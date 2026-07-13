import time

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from integrations.github.app_jwt import generate_app_jwt


def _generate_test_keypair() -> tuple[str, str]:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    public_pem = (
        private_key.public_key()
        .public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        .decode()
    )
    return private_pem, public_pem


def test_generates_valid_rs256_jwt_with_expected_claims() -> None:
    private_pem, public_pem = _generate_test_keypair()
    now = time.time()
    token = generate_app_jwt("12345", private_pem, now=now)

    payload = jwt.decode(token, public_pem, algorithms=["RS256"])
    assert payload["iss"] == "12345"
    # 60s clock-drift buffer subtracted from `now`.
    assert payload["iat"] == int(now) - 60
    # Lifetime capped under GitHub's 10-minute maximum.
    assert payload["exp"] - payload["iat"] <= 10 * 60
    assert payload["exp"] > payload["iat"]


def test_jwt_is_rejected_by_a_different_key() -> None:
    private_pem, _ = _generate_test_keypair()
    _, other_public_pem = _generate_test_keypair()
    token = generate_app_jwt("12345", private_pem)

    with pytest.raises(jwt.InvalidSignatureError):
        jwt.decode(token, other_public_pem, algorithms=["RS256"])
