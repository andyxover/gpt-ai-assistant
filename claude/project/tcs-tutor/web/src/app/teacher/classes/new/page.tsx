import { getTutorUser } from '@/lib/tutor/role';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClass } from './actions';

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
        <form action={createClass}>
          <Field label="Display name" name="display_name" placeholder="Science 7A" required />
          <div className="grid-3" style={{ marginBottom: 14 }}>
            <Field label="Subject" name="subject" placeholder="science" required noMargin />
            <Field label="Grade" name="grade" type="number" min={1} max={12} defaultValue="7" required noMargin />
            <Field label="Section" name="section" placeholder="7A" required noMargin />
          </div>
          <Field label="Academic year" name="academic_year" placeholder="2026-27" defaultValue="2026-27" required />
          <button type="submit" className="btn">Create class</button>
        </form>
      </div>
    </main>
  );
}

function Field({
  label,
  noMargin,
  ...rest
}: { label: string; noMargin?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label style={{ display: 'block', marginBottom: noMargin ? 0 : 14 }}>
      <span
        className="mono small dim"
        style={{ display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}
      >
        {label}
      </span>
      <input {...rest} />
    </label>
  );
}
