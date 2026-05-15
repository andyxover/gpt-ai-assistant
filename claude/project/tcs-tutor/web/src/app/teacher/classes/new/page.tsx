import { getTutorUser } from '@/lib/tutor/role';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import NewClassForm from './NewClassForm';

export default async function NewClassPage() {
  const user = await getTutorUser();
  if (!user) redirect('/login');
  if (user.role !== 'teacher' && user.role !== 'admin') redirect('/');

  return (
    <main className="main">
      <div style={{ marginBottom: 12 }}>
        <Link href="/teacher/classes" className="mono small dim" style={{ textDecoration: 'underline' }}>
          ← Classes
        </Link>
      </div>
      <div className="eyebrow">Classes</div>
      <h1>New class</h1>
      <p className="subtitle">Create a class, then enroll students and upload a syllabus.</p>

      <div className="card">
        <NewClassForm />
      </div>
    </main>
  );
}
