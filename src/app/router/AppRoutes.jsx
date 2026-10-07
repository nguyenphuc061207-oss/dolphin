import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
import LandingPage from '@/features/home/pages/LandingPage';
import Login from '@/features/auth/pages/Login';
import ProtectedRoute from '@/features/auth/components/ProtectedRoute';

const loaders = {
  friends: () => import('@/features/friends/pages/Friends'),
  teacher: () => import('@/features/exams/pages/TeacherDashboard'),
  manage: () => import('@/features/exams/pages/ManageExams'),
  student: () => import('@/features/exams/pages/StudentDashboard'),
  submissions: () => import('@/features/exams/pages/ExamSubmissions'),
  takeExam: () => import('@/features/exams/pages/TakeExam'),
  review: () => import('@/features/exams/pages/ReviewExam'),
  recalc: () => import('@/features/exams/pages/RecalculateScores'),
};
const Friends = lazy(loaders.friends);
const TeacherDashboard = lazy(loaders.teacher);
const ManageExams = lazy(loaders.manage);
const StudentDashboard = lazy(loaders.student);
const ExamSubmissions = lazy(loaders.submissions);
const TakeExam = lazy(loaders.takeExam);
const ReviewExam = lazy(loaders.review);
const RecalculateScores = lazy(loaders.recalc);

// Warm the most-visited pages while the browser is idle, so navigating to them is instant.
// Skipped on metered / slow connections (Save-Data, 2g).
function usePrefetchPages() {
  useEffect(() => {
    const conn = navigator.connection;
    if (conn?.saveData || /2g/.test(conn?.effectiveType || '')) return;
    const queue = [loaders.student, loaders.teacher, loaders.manage, loaders.takeExam, loaders.review];
    const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 1500));
    const cancel = window.cancelIdleCallback || clearTimeout;
    let handle;
    const next = () => {
      const load = queue.shift();
      if (!load) return;
      load().catch(() => {}).finally(() => { handle = idle(next); });
    };
    handle = idle(next);
    return () => cancel(handle);
  }, []);
}

export default function AppRoutes() {
  usePrefetchPages();
  return (
    <Suspense fallback={<div role="status" className="py-20 text-center text-gray-500">Đang mở không gian học tập…</div>}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/teacher" element={<ProtectedRoute><TeacherDashboard /></ProtectedRoute>} />
        <Route path="/teacher/exams" element={<ProtectedRoute><ManageExams /></ProtectedRoute>} />
        <Route path="/teacher/exam/:examId/submissions" element={<ProtectedRoute><ExamSubmissions /></ProtectedRoute>} />
        <Route path="/teacher/recalculate" element={<ProtectedRoute><RecalculateScores /></ProtectedRoute>} />
        <Route path="/student" element={<ProtectedRoute><StudentDashboard /></ProtectedRoute>} />
        <Route path="/student/exam/:examId" element={<ProtectedRoute><TakeExam /></ProtectedRoute>} />
        <Route path="/student/review/:submissionId" element={<ProtectedRoute><ReviewExam /></ProtectedRoute>} />
        <Route path="/friends" element={<ProtectedRoute><Friends /></ProtectedRoute>} />
      </Routes>
    </Suspense>
  );
}
