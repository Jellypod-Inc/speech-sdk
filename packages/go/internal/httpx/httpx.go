// Package httpx holds shared HTTP helpers for providers.
package httpx

import (
	"fmt"
	"io"
	"net/http"
	"os"
)

// ResolveAPIKey returns the provided key or falls back to the given env var.
func ResolveAPIKey(apiKey, envVar, provider string) (string, error) {
	if apiKey != "" {
		return apiKey, nil
	}
	if v := os.Getenv(envVar); v != "" {
		return v, nil
	}
	return "", fmt.Errorf("%s API key not found; pass it explicitly or set %s", provider, envVar)
}

// HandleErrorResponse returns an error if the response is non-2xx.
func HandleErrorResponse(resp *http.Response, provider string) error {
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return nil
	}
	body, _ := io.ReadAll(resp.Body)
	return fmt.Errorf("%s request failed (%d): %s", provider, resp.StatusCode, string(body))
}
