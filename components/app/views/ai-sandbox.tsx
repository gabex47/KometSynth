"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, ChevronRight, Command, Sparkles } from "lucide-react";
import { apiRequest } from "@/lib/client/api";

const modes = ["Chat", "Generate code", "Review code", "Explain code", "Debug code", "Rewrite", "Prompt lab"] as const;
type Mode = typeof modes[number];
type Provider = "openai" | "anthropic" | "gemini";
type Message = { id: string; role: "user" | "assistant"; content: string };

export function AISandbox() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<Mode>("Chat");
  const [provider, setProvider] = useState<Provider>("openai");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  async function send() {
    const value = prompt.trim();
    if (!value || loading) return;
    const next = [...messages, { id: crypto.randomUUID(), role: "user" as const, content: value }];
    setMessages(next);
    setPrompt("");
    setLoading(true);
    setError("");
    controller.current?.abort();
    controller.current = new AbortController();
    try {
      const data = await apiRequest<{ content: string }>("/api/ai", {
        method: "POST",
        body: JSON.stringify({
          provider,
          mode,
          messages: next.map(({ role, content }) => ({ role, content })),
        }),
        signal: controller.current.signal,
      });
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: data.content }]);
    } catch (caught) {
      if ((caught as Error).name !== "AbortError") {
        setError(caught instanceof Error ? caught.message : "AI request failed.");
      }
    } finally {
      setLoading(false);
    }
  }

  return <section className="ai-page">
    <div className="page-heading compact-heading"><div><span className="eyebrow">AI / SANDBOX</span><h1>Think with your tools.</h1><p>Use your own provider key. Prompts pass through the authenticated server route and are not retained by SynthNet.</p></div><span className="local-badge"><Sparkles size={13} /> BYOK</span></div>
    <div className="ai-layout">
      <aside className="ai-modes" aria-label="AI mode"><small>MODE</small>{modes.map((item) => <button className={mode === item ? "active" : ""} key={item} onClick={() => setMode(item)} aria-pressed={mode === item}>{item}<ChevronRight size={13} /></button>)}</aside>
      <div className="chat-panel">
        <div className="chat-header"><div><span className="provider-mark">{provider[0].toUpperCase()}</span><p><strong>AI provider</strong><small>Configured key required</small></p></div><label className="provider-select"><span>PROVIDER</span><select value={provider} onChange={(event) => setProvider(event.target.value as Provider)} disabled={loading}><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="gemini">Google Gemini</option></select></label></div>
        <div className="message-list" aria-live="polite">
          {!messages.length && <div className="chat-empty"><Bot size={28} /><h2>Start a new {mode.toLowerCase()} session</h2><p>Messages are never exposed to other SynthNet users.</p><div><button onClick={() => setPrompt("Review this function for bugs and edge cases:")}>Review code</button><button onClick={() => setPrompt("Explain this code step by step:")}>Explain code</button></div></div>}
          {messages.map((message) => <article className={`message ${message.role}`} key={message.id}><small>{message.role === "user" ? "YOU" : "SYNTH"}</small><p>{message.content}</p></article>)}
          {loading && <article className="message assistant"><small>SYNTH</small><p className="typing">Processing<span>_</span></p></article>}
        </div>
        {error && <p className="chat-error" role="alert">{error}</p>}
        <div className="prompt-box"><label className="sr-only" htmlFor="ai-prompt">Prompt</label><textarea id="ai-prompt" value={prompt} maxLength={20_000} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void send(); }} placeholder={`Ask SynthNet to ${mode.toLowerCase()}…`} /><div><span>⌘ + ENTER TO SEND</span><button onClick={() => void send()} disabled={!prompt.trim() || loading}><Command size={14} /> SEND</button></div></div>
      </div>
    </div>
  </section>;
}
