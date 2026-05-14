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

export async function listChildren(parentId: string): Promise<ChildSummary[]> {
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
}

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

export async function generateParentNarrative(
  data: WeeklyDigestData,
  lang: Lang,
): Promise<ParentNarrative | null> {
  if (data.totalAttempts < 3) return null;

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
    return result.data;
  } catch {
    return null;
  }
}
