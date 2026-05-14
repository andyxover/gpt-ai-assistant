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
    <div className="flex items-center gap-2">
      {msg && <span className="text-xs text-green-700">{msg}</span>}
      {err && <span className="text-xs text-red-600 max-w-[200px] truncate" title={err}>{err}</span>}
      <button
        onClick={handleClick}
        disabled={pending}
        className="text-xs px-2.5 py-1 rounded border border-stone-300 hover:border-[#c9874a] hover:bg-stone-50 disabled:opacity-50 disabled:cursor-wait"
      >
        {pending ? 'Generating…' : props.hasQuestions ? 'Generate 5 more' : 'Generate 5'}
      </button>
    </div>
  );
}
