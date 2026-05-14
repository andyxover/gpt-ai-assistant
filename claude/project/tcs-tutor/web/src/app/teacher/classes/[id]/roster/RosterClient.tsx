'use client';

import { useState, useTransition, useRef } from 'react';
import { enrollStudent, withdrawStudent } from './actions';

interface RosterRow {
  student_id: string;
  display_name: string;
  email: string | null;
  enrolled_at: string;
  total_attempts: number;
  avg_mastery: number | null;
}

export default function RosterClient(props: { classId: string; initialRows: RosterRow[] }) {
  const [rows, setRows] = useState<RosterRow[]>(props.initialRows);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const data = new FormData(formEl);
    data.set('class_id', props.classId);
    setErr(null);
    setMsg(null);
    startTransition(async () => {
      const res = await enrollStudent(data);
      if (!res.ok) {
        setErr(res.error ?? 'Enrollment failed');
        return;
      }
      setMsg(res.created ? 'Student created and enrolled.' : 'Existing student enrolled.');
      formRef.current?.reset();
      const r = await fetch(`/api/teacher-roster/${props.classId}`, { cache: 'no-store' });
      if (r.ok) {
        const data: { rows: RosterRow[] } = await r.json();
        setRows(data.rows);
      }
    });
  }

  function onWithdraw(studentId: string, name: string) {
    if (!confirm(`Withdraw ${name} from this class?`)) return;
    setErr(null);
    setMsg(null);
    startTransition(async () => {
      const res = await withdrawStudent({ classId: props.classId, studentId });
      if (!res.ok) {
        setErr(res.error ?? 'Withdraw failed');
        return;
      }
      setRows(prev => prev.filter(r => r.student_id !== studentId));
    });
  }

  return (
    <>
      <div className="card">
        <div className="card-title">Add a student</div>
        <div className="card-desc small" style={{ marginBottom: 12 }}>
          Creates the student account if their email is new. They sign in at /login with that email.
        </div>
        <form ref={formRef} onSubmit={onAdd} className="row" style={{ gap: 10, alignItems: 'stretch' }}>
          <input name="display_name" placeholder="Student name" required style={{ flex: 1 }} />
          <input name="email" type="email" placeholder="student@example.com" required style={{ flex: 1.2 }} />
          <button type="submit" disabled={pending} className="btn">Enroll</button>
        </form>
        {msg && <p className="small" style={{ color: 'var(--success)', marginTop: 10 }}>{msg}</p>}
        {err && <p className="small" style={{ color: 'var(--danger)', marginTop: 10 }}>{err}</p>}
      </div>

      <div className="section-h">
        <h2>Roster <span className="mono dim small">({rows.length})</span></h2>
      </div>

      {rows.length === 0 ? (
        <div className="empty-illust">No students enrolled yet.</div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)' }}>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Attempts</th>
                <th style={thStyle}>Avg mastery</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.student_id} style={{ borderTop: '1px solid var(--border-soft)' }}>
                  <td style={tdStyle}><strong>{r.display_name}</strong></td>
                  <td style={tdStyle} className="muted">{r.email ?? '—'}</td>
                  <td style={tdStyle} className="mono">{r.total_attempts}</td>
                  <td style={tdStyle} className="mono">
                    {r.avg_mastery == null ? '—' : `${Math.round(r.avg_mastery)}/100`}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <button
                      onClick={() => onWithdraw(r.student_id, r.display_name)}
                      disabled={pending}
                      className="btn danger-ghost"
                    >
                      Withdraw
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const thStyle: React.CSSProperties = {
  padding: '10px 18px',
  textAlign: 'left',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--text-dim)',
  fontWeight: 500,
};

const tdStyle: React.CSSProperties = {
  padding: '12px 18px',
};
