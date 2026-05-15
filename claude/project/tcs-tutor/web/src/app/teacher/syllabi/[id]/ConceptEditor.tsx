'use client';

import { useState, useTransition } from 'react';
import { renameConcept } from './actions';

/**
 * Inline rename for parsed concept names. Shows a pencil button next
 * to the name; clicking it swaps in an input + save/cancel buttons.
 * Optimistically updates the displayed name on save; on error, falls
 * back to the previous name and shows the error inline.
 */
export default function ConceptEditor({
  conceptId,
  syllabusId,
  initialName,
}: {
  conceptId: string;
  syllabusId: string;
  initialName: string;
}) {
  const [name, setName] = useState(initialName);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialName);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function startEdit() {
    setDraft(name);
    setErrorMsg(null);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setDraft(name);
    setErrorMsg(null);
  }

  function save() {
    const trimmed = draft.trim();
    if (!trimmed) {
      setErrorMsg('Name cannot be empty');
      return;
    }
    if (trimmed === name) {
      setEditing(false);
      return;
    }
    setErrorMsg(null);
    startTransition(async () => {
      const res = await renameConcept({ conceptId, syllabusId, newName: trimmed });
      if (!res.ok) {
        setErrorMsg(res.error ?? 'Save failed');
        return;
      }
      setName(res.newName ?? trimmed);
      setEditing(false);
    });
  }

  if (!editing) {
    return (
      <>
        <strong>{name}</strong>
        <button
          type="button"
          onClick={startEdit}
          aria-label="Edit concept name"
          title="Edit concept name"
          style={{
            marginLeft: 6,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: 'var(--text-dim)',
            fontSize: 12,
            padding: '0 4px',
          }}
        >
          ✏
        </button>
      </>
    );
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') cancel();
        }}
        disabled={pending}
        style={{
          fontSize: 14,
          padding: '4px 8px',
          minWidth: 200,
          maxWidth: 360,
        }}
      />
      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="btn small"
        style={{ padding: '4px 10px' }}
      >
        {pending ? 'Saving…' : 'Save'}
      </button>
      <button
        type="button"
        onClick={cancel}
        disabled={pending}
        className="btn secondary small"
        style={{ padding: '4px 10px' }}
      >
        Cancel
      </button>
      {errorMsg && (
        <span style={{ color: 'var(--danger)', fontSize: 12 }}>{errorMsg}</span>
      )}
    </span>
  );
}
