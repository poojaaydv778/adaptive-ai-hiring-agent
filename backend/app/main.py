from __future__ import annotations
from fastapi.middleware.cors import CORSMiddleware
import json
import os
import uuid
import threading
from collections import Counter
from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import Any
import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool
from dotenv import load_dotenv
from sqlalchemy.orm import Session
from .database import Base, engine, get_db
from .document_parser import DocumentParseError, MAX_UPLOAD_BYTES, extract_document
from .engine import build_assessment, generate_questions, llm_enabled, make_follow_up, score_answer
from .models import Interview, ProctoringEvent
from .schemas import AnswerRequest, HumanDecisionRequest

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
Path("data").mkdir(parents=True, exist_ok=True)
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Adaptive AI Hiring Interview Agent API", version="1.0.0", description="Evidence-based adaptive interview prototype; human review required.")





app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://127.0.0.1:5174",
        "http://localhost:5174",
        "http://127.0.0.1:5175",
        "http://localhost:5175",
        "http://127.0.0.1:4173",
        "http://localhost:4173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# YOLO loads lazily on the first analyzed camera frame. The model weights are
# downloaded by Ultralytics on first use and can be overridden with YOLO_MODEL.
_YOLO_MODEL: Any = None
_YOLO_LOCK = threading.Lock()
_MOTION_LOCK = threading.Lock()
_LAST_GRAY_FRAME: dict[str, np.ndarray] = {}
_MOTION_THRESHOLD = float(os.getenv("MOTION_THRESHOLD", "4.0"))
MAX_FRAME_BYTES = 2 * 1024 * 1024

def _analyze_frame_with_yolo(
    image_bytes: bytes,
    interview_id: str
) -> dict[str, Any]:
    """
    Analyze a transient camera frame using YOLO and frame-difference analysis.

    This function:
    - Detects people and objects recognized by the configured YOLO model.
    - Counts detected people.
    - Measures coarse changes between consecutive frames.
    - Returns review flags for technical camera events.

    Important:
    - It does not measure eye contact or infer attention, honesty,
      personality, or job suitability.
    - It does not cancel an interview or reject a candidate.
    - Raw camera frames are not saved by this function.
    """
    global _YOLO_MODEL

    # 1. Decode the uploaded frame.
    try:
        with Image.open(BytesIO(image_bytes)) as source:
            image = source.convert("RGB")
            image.thumbnail((640, 480))
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise ValueError(
            "The uploaded camera frame is not a readable image."
        ) from exc

    # 2. Compute a coarse frame-change score.
    # This measures changes in the entire image, not face movement alone.
    small_gray = np.asarray(
        ImageOps.grayscale(image).resize((64, 64)),
        dtype=np.int16
    )

    with _MOTION_LOCK:
        previous = _LAST_GRAY_FRAME.get(interview_id)

        if previous is None:
            motion_score = None
            motion_detected = None
        else:
            motion_score = float(
                np.abs(small_gray - previous).mean()
            )
            motion_detected = (
                motion_score >= _MOTION_THRESHOLD
            )

        _LAST_GRAY_FRAME[interview_id] = small_gray

    # 3. Load the YOLO model once, then reuse it.
    with _YOLO_LOCK:
        if _YOLO_MODEL is None:
            from ultralytics import YOLO

            model_name = os.getenv(
                "YOLO_MODEL",
                "yolo11n.pt"
            )
            _YOLO_MODEL = YOLO(model_name)

        model = _YOLO_MODEL

        predictions = model.predict(
            source=np.asarray(image),
            imgsz=416,
            conf=0.35,
            verbose=False,
            device="cpu",
        )

    # 4. Group detected objects by label.
    grouped: dict[str, list[float]] = {}

    for prediction in predictions:
        boxes = getattr(prediction, "boxes", None)

        if boxes is None:
            continue

        names = prediction.names

        for index in range(len(boxes)):
            class_index = int(
                boxes.cls[index].item()
            )
            confidence = float(
                boxes.conf[index].item()
            )

            if isinstance(names, dict):
                label = names.get(
                    class_index,
                    str(class_index)
                )
            else:
                label = names[class_index]

            label = str(label).lower()

            grouped.setdefault(label, []).append(
                confidence
            )

    # 5. Create a compact object-detection response.
    objects = [
        {
            "label": label,
            "count": len(confidences),
            "confidence": round(max(confidences), 3),
        }
        for label, confidences in sorted(
            grouped.items(),
            key=lambda item: (-len(item[1]), item[0])
        )
    ]

    # Count person detections in this frame.
    person_count = sum(
        len(confidences)
        for label, confidences in grouped.items()
        if label == "person"
    )

    # 6. Report review flags instead of making a hiring decision.
    review_flags: list[dict[str, Any]] = []

    if person_count == 0:
        review_flags.append({
            "code": "no_person_detected",
            "message": (
                "No person was detected in this frame. "
                "Check camera placement, lighting, and image quality."
            ),
        })

    elif person_count > 1:
        review_flags.append({
            "code": "multiple_people_detected",
            "message": (
                "More than one person was detected in this frame. "
                "Ask a human reviewer to verify the situation."
            ),
            "detected_person_count": person_count,
        })

    if motion_detected is True:
        review_flags.append({
            "code": "frame_change_observed",
            "message": (
                "A change was detected between camera frames. "
                "This can result from ordinary movement, lighting, "
                "or camera changes."
            ),
            "motion_score": round(motion_score, 2),
        })

    # Object detections are informational; common objects are not
    # treated as evidence of misconduct.
    non_person_objects = [
        obj
        for obj in objects
        if obj["label"] != "person"
    ]

    if non_person_objects:
        review_flags.append({
            "code": "objects_detected",
            "message": (
                "Objects were detected in the camera frame. "
                "Review the labels as technical context only."
            ),
            "objects": non_person_objects,
        })

    # 7. Return detection data and review information.
    return {
        "status": "ok",
        "detector": os.getenv(
            "YOLO_MODEL",
            "yolo11n.pt"
        ),
        "objects": objects,
        "person_count": person_count,
        "motion_detected": motion_detected,
        "motion_score": (
            round(motion_score, 2)
            if motion_score is not None
            else None
        ),
        "review_flags": review_flags,
        "requires_human_review": bool(review_flags),
        "recommended_action": (
            "review_camera_event"
            if review_flags
            else "continue"
        ),
        "eye_contact_assessment": "not_assessed",
        "automatic_rejection": False,
        "analyzed_at": datetime.utcnow().isoformat() + "Z",
        "note": (
            "Object detection and frame changes are technical signals "
            "only. They do not determine candidate suitability or "
            "automatically change a hiring decision. Eye contact "
            "is not assessed."
        ),
    }
    
def _proctoring_summary(interview_id: str, db: Session) -> dict[str, Any]:
    events = (
        db.query(ProctoringEvent)
        .filter(ProctoringEvent.interview_id == interview_id)
        .order_by(ProctoringEvent.created_at.asc())
        .all()
    )
    object_totals: Counter[str] = Counter()
    for event in events:
        for obj in _json_list(event.objects_json):
            try:
                object_totals[str(obj.get("label", "object"))] += int(obj.get("count", 0))
            except (TypeError, ValueError):
                continue
    last_seen = events[-1].created_at.isoformat() + "Z" if events else None
    return {
        "interview_id": interview_id,
        "frames_analyzed": len(events),
        "frames_with_person": sum(1 for event in events if event.person_count >= 1),
        "frames_with_multiple_people": sum(1 for event in events if event.person_count > 1),
        "motion_events": sum(1 for event in events if event.motion_detected is True),
        "object_counts": [{"label": label, "count": count} for label, count in object_totals.most_common(12)],
        "last_observed_at": last_seen,
        "raw_frames_saved": False,
        "decision_use": "Technical context only; not used in candidate scoring or hiring decisions.",
    }


def _json_list(value: str | None) -> list[dict[str, Any]]:
    try:
        data = json.loads(value or "[]")
        return data if isinstance(data, list) else []
    except (TypeError, json.JSONDecodeError):
        return []


def _pack(item: Interview) -> dict[str, Any]:
    questions = _json_list(item.questions_json)
    answers = _json_list(item.answers_json)
    assessment = None
    if item.assessment_json:
        try:
            assessment = json.loads(item.assessment_json)
        except json.JSONDecodeError:
            assessment = None
    active = questions[item.current_index] if item.status == "in_progress" and item.current_index < len(questions) else None
    return {
        "id": item.id,
        "candidate_name": item.candidate_name,
        "job_title": item.job_title,
        "job_description": item.job_description,
        "resume_text": item.resume_text,
        "questions": questions,
        "answers": answers,
        "assessment": assessment,
        "current_index": item.current_index,
        "current_question": active,
        "progress": min(100, round(len(answers) / max(1, len(questions)) * 100)),
        "status": item.status,
        "engine_mode": item.engine_mode,
        "created_at": item.created_at.isoformat() + "Z" if item.created_at else datetime.utcnow().isoformat() + "Z",
    }


async def _resolve_text(raw_text: str, upload: UploadFile | None, label: str) -> str:
    chunks: list[str] = []
    if raw_text and raw_text.strip():
        chunks.append(raw_text.strip())
    if upload and upload.filename:
        content = await upload.read(MAX_UPLOAD_BYTES + 1)
        if len(content) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail=f"{label} must be 5 MB or smaller.")
        try:
            extracted = extract_document(upload.filename, content)
        except DocumentParseError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        if extracted:
            chunks.append(extracted)
    return "\n\n".join(chunks).strip()


@app.get("/")
def root():
    return {"name": "Adaptive AI Hiring Interview Agent", "docs": "/docs", "api": "/api"}


@app.get("/api/health")
def health():
    return {"status": "ok", "llm_enabled": llm_enabled(), "engine_mode": "openai+rules-fallback" if llm_enabled() else "rules", "database": "sqlite"}


@app.get("/api/interviews")
def list_interviews(db: Session = Depends(get_db)):
    items = db.query(Interview).order_by(Interview.created_at.desc()).all()
    return [_pack(item) for item in items]


@app.post("/api/interviews")
async def create_interview(
    candidate_name: str = Form("Jordan Lee (Fictional)"),
    job_title: str = Form("Software Engineer"),
    job_description_text: str = Form(""),
    resume_text: str = Form(""),
    job_description_file: UploadFile | None = File(default=None),
    resume_file: UploadFile | None = File(default=None),
    db: Session = Depends(get_db),
):
    job_description = await _resolve_text(job_description_text, job_description_file, "Job description")
    resume = await _resolve_text(resume_text, resume_file, "RÃ©sumÃ©")
    if len(job_description) < 35:
        raise HTTPException(status_code=400, detail="Please provide a job description with at least 35 characters or upload a readable file.")
    if len(resume) < 35:
        raise HTTPException(status_code=400, detail="Please provide rÃ©sumÃ© content with at least 35 characters or upload a readable file.")
    if not candidate_name.strip() or not job_title.strip():
        raise HTTPException(status_code=400, detail="Candidate label and job title are required.")
    questions, mode = generate_questions(job_title.strip(), job_description, resume)
    item = Interview(
        id=str(uuid.uuid4()), candidate_name=candidate_name.strip()[:160], job_title=job_title.strip()[:200],
        job_description=job_description, resume_text=resume, questions_json=json.dumps(questions, ensure_ascii=False),
        answers_json="[]", current_index=0, status="ready", assessment_json=None, engine_mode=mode,
    )
    db.add(item); db.commit(); db.refresh(item)
    return _pack(item)


@app.get("/api/interviews/{interview_id}")
def get_interview(interview_id: str, db: Session = Depends(get_db)):
    item = db.get(Interview, interview_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Interview not found.")
    return _pack(item)


@app.post("/api/interviews/{interview_id}/proctoring/frame")
async def analyze_proctoring_frame(
    interview_id: str,
    frame: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Run YOLO on a single live camera frame; the image is processed, never retained."""
    item = db.get(Interview, interview_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Interview not found.")
    image_bytes = await frame.read(MAX_FRAME_BYTES + 1)
    if not image_bytes:
        raise HTTPException(status_code=400, detail="No camera frame was received.")
    if len(image_bytes) > MAX_FRAME_BYTES:
        raise HTTPException(status_code=413, detail="Camera frame must be 2 MB or smaller.")
    try:
        result = await run_in_threadpool(_analyze_frame_with_yolo, image_bytes, interview_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        # A common first-run cause is an unavailable YOLO package/model download.
        detail = str(exc).replace("\n", " ")[:260]
        raise HTTPException(
            status_code=503,
            detail=("YOLO analysis could not run. Ensure ultralytics is installed and allow the first-run "
                    f"model download. Details: {detail}"),
        ) from exc
    event = ProctoringEvent(
        id=str(uuid.uuid4()),
        interview_id=interview_id,
        objects_json=json.dumps(result["objects"], ensure_ascii=False),
        person_count=int(result["person_count"]),
        motion_detected=result["motion_detected"],
        motion_score=result["motion_score"],
    )
    db.add(event)
    db.commit()
    result["summary"] = _proctoring_summary(interview_id, db)
    return result


@app.get("/api/interviews/{interview_id}/proctoring/summary")
def get_proctoring_summary(interview_id: str, db: Session = Depends(get_db)):
    item = db.get(Interview, interview_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Interview not found.")
    return _proctoring_summary(interview_id, db)


@app.post("/api/interviews/{interview_id}/start")
def start_interview(interview_id: str, db: Session = Depends(get_db)):
    item = db.get(Interview, interview_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Interview not found.")
    if item.status == "ready":
        item.status = "in_progress"
        db.commit(); db.refresh(item)
    return _pack(item)


@app.post("/api/interviews/{interview_id}/answer")
def submit_answer(interview_id: str, body: AnswerRequest, db: Session = Depends(get_db)):
    item = db.get(Interview, interview_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Interview not found.")
    if item.status == "ready":
        item.status = "in_progress"
    if item.status == "completed":
        raise HTTPException(status_code=409, detail="This interview is already complete. Open the assessment to review it.")
    questions = _json_list(item.questions_json)
    answers = _json_list(item.answers_json)
    if item.current_index >= len(questions):
        raise HTTPException(status_code=409, detail="No unanswered question remains.")
    answer_text = body.answer.strip()
    if not answer_text:
        raise HTTPException(status_code=400, detail="Answer cannot be empty.")
    question = questions[item.current_index]
    scoring = score_answer(question, answer_text, item.job_description)
    answer_item = {
        "question_id": question.get("id", str(uuid.uuid4())),
        "question": question.get("text", ""),
        "answer": answer_text,
        "skill": question.get("skill", "Role evidence"),
        "is_follow_up": bool(question.get("is_follow_up", False)),
        "scores": scoring["scores"],
        "evidence_quote": answer_text,
        "feedback": scoring["feedback"],
        "scoring_mode": scoring["scoring_mode"],
        "submitted_at": datetime.utcnow().isoformat() + "Z",
    }
    answers.append(answer_item)
    follow_up = None
    if not question.get("is_follow_up", False) and not question.get("follow_up_used", False) and len(questions) < 9:
        follow_up = make_follow_up(question, answer_text, scoring)
    item.current_index += 1
    if follow_up:
        question["follow_up_used"] = True
        followup_text, reason = follow_up
        followup_question = {
            "id": str(uuid.uuid4()), "text": followup_text, "skill": question.get("skill", "Role evidence"),
            "intent": "adaptive_follow_up", "is_follow_up": True, "parent_id": question.get("id"),
            "adaptation_reason": reason, "follow_up_used": True,
        }
        questions.insert(item.current_index, followup_question)
    item.questions_json = json.dumps(questions, ensure_ascii=False)
    item.answers_json = json.dumps(answers, ensure_ascii=False)
    if item.current_index >= len(questions):
        item.status = "completed"
        item.assessment_json = json.dumps(build_assessment(answers, item.job_description), ensure_ascii=False)
    else:
        item.status = "in_progress"
    db.commit(); db.refresh(item)
    return _pack(item)


@app.post("/api/interviews/{interview_id}/decision")
def record_human_decision(interview_id: str, body: HumanDecisionRequest, db: Session = Depends(get_db)):
    """Save an explicit human review decision; the AI score never decides automatically."""
    item = db.get(Interview, interview_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Interview not found.")
    if item.status != "completed" or not item.assessment_json:
        raise HTTPException(status_code=409, detail="Complete the interview before recording a hiring decision.")
    try:
        assessment = json.loads(item.assessment_json)
    except (TypeError, json.JSONDecodeError):
        raise HTTPException(status_code=409, detail="Assessment is not available for this interview.")
    if not isinstance(assessment, dict):
        raise HTTPException(status_code=409, detail="Assessment is not available for this interview.")
    assessment["human_decision"] = {
        "value": body.decision,
        "label": "Hired" if body.decision == "hired" else "Not hired",
        "recorded_at": datetime.utcnow().isoformat() + "Z",
    }
    item.assessment_json = json.dumps(assessment, ensure_ascii=False)
    db.commit()
    db.refresh(item)
    return _pack(item)


@app.delete("/api/interviews/{interview_id}")
def delete_interview(interview_id: str, db: Session = Depends(get_db)):
    item = db.get(Interview, interview_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Interview not found.")
    db.query(ProctoringEvent).filter(ProctoringEvent.interview_id == interview_id).delete(synchronize_session=False)
    with _MOTION_LOCK:
        _LAST_GRAY_FRAME.pop(interview_id, None)
    db.delete(item); db.commit()
    return {"deleted": True}
