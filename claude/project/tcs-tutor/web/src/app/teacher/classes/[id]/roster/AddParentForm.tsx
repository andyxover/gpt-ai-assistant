'use client';

import { useState, useTransition } from 'react';
import { linkParentToStudent, type LinkParentResult } from './actions';

/**
 * Inline form expanded from a student row when the teacher clicks
 * "+ Add parent". Captures email, name, relationship, preferred lang,
 * and a required consent confirmation. On success, fires `onLinked`
 * so the parent row's parent list re-fetches without a full
 * route refresh.
 *
 * Why explicit consent: parent_links.consent_given_at is NOT NULL
 * with no default — every row IS a consent record. The teacher
 * ticking the box is the action that creates the row.
 */
export default function AddParentForm(props: {
  classId: string;
  studentId: string;
  studentName: string;
  onLinked: () => void;
  onCancel: () => void;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState('parent');
  const [lang, setLang] = useState<'zh' | 'en'>('zh');
  const [consent, setConsent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setErr(null);
    if (!consent) {
      setErr('Please confirm consent was collected from the parent.');
      return;
    }
    startTransition(async () => {
      let res: LinkParentResult;
      try {
        res = await linkParentToStudent({
          classId: props.classId,
          studentId: props.studentId,
          parentEmail: email,
          parentDisplayName: name,
          relationship,
          preferredLang: lang,
          consentConfirmed: consent,
        });
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
        return;
      }
      if (!res.ok) {
        setErr(res.error ?? 'Could not link parent.');
        return;
      }
      props.onLinked();
    });
  }

  return (
    <div
      style={{
        background: 'var(--surface-2)',
        borderRadius: 8,
        padding: 12,
        marginTop: 8,
        marginBottom: 4,
      }}
    >
      <div className="mono small dim" style={{ marginBottom: 8 }}>
        Add parent for <strong>{props.studentName}</strong>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
          marginBottom: 8,
        }}
      >
        <input
          name="parentName"
          placeholder="Parent name"
          value={name}
          onChange={e => setName(e.target.value)}
          autoFocus
        />
        <input
          name="parentEmail"
          type="email"
          placeholder="parent@example.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
        <select
          name="relationship"
          value={relationship}
          onChange={e => setRelationship(e.target.value)}
        >
          <option value="parent">Parent</option>
          <option value="guardian">Guardian</option>
          <option value="other">Other</option>
        </select>
        <div
          className="row"
          style={{ gap: 8, alignItems: 'center', fontSize: 13 }}
        >
          <span className="mono small dim">Language:</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              type="radio"
              name="lang"
              value="zh"
              checked={lang === 'zh'}
              onChange={() => setLang('zh')}
            />
            <span>中文</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              type="radio"
              name="lang"
              value="en"
              checked={lang === 'en'}
              onChange={() => setLang('en')}
            />
            <span>EN</span>
          </label>
        </div>
      </div>
      <label
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          fontSize: 12,
          color: 'var(--text-dim)',
          marginBottom: 10,
        }}
      >
        <input
          type="checkbox"
          checked={consent}
          onChange={e => setConsent(e.target.checked)}
          style={{ marginTop: 3 }}
        />
        <span>
          I confirm I&apos;ve collected this parent&apos;s consent to access their
          child&apos;s tutoring data. (Required.)
        </span>
      </label>
      {err && (
        <p style={{ color: 'var(--danger)', fontSize: 12, margin: '0 0 10px' }}>
          {err}
        </p>
      )}
      <div className="row" style={{ gap: 8 }}>
        <button
          type="button"
          className="btn small"
          onClick={submit}
          disabled={pending}
        >
          {pending ? 'Linking…' : 'Link parent'}
        </button>
        <button
          type="button"
          className="btn secondary small"
          onClick={props.onCancel}
          disabled={pending}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
