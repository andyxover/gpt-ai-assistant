import { getTutorUser } from '@/lib/tutor/role';
import { pool } from '@/lib/tutor/db';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';

interface SyllabusRow {
  id: string;
  class_id: string;
  class_name: string;
  semester: string;
  current_week: number;
  parser_uncertainties: string[] | null;
  created_at: string;
}

interface ConceptRow {
  id: string;
  code: string;
  name: string;
  chapter_title: string | null;
  week_introduced: number;
  is_safety_critical: boolean;
  sequence_order: number;
}

export default async function SyllabusDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await getTutorUser();
  if (!user) redirect('/login');
  if (user.role !== 'teacher' && user.role !== 'admin') redirect('/');

  const { id } = await params;

  const { rows: [syllabus] } = await pool.query<SyllabusRow>(
    `SELECT s.id, s.class_id, c.display_name AS class_name, s.semester,
            s.current_week, s.parser_uncertainties, s.created_at
       FROM syllabi s
       JOIN classes c ON c.id = s.class_id
      WHERE s.id = $1 AND c.teacher_user_id = $2`,
    [id, user.id],
  );
  if (!syllabus) notFound();

  const { rows: concepts } = await pool.query<ConceptRow>(
    `SELECT id, code, name, chapter_title, week_introduced, is_safety_critical, sequence_order
       FROM concepts WHERE syllabus_id = $1 ORDER BY sequence_order`,
    [id],
  );

  // Group by chapter for display
  const byChapter = new Map<string, ConceptRow[]>();
  for (const c of concepts) {
    const key = c.chapter_title ?? '(no chapter)';
    if (!byChapter.has(key)) byChapter.set(key, []);
    byChapter.get(key)!.push(c);
  }

  const uncertainties = Array.isArray(syllabus.parser_uncertainties) ? syllabus.parser_uncertainties : [];

  return (
    <main className="max-w-3xl mx-auto p-8">
      <header className="mb-6">
        <Link href="/teacher/syllabi" className="text-sm text-stone-500 hover:underline">← All syllabi</Link>
        <h1 className="text-3xl font-bold mt-2">{syllabus.class_name}</h1>
        <p className="text-stone-600 text-sm mt-1">
          {syllabus.semester} · Week {syllabus.current_week} · {concepts.length} concepts ·{' '}
          {new Date(syllabus.created_at).toLocaleDateString()}
        </p>
      </header>

      {uncertainties.length > 0 && (
        <section className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-5">
          <h2 className="font-semibold text-amber-900 mb-2">Things Claude wasn&apos;t sure about</h2>
          <ul className="space-y-1.5 text-sm text-stone-700 list-disc pl-5">
            {uncertainties.map((u, i) => <li key={i}>{u}</li>)}
          </ul>
        </section>
      )}

      <section>
        {Array.from(byChapter.entries()).map(([chapter, items]) => (
          <div key={chapter} className="mb-6">
            <h2 className="font-semibold mb-2">{chapter}</h2>
            <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
              {items.map(c => (
                <div key={c.id} className="px-4 py-3 flex items-baseline justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium">{c.name}</p>
                    <p className="text-xs text-stone-500 mt-0.5 font-mono">{c.code}</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-stone-500 shrink-0">
                    <span>W{c.week_introduced}</span>
                    {c.is_safety_critical && (
                      <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-800 font-medium">safety</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
