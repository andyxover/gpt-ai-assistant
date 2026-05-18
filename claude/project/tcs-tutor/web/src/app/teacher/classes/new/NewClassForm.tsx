'use client';

import { useActionState } from 'react';
import { createClass, type NewClassState } from './actions';

const initialState: NewClassState = {};

/**
 * Client wrapper so the form can surface validation errors inline.
 * On success, the server action redirects, so the success branch is
 * never observed here.
 */
export default function NewClassForm() {
  const [state, formAction, pending] = useActionState(createClass, initialState);

  return (
    <form action={formAction}>
      <Field label="Display name" name="display_name" placeholder="Science 7A" required />
      <div className="grid-3" style={{ marginBottom: 14 }}>
        <Field label="Subject" name="subject" placeholder="science" required noMargin />
        <Field
          label="Grade"
          name="grade"
          type="number"
          min={1}
          max={12}
          defaultValue="7"
          required
          noMargin
        />
        <Field label="Section" name="section" placeholder="7A" required noMargin />
      </div>
      <Field
        label="Academic year"
        name="academic_year"
        placeholder="2026-27"
        defaultValue="2026-27"
        required
      />
      {state.error && (
        <p
          aria-live="polite"
          style={{ color: 'var(--danger)', fontSize: 13, margin: '0 0 12px' }}
        >
          {state.error}
        </p>
      )}
      <button type="submit" className="btn" disabled={pending}>
        {pending ? 'Creating…' : 'Create class'}
      </button>
    </form>
  );
}

function Field({
  label,
  noMargin,
  ...rest
}: { label: string; noMargin?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label style={{ display: 'block', marginBottom: noMargin ? 0 : 14 }}>
      <span
        className="mono small dim"
        style={{ display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}
      >
        {label}
      </span>
      <input {...rest} />
    </label>
  );
}
