"""Question generation and evidence scoring for the interview prototype.

Without OPENAI_API_KEY the app uses transparent, deterministic rules. With a key,
question generation and response scoring are optionally assisted by an LLM. The
rubric remains limited to job-related evidence and always retains the exact answer.
"""
from __future__ import annotations
import json
import os
import re
import statistics
import uuid
from typing import Any

SKILL_ALIASES: list[tuple[str, tuple[str, ...]]] = [
    ("Python", ("python",)), ("JavaScript", ("javascript",)), ("TypeScript", ("typescript",)),
    ("React", ("react", "react.js")), ("Next.js", ("next.js", "nextjs")),
    ("FastAPI", ("fastapi",)), ("Django", ("django",)), ("Flask", ("flask",)),
    ("SQL", ("postgresql", "mysql", "sqlite", "sql")), ("REST APIs", ("rest api", "restful api", "rest apis", "api integration")),
    ("GraphQL", ("graphql",)), ("Git", ("git", "github", "version control")), ("Docker", ("docker",)),
    ("Kubernetes", ("kubernetes", "k8s")), ("AWS", ("aws", "amazon web services")),
    ("Azure", ("azure",)), ("Google Cloud", ("google cloud", "gcp")), ("Machine Learning", ("machine learning", "ml model", "ml/ai", "predictive model")),
    ("scikit-learn", ("scikit-learn", "sklearn")), ("TensorFlow", ("tensorflow",)), ("PyTorch", ("pytorch",)),
    ("NLP", ("natural language processing", "nlp")), ("LLMs", ("large language model", "llm", "llms", "generative ai")),
    ("Prompt Engineering", ("prompt engineering", "prompt design")), ("RAG", ("retrieval augmented generation", "retrieval-augmented generation", "rag pipeline")),
    ("pandas", ("pandas",)), ("NumPy", ("numpy",)), ("Data Analysis", ("data analysis", "data analytics", "analyze data", "analyse data")),
    ("Data Visualization", ("data visualization", "data visualisation", "dashboard", "visualization")),
    ("Statistics", ("statistics", "statistical", "hypothesis testing")), ("HTML/CSS", ("html", "css")),
    ("Testing", ("unit test", "testing", "test coverage", "pytest")), ("CI/CD", ("ci/cd", "continuous integration", "continuous deployment")),
    ("Cybersecurity", ("cybersecurity", "security controls", "application security")), ("Cloud Computing", ("cloud computing", "cloud infrastructure")),
    ("Data Engineering", ("data engineering", "data pipeline", "etl", "elt")), ("Model Evaluation", ("model evaluation", "precision", "recall", "f1 score", "f1-score")),
    ("System Design", ("system design", "scalability", "distributed system")), ("Accessibility", ("accessibility", "wcag", "accessible interface")),
    ("Agile Delivery", ("agile", "scrum", "sprint planning")), ("Product Analytics", ("product analytics", "conversion rate", "funnel analysis")),
]
STOP_WORDS = set("the a an and or but if then with for from into using use used build building role job candidate experience experienced knowledge ability work working team teams across through about this that these those their them they you your our we are is be to of in on as at by it its can will should would must have has had do does did describe explain tell give share show how what why when where which who project projects requirement requirements responsibility responsibilities responsible include including such etc strong good excellent preferred required plus helpful based looking seeking ideal successful support supportable".split())
ACTION_WORDS = set("built implemented designed debugged tested measured compared evaluated deployed automated integrated wrote created shipped improved optimized optimised investigated refactored configured validated analyzed analysed led developed delivered migrated maintained trained documented reduced increased fixed queried modeled modelled collaborated".split())
OUTCOME_WORDS = set("result outcome improved reduced increased saved faster accuracy precision recall f1 users percent percentage latency revenue time cost impact measured baseline metric metrics success achieved decreased grew delivered production passed compared validated".split())
CRITERIA = ["relevance", "specificity", "actions", "outcome"]


def llm_enabled() -> bool:
    return bool(os.getenv("OPENAI_API_KEY", "").strip())


def _openai_json(system_prompt: str, payload: dict[str, Any]) -> dict[str, Any] | None:
    if not llm_enabled():
        return None
    try:
        from openai import OpenAI
        client = OpenAI(api_key=os.environ["OPENAI_API_KEY"], timeout=22.0, max_retries=1)
        response = client.responses.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4.1-mini"),
            input=[
                {"role": "system", "content": system_prompt + " Return only valid JSON."},
                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
            ],
            text={"format": {"type": "json_object"}},
        )
        return json.loads(response.output_text)
    except Exception:
        # Keep the local prototype usable if an optional external model is unavailable.
        return None


def _contains_alias(text: str, alias: str) -> bool:
    escaped = re.escape(alias.lower())
    if alias.lower() in {"sql", "ml", "nlp", "llm", "llms", "rag", "aws", "css", "html", "git"}:
        return bool(re.search(rf"(?<![a-z0-9]){escaped}(?![a-z0-9])", text.lower()))
    return escaped in text.lower()


def extract_skills(text: str) -> list[str]:
    found: list[tuple[int, str]] = []
    lowered = text.lower()
    for name, aliases in SKILL_ALIASES:
        positions = [lowered.find(alias) for alias in aliases if _contains_alias(lowered, alias)]
        if positions:
            found.append((min(positions), name))
    return [name for _, name in sorted(found, key=lambda item: item[0])]


def _fallback_keywords(text: str, limit: int = 6) -> list[str]:
    words = re.findall(r"[a-zA-Z][a-zA-Z0-9+#.-]{2,}", text.lower())
    freq: dict[str, int] = {}
    for word in words:
        word = word.strip(".-")
        if len(word) > 2 and word not in STOP_WORDS and not word.isdigit():
            freq[word] = freq.get(word, 0) + 1
    return [word.replace(".", " ").title() for word, _ in sorted(freq.items(), key=lambda item: (-item[1], item[0]))[:limit]]


def _normalise_question(item: dict[str, Any], index: int) -> dict[str, Any]:
    text = str(item.get("text", "")).strip()
    skill = str(item.get("skill", "Role requirement")).strip() or "Role requirement"
    if len(text) < 15:
        raise ValueError("Question text is too short")
    return {
        "id": str(uuid.uuid4()), "text": text, "skill": skill,
        "intent": str(item.get("intent", "role_evidence")), "is_follow_up": False,
        "parent_id": None, "adaptation_reason": None, "follow_up_used": False,
    }


def generate_questions(job_title: str, job_description: str, resume_text: str) -> tuple[list[dict[str, Any]], str]:
    payload = {"job_title": job_title, "job_description": job_description[:12000], "fictional_resume": resume_text[:12000]}
    generated = _openai_json(
        "You are an interview-question designer. Using only the job description and fictional resume, create 4 short questions for a fair mock interview. Questions must be role-related, use specific resume evidence where appropriate, check skills in the description, and distinguish claimed experience from an approach to a new task. Do not infer personality, honesty, accent, appearance, protected traits, or general suitability. No trick questions. JSON schema: {\"questions\":[{\"text\":string,\"skill\":string,\"intent\":string}]}",
        payload,
    )
    if generated:
        try:
            items = generated.get("questions", [])
            questions = [_normalise_question(item, index) for index, item in enumerate(items[:4]) if isinstance(item, dict)]
            if len(questions) >= 3:
                return questions, "openai"
        except Exception:
            pass

    jd_skills = extract_skills(job_description)
    resume_skills = extract_skills(resume_text)
    generic_jd = _fallback_keywords(job_description, 5)
    if not jd_skills:
        jd_skills = generic_jd or [job_title or "Role requirements"]
    resume_lookup = {skill.lower() for skill in resume_skills}
    overlap = next((skill for skill in jd_skills if skill.lower() in resume_lookup), jd_skills[0])
    gap = next((skill for skill in jd_skills if skill.lower() not in resume_lookup), jd_skills[1] if len(jd_skills) > 1 else jd_skills[0])
    third = jd_skills[2] if len(jd_skills) > 2 else (jd_skills[1] if len(jd_skills) > 1 else jd_skills[0])
    questions = [
        {"text": f"Choose a project from the résumé where you used {overlap}. What problem were you solving, what did you personally do, and what evidence shows the result worked?", "skill": overlap, "intent": "past_work"},
        {"text": f"This {job_title} role emphasizes {gap}. Describe how you would approach a realistic task using it, including the steps you would take and how you would validate the result.", "skill": gap, "intent": "role_requirement"},
        {"text": f"Suppose a requirement involving {third} is unclear or your first approach does not work. How would you investigate the issue, decide what to try next, and verify the outcome?", "skill": third, "intent": "scenario"},
        {"text": f"Looking at the projects in the résumé, describe the example most relevant to this {job_title} role. Explain your contribution, one technical trade-off, and an outcome or test that could verify the work.", "skill": overlap, "intent": "resume_evidence"},
    ]
    return [_normalise_question(item, index) for index, item in enumerate(questions)], "rules"


def _count_tokens(text: str, vocabulary: set[str]) -> int:
    tokens = set(re.findall(r"[a-zA-Z][a-zA-Z0-9+#.-]*", text.lower()))
    return len(tokens.intersection(vocabulary))


def score_answer(question: dict[str, Any], answer: str, job_description: str) -> dict[str, Any]:
    payload = {"job_description": job_description[:8000], "question": question.get("text", ""), "criterion_skill": question.get("skill", ""), "candidate_answer": answer[:8000]}
    evaluated = _openai_json(
        "Score this interview answer only on job-related evidence. Do not infer personality, honesty, accent, appearance, protected traits, or hiring suitability. Use 0-4 integers for relevance (answers the stated skill/requirement), specificity (concrete details/context), actions (explains steps/ownership), and outcome (results/measurement/validation). Give a short neutral feedback sentence. Do not invent evidence. JSON schema: {\"scores\":{\"relevance\":0,\"specificity\":0,\"actions\":0,\"outcome\":0},\"feedback\":string}",
        payload,
    )
    if evaluated and isinstance(evaluated.get("scores"), dict):
        try:
            scores = {key: max(0, min(4, int(evaluated["scores"].get(key, 0)))) for key in CRITERIA}
            total = round(sum(scores.values()) / len(CRITERIA), 1)
            return {"scores": {**scores, "total": total}, "evidence_quote": answer.strip(), "feedback": str(evaluated.get("feedback", "Scores are linked to the response evidence."))[:360], "scoring_mode": "openai"}
        except Exception:
            pass

    words = re.findall(r"\b[\w+#.-]+\b", answer)
    word_count = len(words)
    if word_count < 8:
        specificity = 0
    elif word_count < 22:
        specificity = 1
    elif word_count < 42:
        specificity = 2
    elif word_count < 75:
        specificity = 3
    else:
        specificity = 4
    skill = str(question.get("skill", "")).lower()
    skill_terms = {term for term in re.findall(r"[a-zA-Z][a-zA-Z0-9+#.-]*", skill) if len(term) > 2 and term not in STOP_WORDS}
    answer_words = set(re.findall(r"[a-zA-Z][a-zA-Z0-9+#.-]*", answer.lower()))
    jd_skills = {s.lower() for s in extract_skills(job_description)}
    relevant_hits = len(skill_terms.intersection(answer_words))
    if skill in jd_skills or any(skill in s or s in skill for s in jd_skills if len(s) > 3):
        relevance = 3 if relevant_hits or any(alias in answer.lower() for alias in [skill]) else 2
    else:
        relevance = 2 if relevant_hits else 1
    if word_count < 4:
        relevance = min(relevance, 1)
    action_hits = _count_tokens(answer, ACTION_WORDS)
    actions = 0 if word_count < 5 else (1 if action_hits == 0 else 2 if action_hits == 1 else 3 if action_hits == 2 else 4)
    outcome_hits = _count_tokens(answer, OUTCOME_WORDS)
    has_number = bool(re.search(r"\b\d+(?:\.\d+)?\s*%?\b", answer))
    outcome = 0 if word_count < 5 else (1 if outcome_hits == 0 and not has_number else 2 if outcome_hits <= 1 and not has_number else 3 if outcome_hits >= 2 or has_number else 2)
    total = round((relevance + specificity + actions + outcome) / 4, 1)
    low = [name for name, value in (("specificity", specificity), ("actions", actions), ("outcome", outcome)) if value <= 1]
    if word_count < 8:
        feedback = "Very little detail is recorded; ask the candidate to provide one concrete, job-related example."
    elif low:
        labels = {"specificity": "concrete detail", "actions": "steps or personal contribution", "outcome": "result or validation"}
        feedback = "The response would benefit from clearer " + ", ".join(labels[item] for item in low) + "."
    elif relevance <= 1:
        feedback = "The answer does not yet clearly address the named role-related criterion; clarify the link to the requirement."
    else:
        feedback = "The response contains job-related detail; verify the described actions and outcome against the role criteria."
    return {"scores": {"relevance": relevance, "specificity": specificity, "actions": actions, "outcome": outcome, "total": total}, "evidence_quote": answer.strip(), "feedback": feedback, "scoring_mode": "rules"}


def make_follow_up(question: dict[str, Any], answer: str, scoring: dict[str, Any]) -> tuple[str, str] | None:
    words = re.findall(r"\b\w+\b", answer)
    scores = scoring["scores"]
    if len(words) < 22:
        return ("Could you walk me through one concrete example? What was your specific responsibility, what steps did you take, and what happened as a result?", "The answer was brief, so the agent is asking for a concrete example and your specific contribution.")
    if scores.get("outcome", 0) <= 1:
        return ("What changed because of your work, and how did you measure or verify the outcome? If there was no metric, what other evidence showed whether it worked?", "The response did not clearly state an outcome, so the agent is probing for results or validation.")
    if scores.get("actions", 0) <= 1:
        return ("What specific steps did you personally take, and why did you choose that approach over an alternative?", "The response did not make the actions or decision process clear, so the agent is asking for specific steps.")
    return None


def build_assessment(answers: list[dict[str, Any]], job_description: str) -> dict[str, Any]:
    if not answers:
        averages = {key: 0.0 for key in CRITERIA}
        return {"summary": "No responses were recorded.", "average_score": 0.0, "demonstrated_skills": [], "gaps": [], "review_topics": [], "criterion_averages": averages, "human_review_required": True, "decision_note": "This report does not make a hiring decision.", "scoring_note": "Scores are an evidence-organization aid, not a validated psychometric measure."}
    averages = {key: round(statistics.mean(float(item.get("scores", {}).get(key, 0)) for item in answers), 1) for key in CRITERIA}
    average_score = round(statistics.mean(float(item.get("scores", {}).get("total", 0)) for item in answers), 1)
    by_skill: dict[str, list[dict[str, Any]]] = {}
    for answer in answers:
        by_skill.setdefault(str(answer.get("skill") or "Role evidence"), []).append(answer)
    demonstrated: list[dict[str, Any]] = []
    gaps: list[dict[str, Any]] = []
    review: list[dict[str, Any]] = []
    for skill, items in by_skill.items():
        skill_score = round(statistics.mean(float(i.get("scores", {}).get("total", 0)) for i in items), 1)
        best = max(items, key=lambda i: float(i.get("scores", {}).get("total", 0)))
        worst = min(items, key=lambda i: float(i.get("scores", {}).get("total", 0)))
        evidence = str(best.get("evidence_quote", ""))[:440]
        if skill_score >= 2.7 and float(best.get("scores", {}).get("relevance", 0)) >= 2:
            demonstrated.append({"skill": skill, "score": skill_score, "label": "Evidence surfaced in the interview; verify the scope and result.", "evidence": evidence, "question": str(best.get("question", ""))})
        else:
            reason = "The responses did not yet provide enough clear, specific evidence for this criterion. A reviewer can ask for an example, actions taken, and how the result was verified."
            gaps.append({"topic": skill, "reason": reason, "evidence": str(worst.get("evidence_quote", ""))[:440], "question": str(worst.get("question", ""))})
        if skill_score < 2.7 or float(best.get("scores", {}).get("outcome", 0)) < 2:
            review.append({"topic": f"Verify evidence for {skill}", "reason": "Check the described contribution and outcome with a focused, job-related follow-up; the recorded answer alone may not establish the requirement.", "evidence": str(worst.get("evidence_quote", ""))[:440], "question": str(worst.get("question", ""))})
    for criterion, score in averages.items():
        if score < 2.5:
            label = {"relevance": "role relevance", "specificity": "specific examples", "actions": "actions and ownership", "outcome": "outcomes or validation"}[criterion]
            review.append({"topic": f"Clarify {label}", "reason": f"The average rubric signal for {label} was {score:.1f}/4. Review the source responses and ask a neutral clarification if it matters for the role.", "evidence": "", "question": "Across the recorded responses"})
    if not gaps:
        summary = f"The interview surfaced some relevant evidence across {len(by_skill)} job-related criterion/criteria, with an average rubric score of {average_score:.1f}/4. This score describes the responses captured here only; it is not a hiring recommendation."
    else:
        summary = f"The interview average was {average_score:.1f}/4 across {len(answers)} responses. Some responses included job-related evidence, while {len(gaps)} criterion/criteria need clearer support or verification. Review the cited answers and ask follow-up questions before drawing conclusions."
    return {
        "summary": summary,
        "average_score": average_score,
        "demonstrated_skills": demonstrated,
        "gaps": gaps,
        "review_topics": review[:8],
        "criterion_averages": averages,
        "human_review_required": True,
        "decision_note": "AI-generated decision support only. A human reviewer retains all hiring decisions.",
        "scoring_note": "The 0–4 rubric is a prototype, not a validated selection instrument. Scores reflect only the recorded answer text and specified job criteria.",
    }
