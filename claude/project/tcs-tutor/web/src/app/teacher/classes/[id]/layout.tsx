import { getTutorUser } from '@/lib/tutor/role';
import { getClassForTeacher } from '@/lib/tutor/classes';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import ClassTabs from './ClassTabs';

export default async function ClassLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const user = await getTutorUser();
  if (!user) redirect('/login');
  if (user.role !== 'teacher' && user.role !== 'admin') redirect('/');

  const { id } = await params;
  const klass = await getClassForTeacher(id, user.id);
  if (!klass) notFound();

  return (
    <main className="max-w-4xl mx-auto p-6 sm:p-8">
      <header className="mb-6">
        <Link href="/teacher" className="text-sm text-stone-500 hover:underline">← Teacher home</Link>
        <h1 className="text-3xl font-bold mt-2">{klass.display_name}</h1>
        <p className="text-stone-600 text-sm mt-1">
          {klass.subject} · Grade {klass.grade} · Section {klass.section} · {klass.academic_year}
        </p>
      </header>

      <ClassTabs classId={id} />

      <div className="mt-6">{children}</div>
    </main>
  );
}
