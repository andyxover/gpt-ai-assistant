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
      // Refresh roster via fetch (cheap)
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
    <div className="space-y-6">
      <section className="bg-white border border-stone-200 rounded-2xl p-5">
        <h2 className="font-semibold mb-3">Add a student</h2>
        <form ref={formRef} onSubmit={onAdd} className="grid sm:grid-cols-[1fr,1fr,auto] gap-3 items-start">
          <input
            name="display_name"
            placeholder="Student name"
            required
            className="px-3 py-2 border border-stone-300 rounded-lg"
          />
          <input
            name="email"
            type="email"
            placeholder="student@example.com"
            required
            className="px-3 py-2 border border-stone-300 rounded-lg"
          />
          <button
            type="submit"
            disabled={pending}
            className="px-5 py-2 rounded-lg bg-[#c9874a] hover:bg-[#a86a36] disabled:opacity-50 text-white font-medium"
          >
            Enroll
          </button>
        </form>
        {msg && <p className="mt-3 text-sm text-green-700">{msg}</p>}
        {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
      </section>

      <section>
        <h2 className="font-semibold mb-3">
          Roster <span className="text-stone-400 font-normal">({rows.length})</span>
        </h2>
        {rows.length === 0 ? (
          <div className="bg-stone-50 border border-stone-200 rounded-2xl p-6 text-center text-stone-500">
            No students enrolled yet.
          </div>
        ) : (
          <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-xs uppercase font-mono text-stone-500">
                <tr>
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3">Attempts</th>
                  <th className="px-5 py-3">Avg mastery</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {rows.map(r => (
                  <tr key={r.student_id}>
                    <td className="px-5 py-3 font-medium">{r.display_name}</td>
                    <td className="px-5 py-3 text-stone-600">{r.email ?? '—'}</td>
                    <td className="px-5 py-3">{r.total_attempts}</td>
                    <td className="px-5 py-3">
                      {r.avg_mastery == null ? '—' : `${Math.round(r.avg_mastery)} / 100`}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => onWithdraw(r.student_id, r.display_name)}
                        disabled={pending}
                        className="text-xs text-red-700 hover:underline disabled:opacity-50"
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
      </section>
    </div>
  );
}
