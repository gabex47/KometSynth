import { z } from "zod";
import { getCurrentSession, logActivity } from "@/lib/server/auth";
import { getDecryptedApiKey } from "@/lib/server/api-keys";
import { apiError, apiOk, getClientIp, isSameOrigin } from "@/lib/server/http";
import { consumeRateLimit } from "@/lib/server/rate-limit";

const schema = z.object({
  provider: z.enum(["openai", "anthropic", "gemini"]),
  mode: z.enum(["Chat", "Generate code", "Review code", "Explain code", "Debug code", "Rewrite", "Prompt lab"]),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(20_000) })).min(1).max(30),
});

const instructions: Record<string, string> = {
  Chat: "Be concise, accurate, and practical.",
  "Generate code": "Generate secure, production-quality code. Explain only important decisions.",
  "Review code": "Review code for correctness, security, performance, and maintainability. Prioritize actionable findings.",
  "Explain code": "Explain the code clearly, starting with its purpose and then its important mechanics.",
  "Debug code": "Find the root cause, show the smallest reliable fix, and note relevant edge cases.",
  Rewrite: "Rewrite the content while preserving intent. Return the improved version first.",
  "Prompt lab": "Improve the prompt for clarity, constraints, and reliable output. Return the revised prompt first.",
};

type OpenAIOutput = { type?: string; content?: Array<{ type?: string; text?: string }> };

async function callOpenAI(key: string, mode: string, messages: Array<{ role: string; content: string }>) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-5.6-luna",
      instructions: instructions[mode],
      input: messages.map((message) => ({ role: message.role, content: message.content })),
      max_output_tokens: 2400,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "OpenAI rejected the request.");
  const content = (data.output as OpenAIOutput[] | undefined)?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text;
  if (!content) throw new Error("The provider returned no text output.");
  return content;
}

async function callAnthropic(key: string, mode: string, messages: Array<{ role: string; content: string }>) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-5", system: instructions[mode], messages, max_tokens: 2400 }),
    signal: AbortSignal.timeout(60_000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "Anthropic rejected the request.");
  const content = data.content?.find((item: { type?: string }) => item.type === "text")?.text;
  if (!content) throw new Error("The provider returned no text output.");
  return content as string;
}

async function callGemini(key: string, mode: string, messages: Array<{ role: string; content: string }>) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: instructions[mode] }] }, contents: messages.map((message) => ({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }] })) }),
    signal: AbortSignal.timeout(60_000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "Gemini rejected the request.");
  const content = data.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("");
  if (!content) throw new Error("The provider returned no text output.");
  return content as string;
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("Request rejected.", 403);
  const account = await getCurrentSession();
  if (!account) return apiError("Authentication required.", 401);
  const limit = consumeRateLimit(`ai:${account.id}`, 30, 60 * 60 * 1000);
  if (!limit.allowed) return apiError("AI request limit reached. Try again later.", 429);
  try {
    const input = schema.parse(await request.json());
    const key = await getDecryptedApiKey(account.id, input.provider);
    if (!key) return apiError(`Add a ${input.provider} key in API Keys first.`, 409);
    const content = input.provider === "openai" ? await callOpenAI(key, input.mode, input.messages) : input.provider === "anthropic" ? await callAnthropic(key, input.mode, input.messages) : await callGemini(key, input.mode, input.messages);
    await logActivity(account.username, `ai_${input.provider}_${input.mode.toLowerCase().replaceAll(" ", "_")}`, getClientIp(request));
    return apiOk({ content });
  } catch (error) {
    if (error instanceof z.ZodError) return apiError("Invalid AI request.", 422);
    return apiError(error instanceof Error ? error.message : "AI request failed.", 502);
  }
}
