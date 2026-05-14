import { getTutorUser } from '@/lib/tutor/role';
import { listClassesForTeacher } from '@/lib/tutor/classes';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function TeacherClasses() {
  const user = await getTutorUser();
  if (!user) redirect('/login');
  if (user.role !== 'teacher' && user.role !== 'admin') redirect('/');

  const classes = await listClassesForTeacher(user.id);

  return (
    <main className="max-w-3xl mx-auto p-8">
      <header className="mb-8">
        <Link href="/teacher" className="text-sm text-stone-500 hover:underline">← Back</Link>
        <div className="flex items-baseline justify-between mt-2">
          <h1 className="text-3xl font-bold">Classes</h1>
          <Link
            href="/teacher/classes/new"
            className="text-sm px-4 py-2 rounded-lg bg-[#c9874a] hover:bg-[#a86a36] text-white font-medium"
          >
            New class
          </Link>
        </div>
      </header>

      {classes.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <p className="font-medium">No classes yet</p>
          <p className="text-sm text-stone-600 mt-1">
            Roster management UI is coming in a later phase. The seed script creates a demo class for you.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {classes.map(c => (
            <li key={c.id}>
              <Link
                href={`/teacher/classes/${c.id}/progress`}
                className="block p-4 bg-white border border-stone-200 rounded-xl hover:border-[#c9874a] transition"
              >
                <p className="font-medium">{c.display_name}</p>
                <p className="text-xs text-stone-500 mt-0.5">
                  {c.subject} · Grade {c.grade} · {c.academic_year}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
