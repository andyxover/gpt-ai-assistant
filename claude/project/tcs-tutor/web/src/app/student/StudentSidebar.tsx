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
    <aside className="hidden lg:flex w-64 bg-white border-r border-stone-200 flex-col">
      <div className="p-5 border-b border-stone-100">
        <h2 className="font-semibold">TCS Tutor</h2>
        <p className="text-xs text-stone-500 mt-0.5">Student</p>
      </div>

      <nav className="p-4 flex-1 overflow-y-auto">
        <SidebarLabel>My courses</SidebarLabel>
        <ul className="mb-6 space-y-0.5">
          {classes.length === 0 && (
            <li className="text-xs text-stone-400 px-3 py-1.5">No enrollments yet</li>
          )}
          {classes.map(c => {
            const active = c.id === props.activeClassId;
            return (
              <li key={c.id}>
                <Link
                  href={`/student/practice?class=${c.id}`}
                  className={`block px-3 py-1.5 rounded-md text-sm ${
                    active ? 'bg-[#fdf6ec] text-[#a86a36] font-medium' : 'text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  <span className="block truncate">{c.display_name}</span>
                  {c.teacher_display && (
                    <span className="block text-[11px] text-stone-500 truncate">{c.teacher_display}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        <SidebarLabel>Learning</SidebarLabel>
        <ul className="space-y-0.5">
          {learningItems.map(item => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`block px-3 py-1.5 rounded-md text-sm ${
                    active ? 'bg-[#fdf6ec] text-[#a86a36] font-medium' : 'text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="p-4 border-t border-stone-100 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-[#c9874a] text-white flex items-center justify-center text-sm font-medium shrink-0">
          {(user.display_name?.[0] ?? '?').toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{user.display_name}</p>
          {user.section && <p className="text-xs text-stone-500 truncate">Section {user.section}</p>}
        </div>
      </div>
    </aside>
  );
}

function SidebarLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] uppercase tracking-wider font-medium text-stone-400 px-3 mb-1.5">
      {children}
    </p>
  );
}
