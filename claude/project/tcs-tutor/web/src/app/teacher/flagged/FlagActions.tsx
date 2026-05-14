'use client';

import { useState, useTransition } from 'react';
import { resolveFlag } from './actions';

export default function FlagActions({ flagId }: { flagId: string }) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function resolve(kind: 'reviewed_kept' | 'reviewed_rejected') {
    setErr(null);
    startTransition(async () => {
      const res = await resolveFlag({ flagId, resolution: kind });
      if (!res.ok) setErr(res.error ?? 'Failed');
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => resolve('reviewed_kept')}
        disabled={pending}
        className="px-3 py-1.5 text-xs rounded-md border border-stone-300 hover:border-green-500 hover:bg-green-50 disabled:opacity-50"
      >
        Keep question
      </button>
      <button
        onClick={() => resolve('reviewed_rejected')}
        disabled={pending}
        className="px-3 py-1.5 text-xs rounded-md border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        Retire question
      </button>
      {err && <span className="text-xs text-red-600">{err}</span>}
    </div>
  );
}
