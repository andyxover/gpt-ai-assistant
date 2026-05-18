import { getTutorUser } from '@/lib/tutor/role';
import { redirect } from 'next/navigation';
import MessageForm from './MessageForm';

const STRINGS = {
  en: {
    eyebrow: 'Reports',
    title: 'Message teacher',
    intro: "Send a note about your child to the teacher. They'll see it in their inbox.",
  },
  zh: {
    eyebrow: '報告',
    title: '訊息老師',
    intro: '傳訊息給老師。老師會在收件匣看到。',
  },
} as const;

export default async function MessageTeacherPage() {
  const user = await getTutorUser();
  if (!user) redirect('/login');
  if (user.role !== 'parent') redirect('/');

  const lang = (user.preferred_lang ?? 'en') as 'en' | 'zh';
  const L = STRINGS[lang];

  return (
    <>
      <div className="eyebrow">{L.eyebrow}</div>
      <h1>{L.title}</h1>
      <p className="subtitle">{L.intro}</p>
      <div className="card">
        <MessageForm lang={lang} />
      </div>
    </>
  );
}
