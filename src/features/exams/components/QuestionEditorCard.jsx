import { Plus, Trash2, ChevronUp, ChevronDown, Check } from 'lucide-react';
import RichTextEditor from '@/shared/components/RichTextEditor';
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
    let correctAnswer = q.correctAnswer;
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

/**
 * Edits one question in place: content, type, options (rich text), correct answer, explanation.
 * Fully controlled – parent passes `question` and receives the updated object via `onChange`.
 */
export default function QuestionEditorCard({ question, onChange, onDone, onDelete }) {
    const q = question;
    const type = q.type || 'single';
    const options = q.options || [];
    const set = (patch) => onChange({ ...q, ...patch });

    const setOption = (i, v) => set({ options: options.map((o, k) => (k === i ? v : o)) });

    const addOption = () => {
        const next = { options: [...options, ''] };
        if (type === 'multi_true_false' && Array.isArray(q.correctAnswer)) next.correctAnswer = [...q.correctAnswer, true];
        set(next);
    };

    const removeOption = (i) => {
        if (options.length <= 1) return;
        const next = { options: options.filter((_, k) => k !== i) };
        if (type === 'multiple') {
            next.correctAnswer = (Array.isArray(q.correctAnswer) ? q.correctAnswer : [])
                .filter((v) => v !== i).map((v) => (v > i ? v - 1 : v));
        } else if (type === 'multi_true_false') {
            next.correctAnswer = (Array.isArray(q.correctAnswer) ? q.correctAnswer : []).filter((_, k) => k !== i);
        } else if (q.correctAnswer === i) next.correctAnswer = 0;
        else if (q.correctAnswer > i) next.correctAnswer = q.correctAnswer - 1;
        set(next);
    };

    const toggleMultiple = (i) => {
        const arr = Array.isArray(q.correctAnswer) ? [...q.correctAnswer] : [];
        const pos = arr.indexOf(i);
        if (pos >= 0) arr.splice(pos, 1); else arr.push(i);
        set({ correctAnswer: arr.sort((a, b) => a - b) });
    };

    const setTF = (i, val) => {
        const arr = Array.isArray(q.correctAnswer) ? [...q.correctAnswer] : options.map(() => true);
        arr[i] = val;
        set({ correctAnswer: arr });
    };

    return (
        <div className="p-4 bg-white border-2 border-blue-200 rounded-xl space-y-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
                <select
                    value={type}
                    onChange={(e) => onChange(convertQuestionType(q, e.target.value))}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 outline-none focus:ring-1 focus:ring-blue-400"
                >
                    {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <div className="flex items-center gap-1">
                    {onDelete && (
                        <button type="button" onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg" title="Xóa câu hỏi">
                            <Trash2 className="w-4 h-4" />
                        </button>
                    )}
                    {onDone && (
                        <button type="button" onClick={onDone} className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                            <Check className="w-3.5 h-3.5" /> Xong
                        </button>
                    )}
                </div>
            </div>

            <RichTextEditor value={q.content} onChange={(v) => set({ content: v })} placeholder="Nội dung câu hỏi…" minHeight={72} />

            {type !== 'essay' && (
                <div className="space-y-2">
                    {options.map((opt, i) => {
                        const isMulti = type === 'multiple';
                        const isTF = type === 'multi_true_false';
                        const correct = isMulti
                            ? Array.isArray(q.correctAnswer) && q.correctAnswer.includes(i)
                            : q.correctAnswer === i;
                        return (
                            <div key={i} className="flex items-start gap-2">
                                <div className="pt-2 w-16 shrink-0 flex items-center gap-1.5">
                                    {isTF ? (
                                        <div className="flex items-center gap-1 text-[10px] font-bold">
                                            <label className="flex items-center gap-0.5 cursor-pointer">
                                                <input type="radio" checked={q.correctAnswer?.[i] === true} onChange={() => setTF(i, true)} className="accent-emerald-600" /> Đ
                                            </label>
                                            <label className="flex items-center gap-0.5 cursor-pointer">
                                                <input type="radio" checked={q.correctAnswer?.[i] === false} onChange={() => setTF(i, false)} className="accent-rose-600" /> S
                                            </label>
                                        </div>
                                    ) : isMulti ? (
                                        <input type="checkbox" checked={correct} onChange={() => toggleMultiple(i)} className="w-4 h-4 accent-purple-600" />
                                    ) : (
                                        <input type="radio" checked={correct} onChange={() => set({ correctAnswer: i })} className="w-4 h-4 accent-blue-600" />
                                    )}
                                    <span className="option-letter text-sm">{isTF ? '' : `${String.fromCharCode(65 + i)}.`}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <RichTextEditor
                                        value={opt}
                                        onChange={(v) => setOption(i, v)}
                                        compact
                                        disabled={type === 'true_false'}
                                        placeholder={isTF ? `Ý ${i + 1}` : `Đáp án ${String.fromCharCode(65 + i)}`}
                                    />
                                </div>
                                {type !== 'true_false' && options.length > 1 && (
                                    <button type="button" onClick={() => removeOption(i)} className="mt-1.5 p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded" title="Xóa đáp án">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        );
                    })}
                    {type !== 'true_false' && (
                        <button type="button" onClick={addOption} className="w-full py-2 border-2 border-dashed border-blue-200 hover:border-blue-500 text-blue-600 rounded-lg text-xs font-bold flex items-center justify-center gap-1">
                            <Plus className="w-3.5 h-3.5" /> Thêm đáp án
                        </button>
                    )}
                </div>
            )}

            <details open={!!q.explanation} className="text-xs">
                <summary className="cursor-pointer text-gray-500 font-bold select-none">Lời giải / ghi chú (không bắt buộc)</summary>
                <div className="mt-2">
                    <RichTextEditor value={q.explanation || ''} onChange={(v) => set({ explanation: v })} placeholder="Lời giải chi tiết…" minHeight={56} />
                </div>
            </details>
        </div>
    );
}

export function MoveButtons({ index, total, onMove }) {
    return (
        <div className="flex flex-col">
            <button type="button" disabled={index === 0} onClick={() => onMove(index, index - 1)} className="p-0.5 text-gray-400 hover:text-blue-600 disabled:opacity-30" title="Lên">
                <ChevronUp className="w-4 h-4" />
            </button>
            <button type="button" disabled={index === total - 1} onClick={() => onMove(index, index + 1)} className="p-0.5 text-gray-400 hover:text-blue-600 disabled:opacity-30" title="Xuống">
                <ChevronDown className="w-4 h-4" />
            </button>
        </div>
    );
}
