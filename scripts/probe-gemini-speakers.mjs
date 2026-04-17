// Probe: does Gemini TTS actually enforce its documented 2-speaker cap?
// We try N=2,3,4,5 speakers on gemini-2.5-flash-preview-tts and
// gemini-3.1-flash-tts-preview. Prints status + first error line.
//
// Run: GOOGLE_API_KEY=... node scripts/probe-gemini-speakers.mjs
//      (or: pnpm exec dotenv -e .env -- node scripts/probe-gemini-speakers.mjs)

import { readFileSync } from "node:fs";

// Lightweight .env loader so you can just run `node scripts/...`
try {
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
  }
} catch {
  // .env is optional — env vars can be set directly in the shell.
}

const API_KEY = process.env.GOOGLE_API_KEY;
if (!API_KEY) {
  console.error("GOOGLE_API_KEY not set");
  process.exit(1);
}

const MODELS = ["gemini-2.5-flash-preview-tts", "gemini-3.1-flash-tts-preview"];

const VOICE_POOL = ["Kore", "Puck", "Charon", "Fenrir", "Aoede", "Leda"];

function buildDialogue(n) {
  // Produce turn-labelled text and matching speakerVoiceConfigs for N speakers.
  const speakerNames = Array.from({ length: n }, (_, i) => `Speaker${i + 1}`);
  const lines = speakerNames.map(
    (name, i) => `${name}: This is speaker number ${i + 1} in the conversation.`
  );
  return {
    text: lines.join("\n"),
    speakerVoiceConfigs: speakerNames.map((speaker, i) => ({
      speaker,
      voice_config: {
        prebuilt_voice_config: { voice_name: VOICE_POOL[i] },
      },
    })),
  };
}

async function tryCall(model, n) {
  const { text, speakerVoiceConfigs } = buildDialogue(n);
  const body = {
    contents: [{ role: "user", parts: [{ text }] }],
    generationConfig: {
      responseModalities: ["audio"],
      speech_config: {
        multi_speaker_voice_config: {
          speaker_voice_configs: speakerVoiceConfigs,
        },
      },
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = raw;
  }

  if (!res.ok) {
    const msg = parsed?.error?.message ?? String(parsed).slice(0, 300);
    return { ok: false, status: res.status, msg };
  }

  const audio = parsed?.candidates?.[0]?.content?.parts?.find(
    (p) => p.inlineData?.data
  );
  return {
    ok: true,
    status: 200,
    audioBytes: audio ? audio.inlineData.data.length : 0,
    mime: audio?.inlineData?.mimeType,
  };
}

for (const model of MODELS) {
  console.log(`\n=== ${model} ===`);
  for (const n of [2, 3, 4, 5]) {
    process.stdout.write(`  ${n} speakers... `);
    try {
      const r = await tryCall(model, n);
      if (r.ok) {
        console.log(`OK (${r.audioBytes} b64 chars, mime=${r.mime})`);
      } else {
        console.log(
          `FAIL ${r.status}: ${r.msg.replace(/\s+/g, " ").slice(0, 220)}`
        );
      }
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
    }
  }
}
