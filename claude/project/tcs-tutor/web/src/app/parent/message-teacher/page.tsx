import { getTutorUser } from '@/lib/tutor/role';
import { redirect } from 'next/navigation';
import MessageForm from './MessageForm';

const STRINGS = {
  en: {
    title: 'Message teacher',
    intro: 'Send a note about your child to the teacher. They\'ll see it in their inbox.',
  },
  zh: {
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
    <main className="max-w-3xl mx-auto p-6 sm:p-8">
      <h1 className="text-3xl font-bold mb-2">{L.title}</h1>
      <p className="text-stone-600 mb-6">{L.intro}</p>
      <MessageForm lang={lang} />
    </main>
  );
}
