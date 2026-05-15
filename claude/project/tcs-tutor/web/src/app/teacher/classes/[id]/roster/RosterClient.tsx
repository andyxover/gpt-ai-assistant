'use client';

import { useState, useTransition, useRef } from 'react';
import { enrollStudent, withdrawStudent, unlinkParentFromStudent } from './actions';
import AddParentForm from './AddParentForm';

export interface RosterRow {
  student_id: string;
  display_name: string;
  email: string | null;
  enrolled_at: string;
  total_attempts: number;
  avg_mastery: number | null;
}

export interface ParentLink {
  parent_id: string;
  display_name: string;
  email: string | null;
  relationship: string;
}

export default function RosterClient(props: {
  classId: string;
  initialRows: RosterRow[];
  initialParentsByStudent: Record<string, ParentLink[]>;
}) {
  const [rows, setRows] = useState<RosterRow[]>(props.initialRows);
  const [parentsByStudent, setParentsByStudent] = useState<
    Record<string, ParentLink[]>
  >(props.initialParentsByStudent);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [addingParentFor, setAddingParentFor] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Re-fetch students AND parents from the API. Used after add/remove so
  // the table reflects authoritative server state without a full route
  // refresh.
  async function refetch() {
    const r = await fetch(`/api/teacher-roster/${props.classId}`, {
      cache: 'no-store',
    });
    if (!r.ok) return;
    const data: {
      rows: RosterRow[];
      parentsByStudent: Record<string, ParentLink[]>;
    } = await r.json();
    setRows(data.rows);
    setParentsByStudent(data.parentsByStudent ?? {});
  }

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
      await refetch();
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
      // Drop their parents from local state too so the row's gone cleanly.
      setParentsByStudent(prev => {
        const next = { ...prev };
        delete next[studentId];
        return next;
      });
    });
  }

  function onUnlinkParent(studentId: string, parent: ParentLink) {
    if (!confirm(`Unlink ${parent.display_name} from this student?`)) return;
    setErr(null);
    setMsg(null);
    // Optimistic: drop the chip first, reconcile from server after.
    setParentsByStudent(prev => ({
      ...prev,
      [studentId]: (prev[studentId] ?? []).filter(p => p.parent_id !== parent.parent_id),
    }));
    startTransition(async () => {
      const res = await unlinkParentFromStudent({
        classId: props.classId,
        studentId,
        parentId: parent.parent_id,
      });
      if (!res.ok) {
        setErr(res.error ?? 'Unlink failed');
      }
      // Always reconcile so we don't drift from server state.
      await refetch();
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
              {rows.map(r => {
                const parents = parentsByStudent[r.student_id] ?? [];
                const isAdding = addingParentFor === r.student_id;
                return (
                  <RosterRowGroup
                    key={r.student_id}
                    row={r}
                    parents={parents}
                    pending={pending}
                    isAddingParent={isAdding}
                    onWithdraw={() => onWithdraw(r.student_id, r.display_name)}
                    onUnlinkParent={p => onUnlinkParent(r.student_id, p)}
                    onStartAddParent={() => setAddingParentFor(r.student_id)}
                    onCancelAddParent={() => setAddingParentFor(null)}
                    onParentLinked={() => {
                      setAddingParentFor(null);
                      void refetch();
                    }}
                    classId={props.classId}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function RosterRowGroup({
  row,
  parents,
  pending,
  isAddingParent,
  onWithdraw,
  onUnlinkParent,
  onStartAddParent,
  onCancelAddParent,
  onParentLinked,
  classId,
}: {
  row: RosterRow;
  parents: ParentLink[];
  pending: boolean;
  isAddingParent: boolean;
  onWithdraw: () => void;
  onUnlinkParent: (p: ParentLink) => void;
  onStartAddParent: () => void;
  onCancelAddParent: () => void;
  onParentLinked: () => void;
  classId: string;
}) {
  return (
    <>
      <tr style={{ borderTop: '1px solid var(--border-soft)' }}>
        <td style={tdStyle}><strong>{row.display_name}</strong></td>
        <td style={tdStyle} className="muted">{row.email ?? '—'}</td>
        <td style={tdStyle} className="mono">{row.total_attempts}</td>
        <td style={tdStyle} className="mono">
          {row.avg_mastery == null ? '—' : `${Math.round(row.avg_mastery)}/100`}
        </td>
        <td style={{ ...tdStyle, textAlign: 'right' }}>
          <button
            onClick={onWithdraw}
            disabled={pending}
            className="btn danger-ghost"
          >
            Withdraw
          </button>
        </td>
      </tr>
      <tr style={{ background: 'rgba(0,0,0,0.015)' }}>
        <td colSpan={5} style={{ padding: '6px 18px 14px' }}>
          <div
            className="row"
            style={{
              gap: 8,
              alignItems: 'center',
              flexWrap: 'wrap',
              fontSize: 12,
            }}
          >
            <span className="mono small dim">Parents:</span>
            {parents.length === 0 && (
              <span className="muted small" style={{ fontStyle: 'italic' }}>
                none linked yet
              </span>
            )}
            {parents.map(p => (
              <ParentChip
                key={p.parent_id}
                parent={p}
                disabled={pending}
                onUnlink={() => onUnlinkParent(p)}
              />
            ))}
            {!isAddingParent && (
              <button
                type="button"
                onClick={onStartAddParent}
                className="btn ghost small"
                style={{ padding: '3px 10px', fontSize: 12 }}
                disabled={pending}
              >
                + Add parent
              </button>
            )}
          </div>
          {isAddingParent && (
            <AddParentForm
              classId={classId}
              studentId={row.student_id}
              studentName={row.display_name}
              onLinked={onParentLinked}
              onCancel={onCancelAddParent}
            />
          )}
        </td>
      </tr>
    </>
  );
}

function ParentChip({
  parent,
  disabled,
  onUnlink,
}: {
  parent: ParentLink;
  disabled: boolean;
  onUnlink: () => void;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 4px 3px 10px',
        background: 'var(--surface-2)',
        border: '1px solid var(--border-soft)',
        borderRadius: 999,
        fontSize: 12,
      }}
      title={parent.email ?? ''}
    >
      <span>{parent.display_name}</span>
      <span className="mono small dim">·</span>
      <span className="mono small dim">{parent.relationship}</span>
      <button
        type="button"
        onClick={onUnlink}
        disabled={disabled}
        aria-label={`Unlink ${parent.display_name}`}
        title={`Unlink ${parent.display_name}`}
        style={{
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          color: 'var(--text-dim)',
          fontSize: 14,
          lineHeight: 1,
          padding: '0 4px',
        }}
      >
        ×
      </button>
    </span>
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
