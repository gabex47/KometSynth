"use client";

import { FormEvent, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, KeyRound, LoaderCircle, ShieldCheck, UserPlus } from "lucide-react";
import Link from "next/link";
import { apiRequest } from "@/lib/client/api";

type Step = "username" | "pin";
type Mode = "login" | "register";

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>("login");
  const [step, setStep] = useState<Step>("username");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const pinRef = useRef<HTMLInputElement>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setStep("username");
    setPin("");
    setConfirmPin("");
    setInviteCode("");
    setError("");
  }

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

  async function register(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    setError("");
    if (pin !== confirmPin) {
      setError("PINs must match.");
      return;
    }
    setLoading(true);
    try {
      await apiRequest<{ registered: boolean }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ username, pin, confirmPin, inviteCode }),
      });
      window.location.assign("/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create account.");
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

      <section className={`auth-panel ${mode === "register" ? "register-panel" : ""}`} aria-labelledby="auth-title">
        <div className="auth-kicker">{mode === "register" ? <UserPlus size={14} /> : <ShieldCheck size={14} />} {mode === "register" ? "INVITED REGISTRATION" : "RESTRICTED SYSTEM"}</div>
        <h1 id="auth-title">{mode === "register" ? "Create your identity." : "Identify yourself."}</h1>
        <p className="auth-copy">{mode === "register" ? "Registration requires a valid invitation. No email address or third-party identity is required." : "Authorized personnel only. All access attempts are monitored and recorded."}</p>

        {mode === "login" ? <>
          <div className="step-track" aria-label={`Authentication step ${step === "username" ? 1 : 2} of 2`}><span className="active" /><span className={step === "pin" ? "active" : ""} /></div>
          {step === "username" ? (
            <form onSubmit={submitUsername} className="auth-form">
              <label htmlFor="username">USERNAME</label>
              <div className="terminal-field"><span>›</span><input id="username" name="username" value={username} onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))} autoComplete="username" autoCapitalize="none" spellCheck={false} pattern="[a-zA-Z0-9_-]{3,32}" maxLength={32} autoFocus placeholder="enter username" required /></div>
              {error && <p className="form-error" role="alert">{error}</p>}
              <button className="primary-button" type="submit" disabled={loading || username.length < 3}>{loading ? <LoaderCircle className="spin" size={16} /> : <>CONTINUE <ArrowRight size={16} /></>}</button>
              <button className="text-button" type="button" onClick={() => switchMode("register")}><UserPlus size={14} /> CREATE AN INVITED ACCOUNT</button>
            </form>
          ) : (
            <form onSubmit={submitPin} className="auth-form">
              <div className="identity-confirmed"><span><Check size={14} /></span><div><small>IDENTITY ENTERED</small><strong>{username}</strong></div></div>
              <label htmlFor="pin">SECURITY PIN</label>
              <div className="terminal-field pin-field"><KeyRound size={16} /><input ref={pinRef} id="pin" name="pin" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 12))} autoComplete="current-password" inputMode="numeric" type="password" minLength={4} maxLength={12} placeholder="••••••" required /></div>
              {error && <p className="form-error" role="alert">{error}</p>}
              <button className="primary-button" type="submit" disabled={loading || pin.length < 4}>{loading ? <LoaderCircle className="spin" size={16} /> : <>AUTHENTICATE <ArrowRight size={16} /></>}</button>
              <button className="text-button" type="button" onClick={() => { setStep("username"); setPin(""); setError(""); }}><ArrowLeft size={14} /> USE ANOTHER IDENTITY</button>
            </form>
          )}
        </> : (
          <form onSubmit={register} className="auth-form register-form">
            <label htmlFor="register-username">USERNAME</label>
            <div className="terminal-field"><span>›</span><input id="register-username" value={username} onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))} autoComplete="username" maxLength={32} minLength={3} autoFocus placeholder="choose username" required /></div>
            <div className="register-columns"><label htmlFor="register-pin">SECURITY PIN<div className="terminal-field pin-field"><KeyRound size={16} /><input id="register-pin" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 12))} autoComplete="new-password" inputMode="numeric" type="password" minLength={6} maxLength={12} placeholder="6–12 digits" required /></div></label><label htmlFor="confirm-pin">CONFIRM PIN<div className="terminal-field pin-field"><Check size={16} /><input id="confirm-pin" value={confirmPin} onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, "").slice(0, 12))} autoComplete="new-password" inputMode="numeric" type="password" minLength={6} maxLength={12} placeholder="repeat PIN" required /></div></label></div>
            <label htmlFor="invite-code">INVITATION CODE</label>
            <div className="terminal-field"><ShieldCheck size={16} /><input id="invite-code" value={inviteCode} onChange={(event) => setInviteCode(event.target.value.trim())} autoComplete="off" maxLength={128} placeholder="snet_…" required /></div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-button" type="submit" disabled={loading || username.length < 3 || pin.length < 6 || confirmPin.length < 6 || inviteCode.length < 16}>{loading ? <LoaderCircle className="spin" size={16} /> : <>CREATE SECURE ACCOUNT <ArrowRight size={16} /></>}</button>
            <button className="text-button" type="button" onClick={() => switchMode("login")}><ArrowLeft size={14} /> RETURN TO SIGN IN</button>
          </form>
        )}
      </section>

      <footer className="auth-footer"><span>ENCRYPTED CONNECTION</span><span>HTTPS REQUIRED</span><span>SESSION // PENDING</span></footer>
    </main>
  );
}
