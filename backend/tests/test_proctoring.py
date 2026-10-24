import io
import unittest
import uuid
from types import SimpleNamespace

import numpy as np
from PIL import Image

from app import main


class FakeBoxes:
    def __init__(self):
        self.cls = np.asarray([0, 67])
        self.conf = np.asarray([0.96, 0.78])

    def __len__(self):
        return len(self.cls)


class FakeYOLO:
    def predict(self, **kwargs):
        return [SimpleNamespace(boxes=FakeBoxes(), names={0: "person", 67: "cell phone"})]


def image_bytes(color: str) -> bytes:
    image = Image.new("RGB", (160, 120), color=color)
    output = io.BytesIO()
    image.save(output, format="JPEG")
    return output.getvalue()


class ProctoringTests(unittest.TestCase):
    def setUp(self):
        self.old_model = main._YOLO_MODEL
        main._YOLO_MODEL = FakeYOLO()
        self.interview_id = str(uuid.uuid4())

    def tearDown(self):
        main._YOLO_MODEL = self.old_model
        with main._MOTION_LOCK:
            main._LAST_GRAY_FRAME.pop(self.interview_id, None)

    def test_yolo_labels_are_returned_without_storing_images(self):
        result = main._analyze_frame_with_yolo(image_bytes("black"), self.interview_id)
        labels = {item["label"] for item in result["objects"]}
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["person_count"], 1)
        self.assertIn("person", labels)
        self.assertIn("cell phone", labels)
        self.assertIsNone(result["motion_detected"])  # first frame establishes baseline
        self.assertIn("not used to score", result["note"])

    def test_frame_change_is_reported_as_technical_signal(self):
        main._analyze_frame_with_yolo(image_bytes("black"), self.interview_id)
        result = main._analyze_frame_with_yolo(image_bytes("white"), self.interview_id)
        self.assertTrue(result["motion_detected"])
        self.assertGreater(result["motion_score"], 4.0)


if __name__ == "__main__":
    unittest.main()
