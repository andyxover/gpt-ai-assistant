import { getTutorUser } from '@/lib/tutor/role';
import { pool } from '@/lib/tutor/db';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import UploadForm from './UploadForm';

interface ClassRow {
  id: string;
  display_name: string;
  subject: string;
  grade: number;
  section: string;
  academic_year: string;
}

interface SyllabusRow {
  id: string;
  class_id: string;
  class_name: string;
  semester: string;
  current_week: number;
  concept_count: number;
  created_at: string;
  superseded_at: string | null;
}

export default async function TeacherSyllabiPage() {
  const user = await getTutorUser();
  if (!user) redirect('/login');
  if (user.role !== 'teacher' && user.role !== 'admin') redirect('/');

  const { rows: classes } = await pool.query<ClassRow>(
    `SELECT id, display_name, subject, grade, section, academic_year
       FROM classes
      WHERE teacher_user_id = $1 AND archived_at IS NULL
      ORDER BY academic_year DESC, display_name`,
    [user.id],
  );

  const { rows: syllabi } = await pool.query<SyllabusRow>(
    `SELECT s.id, s.class_id, c.display_name AS class_name, s.semester, s.current_week,
            (SELECT COUNT(*) FROM concepts WHERE syllabus_id = s.id)::int AS concept_count,
            s.created_at, s.superseded_at
       FROM syllabi s
       JOIN classes c ON c.id = s.class_id
      WHERE c.teacher_user_id = $1
      ORDER BY s.created_at DESC
      LIMIT 50`,
    [user.id],
  );

  return (
    <main className="main">
      <div style={{ marginBottom: 12 }}>
        <Link href="/teacher" className="mono small dim" style={{ textDecoration: 'underline' }}>← Teacher home</Link>
      </div>
      <div className="eyebrow">Content</div>
      <h1>Syllabi</h1>
      <p className="subtitle">Upload a syllabus. Claude extracts the chapter/week/concept structure for the question pool and the class progress view.</p>

      {classes.length === 0 ? (
        <div className="attention-card">
          <div className="label">No classes yet</div>
          <div className="body">You need a class before uploading a syllabus. Create one in <Link href="/teacher/classes/new" style={{ color: 'var(--primary)' }}>Classes → New class</Link>.</div>
        </div>
      ) : (
        <section>
          <div className="section-h"><h2>Upload a new syllabus</h2></div>
          <div className="card">
            <UploadForm classes={classes.map(c => ({
              id: c.id,
              display_name: c.display_name,
              academic_year: c.academic_year,
            }))} />
          </div>
        </section>
      )}

      <div className="section-h"><h2>Existing syllabi</h2></div>
      {syllabi.length === 0 ? (
        <div className="empty-illust">None yet.</div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {syllabi.map((s, i) => (
            <Link
              key={s.id}
              href={`/teacher/syllabi/${s.id}`}
              className="scope-row"
              style={{
                margin: 0,
                borderRadius: 0,
                border: 'none',
                borderTop: i > 0 ? '1px solid var(--border-soft)' : 'none',
                background: s.superseded_at ? 'var(--bg-soft)' : 'var(--surface)',
                opacity: s.superseded_at ? 0.7 : 1,
              }}
            >
              <span style={{ flex: 1 }}>
                <strong>{s.class_name}</strong> — {s.semester}
                <span className="mono small dim" style={{ marginLeft: 10 }}>
                  {s.concept_count} concept{s.concept_count === 1 ? '' : 's'} · Week {s.current_week} ·{' '}
                  {new Date(s.created_at).toLocaleDateString()}
                  {s.superseded_at ? ' · superseded' : ''}
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
