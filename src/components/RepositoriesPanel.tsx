import { useState } from "react";

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
}

const REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

export function RepositoriesPanel({ value, onChange }: Props) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add() {
    const v = draft.trim();
    if (!v) return;
    if (!REPO_PATTERN.test(v)) {
      setError("Format must be owner/repo");
      return;
    }
    if (value.includes(v)) {
      setError("Already in list");
      return;
    }
    setError(null);
    setDraft("");
    onChange([...value, v]);
  }

  function remove(repo: string) {
    onChange(value.filter((r) => r !== repo));
  }

  return (
    <div className="panel">
      <h2>Repositories ({value.length})</h2>
      <div className="row">
        <input
          type="text"
          placeholder="owner/repo"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button onClick={add}>Add</button>
      </div>
      {error && <div className="error-text">{error}</div>}
      <ul className="list">
        {value.length === 0 && (
          <li className="muted">No repositories yet — add one above.</li>
        )}
        {value.map((r) => (
          <li key={r}>
            <span>{r}</span>
            <button className="danger" onClick={() => remove(r)}>
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
