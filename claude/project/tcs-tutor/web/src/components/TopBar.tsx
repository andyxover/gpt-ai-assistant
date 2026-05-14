import Link from 'next/link';
import { getTutorUser } from '@/lib/tutor/role';

const ROLE_HOME: Record<string, string> = {
  teacher: '/teacher',
  admin: '/teacher',
  student: '/student',
  parent: '/parent',
};

export default async function TopBar() {
  const user = await getTutorUser();
  const home = user ? (ROLE_HOME[user.role] ?? '/') : '/';

  return (
    <div className="topbar">
      <Link href={home} className="brand">
        <div className="brand-mark">TT</div>
        <span className="brand-name">TCS Tutor</span>
        <span className="brand-tag">v0</span>
      </Link>
      {user && (
        <div className="row" style={{ gap: 12 }}>
          <span className="mono small dim">{user.role}</span>
          <div className="avatar" title={user.display_name}>
            {(user.display_name?.[0] ?? '?').toUpperCase()}
          </div>
        </div>
      )}
    </div>
  );
}
