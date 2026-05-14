'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { setLang } from './actions';
import { useTransition } from 'react';
import type { ChildSummary } from '@/lib/tutor/parent';

const STRINGS = {
  en: {
    myChildren: 'My children',
    reports: 'Reports',
    settings: 'Settings',
    thisWeek: 'This week',
    history: 'Learning history',
    examPrediction: 'Exam prediction',
    messageTeacher: 'Message teacher',
    notifications: 'Notification preferences',
    parentLabel: 'Parent',
  },
  zh: {
    myChildren: '我的孩子',
    reports: '報告',
    settings: '設定',
    thisWeek: '本週',
    history: '學習歷程',
    examPrediction: '考試預測',
    messageTeacher: '訊息老師',
    notifications: '通知偏好',
    parentLabel: '家長',
  },
} as const;

export default function ParentSidebar(props: {
  user: { display_name: string };
  children: ChildSummary[];
  lang: 'en' | 'zh';
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [pending, startTransition] = useTransition();
  const activeChildId = search.get('child') ?? props.children[0]?.id;
  const L = STRINGS[props.lang];

  const reportItems = [
    { href: '/parent/this-week', label: L.thisWeek },
    { href: '/parent/history', label: L.history },
    { href: '/parent/exam-prediction', label: L.examPrediction },
    { href: '/parent/message-teacher', label: L.messageTeacher },
  ];
  const settingsItems = [
    { href: '/parent/notifications', label: L.notifications },
  ];

  function navWithChild(href: string) {
    const params = new URLSearchParams(search.toString());
    if (activeChildId) params.set('child', activeChildId);
    return `${href}?${params.toString()}`;
  }

  function toggleLang(next: 'en' | 'zh') {
    if (next === props.lang) return;
    startTransition(async () => {
      await setLang(next);
      router.refresh();
    });
  }

  return (
    <aside className="hidden lg:flex w-64 bg-white border-r border-stone-200 flex-col">
      <div className="p-5 border-b border-stone-100 flex items-center justify-between">
        <div>
          <h2 className="font-semibold">TCS Tutor</h2>
          <p className="text-xs text-stone-500 mt-0.5">{L.parentLabel}</p>
        </div>
        <div className="flex gap-1 text-[11px]">
          <button
            onClick={() => toggleLang('en')}
            disabled={pending}
            className={`px-2 py-0.5 rounded ${props.lang === 'en' ? 'bg-[#fdf6ec] text-[#a86a36] font-semibold' : 'text-stone-500 hover:text-stone-900'}`}
          >EN</button>
          <button
            onClick={() => toggleLang('zh')}
            disabled={pending}
            className={`px-2 py-0.5 rounded ${props.lang === 'zh' ? 'bg-[#fdf6ec] text-[#a86a36] font-semibold' : 'text-stone-500 hover:text-stone-900'}`}
          >中</button>
        </div>
      </div>

      <nav className="p-4 flex-1 overflow-y-auto">
        <SidebarLabel>{L.myChildren}</SidebarLabel>
        <ul className="mb-6 space-y-0.5">
          {props.children.length === 0 && (
            <li className="text-xs text-stone-400 px-3 py-1.5">No children linked</li>
          )}
          {props.children.map(c => {
            const active = c.id === activeChildId;
            const search2 = new URLSearchParams(search.toString());
            search2.set('child', c.id);
            return (
              <li key={c.id}>
                <Link
                  href={`${pathname}?${search2.toString()}`}
                  className={`flex items-center justify-between px-3 py-1.5 rounded-md text-sm ${
                    active ? 'bg-[#fdf6ec] text-[#a86a36] font-medium' : 'text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  <span className="truncate">{c.display_name}</span>
                  {c.section && (
                    <span className="text-[10px] font-mono bg-stone-200 text-stone-700 px-1.5 py-0.5 rounded shrink-0">
                      {c.section}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        <SidebarLabel>{L.reports}</SidebarLabel>
        <ul className="mb-6 space-y-0.5">
          {reportItems.map(item => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <li key={item.href}>
                <Link
                  href={navWithChild(item.href)}
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

        <SidebarLabel>{L.settings}</SidebarLabel>
        <ul className="space-y-0.5">
          {settingsItems.map(item => {
            const active = pathname === item.href;
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
        <div className="w-8 h-8 rounded-full bg-green-700 text-white flex items-center justify-center text-sm font-medium shrink-0">
          {(props.user.display_name?.[0] ?? '?').toUpperCase()}
        </div>
        <p className="text-sm font-medium truncate">{props.user.display_name}</p>
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
