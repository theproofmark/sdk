"""Unit tests for ProofMark Verify client."""

import json
import unittest
from typing import Optional

from proofmark_verify import ProofMarkVerify, VerifyResult, ProofMarkVerifyError


class MockOpener:
    """Mock opener for testing without network calls."""

    def __init__(self, status: int = 200, body: bytes = b"{}"):
        self.status = status
        self.body = body
        self.called = False
        self.last_url: Optional[str] = None
        self.last_data: Optional[bytes] = None

    def __call__(self, url: str, data: bytes, timeout: float) -> tuple[int, bytes]:
        self.called = True
        self.last_url = url
        self.last_data = data
        return (self.status, self.body)


class TestVerifyResult(unittest.TestCase):
    """Tests for VerifyResult."""

    def test_from_dict_success(self):
        """Test successful result parsing."""
        data = {
            "success": True,
            "score": 0.9,
            "flags": ["datacenter_ip"],
            "credit": True,
            "challenge_ts": "2026-06-25T10:00:00Z",
            "hostname": "example.com",
            "action": "signup",
        }
        result = VerifyResult.from_dict(data)
        self.assertTrue(result.success)
        self.assertEqual(result.score, 0.9)
        self.assertEqual(result.flags, ["datacenter_ip"])
        self.assertTrue(result.credit)
        self.assertEqual(result.challenge_ts, "2026-06-25T10:00:00Z")
        self.assertEqual(result.hostname, "example.com")
        self.assertEqual(result.action, "signup")
        self.assertEqual(result.error_codes, [])

    def test_from_dict_failure(self):
        """Test failure result parsing."""
        data = {
            "success": False,
            "score": 0,
            "flags": [],
            "credit": False,
            "error-codes": ["invalid-input-secret"],
        }
        result = VerifyResult.from_dict(data)
        self.assertFalse(result.success)
        self.assertEqual(result.score, 0)
        self.assertEqual(result.error_codes, ["invalid-input-secret"])

    def test_from_dict_defensive(self):
        """Test defensive parsing with missing/invalid fields."""
        data = {"success": "yes", "score": None, "flags": None, "credit": 1}
        result = VerifyResult.from_dict(data)
        self.assertFalse(result.success)  # "yes" is not True
        self.assertEqual(result.score, 0.0)
        self.assertEqual(result.flags, [])
        self.assertFalse(result.credit)  # 1 is not True

    def test_is_human_default_threshold(self):
        """Test is_human with default 0.5 threshold."""
        result_high = VerifyResult.from_dict(
            {"success": True, "score": 0.9, "flags": [], "credit": True}
        )
        self.assertTrue(result_high.is_human())

        result_low = VerifyResult.from_dict(
            {"success": True, "score": 0.3, "flags": [], "credit": True}
        )
        self.assertFalse(result_low.is_human())

        result_fail = VerifyResult.from_dict(
            {"success": False, "score": 0.9, "flags": [], "credit": False}
        )
        self.assertFalse(result_fail.is_human())

    def test_is_human_custom_threshold(self):
        """Test is_human with custom threshold."""
        result = VerifyResult.from_dict(
            {"success": True, "score": 0.6, "flags": [], "credit": True}
        )
        self.assertTrue(result.is_human(0.5))
        self.assertFalse(result.is_human(0.7))


class TestProofMarkVerifyClient(unittest.TestCase):
    """Tests for ProofMarkVerify client."""

    def test_init_requires_secret(self):
        """Test that initialization requires a secret."""
        with self.assertRaises(ValueError):
            ProofMarkVerify("")

    def test_init_strips_trailing_slash(self):
        """Test that base_url trailing slashes are stripped."""
        opener = MockOpener()
        client = ProofMarkVerify(
            "secret", base_url="https://api.example.com/", _opener=opener
        )
        client.verify("token")
        self.assertEqual(opener.last_url, "https://api.example.com/v1/verify/siteverify")

    def test_verify_empty_token_short_circuit(self):
        """Test that empty token returns error without HTTP call."""
        opener = MockOpener()
        client = ProofMarkVerify("secret", _opener=opener)

        result = client.verify("")
        self.assertFalse(result.success)
        self.assertEqual(result.score, 0)
        self.assertIn("missing-input-response", result.error_codes)
        self.assertFalse(opener.called)

    def test_verify_success_response(self):
        """Test successful verification."""
        opener = MockOpener(
            status=200,
            body=json.dumps(
                {
                    "success": True,
                    "score": 0.9,
                    "flags": [],
                    "credit": True,
                    "challenge_ts": "2026-06-25T10:00:00Z",
                }
            ).encode(),
        )
        client = ProofMarkVerify("test_secret", _opener=opener)

        result = client.verify("test_token", remoteip="1.2.3.4")
        self.assertTrue(result.success)
        self.assertEqual(result.score, 0.9)
        self.assertTrue(result.is_human())
        self.assertTrue(opener.called)

    def test_verify_low_score(self):
        """Test low score result."""
        opener = MockOpener(
            status=200,
            body=json.dumps(
                {"success": True, "score": 0.3, "flags": [], "credit": True}
            ).encode(),
        )
        client = ProofMarkVerify("secret", _opener=opener)

        result = client.verify("token")
        self.assertTrue(result.success)
        self.assertEqual(result.score, 0.3)
        self.assertFalse(result.is_human(0.5))

    def test_verify_passes_fields(self):
        """Test that verify passes correct fields to opener."""
        opener = MockOpener(
            status=200,
            body=json.dumps(
                {"success": True, "score": 0.8, "flags": [], "credit": True}
            ).encode(),
        )
        client = ProofMarkVerify("my_secret", _opener=opener)

        client.verify("my_token", remoteip="192.168.1.1")

        # Decode and parse the form data
        data_str = opener.last_data.decode()
        from urllib.parse import parse_qs

        fields = parse_qs(data_str)
        self.assertEqual(fields["secret"], ["my_secret"])
        self.assertEqual(fields["response"], ["my_token"])
        self.assertEqual(fields["remoteip"], ["192.168.1.1"])

    def test_verify_without_remoteip(self):
        """Test that remoteip is optional."""
        opener = MockOpener(
            status=200,
            body=json.dumps(
                {"success": True, "score": 0.8, "flags": [], "credit": True}
            ).encode(),
        )
        client = ProofMarkVerify("secret", _opener=opener)

        client.verify("token")

        data_str = opener.last_data.decode()
        from urllib.parse import parse_qs

        fields = parse_qs(data_str)
        self.assertNotIn("remoteip", fields)

    def test_verify_http_error(self):
        """Test that HTTP errors raise ProofMarkVerifyError."""
        opener = MockOpener(status=403, body=b"Forbidden")
        client = ProofMarkVerify("secret", _opener=opener)

        with self.assertRaises(ProofMarkVerifyError) as ctx:
            client.verify("token")

        self.assertEqual(ctx.exception.code, "PMV_HTTP_ERROR")
        self.assertIn("403", str(ctx.exception))

    def test_verify_invalid_json(self):
        """Test that invalid JSON raises ProofMarkVerifyError."""
        opener = MockOpener(status=200, body=b"not json")
        client = ProofMarkVerify("secret", _opener=opener)

        with self.assertRaises(ProofMarkVerifyError) as ctx:
            client.verify("token")

        self.assertEqual(ctx.exception.code, "PMV_INVALID_RESPONSE")


if __name__ == "__main__":
    unittest.main()
