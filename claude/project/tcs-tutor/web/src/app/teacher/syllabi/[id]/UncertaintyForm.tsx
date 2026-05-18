'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { clarifySyllabus } from './actions';

export default function UncertaintyForm(props: {
  syllabusId: string;
  uncertainties: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const answersRef = useRef<Record<number, string>>({});

  function onChange(i: number, value: string) {
    answersRef.current[i] = value;
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    const answers = { ...answersRef.current };
    const filled = Object.values(answers).filter(a => a.trim().length > 0).length;
    if (filled === 0) {
      setErr('Type at least one answer before saving.');
      return;
    }
    setMsg(`Re-parsing the syllabus with your ${filled} clarification${filled === 1 ? '' : 's'}… (~30-90s)`);
    startTransition(async () => {
      const res = await clarifySyllabus({
        syllabusId: props.syllabusId,
        answers,
      });
      if (!res.ok) {
        setErr(res.error ?? 'Re-parse failed.');
        setMsg(null);
        return;
      }
      setMsg(
        res.remainingUncertainties && res.remainingUncertainties.length > 0
          ? `Updated. ${res.remainingUncertainties.length} item${res.remainingUncertainties.length === 1 ? '' : 's'} still uncertain.`
          : 'Updated. No more uncertainties — your scope is clean.',
      );
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} style={{ marginTop: 12 }}>
      <ol style={{ margin: '8px 0 0', paddingLeft: 22, fontSize: 13.5, lineHeight: 1.6 }}>
        {props.uncertainties.map((u, i) => (
          <li key={i} style={{ marginBottom: 14 }}>
            <div style={{ marginBottom: 6 }}>{u}</div>
            <textarea
              name={`answer_${i}`}
              rows={2}
              placeholder="Your answer (optional)…"
              onChange={e => onChange(i, e.target.value)}
              style={{
                width: '100%',
                fontFamily: 'inherit',
                fontSize: 13.5,
                minHeight: 'auto',
                padding: '8px 10px',
              }}
            />
          </li>
        ))}
      </ol>

      <div className="toolbar" style={{ marginTop: 8 }}>
        <button type="submit" disabled={pending} className="btn">
          {pending ? 'Re-parsing…' : 'Apply clarifications & re-parse'}
        </button>
        <span className="mono small dim">
          Updates the parsed scope. Existing concepts with the same code are kept.
        </span>
      </div>

      {msg && (
        <p className="small" style={{ marginTop: 10, color: err ? 'var(--danger)' : 'var(--primary)' }}>
          {msg}
        </p>
      )}
      {err && (
        <p className="small" style={{ marginTop: 10, color: 'var(--danger)' }}>
          {err}
        </p>
      )}
    </form>
  );
}
