package speechsdk

import (
	"fmt"

	"github.com/jellypod-inc/speech-sdk/go/providers/elevenlabs"
	"github.com/jellypod-inc/speech-sdk/go/providers/openai"
)

func createBuiltinProvider(name string) (Provider, error) {
	switch name {
	case "openai":
		return openai.New()
	case "elevenlabs":
		return elevenlabs.New()
	}
	return nil, fmt.Errorf("unknown provider: %q", name)
}
