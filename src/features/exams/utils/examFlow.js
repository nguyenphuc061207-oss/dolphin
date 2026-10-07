/**
 * Exam flow = how questions are presented while taking an exam.
 *   mode 'all'    – every question on one scrolling page (default, previous behaviour)
 *   mode 'single' – one question per page
 *   mode 'group'  – `pageSize` questions per page
 *   allowBack     – may the student return to earlier pages? (always true for 'all')
 * Stored on the exam document as `examFlow: { mode, pageSize, allowBack }`.
 * Exams created before this feature have no `examFlow` and behave exactly as before.
 */
export const FLOW_MODES = ['all', 'single', 'group'];
export const MAX_PAGE_SIZE = 50;

export function normalizeFlow(exam, total = exam?.questions?.length || 0) {
  const raw = exam?.examFlow || {};
  const mode = FLOW_MODES.includes(raw.mode) ? raw.mode : 'all';
  let pageSize = total || 1;
  if (mode === 'single') pageSize = 1;
  else if (mode === 'group') {
    const n = Math.floor(Number(raw.pageSize));
    pageSize = Number.isFinite(n) && n >= 2 ? Math.min(n, MAX_PAGE_SIZE) : 5;
  }
  // A 'group' that already fits on one page degrades to 'all' (nothing to page through).
  const effectiveMode = mode === 'group' && pageSize >= total ? 'all' : mode;
  const totalPages = effectiveMode === 'all' ? 1 : Math.max(1, Math.ceil(total / pageSize));
  return {
    mode: effectiveMode,
    pageSize: effectiveMode === 'all' ? Math.max(total, 1) : pageSize,
    totalPages,
    allowBack: effectiveMode === 'all' ? true : raw.allowBack !== false,
  };
}

export const pageOf = (index, flow) => (flow.mode === 'all' ? 0 : Math.floor(index / flow.pageSize));
export const pageStart = (page, flow) => page * flow.pageSize;
export const pageEnd = (page, flow, total) => Math.min(total, (page + 1) * flow.pageSize);

/** Validate settings coming from the teacher form. Returns an error string or ''. */
export function validateFlowSettings({ mode, pageSize }, total) {
  if (!FLOW_MODES.includes(mode)) return 'Cách hiển thị bài thi không hợp lệ.';
  if (mode === 'group') {
    const n = Number(pageSize);
    if (!Number.isInteger(n) || n < 2 || n > MAX_PAGE_SIZE) return `Số câu mỗi trang phải là số nguyên từ 2 đến ${MAX_PAGE_SIZE}.`;
    if (total > 0 && n >= total) return `Số câu mỗi trang (${n}) phải nhỏ hơn tổng số câu (${total}). Hãy chọn "Hiển thị tất cả".`;
  }
  return '';
}

/** Human readable summary shown to students before they start. */
export function describeFlow(flow) {
  if (flow.mode === 'all') return 'Hiển thị tất cả câu trên một trang';
  const base = flow.mode === 'single' ? 'Từng câu một' : `${flow.pageSize} câu mỗi trang`;
  return `${base} · ${flow.allowBack ? 'có thể quay lại' : 'không thể quay lại'}`;
}
