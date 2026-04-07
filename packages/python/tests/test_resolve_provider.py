import os

import pytest

from speech_sdk.resolve_provider import resolve_model


def test_resolve_model_parses_provider_string(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    provider, model_id = resolve_model("openai/tts-1")
    assert provider.name == "openai"
    assert model_id == "tts-1"


def test_resolve_model_rejects_bare_string():
    with pytest.raises(ValueError, match="provider/model-id"):
        resolve_model("tts-1")


def test_resolve_model_unknown_provider(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    with pytest.raises(ValueError, match="Unknown provider"):
        resolve_model("nope/foo")
