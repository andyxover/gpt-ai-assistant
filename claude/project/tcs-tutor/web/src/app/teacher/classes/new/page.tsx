import { getTutorUser } from '@/lib/tutor/role';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClass } from './actions';

export default async function NewClassPage() {
  const user = await getTutorUser();
  if (!user) redirect('/login');
  if (user.role !== 'teacher' && user.role !== 'admin') redirect('/');

  return (
    <main className="max-w-2xl mx-auto p-6 sm:p-8">
      <header className="mb-6">
        <Link href="/teacher/classes" className="text-sm text-stone-500 hover:underline">← Classes</Link>
        <h1 className="text-3xl font-bold mt-2">New class</h1>
      </header>

      <form action={createClass} className="space-y-4 bg-white border border-stone-200 rounded-2xl p-6">
        <Field label="Display name" name="display_name" placeholder="Science 7A" required />
        <div className="grid grid-cols-3 gap-3">
          <Field label="Subject" name="subject" placeholder="science" required />
          <Field label="Grade" name="grade" type="number" min={1} max={12} defaultValue="7" required />
          <Field label="Section" name="section" placeholder="7A" required />
        </div>
        <Field label="Academic year" name="academic_year" placeholder="2026-27" defaultValue="2026-27" required />
        <button
          type="submit"
          className="px-5 py-2.5 rounded-lg bg-[#c9874a] hover:bg-[#a86a36] text-white font-medium"
        >
          Create class
        </button>
      </form>
    </main>
  );
}

function Field({ label, ...rest }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="block text-xs font-mono uppercase tracking-wide text-stone-500 mb-1">{label}</span>
      <input {...rest} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:border-[#c9874a]" />
    </label>
  );
}
