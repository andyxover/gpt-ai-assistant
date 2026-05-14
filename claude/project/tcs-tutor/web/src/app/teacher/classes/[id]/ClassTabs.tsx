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
    <div className="tabs">
      {TABS.map(t => {
        const href = `/teacher/classes/${classId}/${t.slug}`;
        const active = pathname === href || pathname.startsWith(href + '/');
        return (
          <Link key={t.slug} href={href} className={`tab ${active ? 'active' : ''}`}>
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
