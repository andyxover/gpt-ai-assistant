'use server';

import { getTutorUser } from '@/lib/tutor/role';
import {
  pickNextQuestion,
  recordAttempt,
  findActiveSyllabusForStudent,
  ensureSession,
  type QuestionForStudent,
  type AttemptResult,
} from '@/lib/tutor/mastery';

type Mode = 'review' | 'preview' | 'exam_prep';

export interface StartResponse {
  ok: boolean;
  sessionId?: string;
  question?: QuestionForStudent;
  error?: string;
}

export async function startSession(mode: Mode): Promise<StartResponse> {
  const user = await getTutorUser();
  if (!user || user.role !== 'student') return { ok: false, error: 'Not signed in as a student' };

  const syl = await findActiveSyllabusForStudent(user.id);
  if (!syl) return { ok: false, error: "You're not enrolled in a class yet." };

  const session = await ensureSession({ studentId: user.id, classId: syl.class_id, mode });
  const q = await pickNextQuestion({ studentId: user.id, syllabusId: syl.id });

  if (!q) return { ok: true, sessionId: session.id, error: 'No questions available yet.' };
  return { ok: true, sessionId: session.id, question: q };
}

export interface SubmitResponse {
  ok: boolean;
  attempt?: AttemptResult;
  error?: string;
}

export async function submitAnswer(opts: {
  questionId: string;
  letter: string;
  sessionId: string;
}): Promise<SubmitResponse> {
  const user = await getTutorUser();
  if (!user || user.role !== 'student') return { ok: false, error: 'Not signed in as a student' };
  if (!/^[A-D]$/.test(opts.letter)) return { ok: false, error: 'Pick A, B, C, or D.' };

  try {
    const attempt = await recordAttempt({
      studentId: user.id,
      questionId: opts.questionId,
      letter: opts.letter,
      sessionId: opts.sessionId,
    });
    return { ok: true, attempt };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface NextResponse {
  ok: boolean;
  question?: QuestionForStudent;
  error?: string;
}

export async function requestNext(): Promise<NextResponse> {
  const user = await getTutorUser();
  if (!user || user.role !== 'student') return { ok: false, error: 'Not signed in as a student' };

  const syl = await findActiveSyllabusForStudent(user.id);
  if (!syl) return { ok: false, error: "You're not enrolled in a class yet." };

  const q = await pickNextQuestion({ studentId: user.id, syllabusId: syl.id });
  if (!q) return { ok: true, error: "Nothing else to practice right now — great job!" };
  return { ok: true, question: q };
}
