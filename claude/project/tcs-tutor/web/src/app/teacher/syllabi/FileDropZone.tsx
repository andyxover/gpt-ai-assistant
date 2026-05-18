'use client';

import { useRef, useState } from 'react';

const ACCEPT = '.pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain';

export default function FileDropZone() {
  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
  }

  function onDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (!f || !inputRef.current) return;
    // Move the dropped file into the underlying input so it goes with the form
    const dt = new DataTransfer();
    dt.items.add(f);
    inputRef.current.files = dt.files;
    setFile(f);
  }

  function clear() {
    if (inputRef.current) inputRef.current.value = '';
    setFile(null);
  }

  return (
    <label
      onDragOver={e => e.preventDefault()}
      onDrop={onDrop}
      style={{
        display: 'block',
        cursor: 'pointer',
        padding: '20px 16px',
        border: `1px dashed ${file ? 'var(--primary)' : 'var(--border)'}`,
        borderRadius: 10,
        background: file ? 'var(--primary-soft)' : 'var(--surface-2)',
        transition: 'border-color .15s ease, background .15s ease',
        textAlign: 'center',
      }}
    >
      <input
        ref={inputRef}
        name="file"
        type="file"
        accept={ACCEPT}
        onChange={onChange}
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
      />
      {file ? (
        <span className="row" style={{ justifyContent: 'center', gap: 10 }}>
          <span style={{ color: 'var(--primary)', fontWeight: 500 }}>{file.name}</span>
          <span className="mono small dim">({(file.size / 1024).toFixed(0)} KB)</span>
          <button
            type="button"
            onClick={e => { e.preventDefault(); clear(); }}
            className="btn ghost small"
          >
            Remove
          </button>
        </span>
      ) : (
        <span className="muted small">
          <strong style={{ color: 'var(--text)' }}>Click to choose a file</strong>{' '}
          or drag &amp; drop · PDF, DOCX, or plain text · 10 MB max
        </span>
      )}
    </label>
  );
}
