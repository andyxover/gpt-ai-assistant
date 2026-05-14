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
    <main className="main">
      <div style={{ marginBottom: 18 }}>
        <Link href="/teacher" className="mono small dim" style={{ textDecoration: 'underline' }}>
          ← Teacher home
        </Link>
      </div>
      <div className="eyebrow">Class</div>
      <h1>{klass.display_name}</h1>
      <p className="subtitle">
        {klass.subject} · Grade {klass.grade} · Section {klass.section} · {klass.academic_year}
      </p>

      <ClassTabs classId={id} />

      <div>{children}</div>
    </main>
  );
}
