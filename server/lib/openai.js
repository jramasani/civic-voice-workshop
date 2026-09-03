import { readFile } from "node:fs/promises";

async function configuredKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  try {
    const env = await readFile(new URL("../../.env", import.meta.url), "utf8");
    return env.match(/^OPENAI_API_KEY=(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, "");
  } catch { return undefined; }
}

async function request(path, body) {
  const key = await configuredKey();
  if (!key) throw new Error("OpenAI is not configured");
  const response = await fetch(`https://api.openai.com/v1${path}`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`OpenAI request failed (${response.status})`);
  return response.json();
}

async function textResponse(instructions, input) {
  const result = await request("/responses", { model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini", instructions, input });
  return result.output_text?.trim();
}

export const openai = {
  async categorize(message) {
    const value = await textResponse("Classify this civic feedback using exactly one word: Estate, Transport, Environment, or Other.", message);
    return value;
  },
  summarize: (message) => textResponse("Summarize this civic feedback in one concise sentence.", message),
  translate: (message) => textResponse("Translate this civic feedback into English. Return only the translation.", message),
  async suggestRouting(message) {
    const value = await textResponse("Return JSON only: {\"urgency\":\"Low|Medium|High\",\"team\":\"short responsible team\"} for this civic feedback.", message);
    return JSON.parse(value);
  },
  async synthesize(message) {
    const key = await configuredKey();
    if (!key) throw new Error("OpenAI is not configured");
    const response = await fetch("https://api.openai.com/v1/audio/speech", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts", voice: "coral", input: message }) });
    if (!response.ok) throw new Error(`OpenAI request failed (${response.status})`);
    return { audioBase64: Buffer.from(await response.arrayBuffer()).toString("base64"), mimeType: "audio/mpeg" };
  },
};
