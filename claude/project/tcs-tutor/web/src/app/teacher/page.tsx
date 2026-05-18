import { getTutorUser } from '@/lib/tutor/role';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function TeacherHome() {
  const user = await getTutorUser();
  if (!user) redirect('/login');
  if (user.role !== 'teacher' && user.role !== 'admin') redirect('/');

  return (
    <main className="main">
      <div className="eyebrow">Teacher</div>
      <h1>{user.display_name}</h1>
      <p className="subtitle">Set up your scope, watch the class, and act on what students are stuck on.</p>

      <div className="action-cards">
        <Link href="/teacher/syllabi" className="action">
          <div className="label">Content</div>
          <div className="title">Syllabi</div>
          <div className="desc">Upload a syllabus, edit parsed concepts, generate the question pool.</div>
          <div className="meta">→ Manage syllabi</div>
        </Link>
        <Link href="/teacher/classes" className="action">
          <div className="label">Operations</div>
          <div className="title">Classes</div>
          <div className="desc">Week-by-week progress, student activity, roster.</div>
          <div className="meta">→ Open class view</div>
        </Link>
        <Link href="/teacher/flagged" className="action">
          <div className="label">Quality</div>
          <div className="title">Flagged questions</div>
          <div className="desc">Review questions students flagged as confusing or wrong. Keep or retire.</div>
          <div className="meta">→ Review flags</div>
        </Link>
      </div>
    </main>
  );
}
