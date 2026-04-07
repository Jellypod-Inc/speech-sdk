package speechsdk

import (
	"strings"
	"testing"
)

func TestResolveModelRejectsBareString(t *testing.T) {
	_, _, err := resolveModel("tts-1")
	if err == nil || !strings.Contains(err.Error(), "provider/model-id") {
		t.Fatalf("expected provider/model-id error, got %v", err)
	}
}

func TestResolveModelUnknownProvider(t *testing.T) {
	_, _, err := resolveModel("nope/foo")
	if err == nil || !strings.Contains(err.Error(), "unknown provider") {
		t.Fatalf("expected unknown provider error, got %v", err)
	}
}

func TestResolveModelOpenAI(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "sk-test")
	provider, modelID, err := resolveModel("openai/tts-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if provider.Name() != "openai" {
		t.Errorf("provider name = %q, want openai", provider.Name())
	}
	if modelID != "tts-1" {
		t.Errorf("modelID = %q, want tts-1", modelID)
	}
}
