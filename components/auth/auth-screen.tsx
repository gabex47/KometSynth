"use client";

import { FormEvent, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { apiRequest } from "@/lib/client/api";

type Step = "username" | "pin";

export function AuthScreen() {
  const [step, setStep] = useState<Step>("username");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const pinRef = useRef<HTMLInputElement>(null);

  async function submitUsername(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      await apiRequest<{ accepted: boolean }>("/api/auth/username", {
        method: "POST",
        body: JSON.stringify({ username }),
      });
      setStep("pin");
      requestAnimationFrame(() => pinRef.current?.focus());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Access denied.");
    } finally {
      setLoading(false);
    }
  }

  async function submitPin(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      await apiRequest<{ authenticated: boolean }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, pin }),
      });
      window.location.assign("/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Invalid credentials.");
      setPin("");
      pinRef.current?.focus();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <header className="auth-header">
        <Link className="brand" href="/" aria-label="SynthNet home">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span>SYNTHNET</span>
        </Link>
        <span className="system-state"><i /> SYSTEM ONLINE</span>
      </header>

      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="auth-kicker"><ShieldCheck size={14} /> RESTRICTED SYSTEM</div>
        <h1 id="auth-title">Identify yourself.</h1>
        <p className="auth-copy">
          Authorized personnel only. All access attempts are monitored and recorded.
        </p>

        <div className="step-track" aria-label={`Authentication step ${step === "username" ? 1 : 2} of 2`}>
          <span className="active" />
          <span className={step === "pin" ? "active" : ""} />
        </div>

        {step === "username" ? (
          <form onSubmit={submitUsername} className="auth-form">
            <label htmlFor="username">USERNAME</label>
            <div className="terminal-field">
              <span>›</span>
              <input
                id="username"
                name="username"
                value={username}
                onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                pattern="[a-zA-Z0-9_-]{3,32}"
                maxLength={32}
                autoFocus
                placeholder="enter username"
                required
              />
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-button" type="submit" disabled={loading || username.length < 3}>
              {loading ? <LoaderCircle className="spin" size={16} /> : <>CONTINUE <ArrowRight size={16} /></>}
            </button>
          </form>
        ) : (
          <form onSubmit={submitPin} className="auth-form">
            <div className="identity-confirmed">
              <span><Check size={14} /></span>
              <div><small>IDENTITY ENTERED</small><strong>{username}</strong></div>
            </div>
            <label htmlFor="pin">SECURITY PIN</label>
            <div className="terminal-field pin-field">
              <KeyRound size={16} />
              <input
                ref={pinRef}
                id="pin"
                name="pin"
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 12))}
                autoComplete="current-password"
                inputMode="numeric"
                type="password"
                minLength={4}
                maxLength={12}
                placeholder="••••••"
                required
              />
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-button" type="submit" disabled={loading || pin.length < 4}>
              {loading ? <LoaderCircle className="spin" size={16} /> : <>AUTHENTICATE <ArrowRight size={16} /></>}
            </button>
            <button className="text-button" type="button" onClick={() => { setStep("username"); setPin(""); setError(""); }}>
              <ArrowLeft size={14} /> USE ANOTHER IDENTITY
            </button>
          </form>
        )}
      </section>

      <footer className="auth-footer">
        <span>ENCRYPTED CONNECTION</span>
        <span>HTTPS REQUIRED</span>
        <span>SESSION // PENDING</span>
      </footer>
    </main>
  );
}
