import unittest
from app.engine import build_assessment, generate_questions, make_follow_up, score_answer

JOB = "Junior Python Engineer. Required skills are Python, REST APIs, SQL, testing, and model evaluation."
RESUME = "Fictional candidate. Built Python API examples using SQL and wrote pytest checks."

class EngineTests(unittest.TestCase):
    def test_generate_four_role_questions(self):
        questions, mode = generate_questions("Junior Python Engineer", JOB, RESUME)
        self.assertGreaterEqual(len(questions), 3)
        self.assertLessEqual(len(questions), 4)
        self.assertTrue(all(len(q["text"]) > 15 for q in questions))
        self.assertIn(mode, {"rules", "openai"})

    def test_short_answer_gets_adaptive_follow_up(self):
        question = {"id": "q1", "text": "Describe your Python project", "skill": "Python", "is_follow_up": False}
        scoring = score_answer(question, "I used Python for an API.", JOB)
        self.assertIsNotNone(make_follow_up(question, "I used Python for an API.", scoring))

    def test_assessment_requires_human_review_and_links_evidence(self):
        question = {"id": "q1", "text": "Describe the Python API project", "skill": "Python", "is_follow_up": False}
        answer = "I built a Python API, wrote tests, compared response times, and reduced latency by 20 percent."
        scores = score_answer(question, answer, JOB)
        answers = [{"question_id": "q1", "question": question["text"], "answer": answer, "skill": "Python", "scores": scores["scores"], "evidence_quote": answer}]
        report = build_assessment(answers, JOB)
        self.assertTrue(report["human_review_required"])
        self.assertEqual(report["average_score"], scores["scores"]["total"])
        if report["demonstrated_skills"]:
            self.assertIn("Python", report["demonstrated_skills"][0]["skill"])
            self.assertIn("built a Python API", report["demonstrated_skills"][0]["evidence"])

if __name__ == "__main__":
    unittest.main()
