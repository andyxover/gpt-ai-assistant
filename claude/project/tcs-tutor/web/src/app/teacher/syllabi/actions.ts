'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { pool } from '@/lib/tutor/db';
import { parseSyllabus, ParsedScope } from '@/lib/tutor/parse-syllabus';
import { getTutorUser } from '@/lib/tutor/role';

export interface UploadResult {
  ok: boolean;
  syllabusId?: string;
  conceptCount?: number;
  uncertainties?: string[];
  error?: string;
}

export async function uploadSyllabus(formData: FormData): Promise<UploadResult> {
  const user = await getTutorUser();
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
    return { ok: false, error: 'Not authorized' };
  }

  const classId = String(formData.get('class_id') ?? '').trim();
  const semester = String(formData.get('semester') ?? 'S1').trim();
  const rawText = String(formData.get('raw_text') ?? '').trim();
  if (!classId) return { ok: false, error: 'class_id is required' };
  if (rawText.length < 50) return { ok: false, error: 'Syllabus text must be at least 50 characters' };

  // Parse via Claude
  let parsed;
  try {
    parsed = await parseSyllabus(rawText);
  } catch (err) {
    return { ok: false, error: `Parse failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  // Persist syllabus + concepts in a transaction
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Supersede previous syllabi for this class+semester
    await client.query(
      `UPDATE syllabi SET superseded_at = now()
        WHERE class_id = $1 AND semester = $2 AND superseded_at IS NULL`,
      [classId, semester],
    );

    const { rows: [syl] } = await client.query<{ id: string }>(
      `INSERT INTO syllabi
        (class_id, semester, raw_text, parsed_scope, parser_model, parser_uncertainties, uploaded_by_user_id)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7)
       RETURNING id`,
      [
        classId,
        semester,
        rawText,
        JSON.stringify(parsed.scope),
        parsed.model,
        JSON.stringify(parsed.scope._uncertainties ?? []),
        user.id,
      ],
    );

    const concepts = flattenConcepts(parsed.scope);
    for (const c of concepts) {
      await client.query(
        `INSERT INTO concepts
           (syllabus_id, code, name, chapter_title, week_introduced, week_last_taught, sequence_order, is_safety_critical)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (syllabus_id, code) DO NOTHING`,
        [syl.id, c.code, c.name, c.chapterTitle, c.weekIntroduced, c.weekLastTaught, c.sequenceOrder, c.isSafetyCritical],
      );
    }

    await client.query('COMMIT');

    revalidatePath('/teacher/syllabi');
    redirect(`/teacher/syllabi/${syl.id}`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (err && typeof err === 'object' && 'digest' in err) throw err; // re-throw Next.js redirect
    return { ok: false, error: `Save failed: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    client.release();
  }
}

function flattenConcepts(scope: ParsedScope) {
  const out: {
    code: string; name: string; chapterTitle: string;
    weekIntroduced: number; weekLastTaught: number;
    sequenceOrder: number; isSafetyCritical: boolean;
  }[] = [];
  let order = 0;
  for (const ch of scope.chapters ?? []) {
    for (const w of ch.weeks ?? []) {
      const weekNum = parseWeek(w.wk);
      for (const c of w.concepts ?? []) {
        order += 1;
        out.push({
          code: c.code,
          name: c.name,
          chapterTitle: ch.title,
          weekIntroduced: weekNum,
          weekLastTaught: weekNum,
          sequenceOrder: order,
          isSafetyCritical: Boolean(c.is_safety_critical),
        });
      }
    }
  }
  return out;
}

function parseWeek(wk: string): number {
  const m = String(wk).match(/(\d+)/);
  return m ? Number(m[1]) : 1;
}
