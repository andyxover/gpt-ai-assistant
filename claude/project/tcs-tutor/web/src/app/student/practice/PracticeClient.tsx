'use client';

import { useState, useTransition } from 'react';
import { submitAnswer, requestNext } from './actions';
import type { QuestionForStudent, AttemptResult } from '@/lib/tutor/mastery';
import MasteryPanelView, { type MasteryRow } from '@/components/MasteryPanelView';

export default function PracticeClient(props: {
  initialQuestion: QuestionForStudent | null;
  sessionId: string;
  initialError?: string;
  initialMastery: MasteryRow[];
  hasSyllabus: boolean;
}) {
  const [question, setQuestion] = useState<QuestionForStudent | null>(props.initialQuestion);
  const [feedback, setFeedback] = useState<AttemptResult | null>(null);
  const [pickedLetter, setPickedLetter] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(props.initialError ?? null);
  const [mastery, setMastery] = useState<MasteryRow[]>(props.initialMastery);

  // Optimistic local bump using the attempt result, so the bar visibly
  // moves the instant the student answers — even before /api/student/mastery
  // returns. The fetch below then reconciles with the server.
  function applyOptimistic(attempt: AttemptResult, conceptId: string | undefined) {
    if (!conceptId) return;
    setMastery(prev =>
      prev.map(row =>
        row.concept_id === conceptId
          ? {
              ...row,
              score: Math.max(0, Math.min(100, attempt.masteryAfter)),
              attempts: row.attempts + 1,
            }
          : row,
      ),
    );
  }

  async function refetchMastery() {
    try {
      const r = await fetch('/api/student/mastery', { cache: 'no-store' });
      if (!r.ok) return;
      const data = (await r.json()) as { rows?: MasteryRow[] };
      if (Array.isArray(data.rows)) setMastery(data.rows);
    } catch {
      // swallow — we already showed the optimistic update
    }
  }

  function handleAnswer(letter: string) {
    if (!question) return;
    setErrorMsg(null);
    setPickedLetter(letter);
    const conceptId = question.concept_id;
    startTransition(async () => {
      const res = await submitAnswer({
        questionId: question.id,
        letter,
        sessionId: props.sessionId,
      });
      if (!res.ok) {
        setErrorMsg(res.error ?? 'Something went wrong.');
        return;
      }
      setFeedback(res.attempt ?? null);
      if (res.attempt) applyOptimistic(res.attempt, conceptId);
      // Reconcile from the server (cheaper than router.refresh — only
      // re-fetches the mastery rows, no full route render).
      void refetchMastery();
    });
  }

  function handleNext() {
    setErrorMsg(null);
    setFeedback(null);
    setPickedLetter(null);
    startTransition(async () => {
      const res = await requestNext();
      if (!res.ok) {
        setErrorMsg(res.error ?? 'Something went wrong.');
        return;
      }
      if (!res.question) {
        setQuestion(null);
        setErrorMsg(res.error ?? 'Nothing more to practice right now.');
        return;
      }
      setQuestion(res.question);
    });
  }

  const focusConceptId = question?.concept_id ?? null;

  const quizMarkup = !question ? (
    <div className="card">
      <div className="card-title">{errorMsg ?? 'No question available'}</div>
      <a href="/student" className="btn ghost small">← Back to This week</a>
    </div>
  ) : (
    <>
      <div className="card">
        <div className="row" style={{ marginBottom: 8 }}>
          <div className="eyebrow" style={{ margin: 0 }}>{question.concept_name}</div>
          <div className="spacer"></div>
          <span className="mono small dim">Difficulty {question.difficulty}/5</span>
        </div>
        <p style={{ fontSize: 16, lineHeight: 1.55, margin: '12px 0 16px' }}>{question.body}</p>

        <div className="quiz">
          {question.options.map(o => {
            const cls = feedback
              ? o.letter === feedback.correctLetter
                ? 'opt correct'
                : o.letter === pickedLetter
                ? 'opt wrong'
                : 'opt'
              : 'opt';
            return (
              <button
                key={o.letter}
                onClick={() => handleAnswer(o.letter)}
                disabled={pending || !!feedback}
                className={cls}
                style={{ width: '100%' }}
              >
                <span className="letter">{o.letter}</span>
                <span style={{ flex: 1, textAlign: 'left' }}>{o.text}</span>
              </button>
            );
          })}

          {feedback && (
            <div className={`feedback ${feedback.isCorrect ? 'ok' : 'no'}`}>
              <strong>
                {feedback.isCorrect
                  ? '✓ Correct!'
                  : `✗ Not quite — the answer was ${feedback.correctLetter}.`}
              </strong>
              {feedback.explanation && (
                <p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{feedback.explanation}</p>
              )}
              <p className="mono small" style={{ margin: '8px 0 0', color: 'inherit', opacity: 0.85 }}>
                Mastery: {Math.round(feedback.masteryBefore)} → {Math.round(feedback.masteryAfter)}
                {' '}
                ({feedback.masteryAfter >= feedback.masteryBefore ? '+' : ''}
                {Math.round(feedback.masteryAfter - feedback.masteryBefore)})
              </p>
            </div>
          )}
        </div>
      </div>

      {feedback && (
        <div className="toolbar">
          <button className="btn" onClick={handleNext} disabled={pending}>
            {pending ? 'Loading…' : 'Next →'}
          </button>
          <a href="/student" className="btn secondary">Stop</a>
        </div>
      )}

      {errorMsg && !feedback && (
        <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 12 }}>{errorMsg}</p>
      )}
    </>
  );

  // If no syllabus is enrolled, skip the mastery panel entirely.
  if (!props.hasSyllabus) return quizMarkup;

  return (
    <div className="with-mastery">
      <MasteryPanelView concepts={mastery} focusConceptId={focusConceptId} />
      <div>{quizMarkup}</div>
    </div>
  );
}
