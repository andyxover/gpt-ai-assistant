'use client';

import { useState, useTransition } from 'react';
import { submitAnswer, requestNext } from './actions';
import type { QuestionForStudent, AttemptResult } from '@/lib/tutor/mastery';

export default function PracticeClient(props: {
  initialQuestion: QuestionForStudent | null;
  sessionId: string;
  initialError?: string;
}) {
  const [question, setQuestion] = useState<QuestionForStudent | null>(props.initialQuestion);
  const [feedback, setFeedback] = useState<AttemptResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(props.initialError ?? null);

  function handleAnswer(letter: string) {
    if (!question) return;
    setErrorMsg(null);
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
    });
  }

  function handleNext() {
    setErrorMsg(null);
    setFeedback(null);
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

  if (!question) {
    return (
      <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center">
        <p className="text-stone-600">{errorMsg ?? 'No question available.'}</p>
        <a href="/student" className="inline-block mt-4 text-sm text-[#a86a36] hover:underline">
          ← Back
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-white border border-stone-200 rounded-2xl p-6">
        <div className="flex items-baseline justify-between mb-4">
          <p className="text-sm font-medium text-[#a86a36]">{question.concept_name}</p>
          <p className="text-xs text-stone-500">Difficulty {question.difficulty}/5</p>
        </div>
        <p className="text-lg whitespace-pre-wrap leading-relaxed">{question.body}</p>

        <div className="mt-5 grid gap-2">
          {question.options.map(o => {
            const isPicked = feedback && o.letter === feedback.correctLetter;
            const isWrongPick = feedback && !feedback.isCorrect && o.letter === feedback.correctLetter;
            return (
              <button
                key={o.letter}
                onClick={() => handleAnswer(o.letter)}
                disabled={pending || !!feedback}
                className={`text-left px-4 py-3 rounded-lg border transition ${
                  feedback
                    ? isPicked
                      ? 'border-green-500 bg-green-50'
                      : 'border-stone-200 bg-stone-50 opacity-60'
                    : 'border-stone-200 hover:border-[#c9874a] hover:bg-stone-50'
                }`}
              >
                <span className="font-semibold mr-2">{o.letter})</span>
                <span>{o.text}</span>
                {isWrongPick && <span className="ml-2 text-xs text-green-700">← correct</span>}
              </button>
            );
          })}
        </div>
      </div>

      {feedback && (
        <div className={`rounded-2xl p-5 border ${feedback.isCorrect ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <p className="font-semibold mb-2">
            {feedback.isCorrect
              ? '✓ Correct!'
              : `✗ Not quite — the answer was ${feedback.correctLetter}.`}
          </p>
          {feedback.explanation && (
            <p className="text-sm text-stone-700 leading-relaxed mb-3 whitespace-pre-wrap">{feedback.explanation}</p>
          )}
          <p className="text-xs text-stone-600">
            Mastery: {Math.round(feedback.masteryBefore)} → {Math.round(feedback.masteryAfter)}
            {' '}({feedback.masteryAfter >= feedback.masteryBefore ? '+' : ''}
            {Math.round(feedback.masteryAfter - feedback.masteryBefore)})
          </p>
          <button
            onClick={handleNext}
            disabled={pending}
            className="mt-4 px-5 py-2.5 rounded-lg bg-[#c9874a] hover:bg-[#a86a36] disabled:opacity-50 text-white font-medium"
          >
            {pending ? 'Loading…' : 'Next →'}
          </button>
        </div>
      )}

      {errorMsg && !feedback && (
        <p className="text-sm text-red-600">{errorMsg}</p>
      )}
    </div>
  );
}
