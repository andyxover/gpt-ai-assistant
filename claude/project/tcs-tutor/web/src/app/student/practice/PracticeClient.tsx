'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { submitAnswer, requestNext } from './actions';
import type { QuestionForStudent, AttemptResult } from '@/lib/tutor/mastery';

export default function PracticeClient(props: {
  initialQuestion: QuestionForStudent | null;
  sessionId: string;
  initialError?: string;
}) {
  const router = useRouter();
  const [question, setQuestion] = useState<QuestionForStudent | null>(props.initialQuestion);
  const [feedback, setFeedback] = useState<AttemptResult | null>(null);
  const [pickedLetter, setPickedLetter] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(props.initialError ?? null);

  function handleAnswer(letter: string) {
    if (!question) return;
    setErrorMsg(null);
    setPickedLetter(letter);
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
      // Re-fetch server data (so the MasteryPanel reflects the new score)
      // without resetting local question/feedback state.
      router.refresh();
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
      router.refresh();
    });
  }

  if (!question) {
    return (
      <div className="card">
        <div className="card-title">{errorMsg ?? 'No question available'}</div>
        <a href="/student" className="btn ghost small">← Back to This week</a>
      </div>
    );
  }

  return (
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
}
