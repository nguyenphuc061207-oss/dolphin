import { htmlToPlain } from '../../../shared/utils/richText.js';
import { parseNumber, questionProblem } from '../../../../functions/questionTypes.js';

export const TYPE_OPTIONS = [
    { value: 'single', label: 'Trắc nghiệm (1 đáp án)' },
    { value: 'multiple', label: 'Chọn nhiều' },
    { value: 'true_false', label: 'Đúng / Sai' },
    { value: 'multi_true_false', label: 'Đúng / Sai Nhiều Ý' },
    { value: 'dropdown', label: 'Chọn từ danh sách' },
    { value: 'short_answer', label: 'Điền đáp án' },
    { value: 'essay', label: 'Tự luận' },
];

/** Badge text and colours per question type (the border colour applies where the badge has a border). */
export const TYPE_LABELS = {
    single: { label: 'Trắc nghiệm', color: 'bg-blue-100 text-blue-700 border-blue-200' },
    multiple: { label: 'Chọn nhiều', color: 'bg-purple-100 text-purple-700 border-purple-200' },
    true_false: { label: 'Đúng/Sai', color: 'bg-amber-100 text-amber-700 border-amber-200' },
    multi_true_false: { label: 'Đúng/Sai Nhiều Ý', color: 'bg-orange-100 text-orange-700 border-orange-200' },
    dropdown: { label: 'Chọn từ danh sách', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
    short_answer: { label: 'Điền đáp án', color: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
    essay: { label: 'Tự luận', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
};

/** Types whose `options` are answer choices shown as a list (single, multiple, true/false). */
export const hasOptionList = (type) => !['essay', 'short_answer', 'dropdown'].includes(type || 'single');

const SHORT_ANSWER_FIELDS = ['answerKind', 'acceptedAnswers', 'tolerance', 'toleranceMode', 'caseSensitive', 'units', 'correctUnit', 'unitFactors'];
export const EMPTY_SHORT_ANSWER = { answerKind: 'text', acceptedAnswers: [''] };
/** Dropdown questions: `options` are the rows, `choices` the list every row picks from, `correctAnswer` one choice per row. */
export const EMPTY_DROPDOWN = { options: ['', ''], choices: ['', ''], correctAnswer: [null, null], scoringMethod: 'partial' };

const hasText = (v) => !!v && (htmlToPlain(String(v)).trim() !== '' || String(v).includes('[IMG:'));
const filledAnswers = (q) => (Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers : []).map((a) => String(a ?? '').trim()).filter(Boolean);

function shortAnswerIssues(q) {
    const issues = [];
    const answers = filledAnswers(q);
    const numeric = q.answerKind === 'number';
    if (!answers.length) issues.push('Chưa nhập đáp án đúng');
    else if (numeric && answers.some((a) => !Number.isFinite(parseNumber(a)))) issues.push('Đáp án phải là số');
    if (numeric && q.tolerance !== undefined && !(Number.isFinite(q.tolerance) && q.tolerance >= 0)) issues.push('Sai số không hợp lệ');
    const units = Array.isArray(q.units) ? q.units : [];
    if (units.length) {
        if (units.some((u) => !String(u ?? '').trim())) issues.push('Có đơn vị chưa đặt tên');
        if (!(Number.isInteger(q.correctUnit) && q.correctUnit >= 0 && q.correctUnit < units.length)) issues.push('Chưa chọn đơn vị đúng');
        if (Array.isArray(q.unitFactors) && !q.unitFactors.every((f) => Number.isFinite(f) && f > 0)) issues.push('Hệ số quy đổi phải là số dương');
    }
    if (!issues.length && questionProblem(normalizeShortAnswer(q))) issues.push('Đáp án chưa hợp lệ');
    return issues;
}

const listLabels = (indexes) => indexes.map((i) => i + 1).join(', ');

function dropdownIssues(q) {
    const issues = [];
    const rows = Array.isArray(q.options) ? q.options : [];
    const choices = Array.isArray(q.choices) ? q.choices.map((c) => String(c ?? '').trim()) : [];
    if (!rows.length) issues.push('Cần ít nhất 1 dòng');
    const emptyRows = rows.map((r, i) => (hasText(r) ? null : i)).filter((i) => i !== null);
    if (emptyRows.length) issues.push(`Dòng ${listLabels(emptyRows)} trống`);
    if (choices.length < 2) issues.push('Cần ít nhất 2 lựa chọn');
    const emptyChoices = choices.map((c, i) => (c ? null : i)).filter((i) => i !== null);
    if (emptyChoices.length) issues.push(`Lựa chọn ${listLabels(emptyChoices)} trống`);
    if (new Set(choices.filter(Boolean)).size < choices.filter(Boolean).length) issues.push('Có lựa chọn bị trùng');
    const key = Array.isArray(q.correctAnswer) ? q.correctAnswer : [];
    const unset = rows.map((_, i) => (Number.isInteger(key[i]) && key[i] >= 0 && key[i] < choices.length ? null : i)).filter((i) => i !== null);
    if (unset.length) issues.push(`Chưa chọn đáp án cho dòng ${listLabels(unset)}`);
    if (!issues.length && questionProblem(normalizeQuestion(q))) issues.push('Đáp án chưa hợp lệ');
    return issues;
}

/** Human-readable problems that would make a question unusable or ungradable (empty list = OK). */
export function getQuestionIssues(q) {
    const issues = [];
    const type = q?.type || 'single';
    if (!hasText(q?.content)) issues.push('Thiếu nội dung câu hỏi');
    if (type === 'essay') return issues;
    if (type === 'short_answer') return issues.concat(shortAnswerIssues(q));
    if (type === 'dropdown') return issues.concat(dropdownIssues(q));
    const options = q?.options || [];
    if (options.length < 2 && type !== 'multi_true_false') issues.push('Cần ít nhất 2 đáp án');
    const empty = options.map((o, i) => (hasText(o) ? null : String.fromCharCode(65 + i))).filter(Boolean);
    if (empty.length) issues.push(`Đáp án ${empty.join(', ')} trống`);
    if (type === 'multiple' && (!Array.isArray(q.correctAnswer) || q.correctAnswer.length === 0)) issues.push('Chưa chọn đáp án đúng');
    if ((type === 'single' || type === 'true_false') && !(typeof q.correctAnswer === 'number' && q.correctAnswer >= 0 && q.correctAnswer < options.length)) issues.push('Đáp án đúng không hợp lệ');
    if (type === 'multi_true_false' && (!Array.isArray(q.correctAnswer) || q.correctAnswer.length !== options.length)) issues.push('Thiếu Đúng/Sai cho một số ý');
    return issues;
}

/**
 * The short-answer settings as they are saved: answers trimmed with blank rows dropped, unit names trimmed,
 * and settings that no longer apply removed (text answers have no tolerance; no units means no unit key).
 * Other question types are returned unchanged.
 */
export function normalizeShortAnswer(q) {
    if (q?.type !== 'short_answer') return q;
    const next = { ...q, answerKind: q.answerKind === 'number' ? 'number' : 'text', acceptedAnswers: filledAnswers(q), options: [] };
    delete next.correctAnswer;
    if (next.answerKind === 'number') delete next.caseSensitive;
    else { delete next.tolerance; delete next.toleranceMode; delete next.unitFactors; }
    if (!next.caseSensitive) delete next.caseSensitive;
    if (!next.tolerance) { delete next.tolerance; delete next.toleranceMode; }
    if (Array.isArray(q.units) && q.units.length) next.units = q.units.map((u) => String(u ?? '').trim());
    else { delete next.units; delete next.correctUnit; delete next.unitFactors; }
    return next;
}

/** A question as it is saved: short-answer and dropdown settings cleaned up, other types unchanged. */
export function normalizeQuestion(q) {
    if (q?.type === 'short_answer') return normalizeShortAnswer(q);
    if (q?.type !== 'dropdown') return q;
    return { ...q, choices: (q.choices || []).map((c) => String(c ?? '').trim()), scoringMethod: q.scoringMethod === 'all' ? 'all' : 'partial' };
}

/** The right choice of each dropdown row ('' when not set). */
export const dropdownKey = (q) => (q.options || []).map((_, i) => q.choices?.[q.correctAnswer?.[i]] ?? '');

/** One-line summary of a short answer's key, e.g. "4096 KB · ±0,5 · chấp nhận quy đổi". */
export function describeShortAnswer(q) {
    const answers = filledAnswers(q);
    const unit = Array.isArray(q.units) && q.units.length ? q.units[q.correctUnit] : '';
    const parts = [answers.map((a) => (unit ? `${a} ${unit}` : a)).join(' / ') || '(chưa có đáp án)'];
    if (q.answerKind === 'number' && q.tolerance) parts.push(`±${q.tolerance}${q.toleranceMode === 'percent' ? '%' : unit ? ` ${unit}` : ''}`);
    if (q.answerKind === 'number' && unit && Array.isArray(q.unitFactors)) parts.push('chấp nhận quy đổi đơn vị');
    if (q.answerKind !== 'number' && q.caseSensitive) parts.push('phân biệt hoa/thường');
    return parts.join(' · ');
}

/** A student's short answer as text, e.g. "4 MB"; empty string when unanswered. */
export function formatShortAnswer(answer, units = []) {
    const { value, unit } = typeof answer === 'string' ? { value: answer, unit: null } : answer || {};
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) return '';
    return Number.isInteger(unit) && units?.[unit] ? `${text} ${units[unit]}` : text;
}

/** Return a copy of `q` converted to `newType`, keeping options and fixing correctAnswer's shape. */
export function convertQuestionType(q, newType) {
    if (q.type === newType) return q;
    if (newType === 'short_answer') {
        // Start from the old correct option's text so a converted multiple-choice question keeps its key.
        const keyText = typeof q.correctAnswer === 'number' && q.options?.[q.correctAnswer] ? htmlToPlain(q.options[q.correctAnswer]).trim() : '';
        const rest = { ...q };
        delete rest.correctAnswer;
        delete rest.scoringMethod;
        return { ...rest, ...EMPTY_SHORT_ANSWER, acceptedAnswers: [keyText], type: 'short_answer', options: [] };
    }
    const base = { ...q };
    for (const field of SHORT_ANSWER_FIELDS) delete base[field];
    if (newType === 'dropdown') {
        // Statements become rows to judge Đúng/Sai; a choice question becomes one row picking from its options.
        if (q.type === 'multi_true_false' && q.options?.length) {
            return { ...base, type: 'dropdown', options: q.options, choices: ['Đúng', 'Sai'], scoringMethod: 'partial',
                correctAnswer: q.options.map((_, i) => (typeof q.correctAnswer?.[i] === 'boolean' ? (q.correctAnswer[i] ? 0 : 1) : null)) };
        }
        if (hasOptionList(q.type) && q.options?.length >= 2) {
            return { ...base, type: 'dropdown', options: [''], choices: q.options.map((o) => htmlToPlain(o).trim()), scoringMethod: 'partial',
                correctAnswer: [typeof q.correctAnswer === 'number' ? q.correctAnswer : Array.isArray(q.correctAnswer) && typeof q.correctAnswer[0] === 'number' ? q.correctAnswer[0] : null] };
        }
        return { ...base, ...EMPTY_DROPDOWN, type: 'dropdown' };
    }
    // A dropdown's key points into its choices and its scoring modes are its own: neither carries over.
    if (q.type === 'dropdown') { delete base.choices; delete base.scoringMethod; q = { ...q, correctAnswer: undefined }; }
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
    return { ...base, type: newType, options, correctAnswer };
}
