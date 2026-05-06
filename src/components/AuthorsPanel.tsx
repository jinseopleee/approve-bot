import { useEffect, useRef, useState } from "react";
import { api } from "../lib/tauri";
import type { GhUserHint } from "../lib/types";

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
}

const USERNAME_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const DEBOUNCE_MS = 250;

export function AuthorsPanel({ value, onChange }: Props) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hints, setHints] = useState<GhUserHint[]>([]);
  const [highlight, setHighlight] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const reqIdRef = useRef(0);

  // Close on outside click.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Debounced search.
  useEffect(() => {
    const q = draft.trim().replace(/^@/, "");
    if (q.length < 1) {
      setHints([]);
      setLoading(false);
      return;
    }
    const myId = ++reqIdRef.current;
    setLoading(true);
    const t = window.setTimeout(async () => {
      try {
        const result = await api.searchUsers(q);
        if (reqIdRef.current !== myId) return;
        setHints(result);
        setHighlight(0);
        setOpen(true);
      } catch {
        if (reqIdRef.current !== myId) return;
        setHints([]);
      } finally {
        if (reqIdRef.current === myId) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [draft]);

  function commit(login: string) {
    const v = login.trim().replace(/^@/, "").toLowerCase();
    if (!v) return;
    if (!USERNAME_PATTERN.test(v)) {
      setError("Invalid GitHub username");
      return;
    }
    if (value.includes(v)) {
      setError("Already in list");
      return;
    }
    setError(null);
    setDraft("");
    setHints([]);
    setOpen(false);
    onChange([...value, v]);
  }

  function add() {
    if (open && hints[highlight]) {
      commit(hints[highlight].login);
    } else {
      commit(draft);
    }
  }

  function remove(name: string) {
    onChange(value.filter((n) => n !== name));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      if (hints.length === 0) return;
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => (h + 1) % hints.length);
    } else if (e.key === "ArrowUp") {
      if (hints.length === 0) return;
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => (h - 1 + hints.length) % hints.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      add();
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Tab" && open && hints[highlight]) {
      e.preventDefault();
      setDraft(hints[highlight].login);
      setOpen(false);
    }
  }

  const filteredHints = hints.filter(
    (h) => !value.includes(h.login.toLowerCase()),
  );

  return (
    <div className="panel">
      <h2>Allowed authors ({value.length})</h2>
      <div className="row autocomplete" ref={containerRef}>
        <div className="autocomplete-wrap">
          <input
            type="text"
            placeholder="@username"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            onFocus={() => filteredHints.length > 0 && setOpen(true)}
            onKeyDown={onKeyDown}
            autoComplete="off"
            spellCheck={false}
          />
          {open && (loading || filteredHints.length > 0) && (
            <ul className="autocomplete-menu">
              {loading && filteredHints.length === 0 && (
                <li className="muted">Searching…</li>
              )}
              {filteredHints.map((h, idx) => (
                <li
                  key={h.login}
                  className={idx === highlight ? "active" : ""}
                  onMouseEnter={() => setHighlight(idx)}
                  onMouseDown={(ev) => {
                    ev.preventDefault();
                    commit(h.login);
                  }}
                >
                  {h.avatar_url && (
                    <img src={h.avatar_url} alt="" className="avatar" />
                  )}
                  <span>@{h.login}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button onClick={add}>Add</button>
      </div>
      {error && <div className="error-text">{error}</div>}
      <ul className="list">
        {value.length === 0 && (
          <li className="muted">
            No authors allowed — nothing will be approved until you add some.
          </li>
        )}
        {value.map((n) => (
          <li key={n}>
            <span>@{n}</span>
            <button className="danger" onClick={() => remove(n)}>
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
