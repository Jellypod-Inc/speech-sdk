# speech-sdk (Go)

Go implementation of `@speech-sdk/core`. Mirrors the TypeScript public API.

```go
package main

import (
    "context"
    "os"

    speech "github.com/jellypod-inc/speech-sdk/go/speechsdk"
)

func main() {
    result, err := speech.Generate(context.Background(), speech.Request{
        Model: "openai/tts-1",
        Text:  "Hello from Go",
    })
    if err != nil {
        panic(err)
    }
    os.WriteFile("out.mp3", result.Audio.Data, 0o644)
}
```

## Environment variables

- `OPENAI_API_KEY`
- `ELEVENLABS_API_KEY`
