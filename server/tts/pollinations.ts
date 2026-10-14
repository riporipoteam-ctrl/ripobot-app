// Pollinations text to speech (OpenAI-compatible audio endpoint). The API
// key stays on the harness: the renderer receives only voice metadata and
// synthesized audio bytes.
//
// Keyed, not keyless: the audio endpoint requires an API key (free at
// https://enter.pollinations.ai/keys, verified live 2026-10-14 — keyless
// requests 401). Without a key the provider reports "not configured"
// through the normal NoVoiceConfigured path, and the website falls back to
// the browser's built-in voices, so speech still works out of the box.
const API = (process.env.RIPO_POLLINATIONS_TTS_API || "https://gen.pollinations.ai/v1").replace(/\/+$/, "");
const MODEL = "tts-1";
/** Used when no voice is saved, so existing setups keep their behavior. */
export const DEFAULT_POLLINATIONS_VOICE = "nova";

export interface Voice {
  id: string;
  label: string;
  description?: string;
}

export interface Audio {
  bytes: Uint8Array;
  mime: string;
}

export type VerifyResult = { ok: true } | { ok: false; message: string };

async function safeBody(res: Response): Promise<unknown> {
  try {
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return { message: text };
    }
  } catch {
    return null;
  }
}

function serviceDetail(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const record = body as Record<string, unknown>;
  const error = record.error;
  const detail =
    (error && typeof error === "object" && typeof (error as Record<string, unknown>).message === "string"
      ? ((error as Record<string, unknown>).message as string)
      : "") ||
    (typeof error === "string" && error) ||
    (typeof record.message === "string" && record.message) ||
    "";
  return detail.trim().slice(0, 240);
}

function errorMessage(status: number, action: string, body: unknown): string {
  const detail = serviceDetail(body);
  if (status === 401 || status === 403) {
    return "Pollinations rejected that API key. Grab a free one at enter.pollinations.ai/keys and paste it again.";
  }
  if (status === 402) return detail || "Pollinations says this key is out of Pollen.";
  if (status === 429) return detail || "Pollinations is rate-limiting this key — wait a moment and try again.";
  return detail ? `${action} failed: ${detail}` : `${action} failed (${status})`;
}

/** Verify the exact capability the voice picker needs. `/models` is NOT
 * key-gated (it answers 200 even for garbage), so it cannot prove a key —
 * an empty synthesis POST can: 401/403 means the key is bad, anything else
 * means it cleared the auth layer. */
export async function verifyKey(key: string): Promise<VerifyResult> {
  try {
    const res = await fetch(`${API}/audio/speech`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, input: "", voice: DEFAULT_POLLINATIONS_VOICE }),
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: errorMessage(res.status, "checking that key", await safeBody(res)) };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: "Couldn't reach Pollinations to check that key — check your connection." };
  }
}

/** Pollinations serves the standard OpenAI voice roster. */
export async function listVoices(): Promise<Voice[]> {
  return ["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"].map((id) => ({
    id,
    label: id[0].toUpperCase() + id.slice(1),
    description: "Pollinations voice",
  }));
}

export async function synthesize(text: string, voiceId: string, key: string): Promise<Audio> {
  let res: Response;
  try {
    res = await fetch(`${API}/audio/speech`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        accept: "audio/mpeg",
      },
      body: JSON.stringify({
        model: MODEL,
        input: text,
        voice: voiceId,
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new Error("Couldn't reach Pollinations to generate speech — check your connection.");
  }
  if (!res.ok) throw new Error(errorMessage(res.status, "speaking", await safeBody(res)));
  return { bytes: new Uint8Array(await res.arrayBuffer()), mime: "audio/mpeg" };
}
