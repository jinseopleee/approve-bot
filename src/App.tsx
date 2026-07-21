import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import logoUrl from "./assets/logo.png";
import angSfx from "./assets/ang.mp3";
import cheerupUrl from "./assets/cheerup_song.mp3";
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

  // "Wake up": play the cheer-up song while a floating icon drifts across the
  // window. The song can only be stopped by clicking that floating icon.
  const [wakeActive, setWakeActive] = useState(false);
  const [wakePos, setWakePos] = useState({ x: 0, y: 0 });
  const cheerup = useMemo(() => new Audio(cheerupUrl), []);

  // While active, drift the icon to a fresh random spot on an interval; the CSS
  // transition floats it there smoothly (no rotation).
  useEffect(() => {
    if (!wakeActive) return;
    const ICON = 72;
    const move = () => {
      setWakePos({
        x: Math.random() * Math.max(0, window.innerWidth - ICON),
        y: Math.random() * Math.max(0, window.innerHeight - ICON),
      });
    };
    move();
    const id = setInterval(move, 1000);
    return () => clearInterval(id);
  }, [wakeActive]);

  useEffect(() => {
    const onEnded = () => setWakeActive(false);
    cheerup.addEventListener("ended", onEnded);
    return () => cheerup.removeEventListener("ended", onEnded);
  }, [cheerup]);

  const startWakeUp = useCallback(() => {
    // After a song plays to the end the element is left "ended"; a plain
    // currentTime=0 + play() can start from the old end position on the first
    // click (firing "ended" again → no sound). load() resets it to the start
    // and clears the ended flag so a single press always restarts the song.
    cheerup.load();
    void cheerup.play().catch(() => {});
    setWakeActive(true);
  }, [cheerup]);

  const stopWakeUp = useCallback(() => {
    cheerup.pause();
    cheerup.currentTime = 0;
    setWakeActive(false);
  }, [cheerup]);

  // Short click SFX for the logo. Uses a cloned HTMLMediaElement per click
  // rather than the Web Audio API: on WKWebView an AudioContext gets
  // interrupted whenever another element (the Wake-up song) plays or the
  // window is hidden to the tray, which silenced this sound. A fresh cloned
  // element always plays from the start, overlaps cleanly on rapid clicks,
  // and is unaffected by the song's playback.
  const ang = useMemo(() => {
    const a = new Audio(angSfx);
    a.preload = "auto";
    return a;
  }, []);

  const playAng = useCallback(() => {
    const clip = ang.cloneNode(true) as HTMLAudioElement;
    void clip.play().catch(() => {});
  }, [ang]);

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
          <ConnectionStatus onWakeUp={startWakeUp} />
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
      {wakeActive &&
        createPortal(
          <img
            className="wake-floater"
            src={logoUrl}
            alt="노래 멈추려면 클릭"
            title="클릭해서 노래 멈추기"
            style={{ transform: `translate(${wakePos.x}px, ${wakePos.y}px)` }}
            onClick={stopWakeUp}
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
