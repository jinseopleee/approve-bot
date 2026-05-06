import { useEffect, useState } from "react";
import { api, onStatusChanged } from "../lib/tauri";
import type { ConnectionStatus as Status } from "../lib/types";

export function ConnectionStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getConnectionStatus().then(setStatus).catch(() => {});
    const off = onStatusChanged(setStatus);
    return () => {
      off.then((u) => u()).catch(() => {});
    };
  }, []);

  async function reconnect() {
    setBusy(true);
    try {
      const s = await api.reconnect();
      setStatus(s);
    } finally {
      setBusy(false);
    }
  }

  const ok = status?.connected ?? false;
  const rate =
    status?.rate_limit_remaining != null && status?.rate_limit_total != null
      ? `${status.rate_limit_remaining}/${status.rate_limit_total}`
      : null;

  return (
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
      <button onClick={reconnect} disabled={busy}>
        {busy ? "Connecting…" : "Reconnect"}
      </button>
      <button onClick={() => api.forceCheckNow()}>Check now</button>
    </div>
  );
}
