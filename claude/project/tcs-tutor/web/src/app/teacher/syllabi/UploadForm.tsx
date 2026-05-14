'use client';

import { useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { uploadSyllabus, type UploadResult } from './actions';
import FileDropZone from './FileDropZone';

const fieldLabelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

interface ClassOpt {
  id: string;
  display_name: string;
  academic_year: string;
}

export default function UploadForm({ classes }: { classes: ClassOpt[] }) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);

    // Client-side validation — at least one of file/textarea must have content
    const file = data.get('file');
    const text = String(data.get('raw_text') ?? '').trim();
    const hasFile = file instanceof File && file.size > 0;
    if (!hasFile && text.length < 50) {
      setErr('Upload a document or paste at least 50 characters of syllabus text.');
      return;
    }

    setErr(null);
    setProgress(hasFile
      ? `Extracting text from ${(file as File).name}, then asking Claude to parse…`
      : 'Asking Claude to parse the syllabus…');

    startTransition(async () => {
      let res: UploadResult;
      try {
        res = await uploadSyllabus(data);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
        setProgress(null);
        return;
      }
      if (!res.ok) {
        setErr(res.error ?? 'Something went wrong.');
        setProgress(null);
        return;
      }
      setProgress(`Saved ${res.conceptCount ?? 0} concepts. Opening…`);
      if (res.syllabusId) {
        router.push(`/teacher/syllabi/${res.syllabusId}`);
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit}>
      <label className="mono small dim" style={fieldLabelStyle}>Class</label>
      <select name="class_id" required style={{ marginBottom: 14 }}>
        {classes.map(c => (
          <option key={c.id} value={c.id}>{c.display_name} ({c.academic_year})</option>
        ))}
      </select>

      <label className="mono small dim" style={fieldLabelStyle}>Semester</label>
      <select name="semester" defaultValue="S1" style={{ marginBottom: 14 }}>
        <option value="S1">Semester 1</option>
        <option value="S2">Semester 2</option>
      </select>

      <label className="mono small dim" style={fieldLabelStyle}>Upload a document</label>
      <FileDropZone />

      <div className="row" style={{ gap: 10, margin: '14px 0', color: 'var(--text-dim)' }}>
        <span style={{ flex: 1, height: 1, background: 'var(--border-soft)' }}></span>
        <span className="mono small">or paste below</span>
        <span style={{ flex: 1, height: 1, background: 'var(--border-soft)' }}></span>
      </div>

      <label className="mono small dim" style={fieldLabelStyle}>Syllabus text</label>
      <textarea
        name="raw_text"
        rows={12}
        placeholder="Paste the full syllabus text — chapter list, weekly schedule, assessments…"
        style={{ marginBottom: 14 }}
      />

      <div className="toolbar">
        <button type="submit" disabled={pending} className="btn">
          {pending ? 'Parsing…' : 'Parse & save'}
        </button>
        <span className="mono small dim">~20-40s, ~4¢ per syllabus</span>
      </div>

      {progress && !err && (
        <p className="small" style={{ marginTop: 12, color: 'var(--primary)' }}>
          <span className="typing" style={{ marginRight: 6 }}><span></span><span></span><span></span></span>
          {progress}
        </p>
      )}
      {err && (
        <p className="small" style={{ marginTop: 12, color: 'var(--danger)' }}>
          <strong>Error:</strong> {err}
        </p>
      )}
    </form>
  );
}
