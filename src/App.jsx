import { useState } from "react";
import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "./firebase";
import { useAuth } from "./contexts/AuthContext";
import { BookOpen, Users, ArrowRight, LogOut, LayoutDashboard, UserPlus } from 'lucide-react';
import useDocumentTitle from "./hooks/useDocumentTitle";

import Friends from "./pages/Friends";
import Login from "./pages/Login";
import ProtectedRoute from "./components/ProtectedRoute";
import TeacherDashboard from "./pages/TeacherDashboard";
import ManageExams from "./pages/ManageExams";
import StudentDashboard from "./pages/StudentDashboard";
import ExamSubmissions from "./pages/ExamSubmissions";
import TakeExam from "./pages/TakeExam";
import ReviewExam from "./pages/ReviewExam";
import DocumentModal from "./components/DocumentModal";
import { footerDocuments } from "./constants/footerContent";
import DolphinAssistant from "./components/assistant/DolphinAssistant";
function Navigation() {
  const { currentUser } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const handleLogout = async () => { await signOut(auth); };

  return (
    <nav className="sticky top-0 z-50 w-full backdrop-blur-md bg-white/80 border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-6 h-16 flex justify-between items-center">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 group">
          <img src="/dolphin-logo.png" alt="Dolphin Logo" className="w-10 h-10 object-contain group-hover:scale-105 transition-transform" />
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
                className="flex items-center gap-3 p-1 pr-3 rounded-full hover:bg-gray-100 transition-all border border-gray-100 shadow-sm bg-white cursor-pointer"
              >
                <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold uppercase text-sm shrink-0">
                  {currentUser.displayName?.charAt(0)}
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-xs font-semibold text-gray-900">
                    {currentUser.displayName} <span className="text-gray-400 font-normal">#{currentUser.shortId}</span>
                  </p>
                </div>
              </button>

              {isOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-gray-200 py-2 overflow-hidden z-50 animate-in fade-in slide-in-from-top-3 duration-200 text-left">
                  <div className="px-4 py-2 border-b border-gray-100 mb-1">
                    <p className="text-[10px] text-gray-400 font-black uppercase tracking-wider">Tài khoản</p>
                  </div>
                  <Link
                    to='/'
                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition font-semibold"
                    onClick={() => setIsOpen(false)}
                  >
                    <BookOpen className="w-4 h-4 text-gray-400" /> Trang chủ
                  </Link>
                  <Link
                    to='/teacher'
                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 transition font-semibold"
                    onClick={() => setIsOpen(false)}
                  >
                    <LayoutDashboard className="w-4 h-4 text-blue-500" /> Khu Giáo viên
                  </Link>
                  <Link
                    to='/student'
                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-emerald-50 transition font-semibold"
                    onClick={() => setIsOpen(false)}
                  >
                    <Users className="w-4 h-4 text-emerald-500" /> Khu học sinh
                  </Link>
                  <Link
                    to='/friends'
                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50 transition font-semibold"
                    onClick={() => setIsOpen(false)}
                  >
                    <UserPlus className="w-4 h-4 text-indigo-500" /> Bạn bè
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition border-t border-gray-100 font-semibold cursor-pointer"
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
  useDocumentTitle("Dolphin - Hệ thống quản lý thi thông minh");
  const [activeDoc, setActiveDoc] = useState(null);

  const handleOpenDoc = (e, docKey) => {
    e.preventDefault();
    setActiveDoc(docKey);
  };

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
        <div className="max-w-7xl mx-auto flex flex-col items-center justify-center gap-6 border-t border-gray-100 pt-8">
          <div className="flex flex-wrap justify-center gap-6 md:gap-10 text-sm font-medium text-gray-500">
            <a href="#terms" onClick={(e) => handleOpenDoc(e, 'terms')} className="hover:text-blue-600 transition">Điều khoản dịch vụ</a>
            <a href="#privacy" onClick={(e) => handleOpenDoc(e, 'privacy')} className="hover:text-blue-600 transition">Chính sách bảo mật</a>
            <a href="#guide" onClick={(e) => handleOpenDoc(e, 'guide')} className="hover:text-blue-600 transition">Hướng dẫn sử dụng</a>
            <a href="#support" onClick={(e) => handleOpenDoc(e, 'support')} className="hover:text-blue-600 transition">Hỗ trợ khách hàng</a>
            <a href="https://zalo.me/0564213425" target="_blank" rel="noreferrer" className="hover:text-blue-600 transition text-blue-600 font-semibold">
              Liên hệ Zalo: 0564213425
            </a>
          </div>
        </div>
      </footer>

      {/* Document Modal */}
      <DocumentModal 
        isOpen={!!activeDoc} 
        onClose={() => setActiveDoc(null)} 
        title={activeDoc ? footerDocuments[activeDoc].title : ''}
        content={activeDoc ? footerDocuments[activeDoc].content : null}
      />
    </div>
  );
}

// Component chứa nội dung định tuyến chính - Nơi có thể gọi useLocation() an toàn
function AppContent() {
  const location = useLocation();
  // Kiểm tra xem URL hiện tại có bắt đầu bằng /teacher không
  const isTeacherPage = location.pathname.startsWith("/teacher");
  const isTakeExamPage = location.pathname.startsWith("/student/exam/");

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Ẩn Navbar chung nếu đang ở trong các trang của giáo viên hoặc làm bài thi */}
      {!isTeacherPage && !isTakeExamPage && <Navigation />}

      <main className="flex-1">
        <Routes>
          {/* Landing Page */}
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<Login />} />

          {/* Teacher Routes */}
          <Route path="/teacher" element={
            <ProtectedRoute>
              <TeacherDashboard />
            </ProtectedRoute>
          } />
          <Route path="/teacher/exams" element={
            <ProtectedRoute>
              <ManageExams />
            </ProtectedRoute>
          } />
          <Route path="/teacher/exam/:examId/submissions" element={
            <ProtectedRoute>
              <ExamSubmissions />
            </ProtectedRoute>
          } />

          {/* Student Routes */}
          <Route path="/student" element={
            <ProtectedRoute>
              <StudentDashboard />
            </ProtectedRoute>
          } />
          <Route path="/student/exam/:examId" element={
            <ProtectedRoute>
              <TakeExam />
            </ProtectedRoute>
          } />
          <Route path="/student/review/:submissionId" element={
            <ProtectedRoute>
              <ReviewExam />
            </ProtectedRoute>
          } />

          {/* Friends Route */}
          <Route path="/friends" element={
            <ProtectedRoute>
              <Friends />
            </ProtectedRoute>
          } />
        </Routes>
      </main>

      {/* Global AI Assistant */}
      {!isTakeExamPage && <DolphinAssistant />}
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