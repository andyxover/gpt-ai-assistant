import { getTutorUser } from '@/lib/tutor/role';
import { pool } from '@/lib/tutor/db';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import GenerateButton from './GenerateButton';
import UncertaintyForm from './UncertaintyForm';

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
  question_count: number;
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
    `SELECT c.id, c.code, c.name, c.chapter_title, c.week_introduced, c.is_safety_critical, c.sequence_order,
            (SELECT COUNT(*) FROM questions q
              WHERE q.concept_id = c.id AND q.validation_status = 'approved' AND q.retired_at IS NULL)::int
              AS question_count
       FROM concepts c
      WHERE c.syllabus_id = $1
      ORDER BY c.sequence_order`,
    [id],
  );

  const byChapter = new Map<string, ConceptRow[]>();
  for (const c of concepts) {
    const key = c.chapter_title ?? '(no chapter)';
    if (!byChapter.has(key)) byChapter.set(key, []);
    byChapter.get(key)!.push(c);
  }

  const uncertainties = Array.isArray(syllabus.parser_uncertainties) ? syllabus.parser_uncertainties : [];

  return (
    <main className="main">
      <div style={{ marginBottom: 12 }}>
        <Link href="/teacher/syllabi" className="mono small dim" style={{ textDecoration: 'underline' }}>
          ← All syllabi
        </Link>
      </div>
      <div className="eyebrow">Syllabus</div>
      <h1>{syllabus.class_name}</h1>
      <p className="subtitle">
        {syllabus.semester} · Week {syllabus.current_week} · {concepts.length} concepts ·{' '}
        {new Date(syllabus.created_at).toLocaleDateString()}
      </p>

      {uncertainties.length > 0 && (
        <div className="attention-card">
          <div className="label">Things Claude wasn&apos;t sure about</div>
          <div className="body" style={{ marginTop: 4 }}>
            Answer any of the questions below to update the parsed scope. The system will re-parse with your clarifications.
          </div>
          <UncertaintyForm syllabusId={syllabus.id} uncertainties={uncertainties} />
        </div>
      )}

      <div className="scope" style={{ marginTop: 18 }}>
        {Array.from(byChapter.entries()).map(([chapter, items]) => (
          <div key={chapter} className="scope-section">
            <div className="scope-h">
              <h4>{chapter}</h4>
              <span className="count">
                {items.length} concept{items.length === 1 ? '' : 's'}
              </span>
            </div>
            {items.map(c => (
              <div key={c.id} className="scope-row">
                <span className="wk">W{c.week_introduced}</span>
                <span className="topic">
                  <strong>{c.name}</strong>
                  <span className="mono small dim" style={{ marginLeft: 10 }}>
                    {c.code} · {c.question_count} {c.question_count === 1 ? 'question' : 'questions'}
                  </span>
                </span>
                {c.is_safety_critical ? (
                  <span
                    className="chip"
                    style={{ background: 'rgba(178,58,72,.10)', color: 'var(--danger)' }}
                  >
                    safety — teacher-authored only
                  </span>
                ) : (
                  <GenerateButton
                    conceptId={c.id}
                    syllabusId={syllabus.id}
                    hasQuestions={c.question_count > 0}
                  />
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </main>
  );
}
