'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setDevRole } from './role-toggle-action';

type Role = 'teacher' | 'student' | 'parent';

const HOME: Record<Role, string> = {
  teacher: '/teacher',
  student: '/student',
  parent: '/parent',
};

export default function RoleToggle({ current }: { current: Role }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function pick(role: Role) {
    if (role === current) return;
    startTransition(async () => {
      await setDevRole(role);
      router.push(HOME[role]);
      router.refresh();
    });
  }

  return (
    <div className="role-toggle" role="tablist" aria-label="Dev role" title="Dev-mode role switcher">
      <button
        type="button"
        className={current === 'teacher' ? 'active' : ''}
        onClick={() => pick('teacher')}
        disabled={pending}
      >
        Teacher
      </button>
      <button
        type="button"
        className={current === 'student' ? 'active' : ''}
        onClick={() => pick('student')}
        disabled={pending}
      >
        Student
      </button>
      <button
        type="button"
        className={current === 'parent' ? 'active' : ''}
        onClick={() => pick('parent')}
        disabled={pending}
      >
        Parent
      </button>
    </div>
  );
}
