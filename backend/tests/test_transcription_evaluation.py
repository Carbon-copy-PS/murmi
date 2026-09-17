import unittest
from backend.tools.evaluate_transcription import character_error_rate

class EvaluationMetricTests(unittest.TestCase):
    def test_ignores_punctuation_but_detects_lost_negation(self):
        self.assertEqual(character_error_rate('我不是反對管制。', '我不是反對管制'), 0)
        self.assertAlmostEqual(character_error_rate('我不是反對管制', '我是反對管制'), 1 / 7)

    def test_empty_reference_does_not_claim_accuracy(self):
        self.assertIsNone(character_error_rate('', 'invented words'))
