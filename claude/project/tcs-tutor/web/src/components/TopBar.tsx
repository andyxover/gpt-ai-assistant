import Link from 'next/link';
import { getTutorUser, activeDevUserId } from '@/lib/tutor/role';
import RoleToggle from './RoleToggle';
import UserMenu from './UserMenu';

const ROLE_HOME: Record<string, string> = {
  teacher: '/teacher',
  admin: '/teacher',
  student: '/student',
  parent: '/parent',
};

export default async function TopBar() {
  const [user, devId] = await Promise.all([getTutorUser(), activeDevUserId()]);
  const home = user ? (ROLE_HOME[user.role] ?? '/') : '/';
  const isDev = !!devId;

  // Map the current user role to one of the three toggle slots
  const toggleRole: 'teacher' | 'student' | 'parent' =
    user?.role === 'student' ? 'student' :
    user?.role === 'parent'  ? 'parent'  :
    'teacher';

  return (
    <div className="topbar">
      <Link href={home} className="brand">
        <div className="brand-mark">TT</div>
        <span className="brand-name">TCS Tutor</span>
        <span className="brand-tag">v0</span>
      </Link>

      <div className="row" style={{ gap: 16 }}>
        {isDev && <RoleToggle current={toggleRole} />}
        {user && (
          <UserMenu
            displayName={user.display_name}
            email={user.email}
            role={user.role}
          />
        )}
      </div>
    </div>
  );
}
