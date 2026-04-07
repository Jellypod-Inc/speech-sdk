// Package speechtypes defines the shared request/result/provider types
// used by both the top-level speechsdk package and individual providers.
// It is extracted into its own package to avoid an import cycle between
// speechsdk (which dispatches to providers) and providers (which return
// result values).
package speechtypes

import "context"

// Request is a speech generation request.
type Request struct {
	Text            string
	Voice           string
	OutputFormat    string
	ProviderOptions map[string]any
}

// Result is the outcome of a generation call.
type Result struct {
	Audio    AudioFile
	ModelID  string
	Provider string
	Warnings []string
}

// AudioFile holds raw audio bytes and their media type.
type AudioFile struct {
	Data      []byte
	MediaType string
}

// Provider is the interface all speech providers implement.
type Provider interface {
	Name() string
	Generate(ctx context.Context, req Request) (*Result, error)
}
