"use client";
/* eslint-disable @next/next/no-img-element -- Profile images use short-lived private Storage URLs. */

import { useCallback, useEffect, useState } from "react";
import { ImagePlus, KeyRound, Laptop, Link2, LoaderCircle, MonitorSmartphone, RefreshCw, Save, ShieldCheck, UserRound, X } from "lucide-react";
import type { SessionAccount } from "@/lib/types";
import type { ProfileLink, ProfilePrivacy, SocialProfile } from "@/lib/social/types";
import { apiRequest } from "@/lib/client/api";
import { applyTheme, type ThemePreference } from "@/lib/client/theme";

type Profile = { displayName: string; bio: string; theme: ThemePreference };
type AccountSession = { id: string; createdAt: string; expiresAt: string; ip: string; userAgent: string; isCurrent: boolean };

export function SettingsView({ account }: { account: SessionAccount }) {
  const [profile, setProfile] = useState<Profile>({ displayName: "", bio: "", theme: "dark" });
  const [socialProfile, setSocialProfile] = useState<Pick<SocialProfile, "statusText" | "links" | "privacy" | "avatarUrl" | "bannerUrl">>({
    statusText: "",
    links: [],
    privacy: { activity: "friends", mutuals: true, presence: true, friendRequests: true },
    avatarUrl: null,
    bannerUrl: null,
  });
  const [sessions, setSessions] = useState<AccountSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    const [profileData, sessionData, socialData] = await Promise.all([
      apiRequest<{ profile: Profile }>("/api/account/profile", { signal }),
      apiRequest<{ sessions: AccountSession[] }>("/api/account/sessions", { signal }),
      apiRequest<{ profile: SocialProfile }>(`/api/social/profile?username=${account.username}`, { signal }),
    ]);
    setProfile(profileData.profile);
    setSessions(sessionData.sessions);
    setSocialProfile({ statusText: socialData.profile.statusText, links: socialData.profile.links, privacy: socialData.profile.privacy, avatarUrl: socialData.profile.avatarUrl, bannerUrl: socialData.profile.bannerUrl });
    applyTheme(profileData.profile.theme);
  }, [account.username]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).catch((error) => {
      if (error.name !== "AbortError") setNotice(error.message);
    }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [load]);

  async function saveProfile() {
    setBusy("profile");
    setNotice("");
    try {
      const data = await apiRequest<{ profile: Profile }>("/api/account/profile", {
        method: "PATCH",
        body: JSON.stringify(profile),
      });
      await apiRequest("/api/social/profile", {
        method: "PATCH",
        body: JSON.stringify({ displayName: profile.displayName, bio: profile.bio, statusText: socialProfile.statusText, links: socialProfile.links.filter((link) => link.label.trim() && link.url.trim()), privacy: socialProfile.privacy }),
      });
      setProfile(data.profile);
      applyTheme(data.profile.theme);
      setNotice("Profile and appearance saved.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to save profile."); }
    finally { setBusy(""); }
  }

  async function uploadProfileImage(file: File, purpose: "avatar" | "banner") {
    setBusy(purpose);
    setNotice("");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("purpose", purpose);
      await apiRequest("/api/social/upload", { method: "POST", body: form });
      await load();
      setNotice(`${purpose === "avatar" ? "Profile picture" : "Banner"} updated.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to upload image."); }
    finally { setBusy(""); }
  }

  function updateLink(index: number, patch: Partial<ProfileLink>) {
    setSocialProfile((current) => ({ ...current, links: current.links.map((link, linkIndex) => linkIndex === index ? { ...link, ...patch } : link) }));
  }

  function updatePrivacy(patch: Partial<ProfilePrivacy>) {
    setSocialProfile((current) => ({ ...current, privacy: { ...current.privacy, ...patch } }));
  }

  async function changePin() {
    setBusy("pin");
    setNotice("");
    try {
      await apiRequest<{ changed: boolean }>("/api/account/pin", {
        method: "POST",
        body: JSON.stringify({ currentPin, newPin, confirmPin }),
      });
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
      setNotice("PIN changed. Other sessions were signed out.");
      await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to change PIN."); }
    finally { setBusy(""); }
  }

  async function revoke(action: "revoke" | "revoke_others", sessionId?: string) {
    setBusy(sessionId ?? action);
    setNotice("");
    try {
      const data = await apiRequest<{ revoked: number; sessions: AccountSession[] }>("/api/account/sessions", {
        method: "DELETE",
        body: JSON.stringify(action === "revoke" ? { action, sessionId } : { action }),
      });
      setSessions(data.sessions);
      setNotice(data.revoked ? `${data.revoked} session${data.revoked === 1 ? "" : "s"} revoked.` : "No matching session was active.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to revoke session."); }
    finally { setBusy(""); }
  }

  return <>
    <div className="page-heading compact-heading"><div><span className="eyebrow">ACCOUNT / SECURITY</span><h1>Account settings.</h1><p>Manage your profile, appearance, PIN, and active devices.</p></div><span className="local-badge"><ShieldCheck size={13} /> PROTECTED</span></div>
    {notice && <p className="admin-notice" role="status">{notice}</p>}
    <div className="settings-grid account-settings-grid" aria-busy={loading}>
      <section className="content-card profile-settings"><div className="section-title"><div><span className="eyebrow">PROFILE</span><h2>Public identity</h2></div><UserRound size={18} /></div><div className="profile-summary"><div className="profile-avatar">{socialProfile.avatarUrl ? <img src={socialProfile.avatarUrl} alt="" /> : account.username.slice(0, 2).toUpperCase()}</div><div><strong>{profile.displayName || account.username}</strong><small>@{account.username} · {account.accountType.toUpperCase()}</small></div></div><div className="profile-media-actions"><label><ImagePlus size={13} /> PROFILE PICTURE<input hidden type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => event.target.files?.[0] && void uploadProfileImage(event.target.files[0], "avatar")} /></label><label><ImagePlus size={13} /> BANNER<input hidden type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => event.target.files?.[0] && void uploadProfileImage(event.target.files[0], "banner")} /></label></div><label>DISPLAY NAME<input value={profile.displayName} maxLength={80} onChange={(event) => setProfile((current) => ({ ...current, displayName: event.target.value }))} placeholder="How your name appears" /></label><label>STATUS<input value={socialProfile.statusText} maxLength={120} onChange={(event) => setSocialProfile((current) => ({ ...current, statusText: event.target.value }))} placeholder="What are you working on?" /></label><label>BIO<textarea value={profile.bio} maxLength={500} onChange={(event) => setProfile((current) => ({ ...current, bio: event.target.value }))} placeholder="A short description" /><small>{profile.bio.length}/500</small></label><label>APPEARANCE<select value={profile.theme} onChange={(event) => { const theme = event.target.value as ThemePreference; setProfile((current) => ({ ...current, theme })); applyTheme(theme); }}><option value="dark">Dark</option><option value="light">Light</option><option value="system">Use system</option></select></label><button className="primary-button" disabled={busy === "profile" || loading} onClick={() => void saveProfile()}>{busy === "profile" ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />} SAVE PROFILE</button></section>
      <section className="content-card social-profile-settings"><div className="section-title"><div><span className="eyebrow">SOCIAL PROFILE</span><h2>Links & privacy</h2></div><Link2 size={18} /></div><div className="profile-link-editor">{socialProfile.links.map((link, index) => <div key={index}><input aria-label={`Link ${index + 1} label`} value={link.label} maxLength={40} onChange={(event) => updateLink(index, { label: event.target.value })} placeholder="Label" /><input aria-label={`Link ${index + 1} URL`} type="url" value={link.url} maxLength={300} onChange={(event) => updateLink(index, { url: event.target.value })} placeholder="https://…" /><button onClick={() => setSocialProfile((current) => ({ ...current, links: current.links.filter((_, linkIndex) => linkIndex !== index) }))}><X size={13} /></button></div>)}{socialProfile.links.length < 8 && <button onClick={() => setSocialProfile((current) => ({ ...current, links: [...current.links, { label: "", url: "" }] }))}>+ ADD LINK</button>}</div><div className="privacy-settings"><label>ACTIVITY VISIBILITY<select value={socialProfile.privacy.activity} onChange={(event) => updatePrivacy({ activity: event.target.value as ProfilePrivacy["activity"] })}><option value="everyone">Everyone</option><option value="friends">Friends</option><option value="private">Private</option></select></label><label><input type="checkbox" checked={socialProfile.privacy.presence} onChange={(event) => updatePrivacy({ presence: event.target.checked })} /> Show online presence</label><label><input type="checkbox" checked={socialProfile.privacy.mutuals} onChange={(event) => updatePrivacy({ mutuals: event.target.checked })} /> Show mutual friends and groups</label><label><input type="checkbox" checked={socialProfile.privacy.friendRequests} onChange={(event) => updatePrivacy({ friendRequests: event.target.checked })} /> Allow friend requests</label></div></section>
      <section className="content-card pin-settings"><div className="section-title"><div><span className="eyebrow">CREDENTIALS</span><h2>Change security PIN</h2></div><KeyRound size={18} /></div><p className="section-copy">Changing your PIN signs out every other device while preserving this session.</p><label>CURRENT PIN<input type="password" inputMode="numeric" autoComplete="current-password" value={currentPin} onChange={(event) => setCurrentPin(event.target.value.replace(/\D/g, "").slice(0, 12))} /></label><label>NEW PIN<input type="password" inputMode="numeric" autoComplete="new-password" value={newPin} onChange={(event) => setNewPin(event.target.value.replace(/\D/g, "").slice(0, 12))} placeholder="6–12 digits" /></label><label>CONFIRM NEW PIN<input type="password" inputMode="numeric" autoComplete="new-password" value={confirmPin} onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, "").slice(0, 12))} /></label><button className="primary-button" disabled={busy === "pin" || currentPin.length < 4 || newPin.length < 6 || newPin !== confirmPin} onClick={() => void changePin()}>{busy === "pin" ? <LoaderCircle className="spin" size={15} /> : <KeyRound size={15} />} UPDATE PIN</button></section>
      <section className="content-card session-manager owner-wide"><div className="section-title"><div><span className="eyebrow">ACTIVE DEVICES</span><h2>Session management</h2></div><span className="section-actions"><button disabled={loading} onClick={() => void load()}><RefreshCw size={13} /> REFRESH</button><button disabled={sessions.length < 2 || busy === "revoke_others"} onClick={() => void revoke("revoke_others")}><MonitorSmartphone size={13} /> SIGN OUT OTHERS</button></span></div><div className="session-list">{sessions.map((session) => <div key={session.id}><span className="session-device"><Laptop size={17} /></span><p><strong>{session.isCurrent ? "Current browser" : session.userAgent.slice(0, 80)}</strong><small>{session.ip} · started {new Date(session.createdAt).toLocaleString()} · expires {new Date(session.expiresAt).toLocaleString()}</small></p>{session.isCurrent ? <span className="status-chip">CURRENT</span> : <button disabled={busy === session.id} onClick={() => void revoke("revoke", session.id)}>REVOKE</button>}</div>)}{!loading && !sessions.length && <div className="inline-empty"><p><strong>No active sessions</strong><small>Sign in again to create a new session.</small></p></div>}</div></section>
    </div>
  </>;
}
