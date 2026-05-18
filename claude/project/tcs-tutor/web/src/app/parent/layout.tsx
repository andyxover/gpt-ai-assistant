import { getTutorUser } from '@/lib/tutor/role';
import { listChildren } from '@/lib/tutor/parent';
import { redirect } from 'next/navigation';
import ParentSidebar from './ParentSidebar';

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const user = await getTutorUser();
  if (!user) redirect('/login');
  if (user.role !== 'parent') redirect('/');

  const kids = await listChildren(user.id);
  const lang = (user.preferred_lang ?? 'en') as 'en' | 'zh';

  return (
    <div className="app">
      <ParentSidebar user={{ display_name: user.display_name }} children={kids} lang={lang} />
      <main className="main">{children}</main>
    </div>
  );
}
