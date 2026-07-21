import { useEffect, useState } from "react";
import type { AppConfig } from "../lib/types";
import { api } from "../lib/tauri";

interface Props {
  value: AppConfig;
  onChange: (next: AppConfig) => void;
}

export function SettingsPanel({ value, onChange }: Props) {
  function patch(p: Partial<AppConfig>) {
    onChange({ ...value, ...p });
  }

  // Launch-at-login is an OS-managed login item, not part of AppConfig, so it
  // reflects the real system state and applies immediately (no Save needed).
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [autostartBusy, setAutostartBusy] = useState(false);

  useEffect(() => {
    api
      .getAutostart()
      .then(setAutostart)
      .catch(() => setAutostart(false));
  }, []);

  async function toggleAutostart(enabled: boolean) {
    setAutostartBusy(true);
    const prev = autostart;
    setAutostart(enabled); // optimistic
    try {
      await api.setAutostart(enabled);
    } catch {
      setAutostart(prev); // revert on failure
    } finally {
      setAutostartBusy(false);
    }
  }

  return (
    <div className="panel">
      <label className="toggle">
        <input
          type="checkbox"
          checked={autostart ?? false}
          disabled={autostart === null || autostartBusy}
          onChange={(e) => toggleAutostart(e.target.checked)}
        />
        컴퓨터 켜면 자동 실행
      </label>
      <label className="toggle">
        <input
          type="checkbox"
          checked={value.auto_approve_enabled}
          onChange={(e) => patch({ auto_approve_enabled: e.target.checked })}
        />
        Auto-approve enabled
      </label>
      <label className="toggle">
        <input
          type="checkbox"
          checked={value.skip_drafts}
          onChange={(e) => patch({ skip_drafts: e.target.checked })}
        />
        Skip draft PRs
      </label>
      <div className="row">
        <span style={{ minWidth: 120 }}>Polling interval</span>
        <input
          type="number"
          min={30}
          max={3600}
          step={10}
          value={value.polling_interval_seconds}
          onChange={(e) =>
            patch({
              polling_interval_seconds: Math.max(
                30,
                Math.min(3600, parseInt(e.target.value || "60", 10) || 60),
              ),
            })
          }
          style={{ maxWidth: 100 }}
        />
        <span className="muted">seconds (30–3600)</span>
      </div>
      <div>
        <div className="muted" style={{ marginBottom: 4 }}>
          Approval message (optional)
        </div>
        <textarea
          rows={2}
          placeholder="e.g. LGTM (auto-approved by approve-bot)"
          value={value.approval_message}
          onChange={(e) => patch({ approval_message: e.target.value })}
          style={{ width: "100%", resize: "vertical" }}
        />
      </div>
    </div>
  );
}
