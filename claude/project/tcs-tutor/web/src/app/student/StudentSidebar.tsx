'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { EnrolledClass } from '@/lib/tutor/student';

export default function StudentSidebar(props: {
  user: { display_name: string; section?: string | null };
  classes: EnrolledClass[];
  activeClassId?: string;
}) {
  const pathname = usePathname();
  const { user, classes } = props;

  const learningItems = [
    { href: '/student', label: 'This week' },
    { href: '/student/practice', label: 'Practice' },
    { href: '/student/chat', label: 'Ask the tutor' },
    { href: '/student/mistakes', label: 'Mistake log' },
    { href: '/student/reports', label: 'Learning reports' },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-section">
        <div className="sidebar-label">My courses</div>
        {classes.length === 0 && (
          <div className="sidebar-item" style={{ color: 'var(--text-dim)' }}>None yet</div>
        )}
        {classes.map(c => (
          <Link
            key={c.id}
            href={`/student/practice?class=${c.id}`}
            className={`sidebar-item ${c.id === props.activeClassId ? 'active' : ''}`}
          >
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.display_name}
            </span>
            {c.teacher_display && <span className="badge">{c.teacher_display.split(' ').slice(-1)[0]}</span>}
          </Link>
        ))}
      </div>

      <div className="sidebar-section">
        <div className="sidebar-label">Learning</div>
        {learningItems.map(item => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-item ${active ? 'active' : ''}`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className="me">
        <div className="avatar">{(user.display_name?.[0] ?? '?').toUpperCase()}</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{user.display_name}</div>
          {user.section && <div className="small dim">Section {user.section}</div>}
        </div>
      </div>
    </aside>
  );
}
