import { useEffect, useState } from "react";
import { api, onGhLoginProgress, onStatusChanged } from "../lib/tauri";
import type { ConnectionStatus as Status } from "../lib/types";

interface Props {
  onWakeUp: () => void;
}

export function ConnectionStatus({ onWakeUp }: Props) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [deviceCode, setDeviceCode] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);

  useEffect(() => {
    api.getConnectionStatus().then(setStatus).catch(() => {});
    const offStatus = onStatusChanged(setStatus);
    const offLogin = onGhLoginProgress((p) => {
      switch (p.kind) {
        case "started":
          setSigningIn(true);
          setDeviceCode(null);
          setLoginError(null);
          setCodeCopied(false);
          break;
        case "code":
          setDeviceCode(p.code);
          break;
        case "done":
          setSigningIn(false);
          setDeviceCode(null);
          break;
        case "failed":
          setSigningIn(false);
          setDeviceCode(null);
          setLoginError(p.message);
          break;
      }
    });
    return () => {
      offStatus.then((u) => u()).catch(() => {});
      offLogin.then((u) => u()).catch(() => {});
    };
  }, []);

  async function reconnect() {
    setBusy(true);
    setLoginError(null);
    try {
      const s = await api.reconnect();
      setStatus(s);
      const err = (s.last_error ?? "").toLowerCase();
      const needsLogin =
        !s.connected &&
        (err.includes("gh cli") ||
          err.includes("gh auth") ||
          err.includes("not authenticated") ||
          err.includes("sign in"));
      if (needsLogin) {
        await api.startGhLogin();
      }
    } finally {
      setBusy(false);
    }
  }

  async function signIn() {
    setLoginError(null);
    await api.startGhLogin();
  }

  async function copyCode() {
    if (!deviceCode) return;
    try {
      await navigator.clipboard.writeText(deviceCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 1500);
    } catch {
      // clipboard may be unavailable; ignore
    }
  }

  const ok = status?.connected ?? false;
  const rate =
    status?.rate_limit_remaining != null && status?.rate_limit_total != null
      ? `${status.rate_limit_remaining}/${status.rate_limit_total}`
      : null;

  return (
    <div className="connection" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div className="row" style={{ gap: 12 }}>
        <span>
          <span className={`status-dot ${ok ? "ok" : ""}`} />
          {ok ? (
            <>
              Connected as <b>@{status?.username}</b>
              {rate && <span className="muted"> · rate {rate}</span>}
            </>
          ) : (
            <>
              Disconnected
              {status?.last_error && (
                <span className="error-text"> — {status.last_error}</span>
              )}
            </>
          )}
        </span>
        <button onClick={reconnect} disabled={busy || signingIn}>
          {busy ? "Connecting…" : "Reconnect"}
        </button>
        {!ok && !signingIn && (
          <button onClick={signIn} disabled={busy}>
            Sign in with GitHub
          </button>
        )}
        <button onClick={() => api.forceCheckNow()}>Check now</button>
        <button onClick={onWakeUp}>Wake up</button>
      </div>

      {signingIn && (
        <div
          className="row"
          style={{
            gap: 8,
            padding: "8px 10px",
            border: "1px solid var(--info)",
            borderRadius: 6,
            background: "rgba(59, 130, 246, 0.08)",
          }}
        >
          {deviceCode ? (
            <>
              <span>Enter this code in the browser:</span>
              <code
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  padding: "2px 8px",
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                }}
              >
                {deviceCode}
              </code>
              <button onClick={copyCode}>{codeCopied ? "Copied" : "Copy"}</button>
              <span className="muted">waiting for browser authorization…</span>
            </>
          ) : (
            <span className="muted">Starting GitHub sign-in…</span>
          )}
        </div>
      )}

      {loginError && (
        <div className="error-text">Sign-in failed: {loginError}</div>
      )}
    </div>
  );
}
