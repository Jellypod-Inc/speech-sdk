// Package openai implements the OpenAI TTS provider.
package openai

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"

	"github.com/jellypod-inc/speech-sdk/go/internal/httpx"
	"github.com/jellypod-inc/speech-sdk/go/speechtypes"
)

const (
	defaultBaseURL = "https://api.openai.com/v1"
	defaultVoice   = "alloy"
)

// Provider is the OpenAI speech provider.
type Provider struct {
	APIKey  string
	BaseURL string
	Client  *http.Client
}

// Option configures a Provider.
type Option func(*Provider)

// WithAPIKey sets the API key explicitly.
func WithAPIKey(key string) Option { return func(p *Provider) { p.APIKey = key } }

// WithBaseURL overrides the API base URL.
func WithBaseURL(url string) Option { return func(p *Provider) { p.BaseURL = url } }

// WithHTTPClient overrides the HTTP client used for requests.
func WithHTTPClient(c *http.Client) Option { return func(p *Provider) { p.Client = c } }

// New constructs a new OpenAI provider, resolving the API key from
// OPENAI_API_KEY if not supplied.
func New(opts ...Option) (*Provider, error) {
	p := &Provider{BaseURL: defaultBaseURL, Client: http.DefaultClient}
	for _, opt := range opts {
		opt(p)
	}
	key, err := httpx.ResolveAPIKey(p.APIKey, "OPENAI_API_KEY", "openai")
	if err != nil {
		return nil, err
	}
	p.APIKey = key
	return p, nil
}

// Name returns the provider identifier.
func (p *Provider) Name() string { return "openai" }

// Generate implements speechtypes.Provider.
func (p *Provider) Generate(ctx context.Context, req speechtypes.Request) (*speechtypes.Result, error) {
	modelID, _ := req.ProviderOptions["model"].(string)
	if modelID == "" {
		modelID = "tts-1"
	}
	voice := req.Voice
	if voice == "" {
		voice = defaultVoice
	}
	format := req.OutputFormat
	if format == "" {
		format = "mp3"
	}

	body, err := json.Marshal(map[string]any{
		"model":           modelID,
		"input":           req.Text,
		"voice":           voice,
		"response_format": format,
	})
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, p.BaseURL+"/audio/speech", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+p.APIKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := p.Client.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if err := httpx.HandleErrorResponse(resp, "openai"); err != nil {
		return nil, err
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	return &speechtypes.Result{
		Audio:    speechtypes.AudioFile{Data: data, MediaType: "audio/" + format},
		ModelID:  modelID,
		Provider: p.Name(),
	}, nil
}
