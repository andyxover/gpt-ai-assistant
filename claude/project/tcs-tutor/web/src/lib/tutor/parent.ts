import { cache } from 'react';
import { createHash } from 'node:crypto';
import { pool } from './db';
import { askJSON } from './anthropic';

export interface ChildSummary {
  id: string;
  display_name: string;
  className: string | null;
  section: string | null;
}

export interface WeeklyDigestData {
  child: ChildSummary;
  windowDays: number;
  totalAttempts: number;
  accuracyPercent: number;
  improvedConcepts: { name: string; score: number; attempts: number }[];
  strugglingConcepts: { name: string; score: number; attempts: number }[];
  nextExam: { name: string; weeksAway: number; scope: string | null } | null;
}

export type Lang = 'en' | 'zh';

export interface ParentNarrative {
  improvement: string;
  attention: string;
  prediction: string;
  actions: string[];
}

export const listChildren = cache(async (parentId: string): Promise<ChildSummary[]> => {
  const { rows } = await pool.query<ChildSummary>(
    `SELECT u.id, u.display_name,
            (SELECT c.display_name FROM enrollments e
               JOIN classes c ON c.id = e.class_id
              WHERE e.student_id = u.id AND e.withdrawn_at IS NULL
              ORDER BY e.enrolled_at DESC LIMIT 1) AS "className",
            (SELECT c.section FROM enrollments e
               JOIN classes c ON c.id = e.class_id
              WHERE e.student_id = u.id AND e.withdrawn_at IS NULL
              ORDER BY e.enrolled_at DESC LIMIT 1) AS section
       FROM parent_links pl
       JOIN users u ON u.id = pl.student_user_id
      WHERE pl.parent_user_id = $1 AND u.archived_at IS NULL
      ORDER BY u.display_name`,
    [parentId],
  );
  return rows;
});

export async function loadWeeklyDigest(studentId: string): Promise<WeeklyDigestData | null> {
  const { rows: [childRow] } = await pool.query<{ id: string; display_name: string; class_name: string; section: string }>(
    `SELECT u.id, u.display_name,
            c.display_name AS class_name,
            c.section
       FROM users u
       LEFT JOIN enrollments e ON e.student_id = u.id AND e.withdrawn_at IS NULL
       LEFT JOIN classes c ON c.id = e.class_id
      WHERE u.id = $1
      ORDER BY e.enrolled_at DESC NULLS LAST
      LIMIT 1`,
    [studentId],
  );
  if (!childRow) return null;

  const { rows: [stats] } = await pool.query<{ total: string; correct: string }>(
    `SELECT COUNT(*)::text AS total,
            SUM(CASE WHEN is_correct THEN 1 ELSE 0 END)::text AS correct
       FROM attempts
      WHERE student_id = $1 AND created_at >= now() - interval '7 days'`,
    [studentId],
  );
  const total = Number(stats.total);
  const correct = Number(stats.correct);

  // Top-improving concepts: highest mastery scores
  const { rows: improving } = await pool.query<{ name: string; score: string; attempts: string }>(
    `SELECT c.name, m.score::text AS score, m.attempts_count::text AS attempts
       FROM mastery m
       JOIN concepts c ON c.id = m.concept_id
      WHERE m.student_id = $1
        AND m.last_attempt_at >= now() - interval '7 days'
        AND m.score >= 50
      ORDER BY m.score DESC
      LIMIT 3`,
    [studentId],
  );

  // Struggling concepts: lowest mastery with at least some attempts
  const { rows: struggling } = await pool.query<{ name: string; score: string; attempts: string }>(
    `SELECT c.name, m.score::text AS score, m.attempts_count::text AS attempts
       FROM mastery m
       JOIN concepts c ON c.id = m.concept_id
      WHERE m.student_id = $1
        AND m.last_attempt_at >= now() - interval '7 days'
        AND m.attempts_count >= 2
        AND m.score < 50
      ORDER BY m.score ASC
      LIMIT 3`,
    [studentId],
  );

  // Next assessment from current syllabus. We pull the whole parsed_scope
  // JSON and iterate in JS — the assessments field can be null / missing /
  // wrong type if Claude's parse was off, and jsonb_array_elements() on a
  // non-array throws "cannot extract elements from a scalar".
  const { rows: [sylRow] } = await pool.query<{
    parsed_scope: unknown; current_week: number;
  }>(
    `SELECT s.parsed_scope, s.current_week
       FROM enrollments e
       JOIN syllabi s ON s.class_id = e.class_id AND s.superseded_at IS NULL
      WHERE e.student_id = $1 AND e.withdrawn_at IS NULL
      ORDER BY s.created_at DESC
      LIMIT 1`,
    [studentId],
  );

  let nextExam: WeeklyDigestData['nextExam'] = null;
  if (sylRow?.parsed_scope) {
    const scope = sylRow.parsed_scope as { assessments?: unknown };
    const assessmentsRaw = scope?.assessments;
    const assessments = Array.isArray(assessmentsRaw) ? assessmentsRaw : [];
    const currentWeek = Number(sylRow.current_week) || 1;

    // Find the soonest assessment whose first week is at or after now
    type Assessment = { name?: unknown; weeks?: unknown; scope?: unknown };
    const upcoming = assessments
      .map((a: Assessment) => {
        const weeks = Array.isArray(a?.weeks) ? (a.weeks as unknown[]) : [];
        const weekNums = weeks
          .map(w => parseInt(String(w).replace(/\D/g, ''), 10))
          .filter(n => Number.isFinite(n))
          .sort((x, y) => x - y);
        const firstWeek = weekNums[0];
        if (firstWeek == null || firstWeek < currentWeek) return null;
        return {
          name: String(a?.name ?? 'Assessment'),
          weeksAway: firstWeek - currentWeek,
          scope: typeof a?.scope === 'string' ? (a.scope as string) : null,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.weeksAway - b.weeksAway);

    if (upcoming[0]) {
      nextExam = {
        name: upcoming[0].name,
        weeksAway: upcoming[0].weeksAway,
        scope: upcoming[0].scope,
      };
    }
  }

  return {
    child: {
      id: childRow.id,
      display_name: childRow.display_name,
      className: childRow.class_name,
      section: childRow.section,
    },
    windowDays: 7,
    totalAttempts: total,
    accuracyPercent: total > 0 ? Math.round((correct / total) * 100) : 0,
    improvedConcepts: improving.map(r => ({ name: r.name, score: Math.round(Number(r.score)), attempts: Number(r.attempts) })),
    strugglingConcepts: struggling.map(r => ({ name: r.name, score: Math.round(Number(r.score)), attempts: Number(r.attempts) })),
    nextExam,
  };
}

export interface ImprovedConceptTrail {
  name: string;
  /** Rolling 5-attempt accuracy (0-100), one point per attempt over
   *  the last ~14 days. Smoother to read than raw right/wrong. */
  points: number[];
  /** Current mastery (0-100). */
  scoreNow: number;
  /** Delta vs. 7 days ago (positive = improved). */
  delta: number;
}

/**
 * Per-concept trend data for concepts the student is improving on.
 * Used to render sparklines next to the AI improvement narrative.
 */
export async function loadImprovedConceptTrails(
  studentId: string,
  conceptNames: string[],
): Promise<ImprovedConceptTrail[]> {
  if (conceptNames.length === 0) return [];

  // attempts only stores question_id, so reach concept_id through questions.
  const { rows } = await pool.query<{
    id: string;
    name: string;
    score_now: string;
    marks: string;       // postgres int array serialized to comma-text
  }>(
    `SELECT c.id,
            c.name,
            COALESCE(m.score::text, '0') AS score_now,
            (
              SELECT array_to_string(array_agg(a.is_correct::int ORDER BY a.created_at), ',')
                FROM attempts a
                JOIN questions q ON q.id = a.question_id
               WHERE a.student_id = $1
                 AND q.concept_id = c.id
                 AND a.created_at >= now() - interval '14 days'
            ) AS marks
       FROM concepts c
       LEFT JOIN mastery m ON m.concept_id = c.id AND m.student_id = $1
      WHERE c.name = ANY($2::text[])`,
    [studentId, conceptNames],
  );

  const out: ImprovedConceptTrail[] = [];
  for (const r of rows) {
    const marks = (r.marks ?? '').split(',').filter(Boolean).map(Number);
    if (marks.length < 2) continue;

    // Rolling 5-attempt accuracy.
    const win = 5;
    const points: number[] = [];
    for (let i = 0; i < marks.length; i++) {
      const slice = marks.slice(Math.max(0, i - (win - 1)), i + 1);
      const avg = slice.reduce((s, x) => s + x, 0) / slice.length;
      points.push(Math.round(avg * 100));
    }

    const scoreNow = Math.round(Number(r.score_now));
    // Approximate "delta vs. ~7d ago" as the gap between the rolling
    // accuracy at the start of the window and now. Simple, signal-y.
    const past = points[Math.max(0, Math.floor(points.length / 2) - 1)] ?? points[0];
    const delta = scoreNow - past;

    out.push({ name: r.name, points, scoreNow, delta });
  }

  // Same order as input
  out.sort(
    (a, b) =>
      conceptNames.indexOf(a.name) - conceptNames.indexOf(b.name),
  );
  return out;
}

/**
 * Cache layer: a narrative depends only on the data we feed it. If the
 * data hash + language haven't changed since we last generated, return
 * the cached narrative from parent_reports.snapshot. ~12s → ~50ms hit.
 */
function digestDataHash(data: WeeklyDigestData): string {
  const seed = {
    a: data.totalAttempts,
    c: data.accuracyPercent,
    i: data.improvedConcepts.map(c => [c.name, c.score]),
    s: data.strugglingConcepts.map(c => [c.name, c.score]),
    n: data.nextExam ? [data.nextExam.name, data.nextExam.weeksAway, data.nextExam.scope] : null,
  };
  return createHash('sha1').update(JSON.stringify(seed)).digest('hex').slice(0, 16);
}

interface NarrativeSnapshot {
  data_hash: string;
  narratives: Partial<Record<Lang, ParentNarrative>>;
}

async function readNarrativeCache(
  studentId: string,
  classId: string,
  weekNumber: number,
  dataHash: string,
  lang: Lang,
): Promise<ParentNarrative | null> {
  const { rows } = await pool.query<{ snapshot: NarrativeSnapshot }>(
    `SELECT snapshot FROM parent_reports
       WHERE student_id = $1 AND class_id = $2 AND week_number = $3
       LIMIT 1`,
    [studentId, classId, weekNumber],
  );
  const snap = rows[0]?.snapshot;
  if (!snap || snap.data_hash !== dataHash) return null;
  return snap.narratives?.[lang] ?? null;
}

async function writeNarrativeCache(
  studentId: string,
  classId: string,
  weekNumber: number,
  dataHash: string,
  lang: Lang,
  narrative: ParentNarrative,
): Promise<void> {
  // Upsert. If hash matches an existing row, merge the new language into
  // narratives. If hash differs (data changed), overwrite the snapshot.
  await pool.query(
    `INSERT INTO parent_reports
       (student_id, class_id, week_number, week_starts, snapshot)
     VALUES ($1, $2, $3, date_trunc('week', now())::date,
             jsonb_build_object(
               'data_hash', $4::text,
               'narratives', jsonb_build_object($5::text, $6::jsonb)
             ))
     ON CONFLICT (student_id, week_number, class_id) DO UPDATE
       SET snapshot = CASE
             WHEN (parent_reports.snapshot->>'data_hash') = $4
               THEN jsonb_set(parent_reports.snapshot, ARRAY['narratives', $5::text], $6::jsonb, true)
             ELSE jsonb_build_object(
                    'data_hash', $4::text,
                    'narratives', jsonb_build_object($5::text, $6::jsonb)
                  )
           END`,
    [studentId, classId, weekNumber, dataHash, lang, JSON.stringify(narrative)],
  );
}

async function lookupStudentClassWeek(
  studentId: string,
): Promise<{ classId: string; weekNumber: number } | null> {
  const { rows } = await pool.query<{ class_id: string; current_week: number }>(
    `SELECT e.class_id, s.current_week
       FROM enrollments e
       JOIN syllabi s ON s.class_id = e.class_id AND s.superseded_at IS NULL
      WHERE e.student_id = $1 AND e.withdrawn_at IS NULL
      ORDER BY s.created_at DESC
      LIMIT 1`,
    [studentId],
  );
  if (!rows[0]) return null;
  return { classId: rows[0].class_id, weekNumber: Number(rows[0].current_week) || 1 };
}

export async function generateParentNarrative(
  data: WeeklyDigestData,
  lang: Lang,
): Promise<ParentNarrative | null> {
  if (data.totalAttempts < 3) return null;

  // Cache check
  const ctx = await lookupStudentClassWeek(data.child.id);
  const hash = digestDataHash(data);
  if (ctx) {
    const cached = await readNarrativeCache(data.child.id, ctx.classId, ctx.weekNumber, hash, lang);
    if (cached) return cached;
  }

  const langInstruction = lang === 'zh'
    ? 'Write the narrative in Traditional Chinese (繁體中文). Use natural, conversational Taiwanese-style phrasing — like a teacher chatting with a parent.'
    : 'Write the narrative in English. Use warm, natural phrasing — like a teacher chatting with a parent.';

  try {
    const result = await askJSON<ParentNarrative>({
      system: `You write weekly progress digests for parents of Grade 7 students at TCS.
Tone: warm, specific, brief. Two-to-three sentences per section. Never invent data.
${langInstruction}
Always return strict JSON: { "improvement": "...", "attention": "...", "prediction": "...", "actions": ["...", "..."] }
No markdown, no prose outside JSON.`,
      user: `Write a weekly digest for the parent of ${data.child.display_name} (${data.child.className ?? 'class TBD'}). Use the data below — quote concept names and the upcoming exam if relevant. Do not invent.

Data:
${JSON.stringify({
  window: `last ${data.windowDays} days`,
  total_questions_practiced: data.totalAttempts,
  accuracy_percent: data.accuracyPercent,
  improving: data.improvedConcepts.slice(0, 3),
  struggling: data.strugglingConcepts.slice(0, 3),
  next_exam: data.nextExam,
}, null, 2)}

Sections:
- improvement: what's getting stronger. Name specific concepts if available.
- attention: what's still tricky. Be honest but encouraging.
- prediction: how ready they are for the upcoming exam (if any).
- actions: 2-3 specific things the parent can do this week (questions to ask, study habits, conversation prompts). Each as a string in the array.`,
      maxTokens: 1000,
    });

    // Persist to the cache for next visit (fire-and-forget — we don't
    // want a write failure to bubble up to the request).
    if (ctx && result.data) {
      writeNarrativeCache(data.child.id, ctx.classId, ctx.weekNumber, hash, lang, result.data)
        .catch(err => console.error('[parent] narrative cache write failed:', err));
    }

    return result.data;
  } catch {
    return null;
  }
}
