import { useState } from "react";
import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "./firebase";
import { useAuth } from "./contexts/AuthContext";
import { BookOpen, Users, ArrowRight, LogOut, LayoutDashboard } from 'lucide-react';

// Import Pages
import Login from "./pages/Login";
import ProtectedRoute from "./components/ProtectedRoute";
import TeacherDashboard from "./pages/TeacherDashboard";
import ManageExams from "./pages/ManageExams";
import StudentDashboard from "./pages/StudentDashboard";
import ExamSubmissions from "./pages/ExamSubmissions";
import TakeExam from "./pages/TakeExam";
import ReviewExam from "./pages/ReviewExam";

function Navigation() {
  const { currentUser } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const handleLogout = async () => { await signOut(auth); };

  return (
    <nav className="sticky top-0 z-50 w-full backdrop-blur-md bg-white/80 border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-6 h-16 flex justify-between items-center">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-md group-hover:rotate-6 transition-transform">
            <span className="font-bold text-xl">D</span>
          </div>
          <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600">
            Dolphin
          </h1>
        </Link>

        {/* Auth Actions */}
        <div className="flex items-center gap-4">
          {currentUser ? (
            <div className="relative">
              <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-3 p-1 pr-3 rounded-full hover:bg-gray-100 transition-all border border-gray-100 shadow-sm"
              >
                <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold uppercase text-sm">
                  {currentUser.displayName?.charAt(0)}
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-xs font-semibold text-gray-900 leading-none">{currentUser.displayName}</p>
                  <p className="text-[10px] text-gray-500 font-medium uppercase mt-1">{currentUser.role}</p>
                </div>
              </button>

              {isOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-gray-100 py-2 overflow-hidden z-50">
                  <div className="px-4 py-2 border-b border-gray-50 mb-1">
                    <p className="text-xs text-gray-400 font-medium uppercase">Tài khoản</p>
                  </div>
                  <Link
                    to={currentUser.role === 'teacher' ? '/teacher' : '/student'}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 transition"
                    onClick={() => setIsOpen(false)}
                  >
                    <LayoutDashboard className="w-4 h-4" /> Bảng điều khiển
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition border-t border-gray-50"
                  >
                    <LogOut className="w-4 h-4" /> Đăng xuất
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex gap-2">
              <Link to="/login" className="px-5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 rounded-lg transition">Đăng nhập</Link>
              <Link to="/login" className="px-5 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-md transition active:scale-95">Đăng ký</Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

function HomePage() {
  return (
    <div className="w-full">
      {/* Hero Section */}
      <section className="pt-20 pb-16 px-6 text-center">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-5xl md:text-6xl font-black text-gray-900 mb-6 tracking-tight leading-tight">
            Nền tảng học tập hiện đại cho <br />
            <span className="text-blue-600 underline decoration-blue-200 underline-offset-8">giáo viên và học sinh</span>
          </h2>
          <p className="text-xl text-gray-500 max-w-2xl mx-auto mb-12">
            Tạo, quản lý và chấm tự động các bài kiểm tra. <br className="hidden md:block" /> Theo dõi tiến độ học sinh một cách hiệu quả và trực quan.
          </p>
        </div>
      </section>

      {/* Role Selection Cards */}
      <section className="px-6 pb-20">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-8">
          {/* Teacher Card */}
          <div className="bg-white p-8 rounded-2xl border-2 border-gray-100 hover:border-blue-500 hover:shadow-2xl transition-all duration-300 group flex flex-col">
            <div className="w-16 h-16 bg-blue-50 rounded-xl flex items-center justify-center mb-6 group-hover:bg-blue-100 transition-colors">
              <BookOpen className="w-8 h-8 text-blue-600" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-3">Giáo viên</h3>
            <p className="text-gray-500 mb-8 flex-1 leading-relaxed">
              Tạo bài kiểm tra thần tốc, quản lý lớp học, chấm điểm tự động và theo dõi hiệu suất học sinh trong thời gian thực.
            </p>
            <Link
              to="/teacher"
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all group/btn"
            >
              Vào khu vực Giáo viên
              <ArrowRight className="w-5 h-5 group-hover/btn:translate-x-1 transition-transform" />
            </Link>
          </div>

          {/* Student Card */}
          <div className="bg-white p-8 rounded-2xl border-2 border-gray-100 hover:border-emerald-500 hover:shadow-2xl transition-all duration-300 group flex flex-col">
            <div className="w-16 h-16 bg-emerald-50 rounded-xl flex items-center justify-center mb-6 group-hover:bg-emerald-100 transition-colors">
              <Users className="w-8 h-8 text-emerald-600" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-3">Học sinh</h3>
            <p className="text-gray-500 mb-8 flex-1 leading-relaxed">
              Làm bài kiểm tra, xem kết quả tức thì, nhận phản hồi chi tiết và theo dõi biểu đồ tiến độ học tập của cá nhân.
            </p>
            <Link
              to="/student"
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all group/btn"
            >
              Vào khu vực Học sinh
              <ArrowRight className="w-5 h-5 group-hover/btn:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="bg-gray-50 py-20 px-6 border-y border-gray-200">
        <div className="max-w-6xl mx-auto">
          <h3 className="text-3xl font-black text-center text-gray-900 mb-16">Tính năng chính</h3>
          <div className="grid md:grid-cols-3 gap-12">
            {[
              { icon: "📝", bg: "bg-blue-100", title: "Tạo bài kiểm tra", desc: "Hỗ trợ bóc tách câu hỏi từ file Word/Text chỉ trong vài giây." },
              { icon: "⚡", bg: "bg-amber-100", title: "Chấm tự động", desc: "Hệ thống tự động chấm điểm và trả kết quả ngay sau khi nộp bài." },
              { icon: "📊", bg: "bg-purple-100", title: "Phân tích chi tiết", desc: "Báo cáo trực quan về hiệu suất học sinh, giúp giáo viên điều chỉnh dạy học." }
            ].map((feat, index) => (
              <div key={index} className="text-center group">
                <div className={`w-16 h-16 ${feat.bg} rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform`}>
                  <span className="text-3xl">{feat.icon}</span>
                </div>
                <h4 className="text-xl font-bold text-gray-900 mb-3">{feat.title}</h4>
                <p className="text-gray-500 leading-relaxed">{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 bg-white">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6 border-t border-gray-100 pt-8">
          <p className="text-gray-400 text-sm font-medium">© 2026 Dolphin. Tất cả quyền được bảo lưu.</p>
          <div className="flex gap-8 text-sm font-semibold text-gray-400">
            <a href="#" className="hover:text-blue-600 transition">Điều khoản</a>
            <a href="#" className="hover:text-blue-600 transition">Bảo mật</a>
            <a href="#" className="hover:text-blue-600 transition">Liên hệ</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Component chứa nội dung định tuyến chính - Nơi có thể gọi useLocation() an toàn
function AppContent() {
  const location = useLocation();
  // Kiểm tra xem URL hiện tại có bắt đầu bằng /teacher không
  const isTeacherPage = location.pathname.startsWith("/teacher");

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Ẩn Navbar chung nếu đang ở trong các trang của giáo viên */}
      {!isTeacherPage && <Navigation />}

      <main className="flex-1">
        <Routes>
          {/* Landing Page */}
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<Login />} />

          {/* Teacher Routes */}
          <Route path="/teacher" element={
            <ProtectedRoute allowedRole="teacher">
              <TeacherDashboard />
            </ProtectedRoute>
          } />
          <Route path="/teacher/exams" element={
            <ProtectedRoute allowedRole="teacher">
              <ManageExams />
            </ProtectedRoute>
          } />
          <Route path="/teacher/exam/:examId/submissions" element={
            <ProtectedRoute allowedRole="teacher">
              <ExamSubmissions />
            </ProtectedRoute>
          } />

          {/* Student Routes */}
          <Route path="/student" element={
            <ProtectedRoute allowedRole="student">
              <StudentDashboard />
            </ProtectedRoute>
          } />
          <Route path="/student/exam/:examId" element={
            <ProtectedRoute allowedRole="student">
              <TakeExam />
            </ProtectedRoute>
          } />
          <Route path="/student/review/:submissionId" element={
            <ProtectedRoute allowedRole="student">
              <ReviewExam />
            </ProtectedRoute>
          } />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}