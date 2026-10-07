import { Link, NavLink } from 'react-router-dom';
import { BookOpen, GraduationCap, Users, ArrowRight } from 'lucide-react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import ThemeToggle from '@/shared/components/ThemeToggle';
import QualityToggle from '@/shared/components/QualityToggle';
import AccountMenu from '@/shared/components/AccountMenu';

export default function Navigation() {
  const { currentUser } = useAuth();
  return (
    <header className="site-header">
      <a href="#main-content" className="skip-link">Chuyển đến nội dung</a>
      <div className="header-inner page-width">
        <Link to="/" className="brand" aria-label="Dolphin — Trang chủ"><span className="brand-symbol"><img src="/dolphin-logo.png" alt="" /></span><span>Dolphin<span className="brand-caption">Dạy và học, cùng nhau.</span></span></Link>
        <nav className="site-nav" aria-label="Điều hướng chính"><NavLink to="/teacher"><BookOpen size={17} />Giáo viên</NavLink><NavLink to="/student"><GraduationCap size={19} />Học sinh</NavLink>{currentUser && <NavLink to="/friends"><Users size={17} />Bạn bè</NavLink>}</nav>
        <div className="header-actions"><ThemeToggle /><QualityToggle />
        {currentUser ? <AccountMenu /> : <Link to="/login" className="button-primary header-login">Đăng nhập <ArrowRight size={16} /></Link>}</div>
      </div>
    </header>
  );
}
