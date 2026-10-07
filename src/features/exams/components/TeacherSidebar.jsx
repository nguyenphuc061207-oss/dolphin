import { NavLink, Link } from 'react-router-dom';
import ThemeToggle from '@/shared/components/ThemeToggle';
import QualityToggle from '@/shared/components/QualityToggle';
import { Plus, BookOpen, Users, ArrowUpRight, GraduationCap, House } from 'lucide-react';

export default function TeacherSidebar() {
  return (
    <aside className="teacher-sidebar">
      <Link to="/" className="brand"><span className="brand-symbol"><img src="/dolphin-logo.png" alt="" /></span><span>Dolphin<span className="brand-caption">Không gian giáo viên</span></span></Link>
      <nav aria-label="Chung" className="teacher-links teacher-links-top">
        <NavLink to="/" end><House size={19} />Trang chủ</NavLink>
      </nav>
      <p className="sidebar-label">Giảng dạy</p>
      <nav aria-label="Điều hướng giáo viên" className="teacher-links">
        <NavLink to="/teacher" end><Plus size={19} />Tạo đề thi</NavLink>
        <NavLink to="/teacher/exams"><BookOpen size={19} />Đề thi của tôi</NavLink>
        <NavLink to="/friends"><Users size={19} />Bạn bè</NavLink>
        <NavLink to="/student"><GraduationCap size={19} />Không gian học sinh</NavLink>
      </nav>
      <div className="sidebar-appearance"><span>Giao diện</span><ThemeToggle /></div>
      <div className="sidebar-quality"><span>Chất lượng giao diện</span><QualityToggle /></div>
      <div className="sidebar-note"><h3>Mẹo nhanh</h3><p>Kéo thả file Word vào ô “Nhập tài liệu”, bấm <b>Sửa</b> để chỉnh từng câu, <kbd>Ctrl + Enter</kbd> để thêm câu. Đề đang soạn được tự lưu.</p><Link to="/teacher/exams">Xem đề thi của tôi <ArrowUpRight size={16} /></Link></div>
    </aside>
  );
}
