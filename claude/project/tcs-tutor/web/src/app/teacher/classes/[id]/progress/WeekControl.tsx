'use client';

import { useState, useTransition } from 'react';
import { setCurrentWeek } from './actions';

export default function WeekControl(props: {
  classId: string;
  syllabusId: string;
  initialWeek: number;
  totalWeeks: number;
}) {
  const [week, setWeek] = useState(props.initialWeek);
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function save(next: number) {
    setErr(null);
    if (next === week) { setEditing(false); return; }
    startTransition(async () => {
      const res = await setCurrentWeek({
        classId: props.classId,
        syllabusId: props.syllabusId,
        week: next,
      });
      if (!res.ok) {
        setErr(res.error ?? 'Failed');
        return;
      }
      setWeek(res.currentWeek ?? next);
      setEditing(false);
    });
  }

  function advance() {
    save(week + 1);
  }

  if (editing) {
    return (
      <div className="row" style={{ gap: 6 }}>
        <span className="mono small dim">Week</span>
        <input
          type="number"
          min={1}
          max={Math.max(30, props.totalWeeks || 30)}
          defaultValue={week}
          autoFocus
          disabled={pending}
          onKeyDown={e => {
            if (e.key === 'Enter') save(Number((e.target as HTMLInputElement).value));
            if (e.key === 'Escape') { setEditing(false); setErr(null); }
          }}
          style={{ width: 70, padding: '4px 8px', fontSize: 13 }}
        />
        {props.totalWeeks > 0 && <span className="mono small dim">/ {props.totalWeeks}</span>}
        <button
          className="btn small"
          disabled={pending}
          onClick={e => {
            const input = (e.currentTarget.parentElement?.querySelector('input') as HTMLInputElement | null);
            if (input) save(Number(input.value));
          }}
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button
          className="btn ghost small"
          onClick={() => { setEditing(false); setErr(null); }}
          disabled={pending}
        >
          Cancel
        </button>
        {err && <span className="mono small" style={{ color: 'var(--danger)' }}>{err}</span>}
      </div>
    );
  }

  return (
    <div className="row" style={{ gap: 8 }}>
      <span className="mono small dim">
        Week {week}{props.totalWeeks > 0 && <> / {props.totalWeeks}</>}
      </span>
      <button
        className="btn ghost small"
        onClick={() => setEditing(true)}
        title="Set the current week"
      >
        Edit
      </button>
      {week < (props.totalWeeks || 30) && (
        <button
          className="btn secondary small"
          onClick={advance}
          disabled={pending}
          title={`Advance to Week ${week + 1}`}
        >
          {pending ? '…' : `Advance →`}
        </button>
      )}
      {err && <span className="mono small" style={{ color: 'var(--danger)' }}>{err}</span>}
    </div>
  );
}
