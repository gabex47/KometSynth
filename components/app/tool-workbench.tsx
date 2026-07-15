"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Check, Clipboard, LoaderCircle, Play, RefreshCcw } from "lucide-react";
import type { ToolDefinition } from "@/lib/types";

function bytesToHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function jsonToYaml(value: unknown, depth = 0): string {
  const indent = "  ".repeat(depth);
  if (Array.isArray(value)) return value.map((item) => `${indent}- ${typeof item === "object" ? `\n${jsonToYaml(item, depth + 1)}` : String(item)}`).join("\n");
  if (value && typeof value === "object") return Object.entries(value).map(([key, item]) => `${indent}${key}:${typeof item === "object" ? `\n${jsonToYaml(item, depth + 1)}` : ` ${String(item)}`}`).join("\n");
  return `${indent}${String(value)}`;
}

function safeCalculate(input: string) {
  if (!/^[\d\s()+\-*/%.]+$/.test(input)) throw new Error("Only arithmetic operators are allowed.");
  const tokens = input.match(/\d+(?:\.\d+)?|[()+\-*/%]/g);
  if (!tokens || tokens.join("") !== input.replace(/\s/g, "")) throw new Error("Invalid expression.");
  const values: number[] = [];
  const operators: string[] = [];
  const precedence: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2, "%": 2 };
  const apply = () => {
    const operator = operators.pop();
    const right = values.pop();
    const left = values.pop();
    if (!operator || left === undefined || right === undefined) throw new Error("Invalid expression.");
    if ((operator === "/" || operator === "%") && right === 0) throw new Error("Division by zero.");
    values.push(operator === "+" ? left + right : operator === "-" ? left - right : operator === "*" ? left * right : operator === "/" ? left / right : left % right);
  };
  tokens.forEach((token) => {
    if (!Number.isNaN(Number(token))) values.push(Number(token));
    else if (token === "(") operators.push(token);
    else if (token === ")") { while (operators.at(-1) !== "(") apply(); operators.pop(); }
    else { while (operators.length && operators.at(-1) !== "(" && precedence[operators.at(-1)!] >= precedence[token]) apply(); operators.push(token); }
  });
  while (operators.length) apply();
  if (values.length !== 1 || !Number.isFinite(values[0])) throw new Error("Invalid expression.");
  return String(values[0]);
}

async function runTool(tool: ToolDefinition, input: string) {
  const serverTools = ["md5-generator", "hmac-generator", "dns-lookup", "reverse-dns", "http-status", "mime-lookup", "user-agent"];
  if (serverTools.includes(tool.id)) {
    const response = await fetch("/api/tools/process", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tool: tool.id, input }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to run tool.");
    return data.output as string;
  }
  switch (tool.id) {
    case "json-formatter": return JSON.stringify(JSON.parse(input), null, 2);
    case "yaml-converter": return jsonToYaml(JSON.parse(input));
    case "base64": return input.startsWith("decode:") ? decodeURIComponent(escape(atob(input.slice(7).trim()))) : btoa(unescape(encodeURIComponent(input)));
    case "url-codec": return input.startsWith("decode:") ? decodeURIComponent(input.slice(7).trim()) : encodeURIComponent(input);
    case "jwt-decoder": {
      const [header, payload] = input.split(".");
      if (!header || !payload) throw new Error("Enter a valid JWT structure.");
      const decode = (part: string) => JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
      return JSON.stringify({ header: decode(header), payload: decode(payload), note: "Signature is not verified by this local inspector." }, null, 2);
    }
    case "uuid-generator": return Array.from({ length: 5 }, () => crypto.randomUUID()).join("\n");
    case "nanoid-generator": return Array.from({ length: 5 }, () => [...crypto.getRandomValues(new Uint8Array(16))].map((n) => "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz-"[n & 63]).join("")).join("\n");
    case "password-generator": {
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*+-=";
      return Array.from({ length: 5 }, () => [...crypto.getRandomValues(new Uint8Array(20))].map((n) => alphabet[n % alphabet.length]).join("")).join("\n");
    }
    case "hash-generator":
    case "secure-hash": return bytesToHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)));
    case "timestamp-converter": {
      const numeric = Number(input);
      const date = Number.isNaN(numeric) ? new Date(input) : new Date(numeric < 1e12 ? numeric * 1000 : numeric);
      if (Number.isNaN(date.getTime())) throw new Error("Enter a Unix timestamp or valid date.");
      return JSON.stringify({ iso: date.toISOString(), unixSeconds: Math.floor(date.getTime() / 1000), local: date.toString() }, null, 2);
    }
    case "slug-generator": return input.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    case "text-counter": {
      const words = input.trim() ? input.trim().split(/\s+/).length : 0;
      return JSON.stringify({ characters: input.length, charactersWithoutSpaces: input.replace(/\s/g, "").length, words, lines: input ? input.split("\n").length : 0, readingTimeMinutes: Math.max(1, Math.ceil(words / 220)) }, null, 2);
    }
    case "case-converter": return [input.toUpperCase(), input.toLowerCase(), input.replace(/\b\w/g, (letter) => letter.toUpperCase()), input.toLowerCase().replace(/[^a-z0-9]+(.)/g, (_, letter) => letter.toUpperCase())].join("\n\n");
    case "lorem-ipsum": return Array.from({ length: 4 }, () => "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer vitae justo sed lorem tincidunt feugiat. Nulla facilisi, donec at sem vel arcu tincidunt consequat.").join("\n\n");
    case "random-generator": return Array.from(crypto.getRandomValues(new Uint32Array(10))).map((value) => value.toString()).join("\n");
    case "random-name": {
      const first = ["Alex", "Avery", "Cameron", "Emery", "Jordan", "Morgan", "Quinn", "Riley", "Rowan", "Taylor"];
      const last = ["Arden", "Blake", "Ellis", "Hayes", "Lane", "Monroe", "Parker", "Reed", "Shaw", "Vale"];
      const random = (values: string[]) => values[crypto.getRandomValues(new Uint8Array(1))[0] % values.length];
      return Array.from({ length: 10 }, () => `${random(first)} ${random(last)}`).join("\n");
    }
    case "color-converter": {
      const match = input.trim().match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
      if (!match) throw new Error("Enter a six-digit HEX color, such as #F4F4F2.");
      const [, r, g, b] = match;
      return JSON.stringify({ hex: `#${r}${g}${b}`.toUpperCase(), rgb: `rgb(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)})`, channels: { red: parseInt(r, 16), green: parseInt(g, 16), blue: parseInt(b, 16) } }, null, 2);
    }
    case "regex-tester": {
      const [expression, ...body] = input.split("\n");
      const slash = expression.match(/^\/(.*)\/([dgimsuvy]*)$/);
      const regex = new RegExp(slash?.[1] ?? expression, slash?.[2] ?? "g");
      const matches = [...body.join("\n").matchAll(regex)].map((match) => ({ match: match[0], index: match.index, groups: match.groups ?? null }));
      return JSON.stringify({ count: matches.length, matches }, null, 2);
    }
    case "unicode": return [...input].map((character) => `${character}  U+${character.codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0")}`).join("\n");
    case "hex-viewer": return [...new TextEncoder().encode(input)].map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
    case "binary-converter": {
      const number = input.startsWith("0b") ? parseInt(input.slice(2), 2) : input.startsWith("0x") ? parseInt(input.slice(2), 16) : Number(input);
      if (!Number.isInteger(number)) throw new Error("Enter an integer in decimal, 0b binary, or 0x hex form.");
      return `DEC  ${number}\nBIN  ${number.toString(2)}\nHEX  ${number.toString(16).toUpperCase()}\nOCT  ${number.toString(8)}`;
    }
    case "calculator": return safeCalculate(input);
    case "password-strength": {
      const pool = (/[a-z]/.test(input) ? 26 : 0) + (/[A-Z]/.test(input) ? 26 : 0) + (/\d/.test(input) ? 10 : 0) + (/[^a-zA-Z0-9]/.test(input) ? 32 : 0);
      const bits = pool ? Math.round(input.length * Math.log2(pool)) : 0;
      return JSON.stringify({ entropyBits: bits, rating: bits >= 80 ? "strong" : bits >= 55 ? "good" : bits >= 35 ? "weak" : "very weak", length: input.length, advice: bits < 80 ? "Use a longer, unique passphrase or a generated password." : "Good entropy. Keep it unique and store it in a password manager." }, null, 2);
    }
    default: return input.trim() ? `Processed locally by ${tool.name}.\n\n${input}` : `Ready. Enter input to use ${tool.name}.`;
  }
}

function placeholderFor(tool: ToolDefinition) {
  if (["uuid-generator", "nanoid-generator", "password-generator"].includes(tool.id)) return "No input required — select Run";
  if (tool.id === "calculator") return "(128 * 4) + 16";
  if (tool.id === "json-formatter" || tool.id === "yaml-converter") return '{"service":"synthnet","status":"online"}';
  if (tool.category === "network") return "example.com";
  return `Enter ${tool.name.toLowerCase()} input…`;
}

export function ToolWorkbench({ tool, onBack }: { tool: ToolDefinition; onBack: () => void }) {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const isGenerator = useMemo(() => ["uuid-generator", "nanoid-generator", "password-generator"].includes(tool.id), [tool.id]);

  async function execute() {
    setRunning(true);
    setError("");
    try {
      setOutput(await runTool(tool, input));
    } catch (caught) {
      setOutput("");
      setError(caught instanceof Error ? caught.message : "Unable to process input.");
    } finally {
      setRunning(false);
    }
  }

  async function copyOutput() {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <section className="tool-workbench">
      <button className="back-button" onClick={onBack}><ArrowLeft size={15} /> ALL {tool.category.toUpperCase()} TOOLS</button>
      <div className="page-heading compact-heading">
        <div><span className="eyebrow">{tool.category} / {tool.id}</span><h1>{tool.name}</h1><p>{tool.description}</p></div>
        <span className="local-badge">LOCAL FIRST</span>
      </div>
      <div className="workbench-grid">
        <div className="editor-panel">
          <div className="panel-title"><span>INPUT</span><button onClick={() => setInput("")}><RefreshCcw size={13} /> CLEAR</button></div>
          <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder={placeholderFor(tool)} spellCheck={false} aria-label={`${tool.name} input`} />
          <div className="editor-footer"><span>{input.length} CHARS</span><span>UTF-8</span></div>
        </div>
        <div className="editor-panel output-panel">
          <div className="panel-title"><span>OUTPUT</span><button onClick={copyOutput} disabled={!output}>{copied ? <Check size={13} /> : <Clipboard size={13} />} {copied ? "COPIED" : "COPY"}</button></div>
          <pre className={!output ? "empty-output" : ""}>{output || "Output will appear here."}</pre>
          <div className="editor-footer"><span>{output.length} CHARS</span><span>{error ? "ERROR" : output ? "COMPLETE" : "WAITING"}</span></div>
        </div>
      </div>
      {error && <p className="tool-error" role="alert">{error}</p>}
      <button className="run-button" onClick={execute} disabled={running || (!input && !isGenerator)}>
        {running ? <LoaderCircle className="spin" size={16} /> : <Play size={15} fill="currentColor" />} RUN {tool.name.toUpperCase()}
        <kbd>⌘ ↵</kbd>
      </button>
    </section>
  );
}
