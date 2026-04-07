// Package elevenlabs implements the ElevenLabs TTS provider.
package elevenlabs

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
	defaultBaseURL = "https://api.elevenlabs.io/v1"
	defaultVoice   = "21m00Tcm4TlvDq8ikWAM" // Rachel
)

// Provider is the ElevenLabs speech provider.
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

// New constructs a new ElevenLabs provider, resolving the API key from
// ELEVENLABS_API_KEY if not supplied.
func New(opts ...Option) (*Provider, error) {
	p := &Provider{BaseURL: defaultBaseURL, Client: http.DefaultClient}
	for _, opt := range opts {
		opt(p)
	}
	key, err := httpx.ResolveAPIKey(p.APIKey, "ELEVENLABS_API_KEY", "elevenlabs")
	if err != nil {
		return nil, err
	}
	p.APIKey = key
	return p, nil
}

// Name returns the provider identifier.
func (p *Provider) Name() string { return "elevenlabs" }

// Generate implements speechtypes.Provider.
func (p *Provider) Generate(ctx context.Context, req speechtypes.Request) (*speechtypes.Result, error) {
	modelID, _ := req.ProviderOptions["model"].(string)
	if modelID == "" {
		modelID = "eleven_multilingual_v2"
	}
	voice := req.Voice
	if voice == "" {
		voice = defaultVoice
	}
	format := req.OutputFormat
	if format == "" {
		format = "mp3_44100_128"
	}

	body, err := json.Marshal(map[string]any{
		"text":     req.Text,
		"model_id": modelID,
	})
	if err != nil {
		return nil, err
	}

	url := p.BaseURL + "/text-to-speech/" + voice + "?output_format=" + format
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("xi-api-key", p.APIKey)
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "audio/mpeg")

	resp, err := p.Client.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if err := httpx.HandleErrorResponse(resp, "elevenlabs"); err != nil {
		return nil, err
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	return &speechtypes.Result{
		Audio:    speechtypes.AudioFile{Data: data, MediaType: "audio/mpeg"},
		ModelID:  modelID,
		Provider: p.Name(),
	}, nil
}
