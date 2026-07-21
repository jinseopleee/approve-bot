import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import logoUrl from "./assets/logo.png";
import angSfx from "./assets/ang.mp3";
import { ConnectionStatus } from "./components/ConnectionStatus";
import { RepositoriesPanel } from "./components/RepositoriesPanel";
import { AuthorsPanel } from "./components/AuthorsPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { ActivityLog } from "./components/ActivityLog";
import { api } from "./lib/tauri";
import type { AppConfig } from "./lib/types";

const DEFAULT_CFG: AppConfig = {
  repositories: [],
  allowed_authors: [],
  polling_interval_seconds: 60,
  auto_approve_enabled: true,
  approval_message: "",
  skip_drafts: true,
};

function eq(a: AppConfig, b: AppConfig): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export default function App() {
  const [saved, setSaved] = useState<AppConfig>(DEFAULT_CFG);
  const [draft, setDraft] = useState<AppConfig>(DEFAULT_CFG);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [logoFlash, setLogoFlash] = useState(false);

  // Preload & decode the sound up front so playback is instant on click,
  // with no first-play network/decode latency (Web Audio API).
  const audioCtxRef = useRef<AudioContext | null>(null);
  const angBufferRef = useRef<AudioBuffer | null>(null);

  useEffect(() => {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    audioCtxRef.current = ctx;
    let cancelled = false;
    fetch(angSfx)
      .then((r) => r.arrayBuffer())
      .then((buf) => ctx.decodeAudioData(buf))
      .then((decoded) => {
        if (!cancelled) angBufferRef.current = decoded;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      void ctx.close();
    };
  }, []);

  const playAng = useCallback(() => {
    const ctx = audioCtxRef.current;
    const buffer = angBufferRef.current;
    if (!ctx || !buffer) return;
    if (ctx.state === "suspended") void ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start(0);
  }, []);

  useEffect(() => {
    api
      .getConfig()
      .then((c) => {
        setSaved(c);
        setDraft(c);
      })
      .catch((e) => setErr(String(e)));
  }, []);

  useEffect(() => {
    if (!settingsOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSettingsOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen]);

  const dirty = useMemo(() => !eq(saved, draft), [saved, draft]);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const next = await api.updateConfig(draft);
      setSaved(next);
      setDraft(next);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setDraft(saved);
    setErr(null);
  }

  return (
    <div className="app">
      <div className="header">
        <div className="header-left">
          <img
            className="app-logo"
            src={logoUrl}
            alt="approve-bot logo"
            title="approve-bot"
            onClick={() => {
              playAng();
              setLogoFlash(false);
              // restart the animation even on rapid re-clicks
              requestAnimationFrame(() => setLogoFlash(true));
            }}
          />
          <ConnectionStatus />
        </div>
        <div className="header-right">
          <div className="muted">approve-bot</div>
          <button
            className="icon-btn"
            title="Settings"
            aria-label="Settings"
            onClick={() => setSettingsOpen(true)}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </div>
      <div className="body">
        <div className="col">
          <RepositoriesPanel
            value={draft.repositories}
            onChange={(repositories) => setDraft({ ...draft, repositories })}
          />
          <AuthorsPanel
            value={draft.allowed_authors}
            onChange={(allowed_authors) =>
              setDraft({ ...draft, allowed_authors })
            }
          />
          {dirty && (
            <div className="dirty-bar">
              <span>You have unsaved changes.</span>
              <span className="row">
                <button onClick={reset} disabled={busy}>
                  Discard
                </button>
                <button className="primary" onClick={save} disabled={busy}>
                  {busy ? "Saving…" : "Save"}
                </button>
              </span>
            </div>
          )}
          {err && <div className="error-text">{err}</div>}
        </div>
        <div className="col">
          <ActivityLog />
        </div>
      </div>
      {logoFlash &&
        createPortal(
          <div
            className="logo-flash"
            style={{ backgroundImage: `url(${logoUrl})` }}
            onAnimationEnd={() => setLogoFlash(false)}
          />,
          document.body,
        )}
      {settingsOpen &&
        createPortal(
          <div
            className="overlay"
            onClick={() => setSettingsOpen(false)}
          >
            <div
              className="overlay-card"
              role="dialog"
              aria-modal="true"
              aria-label="Settings"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="overlay-header">
                <h2>Settings</h2>
                <button
                  className="icon-btn"
                  title="Close"
                  aria-label="Close"
                  onClick={() => setSettingsOpen(false)}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <SettingsPanel value={draft} onChange={setDraft} />
              {dirty && (
                <div className="dirty-bar">
                  <span>You have unsaved changes.</span>
                  <span className="row">
                    <button onClick={reset} disabled={busy}>
                      Discard
                    </button>
                    <button className="primary" onClick={save} disabled={busy}>
                      {busy ? "Saving…" : "Save"}
                    </button>
                  </span>
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
