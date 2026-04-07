// Package speechsdk is a universal TTS SDK with multi-provider support.
// It mirrors the public API of the TypeScript @speech-sdk/core package.
package speechsdk

import (
	"context"
	"fmt"
	"strings"

	"github.com/jellypod-inc/speech-sdk/go/speechtypes"
)

// Request, Result, AudioFile, and Provider are re-exported from speechtypes
// so callers can use speechsdk.Request etc. without a second import.
type (
	Request   = speechtypes.Request
	Result    = speechtypes.Result
	AudioFile = speechtypes.AudioFile
	Provider  = speechtypes.Provider
)

// Generate resolves the provider from model and generates speech.
func Generate(ctx context.Context, model string, req Request) (*Result, error) {
	provider, modelID, err := resolveModel(model)
	if err != nil {
		return nil, err
	}
	if req.ProviderOptions == nil {
		req.ProviderOptions = map[string]any{}
	}
	req.ProviderOptions["model"] = modelID
	return provider.Generate(ctx, req)
}

// GenerateWith lets callers pass a pre-built provider, skipping resolution.
func GenerateWith(ctx context.Context, provider Provider, req Request) (*Result, error) {
	return provider.Generate(ctx, req)
}

func resolveModel(model string) (Provider, string, error) {
	name, modelID, ok := strings.Cut(model, "/")
	if !ok {
		return nil, "", fmt.Errorf("model must be %q, got %q", "provider/model-id", model)
	}
	provider, err := createBuiltinProvider(name)
	if err != nil {
		return nil, "", err
	}
	return provider, modelID, nil
}
