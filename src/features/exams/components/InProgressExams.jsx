import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { listExamProgress, removeExamProgress } from '../utils/examProgress';

export default function InProgressExams({ userId, submissions }) {
  const [drafts, setDrafts] = useState([]);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0); // bumped after a draft is removed
  useEffect(() => {
    const refresh = () => {
      try {
        const now = Date.now();
        const all = listExamProgress(userId);
        // Submitted (by the student or automatically when time ran out): the browser copy is no longer needed.
        for (const draft of all) {
          if (submissions.some(sub => sub.id === draft.attemptId)) removeExamProgress(draft.examId, userId);
        }
        setDrafts(all.filter(draft => !submissions.some(sub => sub.id === draft.attemptId))
          .map(draft => ({ ...draft, expired: draft.deadline <= now })));
        setError('');
      } catch { setError('Không đọc được bài đang làm chưa xong trên trình duyệt này.'); }
    };
    refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [userId, submissions, version]);

  const remove = (draft) => {
    const title = draft.examTitle || `Bài thi ${draft.examId}`;
    const message = draft.expired
      ? `Xóa “${title}” khỏi danh sách?\nBài đã hết giờ và được tự động nộp với các câu trả lời đã lưu trên máy chủ.`
      : `Xóa “${title}” khỏi danh sách bài đang làm chưa xong trên trình duyệt này?\nLượt thi đã bắt đầu vẫn được tính và sẽ tự động nộp khi hết giờ với các câu trả lời đã lưu trên máy chủ.`;
    if (!window.confirm(message)) return;
    try { removeExamProgress(draft.examId, userId); } catch { setError('Không xóa được bản lưu trên trình duyệt này.'); return; }
    setVersion(v => v + 1);
  };

  if (error) return <p role="alert" className="student-data-alert">{error}</p>;
  if (!drafts.length) return null;
  return <section aria-labelledby="in-progress-title" className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 p-5">
    <h2 id="in-progress-title" className="text-lg font-bold text-gray-900">Bài thi đang làm chưa xong</h2>
    <p className="mt-1 text-sm text-gray-600">Bản lưu trên trình duyệt này. Thời gian làm bài vẫn chạy khi bạn rời trang; hết giờ bài sẽ tự động được nộp.</p>
    <ul className="mt-4 space-y-3">
      {drafts.map(draft => {
        const title = draft.examTitle || `Bài thi ${draft.examId}`;
        return <li key={draft.examId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-4">
          <div className="min-w-0">
            <h3 className="font-bold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-600">{draft.expired ? 'Đã hết giờ · bài được tự động nộp với câu trả lời đã lưu'
              : draft.submissionAttempted ? 'Chưa xác nhận nộp thành công' : 'Đã lưu câu trả lời và vị trí đang làm'}</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => remove(draft)} title="Xóa khỏi danh sách" aria-label={`Xóa ${title} khỏi danh sách`}
              className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold text-gray-500 hover:bg-red-50 hover:text-red-600">
              <Trash2 className="h-4 w-4" aria-hidden="true" /> Xóa
            </button>
            <Link to={`/student/exam/${draft.examId}`} className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white">
              {draft.expired ? 'Xem kết quả' : draft.submissionAttempted ? 'Mở lại để nộp bài' : 'Tiếp tục làm bài'}
            </Link>
          </div>
        </li>;
      })}
    </ul>
  </section>;
}
