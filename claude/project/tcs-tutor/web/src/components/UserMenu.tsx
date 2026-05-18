'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import { signOut } from '@/lib/tutor/sign-out';

/**
 * Small popover anchored to the topbar avatar. Shows the signed-in
 * user's display name + email, with a Sign out button. Click-outside
 * and Escape both close it.
 */
export default function UserMenu(props: {
  displayName: string;
  email: string | null;
  role: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const initial = (props.displayName?.[0] ?? '?').toUpperCase();

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={props.displayName}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          border: 'none',
          background: 'transparent',
          padding: 0,
          cursor: 'pointer',
        }}
      >
        <span className="mono small dim">{props.role}</span>
        <span className="avatar" aria-hidden="true">{initial}</span>
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 8px)',
            minWidth: 240,
            background: 'var(--surface-1, #fff)',
            border: '1px solid var(--border-soft, #e5e5e5)',
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
            padding: 12,
            zIndex: 50,
          }}
        >
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{props.displayName}</div>
            <div
              className="mono small dim"
              style={{ wordBreak: 'break-all', marginTop: 2 }}
            >
              {props.email ?? '(no email on file)'}
            </div>
            <div className="mono small dim" style={{ marginTop: 2 }}>
              role: {props.role}
            </div>
          </div>
          <div
            style={{
              height: 1,
              background: 'var(--border-soft, #e5e5e5)',
              margin: '8px -12px 10px',
            }}
          />
          <button
            type="button"
            role="menuitem"
            onClick={() => startTransition(() => signOut())}
            disabled={pending}
            className="btn secondary small"
            style={{ width: '100%' }}
          >
            {pending ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      )}
    </div>
  );
}
