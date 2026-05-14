'use client';

import { useState, useTransition } from 'react';
import { generateForConcept } from './actions';

export default function GenerateButton(props: {
  conceptId: string;
  syllabusId: string;
  hasQuestions: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function handleClick() {
    setMsg(null);
    setErr(null);
    startTransition(async () => {
      const res = await generateForConcept({
        conceptId: props.conceptId,
        syllabusId: props.syllabusId,
        count: 5,
      });
      if (!res.ok) {
        setErr(res.error ?? 'Generation failed.');
        return;
      }
      setMsg(`+${res.added} ${res.added === 1 ? 'question' : 'questions'} (≈$${(res.costUSD ?? 0).toFixed(3)})`);
    });
  }

  return (
    <div className="row" style={{ gap: 8 }}>
      {msg && <span className="mono small" style={{ color: 'var(--success)' }}>{msg}</span>}
      {err && <span className="mono small" style={{ color: 'var(--danger)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={err}>{err}</span>}
      <button onClick={handleClick} disabled={pending} className="btn secondary small">
        {pending ? 'Generating…' : props.hasQuestions ? 'Generate 5 more' : 'Generate 5'}
      </button>
    </div>
  );
}
