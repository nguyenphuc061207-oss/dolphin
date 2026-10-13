import { htmlToPlain } from '@/shared/utils/richText';

export const TYPE_OPTIONS = [
    { value: 'single', label: 'Trắc nghiệm (1 đáp án)' },
    { value: 'multiple', label: 'Chọn nhiều' },
    { value: 'true_false', label: 'Đúng / Sai' },
    { value: 'multi_true_false', label: 'Đúng / Sai Nhiều Ý' },
    { value: 'essay', label: 'Tự luận' },
];

const hasText = (v) => !!v && (htmlToPlain(String(v)).trim() !== '' || String(v).includes('[IMG:'));

/** Human-readable problems that would make a question unusable or ungradable (empty list = OK). */
export function getQuestionIssues(q) {
    const issues = [];
    const type = q?.type || 'single';
    if (!hasText(q?.content)) issues.push('Thiếu nội dung câu hỏi');
    if (type === 'essay') return issues;
    const options = q?.options || [];
    if (options.length < 2 && type !== 'multi_true_false') issues.push('Cần ít nhất 2 đáp án');
    const empty = options.map((o, i) => (hasText(o) ? null : String.fromCharCode(65 + i))).filter(Boolean);
    if (empty.length) issues.push(`Đáp án ${empty.join(', ')} trống`);
    if (type === 'multiple' && (!Array.isArray(q.correctAnswer) || q.correctAnswer.length === 0)) issues.push('Chưa chọn đáp án đúng');
    if ((type === 'single' || type === 'true_false') && !(typeof q.correctAnswer === 'number' && q.correctAnswer >= 0 && q.correctAnswer < options.length)) issues.push('Đáp án đúng không hợp lệ');
    if (type === 'multi_true_false' && (!Array.isArray(q.correctAnswer) || q.correctAnswer.length !== options.length)) issues.push('Thiếu Đúng/Sai cho một số ý');
    return issues;
}

/** Return a copy of `q` converted to `newType`, keeping options and fixing correctAnswer's shape. */
export function convertQuestionType(q, newType) {
    let correctAnswer;
    let options = q.options || [];
    if (newType === 'essay') {
        correctAnswer = '';
    } else if (newType === 'true_false') {
        options = ['Đúng', 'Sai'];
        correctAnswer = typeof q.correctAnswer === 'number' && q.correctAnswer >= 0 && q.correctAnswer < 2 ? q.correctAnswer : 0;
    } else if (newType === 'multi_true_false') {
        if (options.length === 0) options = ['', '', '', ''];
        correctAnswer = Array.isArray(q.correctAnswer)
            ? options.map((_, i) => (typeof q.correctAnswer[i] === 'boolean' ? q.correctAnswer[i] : true))
            : Array(options.length).fill(true);
    } else if (newType === 'multiple') {
        if (options.length === 0) options = ['', '', '', ''];
        correctAnswer = Array.isArray(q.correctAnswer)
            ? q.correctAnswer.filter((v) => typeof v === 'number')
            : (typeof q.correctAnswer === 'number' && q.correctAnswer >= 0 ? [q.correctAnswer] : [0]);
    } else {
        if (options.length === 0) options = ['', '', '', ''];
        correctAnswer = Array.isArray(q.correctAnswer)
            ? (typeof q.correctAnswer[0] === 'number' ? q.correctAnswer[0] : 0)
            : (typeof q.correctAnswer === 'number' && q.correctAnswer >= 0 ? q.correctAnswer : 0);
    }
    return { ...q, type: newType, options, correctAnswer };
}
