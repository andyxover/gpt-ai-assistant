import { getTutorUser } from '@/lib/tutor/role';
import { redirect } from 'next/navigation';

const STRINGS = {
  en: {
    title: 'Notification preferences',
    weeklyDigest: 'Weekly digest',
    weeklyDigest_desc: 'A summary email every Sunday with this week\'s progress.',
    flaggedAlerts: 'Flagged-content alerts',
    flaggedAlerts_desc: 'Notify me when my child flags a question.',
    examReminders: 'Exam reminders',
    examReminders_desc: 'Remind me one week before an exam.',
    note: 'These preferences will be wired to actual delivery when email / LINE digest is enabled.',
  },
  zh: {
    title: '通知偏好',
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
    <main className="max-w-3xl mx-auto p-6 sm:p-8">
      <h1 className="text-3xl font-bold mb-6">{L.title}</h1>

      <div className="space-y-3">
        <PrefRow title={L.weeklyDigest} desc={L.weeklyDigest_desc} defaultOn />
        <PrefRow title={L.flaggedAlerts} desc={L.flaggedAlerts_desc} defaultOn />
        <PrefRow title={L.examReminders} desc={L.examReminders_desc} defaultOn={false} />
      </div>

      <p className="mt-6 text-xs text-stone-500">{L.note}</p>
    </main>
  );
}

function PrefRow({ title, desc, defaultOn }: { title: string; desc: string; defaultOn: boolean }) {
  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-5 flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-stone-500 mt-0.5">{desc}</p>
      </div>
      <label className="relative inline-flex items-center cursor-pointer shrink-0">
        <input type="checkbox" defaultChecked={defaultOn} className="sr-only peer" />
        <div className="w-11 h-6 bg-stone-200 peer-checked:bg-[#c9874a] rounded-full transition" />
        <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition peer-checked:translate-x-5" />
      </label>
    </div>
  );
}
