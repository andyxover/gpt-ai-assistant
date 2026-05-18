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
    <aside className="sidebar">
      <div className="sidebar-section">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12, padding: '0 4px' }}>
          <div className="sidebar-label" style={{ margin: 0, padding: 0 }}>{L.myChildren}</div>
          <div className="lang-toggle" style={{ padding: 2 }}>
            <button onClick={() => toggleLang('en')} disabled={pending} className={props.lang === 'en' ? 'active' : ''} style={{ fontSize: 11, padding: '3px 8px' }}>EN</button>
            <button onClick={() => toggleLang('zh')} disabled={pending} className={props.lang === 'zh' ? 'active' : ''} style={{ fontSize: 11, padding: '3px 8px' }}>中</button>
          </div>
        </div>
        {props.children.length === 0 && (
          <div className="sidebar-item" style={{ color: 'var(--text-dim)' }}>No children linked</div>
        )}
        {props.children.map(c => {
          const active = c.id === activeChildId;
          const params = new URLSearchParams(search.toString());
          params.set('child', c.id);
          return (
            <Link
              key={c.id}
              href={`${pathname}?${params.toString()}`}
              className={`sidebar-item ${active ? 'active' : ''}`}
            >
              <span style={{ flex: 1 }}>{c.display_name}</span>
              {c.section && <span className="badge">{c.section}</span>}
            </Link>
          );
        })}
      </div>

      <div className="sidebar-section">
        <div className="sidebar-label">{L.reports}</div>
        {reportItems.map(item => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={navWithChild(item.href)}
              className={`sidebar-item ${active ? 'active' : ''}`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className="sidebar-section">
        <div className="sidebar-label">{L.settings}</div>
        {settingsItems.map(item => {
          const active = pathname === item.href;
          return (
            <Link key={item.href} href={item.href} className={`sidebar-item ${active ? 'active' : ''}`}>
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className="me">
        <div className="avatar" style={{ background: 'var(--success)' }}>
          {(props.user.display_name?.[0] ?? '?').toUpperCase()}
        </div>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{props.user.display_name}</div>
      </div>
    </aside>
  );
}
