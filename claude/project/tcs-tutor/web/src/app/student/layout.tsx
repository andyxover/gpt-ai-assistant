import { getTutorUser } from '@/lib/tutor/role';
import { listEnrolledClasses } from '@/lib/tutor/student';
import { redirect } from 'next/navigation';
import StudentSidebar from './StudentSidebar';

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await getTutorUser();
  if (!user) redirect('/login');
  if (user.role !== 'student') redirect('/');

  const classes = await listEnrolledClasses(user.id);
  const activeClassId = classes[0]?.id;

  return (
    <div className="app">
      <StudentSidebar
        user={{ display_name: user.display_name }}
        classes={classes}
        activeClassId={activeClassId}
      />
      <main className="main">{children}</main>
    </div>
  );
}
