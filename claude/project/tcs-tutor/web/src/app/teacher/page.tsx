import { getTutorUser } from '@/lib/tutor/role';
import { redirect } from 'next/navigation';

export default async function TeacherHome() {
  const user = await getTutorUser();
  if (!user) redirect('/login');
  if (user.role !== 'teacher' && user.role !== 'admin') redirect('/');

  return (
    <main className="max-w-3xl mx-auto p-8">
      <header className="mb-8">
        <p className="text-sm text-stone-500">Teacher</p>
        <h1 className="text-3xl font-bold">{user.display_name}</h1>
      </header>

      <section className="grid sm:grid-cols-2 gap-4">
        <a
          href="/teacher/syllabi"
          className="block p-5 bg-white border border-stone-200 rounded-xl hover:border-[#c9874a] transition"
        >
          <h2 className="font-semibold mb-1">Syllabi</h2>
          <p className="text-sm text-stone-600">
            Upload a syllabus and see the parsed concepts.
          </p>
        </a>
        <a
          href="/teacher/questions"
          className="block p-5 bg-white border border-stone-200 rounded-xl hover:border-[#c9874a] transition"
        >
          <h2 className="font-semibold mb-1">Questions</h2>
          <p className="text-sm text-stone-600">
            Review the generated question pool. Approve or reject flagged items.
          </p>
        </a>
        <a
          href="/teacher/classes"
          className="block p-5 bg-white border border-stone-200 rounded-xl hover:border-[#c9874a] transition"
        >
          <h2 className="font-semibold mb-1">Classes</h2>
          <p className="text-sm text-stone-600">
            Week-by-week progress, student activity, roster.
          </p>
        </a>
        <a
          href="/teacher/reports"
          className="block p-5 bg-white border border-stone-200 rounded-xl hover:border-[#c9874a] transition"
        >
          <h2 className="font-semibold mb-1">Parent reports</h2>
          <p className="text-sm text-stone-600">
            Preview and send the weekly digest.
          </p>
        </a>
      </section>
    </main>
  );
}
