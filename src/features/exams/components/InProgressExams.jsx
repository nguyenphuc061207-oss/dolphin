import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listExamProgress } from '../utils/examProgress';

export default function InProgressExams({ userId, submissions }) {
  const [drafts, setDrafts] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    const refresh = () => {
      try {
        setDrafts(listExamProgress(userId).filter(draft => !submissions.some(sub => sub.id === draft.attemptId)));
        setError('');
      } catch { setError('Không đọc được bài đang làm dở trên trình duyệt này.'); }
    };
    refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [userId, submissions]);

  if (error) return <p role="alert" className="student-data-alert">{error}</p>;
  if (!drafts.length) return null;
  return <section aria-labelledby="in-progress-title" className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 p-5">
    <h2 id="in-progress-title" className="text-lg font-bold text-gray-900">Bài thi đang làm dở</h2>
    <p className="mt-1 text-sm text-gray-600">Bản lưu trên trình duyệt này. Thời gian làm bài vẫn chạy khi bạn rời trang.</p>
    <ul className="mt-4 space-y-3">
      {drafts.map(draft => <li key={draft.examId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-4">
        <div>
          <h3 className="font-bold text-gray-900">{draft.examTitle || `Bài thi ${draft.examId}`}</h3>
          <p className="text-sm text-gray-600">{draft.submissionAttempted ? 'Chưa xác nhận nộp thành công' : 'Đã lưu câu trả lời và vị trí đang làm'}</p>
        </div>
        <Link to={`/student/exam/${draft.examId}`} className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white">{draft.submissionAttempted ? 'Mở lại để nộp bài' : 'Tiếp tục làm bài'}</Link>
      </li>)}
    </ul>
  </section>;
}
