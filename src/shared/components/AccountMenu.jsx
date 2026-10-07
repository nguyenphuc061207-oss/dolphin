import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { House, BookOpen, GraduationCap, Users, LogOut, ChevronDown } from 'lucide-react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { auth } from '@/shared/config/firebase';
import ThemeToggle from '@/shared/components/ThemeToggle';
import QualityToggle from '@/shared/components/QualityToggle';

const ITEMS = [
  { to: '/', label: 'Trang chủ', Icon: House, match: (p) => p === '/' },
  { to: '/teacher', label: 'Không gian giáo viên', Icon: BookOpen, match: (p) => p.startsWith('/teacher') },
  { to: '/student', label: 'Không gian học sinh', Icon: GraduationCap, match: (p) => p.startsWith('/student') },
  { to: '/friends', label: 'Bạn bè', Icon: Users, match: (p) => p.startsWith('/friends') },
];

/** Single account menu shared by the public header and the teacher workspace. */
export default function AccountMenu({ className = '' }) {
  const { currentUser } = useAuth();
  const { pathname } = useLocation();
  const [error, setError] = useState('');
  if (!currentUser) return null;

  const close = (el) => el.closest('details')?.removeAttribute('open');
  const logout = async () => {
    try { await signOut(auth); } catch { setError('Chưa thể đăng xuất. Vui lòng thử lại.'); }
  };
  const name = currentUser.displayName || 'Tài khoản';

  return (
    <details
      className={`account-menu ${className}`}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.currentTarget.removeAttribute('open');
          e.currentTarget.querySelector('summary')?.focus();
        }
      }}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.removeAttribute('open'); }}
    >
      <summary aria-label={`Menu tài khoản của ${name}`}>
        <span className="account-avatar">{name.charAt(0).toUpperCase()}</span>
        <span className="account-name">{name}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </summary>
      <div className="account-dropdown">
        <span className="account-id">Mã cá nhân #{currentUser.shortId}</span>
        {ITEMS.map(({ to, label, Icon, match }) => (
          <Link key={to} to={to} aria-current={match(pathname) ? 'page' : undefined} onClick={(e) => close(e.currentTarget)}>
            <Icon size={to === '/student' ? 19 : 17} aria-hidden="true" />{label}
          </Link>
        ))}
        <div className="account-appearance"><span>Giao diện</span><ThemeToggle /></div>
        <div className="account-quality"><span>Chất lượng giao diện</span><QualityToggle /></div>
        <button type="button" onClick={logout}><LogOut size={17} aria-hidden="true" />Đăng xuất</button>
        {error && <p role="alert">{error}</p>}
      </div>
    </details>
  );
}
