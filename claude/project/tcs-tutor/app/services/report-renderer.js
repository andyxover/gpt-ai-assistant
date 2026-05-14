import { pool, query } from '../lib/db.js';
import { askJSON } from '../lib/claude.js';

// ──────────────────────────────────────────────────────────────────────────
// renderWeeklyReport — produce a parent-facing weekly digest for one student.
//
// Returns:
//   {
//     snapshot:  structured data (stored in parent_reports.snapshot JSONB),
//     rendered:  { plainText, html } — for LINE / web view,
//     costUSD:   API cost incurred while building the narrative
//   }
//
// The numbers in the report are computed deterministically. The AI is used
// ONLY to phrase a 2-3 sentence narrative on top of those numbers — never
// to invent or modify data. This keeps hallucination risk minimal.
// ──────────────────────────────────────────────────────────────────────────

/**
 * @param {object} args
 * @param {string} args.studentId
 * @param {string} args.classId
 * @param {number} args.weekNumber
 * @param {string|Date} args.weekStartDate  YYYY-MM-DD; the Monday of the week
 * @param {'en'|'zh'} [args.lang='en']
 * @param {boolean} [args.skipNarrative=false]  Skip the AI narrative (cheaper / deterministic)
 */
export async function renderWeeklyReport({ studentId, classId, weekNumber, weekStartDate, lang = 'en', skipNarrative = false }) {
  if (!studentId || !classId) throw new Error('studentId and classId are required');
  if (!Number.isInteger(weekNumber)) throw new Error('weekNumber must be an integer');
  if (!weekStartDate) throw new Error('weekStartDate is required');

  const data = await gatherReportData({ studentId, classId, weekNumber, weekStartDate });

  let narrative = null;
  let costUSD = 0;
  if (!skipNarrative) {
    const result = await generateNarrative(data, lang);
    narrative = result.text;
    costUSD = result.costUSD;
  } else {
    narrative = fallbackNarrative(data, lang);
  }

  const snapshot = {
    schema_version: 1,
    week_number: weekNumber,
    week_start: toDateString(weekStartDate),
    lang,
    student: data.student,
    class: data.class,
    activity: data.activity,
    concepts: data.concepts,
    strengths: data.strengths,
    weaknesses: data.weaknesses,
    upcoming: data.upcoming,
    prediction: data.prediction,
    narrative,
    generated_at: new Date().toISOString()
  };

  return {
    snapshot,
    rendered: {
      plainText: renderPlainText(snapshot),
      html: renderHTML(snapshot)
    },
    costUSD
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Data gathering — all deterministic, all from the database.
// ──────────────────────────────────────────────────────────────────────────

async function gatherReportData({ studentId, classId, weekNumber, weekStartDate }) {
  const weekStart = new Date(weekStartDate);
  const weekEnd = addDays(weekStart, 7);

  const { rows: studentRows } = await pool.query(
    `SELECT id, display_name FROM users WHERE id = $1 AND role = 'student'`,
    [studentId]
  );
  if (studentRows.length === 0) throw new Error(`Student ${studentId} not found`);
  const student = studentRows[0];

  const { rows: classRows } = await pool.query(
    `SELECT c.id, c.display_name, c.subject, c.grade, c.section,
            t.display_name AS teacher_name,
            s.id AS syllabus_id, s.parsed_scope, s.current_week
       FROM classes c
       JOIN users t ON t.id = c.teacher_user_id
  LEFT JOIN syllabi s ON s.class_id = c.id AND s.superseded_at IS NULL
      WHERE c.id = $1`,
    [classId]
  );
  if (classRows.length === 0) throw new Error(`Class ${classId} not found`);
  const klass = classRows[0];

  const attempts = await query(
    `SELECT a.is_correct,
            q.difficulty,
            c.id AS concept_id,
            c.code AS concept_code,
            c.name AS concept_name
       FROM attempts a
       JOIN questions q ON q.id = a.question_id
       JOIN concepts c ON c.id = q.concept_id
      WHERE a.student_id = $1
        AND a.created_at >= $2 AND a.created_at < $3`,
    [studentId, weekStart, weekEnd]
  );

  const sessionRows = await query(
    `SELECT COUNT(DISTINCT id)::int AS n FROM chat_sessions
      WHERE student_id = $1 AND started_at >= $2 AND started_at < $3`,
    [studentId, weekStart, weekEnd]
  );

  const conceptIds = [...new Set(attempts.map(a => a.concept_id))];
  const masteries = conceptIds.length
    ? await query(
        `SELECT concept_id, score, attempts_count, correct_count
           FROM mastery
          WHERE student_id = $1 AND concept_id = ANY($2::uuid[])`,
        [studentId, conceptIds]
      )
    : [];
  const masteryByConcept = new Map(masteries.map(m => [m.concept_id, m]));

  const concepts = conceptIds.map(cid => {
    const inConcept = attempts.filter(a => a.concept_id === cid);
    const correct = inConcept.filter(a => a.is_correct).length;
    const meta = inConcept[0];
    const m = masteryByConcept.get(cid);
    return {
      code: meta.concept_code,
      name: meta.concept_name,
      attempts: inConcept.length,
      correct,
      accuracy: inConcept.length ? Math.round((correct / inConcept.length) * 100) : 0,
      current_mastery: m ? Number(m.score) : 0
    };
  });
  concepts.sort((a, b) => a.current_mastery - b.current_mastery);

  const weaknesses = concepts.filter(c => c.current_mastery < 60).slice(0, 2);
  const strengths = concepts.filter(c => c.current_mastery >= 70).slice(-2).reverse();

  const totalAttempts = attempts.length;
  const totalCorrect = attempts.filter(a => a.is_correct).length;

  const activity = {
    attempts_total: totalAttempts,
    correct_total: totalCorrect,
    accuracy: totalAttempts ? Math.round((totalCorrect / totalAttempts) * 100) : 0,
    concepts_touched: concepts.length,
    sessions: sessionRows[0]?.n ?? 0
  };

  const scope = klass.parsed_scope ?? {};
  const upcoming = findUpcomingAssessment(scope.assessments, klass.current_week);
  let prediction = null;
  if (upcoming && klass.syllabus_id) {
    const scopeConcepts = await fetchAssessmentScopeConcepts(klass.syllabus_id, upcoming);
    if (scopeConcepts.length) {
      const avg = await computeAvgMastery(studentId, scopeConcepts);
      prediction = {
        assessment: upcoming.name,
        weeks: upcoming.weeks,
        avg_mastery: Math.round(avg),
        band: predictBand(avg),
        concepts_in_scope: scopeConcepts.length
      };
    }
  }

  return {
    student: { id: student.id, name: student.display_name },
    class: {
      id: klass.id,
      name: klass.display_name,
      subject: klass.subject,
      grade: klass.grade,
      teacher_name: klass.teacher_name,
      current_week: klass.current_week
    },
    activity,
    concepts,
    strengths,
    weaknesses,
    upcoming,
    prediction
  };
}

function findUpcomingAssessment(assessments, currentWeek) {
  if (!Array.isArray(assessments)) return null;
  for (const a of assessments) {
    const weeks = (a.weeks ?? []).map(w => parseInt(String(w).replace(/[^\d]/g, ''), 10)).filter(Number.isFinite);
    if (weeks.length === 0) continue;
    const first = Math.min(...weeks);
    if (first >= currentWeek && first - currentWeek <= 4) {
      return { name: a.name, weeks: a.weeks, scope: a.scope, weeks_until: first - currentWeek };
    }
  }
  return null;
}

async function fetchAssessmentScopeConcepts(syllabusId, assessment) {
  // Heuristic: if assessment.scope mentions chapter names/IDs, match by
  // chapter_title containing those tokens. Otherwise use everything up to
  // the assessment's first week.
  const tokens = (assessment.scope ?? '').match(/Ch\.?\s*\d+/gi) ?? [];
  if (tokens.length) {
    const cleaned = tokens.map(t => t.replace(/\s+/g, '').toLowerCase());
    const rows = await query(
      `SELECT id FROM concepts
        WHERE syllabus_id = $1
          AND ` + cleaned.map((_, i) => `LOWER(REPLACE(chapter_title, ' ', '')) LIKE '%' || $${i + 2} || '%'`).join(' OR '),
      [syllabusId, ...cleaned]
    );
    return rows.map(r => r.id);
  }
  const firstWeek = Math.min(
    ...((assessment.weeks ?? []).map(w => parseInt(String(w).replace(/[^\d]/g, ''), 10)).filter(Number.isFinite)),
    99
  );
  if (!Number.isFinite(firstWeek)) return [];
  const rows = await query(
    `SELECT id FROM concepts WHERE syllabus_id = $1 AND week_introduced < $2`,
    [syllabusId, firstWeek]
  );
  return rows.map(r => r.id);
}

async function computeAvgMastery(studentId, conceptIds) {
  if (conceptIds.length === 0) return 0;
  const rows = await query(
    `SELECT COALESCE(AVG(m.score), 0)::float AS avg
       FROM unnest($2::uuid[]) AS c(id)
  LEFT JOIN mastery m ON m.concept_id = c.id AND m.student_id = $1`,
    [studentId, conceptIds]
  );
  return Number(rows[0]?.avg ?? 0);
}

function predictBand(avgMastery) {
  if (avgMastery >= 85) return 'on_track_strong';
  if (avgMastery >= 70) return 'on_track';
  if (avgMastery >= 50) return 'borderline';
  return 'at_risk';
}

// ──────────────────────────────────────────────────────────────────────────
// AI narrative — strict prompt, narrative only, no fact synthesis.
// ──────────────────────────────────────────────────────────────────────────

async function generateNarrative(data, lang) {
  if (data.activity.attempts_total === 0) {
    return { text: fallbackNarrative(data, lang), costUSD: 0 };
  }

  const langName = lang === 'zh' ? 'Traditional Chinese (繁體中文)' : 'English';

  const system = `You write 2-3 sentence weekly notes to parents about their child's tutoring activity.

Rules — non-negotiable:
- Tone: warm, specific, action-oriented. Like a teacher writing a short note, not a marketing email.
- Lead with an observation about what the child actually did this week.
- If you mention a weakness, phrase it as "might benefit from extra time on X" — NEVER "struggling", "failing", "behind".
- If a strength stands out, name the specific concept.
- Do not invent numbers or details. Use only what is in the data block.
- If the suggested action is parent-facing, make it gentle and concrete ("ask them to explain X at dinner" type — not "study more").
- Output STRICT JSON: { "text": "<2 to 3 sentences>" }
- Write in ${langName}.`;

  const user = `Write a weekly note for ${data.student.name}'s parent.

Class: ${data.class.name} (Grade ${data.class.grade}), Week ${data.class.current_week}.
This week:
  - ${data.activity.attempts_total} practice questions across ${data.activity.concepts_touched} concept(s)
  - ${data.activity.accuracy}% correct overall
  - ${data.activity.sessions} session(s)

Strongest area: ${data.strengths[0] ? `${data.strengths[0].name} (mastery ${data.strengths[0].current_mastery}/100)` : '(none yet)'}
Suggest extra time on: ${data.weaknesses[0] ? `${data.weaknesses[0].name} (mastery ${data.weaknesses[0].current_mastery}/100)` : '(no weak spots)'}
${data.prediction
    ? `Upcoming ${data.prediction.assessment} (in ~${data.upcoming?.weeks_until ?? '?'} week(s)): average mastery across that scope is ${data.prediction.avg_mastery}/100 — band: ${data.prediction.band}.`
    : ''}`;

  const result = await askJSON({ system, user, maxTokens: 300 });
  if (typeof result.data.text !== 'string' || result.data.text.length < 10) {
    throw new Error('Narrative generation returned malformed output.');
  }
  return { text: result.data.text.trim(), costUSD: result.costUSD };
}

function fallbackNarrative(data, lang) {
  if (data.activity.attempts_total === 0) {
    return lang === 'zh'
      ? `本週尚未使用練習功能。下週我們會繼續觀察 ${data.student.name} 的進度。`
      : `${data.student.name} didn't use the practice tool this week — we'll keep watching next week.`;
  }
  const strongest = data.strengths[0]?.name;
  const weakest = data.weaknesses[0]?.name;
  if (lang === 'zh') {
    let line = `${data.student.name} 本週完成了 ${data.activity.attempts_total} 題練習,整體正確率 ${data.activity.accuracy}%。`;
    if (strongest) line += ` 在 ${strongest} 表現特別穩定。`;
    if (weakest) line += ` 可以多花一點時間在 ${weakest} 上。`;
    return line;
  }
  let line = `${data.student.name} completed ${data.activity.attempts_total} practice questions this week with ${data.activity.accuracy}% accuracy.`;
  if (strongest) line += ` ${strongest} is looking solid.`;
  if (weakest) line += ` Some extra time on ${weakest} would help.`;
  return line;
}

// ──────────────────────────────────────────────────────────────────────────
// Renderers — plain text + minimal HTML.
// ──────────────────────────────────────────────────────────────────────────

const LABELS = {
  en: {
    title: 'Weekly Report', week: 'Week', class: 'Class', teacher: 'Teacher',
    activity: 'This week', attempts: 'Questions practiced', accuracy: 'Overall accuracy',
    concepts_touched: 'Concepts touched', sessions: 'Practice sessions',
    strengths: 'Strongest areas', weaknesses: 'Could use more practice',
    upcoming: 'Coming up', prediction: 'Estimated readiness',
    no_strengths: '(none stand out this week)', no_weaknesses: '(no concepts in the danger zone)',
    no_upcoming: '(no assessment in the next 4 weeks)',
    bands: {
      on_track_strong: 'On track — strong',
      on_track: 'On track',
      borderline: 'Borderline — extra review recommended',
      at_risk: 'At risk — please review with your child'
    }
  },
  zh: {
    title: '本週學習報告', week: '第', class: '班級', teacher: '導師',
    activity: '本週活動', attempts: '練習題數', accuracy: '整體正確率',
    concepts_touched: '涉及概念數', sessions: '練習次數',
    strengths: '強項', weaknesses: '建議再加強',
    upcoming: '即將到來', prediction: '預估準備度',
    no_strengths: '(本週尚無突出強項)', no_weaknesses: '(沒有需要特別注意的地方)',
    no_upcoming: '(未來四週內無評量)',
    bands: {
      on_track_strong: '進度良好,表現穩定',
      on_track: '進度良好',
      borderline: '尚可,建議額外複習',
      at_risk: '需要關注,請與孩子一起複習'
    }
  }
};

function renderPlainText(snap) {
  const L = LABELS[snap.lang] ?? LABELS.en;
  const lines = [];
  lines.push(`${L.title} — ${snap.student.name}`);
  lines.push(`${snap.class.name} · ${L.week} ${snap.week_number} · ${L.teacher}: ${snap.class.teacher_name}`);
  lines.push('');
  lines.push(snap.narrative);
  lines.push('');
  lines.push(`${L.activity}`);
  lines.push(`  ${L.attempts}:        ${snap.activity.attempts_total}`);
  lines.push(`  ${L.accuracy}:        ${snap.activity.accuracy}%`);
  lines.push(`  ${L.concepts_touched}: ${snap.activity.concepts_touched}`);
  lines.push(`  ${L.sessions}:        ${snap.activity.sessions}`);
  lines.push('');

  lines.push(`${L.strengths}`);
  if (snap.strengths.length === 0) {
    lines.push(`  ${L.no_strengths}`);
  } else {
    for (const c of snap.strengths) {
      lines.push(`  ${c.name}  ${bar(c.current_mastery)}  ${c.current_mastery}/100`);
    }
  }
  lines.push('');

  lines.push(`${L.weaknesses}`);
  if (snap.weaknesses.length === 0) {
    lines.push(`  ${L.no_weaknesses}`);
  } else {
    for (const c of snap.weaknesses) {
      lines.push(`  ${c.name}  ${bar(c.current_mastery)}  ${c.current_mastery}/100`);
    }
  }
  lines.push('');

  if (snap.prediction) {
    const bandLabel = L.bands[snap.prediction.band] ?? snap.prediction.band;
    lines.push(`${L.upcoming}: ${snap.prediction.assessment}`);
    lines.push(`  ${L.prediction}: ${bandLabel}`);
    lines.push(`  (avg mastery ${snap.prediction.avg_mastery}/100 across ${snap.prediction.concepts_in_scope} concepts)`);
  } else {
    lines.push(`${L.upcoming}: ${L.no_upcoming}`);
  }
  return lines.join('\n');
}

function renderHTML(snap) {
  const L = LABELS[snap.lang] ?? LABELS.en;
  const e = escapeHTML;
  const conceptLi = (c) => `<li><strong>${e(c.name)}</strong> — ${c.current_mastery}/100 <span style="opacity:.6">(${c.attempts} attempts, ${c.accuracy}% correct)</span></li>`;
  const predictionHTML = snap.prediction
    ? `<p><strong>${L.upcoming}:</strong> ${e(snap.prediction.assessment)} — ${e(L.bands[snap.prediction.band] ?? snap.prediction.band)} <span style="opacity:.6">(avg ${snap.prediction.avg_mastery}/100 across ${snap.prediction.concepts_in_scope} concepts)</span></p>`
    : `<p><strong>${L.upcoming}:</strong> ${L.no_upcoming}</p>`;
  return `<article style="font-family: system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 16px; line-height: 1.5;">
  <header>
    <h2 style="margin:0">${e(L.title)} — ${e(snap.student.name)}</h2>
    <p style="opacity:.7; margin:4px 0 16px">${e(snap.class.name)} · ${L.week} ${snap.week_number} · ${L.teacher}: ${e(snap.class.teacher_name)}</p>
  </header>
  <p style="font-size:16px">${e(snap.narrative)}</p>
  <h3>${L.activity}</h3>
  <ul>
    <li>${L.attempts}: <strong>${snap.activity.attempts_total}</strong></li>
    <li>${L.accuracy}: <strong>${snap.activity.accuracy}%</strong></li>
    <li>${L.concepts_touched}: <strong>${snap.activity.concepts_touched}</strong></li>
    <li>${L.sessions}: <strong>${snap.activity.sessions}</strong></li>
  </ul>
  <h3>${L.strengths}</h3>
  <ul>${snap.strengths.length ? snap.strengths.map(conceptLi).join('') : `<li style="opacity:.6">${L.no_strengths}</li>`}</ul>
  <h3>${L.weaknesses}</h3>
  <ul>${snap.weaknesses.length ? snap.weaknesses.map(conceptLi).join('') : `<li style="opacity:.6">${L.no_weaknesses}</li>`}</ul>
  ${predictionHTML}
</article>`;
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function bar(score, width = 16) {
  const filled = Math.round((score / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toDateString(d) {
  const date = new Date(d);
  return date.toISOString().slice(0, 10);
}

function escapeHTML(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
