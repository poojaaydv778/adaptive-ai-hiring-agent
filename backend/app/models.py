from datetime import datetime
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from .database import Base


class Interview(Base):
    __tablename__ = "interviews"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    candidate_name: Mapped[str] = mapped_column(String(160), nullable=False)
    job_title: Mapped[str] = mapped_column(String(200), nullable=False)
    job_description: Mapped[str] = mapped_column(Text, nullable=False)
    resume_text: Mapped[str] = mapped_column(Text, nullable=False)
    questions_json: Mapped[str] = mapped_column(Text, nullable=False)
    answers_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    current_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="ready")
    assessment_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    engine_mode: Mapped[str] = mapped_column(String(32), nullable=False, default="rules")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class ProctoringEvent(Base):
    """Stores lightweight YOLO/frame-change summaries only; never raw camera frames."""
    __tablename__ = "proctoring_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    interview_id: Mapped[str] = mapped_column(String(36), ForeignKey("interviews.id", ondelete="CASCADE"), index=True, nullable=False)
    objects_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    person_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    motion_detected: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    motion_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
