import { getTutorUser } from '@/lib/tutor/role';
import { listClassesForTeacher } from '@/lib/tutor/classes';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function TeacherClasses() {
  const user = await getTutorUser();
  if (!user) redirect('/login');
  if (user.role !== 'teacher' && user.role !== 'admin') redirect('/');

  const classes = await listClassesForTeacher(user.id);

  return (
    <main className="main">
      <div style={{ marginBottom: 12 }}>
        <Link href="/teacher" className="mono small dim" style={{ textDecoration: 'underline' }}>← Teacher home</Link>
      </div>
      <div className="row">
        <div>
          <div className="eyebrow">Operations</div>
          <h1>Classes</h1>
        </div>
        <div className="spacer"></div>
        <Link href="/teacher/classes/new" className="btn">New class</Link>
      </div>
      <p className="subtitle">Open a class for week-by-week progress, student activity, and roster.</p>

      {classes.length === 0 ? (
        <div className="attention-card">
          <div className="label">No classes yet</div>
          <div className="body">Click <strong>New class</strong> to create one.</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {classes.map((c, i) => (
            <Link
              key={c.id}
              href={`/teacher/classes/${c.id}/progress`}
              className="scope-row"
              style={{
                margin: 0,
                borderRadius: 0,
                border: 'none',
                borderTop: i > 0 ? '1px solid var(--border-soft)' : 'none',
              }}
            >
              <span style={{ flex: 1 }}>
                <strong>{c.display_name}</strong>
                <span className="mono small dim" style={{ marginLeft: 10 }}>
                  {c.subject} · Grade {c.grade} · {c.academic_year}
                </span>
              </span>
              <span className="dim">→</span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
