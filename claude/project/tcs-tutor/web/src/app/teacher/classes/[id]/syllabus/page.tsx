import { getTutorUser } from '@/lib/tutor/role';
import { getActiveSyllabus } from '@/lib/tutor/classes';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function ClassSyllabusTab({ params }: { params: Promise<{ id: string }> }) {
  const user = await getTutorUser();
  if (!user) redirect('/login');
  if (user.role !== 'teacher' && user.role !== 'admin') redirect('/');

  const { id } = await params;
  const syllabus = await getActiveSyllabus(id);

  if (!syllabus) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
        <p className="font-medium">No syllabus uploaded yet</p>
        <p className="text-sm text-stone-600 mt-1">
          Go to <Link href="/teacher/syllabi" className="text-[#a86a36] underline">Syllabi</Link> to upload one.
        </p>
      </div>
    );
  }

  // Reuse the existing syllabus detail page
  redirect(`/teacher/syllabi/${syllabus.id}`);
}
