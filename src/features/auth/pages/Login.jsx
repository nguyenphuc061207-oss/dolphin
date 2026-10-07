import { useAuth } from '@/features/auth/hooks/useAuth';
import { useState, useEffect } from 'react';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '@/shared/config/firebase';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ArrowRight, BookOpen, CheckCircle2, LoaderCircle } from 'lucide-react';
import useDocumentTitle from '@/shared/hooks/useDocumentTitle';

export default function Login() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useDocumentTitle('Dolphin | Đăng nhập');
  useEffect(() => { if (currentUser) navigate(location.state?.from || '/', { replace: true }); }, [currentUser, navigate, location.state]);
  const handleGoogleLogin = async () => {
    setError(''); setLoading(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());

    } catch (err) {
      const messages = { 'auth/popup-closed-by-user': 'Bạn đã đóng cửa sổ đăng nhập. Nhấn bên dưới để thử lại.', 'auth/popup-blocked': 'Trình duyệt đã chặn cửa sổ đăng nhập. Hãy cho phép cửa sổ bật lên và thử lại.', 'auth/network-request-failed': 'Không thể kết nối. Kiểm tra mạng và thử lại.' };
      setError(messages[err.code] || 'Chưa thể đăng nhập bằng Google. Vui lòng thử lại sau.');
    } finally { setLoading(false); }
  };
  return <div className="login-layout page-width"><section className="login-story"><span className="eyebrow">CHÀO MỪNG ĐẾN DOLPHIN</span><h1>Một buổi học tốt<br />bắt đầu từ đây.</h1><p>Không gian chung cho những người dạy tận tâm và những người học chủ động.</p><div className="login-story-note"><BookOpen size={25} /><span>Tạo đề. Làm bài. Nhìn thấy tiến bộ.</span></div></section><section className="login-card" aria-labelledby="login-title"><div className="login-symbol"><img src="/dolphin-logo.png" alt="" /></div><h2 id="login-title">Chào bạn trở lại.</h2><p>Đăng nhập để vào không gian học tập của bạn.</p><button className="google-login" onClick={handleGoogleLogin} disabled={loading} aria-busy={loading}>{loading ? <LoaderCircle size={21} className="animate-spin" /> : <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.8 3-4.3 3-7.4Z"/><path fill="#34A853" d="M12 22c2.7 0 5-1 6.6-2.4L15.4 17c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 13.9a6 6 0 0 1 0-3.8V7.5H3.1a10 10 0 0 0 0 9l3.3-2.6Z"/><path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.8A10 10 0 0 0 3.1 7.5l3.3 2.6C7.2 7.8 9.4 6 12 6Z"/></svg>}{loading ? 'Đang đăng nhập…' : 'Tiếp tục với Google'}{!loading && <ArrowRight size={17} />}</button>{error && <p className="login-error" role="alert">{error}</p>}<div className="login-reassurance"><CheckCircle2 size={16} />Một tài khoản cho cả dạy và học.</div><Link to="/" className="login-back">Quay về trang chủ</Link></section></div>;
}