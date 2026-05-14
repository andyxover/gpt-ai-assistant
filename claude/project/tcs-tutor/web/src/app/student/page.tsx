import { getTutorUser } from '@/lib/tutor/role';
import { redirect } from 'next/navigation';

export default async function StudentHome() {
  const user = await getTutorUser();
  if (!user) redirect('/login');
  if (user.role !== 'student') redirect('/');

  return (
    <main className="max-w-2xl mx-auto p-8">
      <header className="mb-8">
        <p className="text-sm text-stone-500">Student</p>
        <h1 className="text-3xl font-bold">{user.display_name}</h1>
      </header>

      <section>
        <h2 className="font-semibold mb-3">Practice mode</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          <a
            href="/student/practice?mode=review"
            className="block p-5 bg-white border border-stone-200 rounded-xl hover:border-[#c9874a] transition"
          >
            <h3 className="font-semibold mb-1">Review</h3>
            <p className="text-xs text-stone-600">Practice what you&apos;ve covered.</p>
          </a>
          <a
            href="/student/practice?mode=preview"
            className="block p-5 bg-white border border-stone-200 rounded-xl hover:border-[#c9874a] transition"
          >
            <h3 className="font-semibold mb-1">Preview</h3>
            <p className="text-xs text-stone-600">Look ahead at upcoming material.</p>
          </a>
          <a
            href="/student/practice?mode=exam_prep"
            className="block p-5 bg-white border border-stone-200 rounded-xl hover:border-[#c9874a] transition"
          >
            <h3 className="font-semibold mb-1">Exam prep</h3>
            <p className="text-xs text-stone-600">Targeted practice before a test.</p>
          </a>
        </div>
      </section>

      <p className="mt-8 text-sm text-stone-500">
        Prefer LINE? You can also message the bot — both channels track the same progress.
      </p>
    </main>
  );
}
