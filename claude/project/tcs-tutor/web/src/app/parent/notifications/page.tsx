import { getTutorUser } from '@/lib/tutor/role';
import { redirect } from 'next/navigation';

const STRINGS = {
  en: {
    eyebrow: 'Settings',
    title: 'Notification preferences',
    subtitle: 'Choose what you want to hear about.',
    weeklyDigest: 'Weekly digest',
    weeklyDigest_desc: "A summary email every Sunday with this week's progress.",
    flaggedAlerts: 'Flagged-content alerts',
    flaggedAlerts_desc: 'Notify me when my child flags a question.',
    examReminders: 'Exam reminders',
    examReminders_desc: 'Remind me one week before an exam.',
    note: 'These preferences will be wired to actual delivery when email / LINE digest is enabled.',
  },
  zh: {
    eyebrow: '設定',
    title: '通知偏好',
    subtitle: '選擇你想收到的通知。',
    weeklyDigest: '每週摘要',
    weeklyDigest_desc: '每週日寄送本週進度摘要。',
    flaggedAlerts: '檢舉提醒',
    flaggedAlerts_desc: '當孩子檢舉題目時通知我。',
    examReminders: '考試提醒',
    examReminders_desc: '考試前一週提醒我。',
    note: '此偏好將在 Email / LINE 摘要啟用時生效。',
  },
} as const;

export default async function NotificationsPage() {
  const user = await getTutorUser();
  if (!user) redirect('/login');
  if (user.role !== 'parent') redirect('/');

  const lang = (user.preferred_lang ?? 'en') as 'en' | 'zh';
  const L = STRINGS[lang];

  return (
    <>
      <div className="eyebrow">{L.eyebrow}</div>
      <h1>{L.title}</h1>
      <p className="subtitle">{L.subtitle}</p>

      <PrefRow title={L.weeklyDigest} desc={L.weeklyDigest_desc} defaultOn />
      <PrefRow title={L.flaggedAlerts} desc={L.flaggedAlerts_desc} defaultOn />
      <PrefRow title={L.examReminders} desc={L.examReminders_desc} defaultOn={false} />

      <p className="mono small dim" style={{ marginTop: 18 }}>{L.note}</p>
    </>
  );
}

function PrefRow({ title, desc, defaultOn }: { title: string; desc: string; defaultOn: boolean }) {
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: 14 }}>{title}</div>
        <div className="muted small" style={{ marginTop: 2 }}>{desc}</div>
      </div>
      <Toggle defaultOn={defaultOn} />
    </div>
  );
}

function Toggle({ defaultOn }: { defaultOn: boolean }) {
  return (
    <label
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer', flexShrink: 0 }}
    >
      <input type="checkbox" defaultChecked={defaultOn} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }} className="peer" />
      <span
        style={{
          width: 40, height: 22,
          background: defaultOn ? 'var(--primary)' : 'var(--border)',
          borderRadius: 999,
          transition: 'background .15s ease',
          display: 'inline-block',
          position: 'relative',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 3, left: defaultOn ? 21 : 3,
            width: 16, height: 16,
            background: '#fff',
            borderRadius: '50%',
            transition: 'left .15s ease',
            boxShadow: '0 1px 2px rgba(0,0,0,.15)',
          }}
        />
      </span>
    </label>
  );
}
