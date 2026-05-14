import { getTutorUser } from '@/lib/tutor/role';
import { pool } from '@/lib/tutor/db';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { uploadSyllabus } from './actions';

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
    <main className="max-w-3xl mx-auto p-8">
      <header className="mb-8">
        <Link href="/teacher" className="text-sm text-stone-500 hover:underline">← Back</Link>
        <h1 className="text-3xl font-bold mt-2">Syllabi</h1>
        <p className="text-stone-600 mt-1">Upload a syllabus and Claude extracts the concept structure.</p>
      </header>

      {classes.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-8">
          <p className="font-medium">No classes yet</p>
          <p className="text-sm text-stone-600 mt-1">
            You need a class before uploading a syllabus. (Class creation UI coming in Phase 2 — for now, the seed script creates a demo class.)
          </p>
        </div>
      ) : (
        <section className="mb-10">
          <h2 className="font-semibold mb-3">Upload a new syllabus</h2>
          <form action={uploadSyllabus} className="space-y-4 bg-white border border-stone-200 rounded-xl p-5">
            <div>
              <label className="block text-sm font-medium mb-1">Class</label>
              <select name="class_id" required className="w-full border border-stone-300 rounded-lg px-3 py-2">
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.display_name} ({c.academic_year})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Semester</label>
              <select name="semester" defaultValue="S1" className="w-full border border-stone-300 rounded-lg px-3 py-2">
                <option value="S1">Semester 1</option>
                <option value="S2">Semester 2</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Syllabus text</label>
              <textarea
                name="raw_text"
                required
                rows={14}
                placeholder="Paste the full syllabus text — chapter list, weekly schedule, assessments…"
                className="w-full border border-stone-300 rounded-lg px-3 py-2 font-mono text-sm"
              />
            </div>
            <button type="submit" className="px-5 py-2.5 rounded-lg bg-[#c9874a] hover:bg-[#a86a36] text-white font-medium">
              Parse & save
            </button>
            <p className="text-xs text-stone-500">
              Parsing takes ~20-40s and costs ~4¢ per syllabus. The parsed structure is editable on the next screen.
            </p>
          </form>
        </section>
      )}

      <section>
        <h2 className="font-semibold mb-3">Existing syllabi</h2>
        {syllabi.length === 0 ? (
          <p className="text-stone-500 text-sm">None yet.</p>
        ) : (
          <ul className="space-y-2">
            {syllabi.map(s => (
              <li key={s.id}>
                <Link
                  href={`/teacher/syllabi/${s.id}`}
                  className={`block p-4 bg-white border border-stone-200 rounded-xl hover:border-[#c9874a] transition ${s.superseded_at ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-baseline justify-between">
                    <div>
                      <p className="font-medium">{s.class_name} — {s.semester}</p>
                      <p className="text-xs text-stone-500 mt-0.5">
                        {s.concept_count} concept{s.concept_count === 1 ? '' : 's'} · Week {s.current_week} ·{' '}
                        {new Date(s.created_at).toLocaleDateString()}
                        {s.superseded_at ? ' · superseded' : ''}
                      </p>
                    </div>
                    <span className="text-stone-400">→</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
