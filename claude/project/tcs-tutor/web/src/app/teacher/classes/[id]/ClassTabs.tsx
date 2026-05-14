'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { slug: 'progress', label: 'Class Progress' },
  { slug: 'activity', label: 'Student Activity' },
  { slug: 'roster', label: 'Roster' },
  { slug: 'syllabus', label: 'Syllabus' },
] as const;

export default function ClassTabs({ classId }: { classId: string }) {
  const pathname = usePathname();

  return (
    <nav className="border-b border-stone-200 flex gap-1">
      {TABS.map(t => {
        const href = `/teacher/classes/${classId}/${t.slug}`;
        const active = pathname === href || pathname.startsWith(href + '/');
        return (
          <Link
            key={t.slug}
            href={href}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
              active
                ? 'border-[#c9874a] text-[#a86a36]'
                : 'border-transparent text-stone-500 hover:text-stone-900'
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
