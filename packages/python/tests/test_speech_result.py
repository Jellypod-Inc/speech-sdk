from speech_sdk.speech_result import GeneratedAudioFile


def test_generated_audio_file_lazy_base64():
    f = GeneratedAudioFile(data=b"hello", media_type="audio/mpeg")
    assert f.uint8_array == b"hello"
    assert f.base64 == "aGVsbG8="
    # cached
    assert f.base64 is f.base64
