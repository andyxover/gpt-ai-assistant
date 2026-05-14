import { redirect } from 'next/navigation';
import { getTutorUser } from '@/lib/tutor/role';

export default async function Home() {
  const user = await getTutorUser();

  if (!user) {
    redirect('/login');
  }

  if (user.role === 'teacher' || user.role === 'admin') {
    redirect('/teacher');
  }
  if (user.role === 'student') {
    redirect('/student');
  }
  if (user.role === 'parent') {
    redirect('/parent');
  }

  return (
    <main className="max-w-2xl mx-auto p-8">
      <h1 className="text-2xl font-bold">Welcome</h1>
      <p className="mt-2 text-stone-600">
        Your account is signed in but isn&apos;t enrolled yet. Ask your teacher
        to add you.
      </p>
    </main>
  );
}
