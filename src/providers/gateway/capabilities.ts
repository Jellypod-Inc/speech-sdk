/**
 * Gateway-level capability flags.
 *
 * These describe what the gateway endpoint (`/v1/audio/conversation` etc.) can
 * currently do, NOT per-model capabilities — the gateway server adds
 * post-processing (stitch, normalize, future STT alignment) that makes every
 * gateway-routed model support conversation regardless of whether the
 * upstream provider supports multi-speaker natively.
 *
 * When the server flips a capability, flip the flag here. Zero per-model
 * maintenance.
 */
export const GATEWAY_CONVERSATION_TIMESTAMPS_SUPPORTED = false as const;
