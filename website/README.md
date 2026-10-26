# SpeechSDK website

The standalone Next.js site for speechsdk.dev. It uses the published SDK model catalog and local UI components. It has no Speechbase API, database, authentication, or workspace dependencies.

From this directory:

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm typecheck
pnpm check
pnpm build
pnpm audit --prod --audit-level=high
```

Vercel project: Jellypod / speech-sdk-marketing. Git repository: Jellypod-Inc/speech-sdk. Root directory: website. Production branch: main. The project uses its own package manifest and lockfile; the SDK package at the repository root keeps its existing release workflow.

No API keys are needed to build the site. Provider credentials are used by SDK consumers, not by this site. PostHog is optional and only enabled when NEXT_PUBLIC_POSTHOG_KEY is configured. NEXT_PUBLIC_POSTHOG_HOST optionally changes its endpoint.

Update @speech-sdk/core and regenerate this directory's lockfile after an SDK release. New provider docs must be deployed with an SDK version that actually supports those providers.

The legacy /playground URL redirects to the SDK docs. The retired login-gated Speechbase playground is not included.

Fumadocs MDX uses mdast-util-to-markdown 2.1.2 because later releases recurse with its custom emphasis handlers when generating processed Markdown. Keep this compatibility pin until the Fumadocs integration is upgraded and both docs pages and llms-full.txt build successfully.
