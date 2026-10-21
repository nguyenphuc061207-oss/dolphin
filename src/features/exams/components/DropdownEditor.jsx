import { Plus, Trash2 } from 'lucide-react';
import RichTextEditor from '@/shared/components/RichTextEditor';

const fieldClass = 'px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent';

/**
 * Rows, shared choice list and per-row key of a dropdown question.
 * Controlled – `question` holds options/choices/correctAnswer/scoringMethod and every edit is sent as a patch to `onChange`.
 */
export default function DropdownEditor({ question, onChange }) {
    const q = question;
    const rows = Array.isArray(q.options) ? q.options : [];
    const choices = Array.isArray(q.choices) ? q.choices : [];
    const key = rows.map((_, i) => (Number.isInteger(q.correctAnswer?.[i]) ? q.correctAnswer[i] : null));

    const setRow = (i, v) => onChange({ options: rows.map((r, k) => (k === i ? v : r)) });
    const addRow = () => onChange({ options: [...rows, ''], correctAnswer: [...key, null] });
    const removeRow = (i) => onChange({ options: rows.filter((_, k) => k !== i), correctAnswer: key.filter((_, k) => k !== i) });
    const setKey = (i, v) => onChange({ correctAnswer: key.map((c, k) => (k === i ? v : c)) });

    const setChoice = (i, v) => onChange({ choices: choices.map((c, k) => (k === i ? v : c)) });
    // Rows that pointed at a removed choice lose their key; later choices shift down by one.
    const removeChoice = (i) => onChange({
        choices: choices.filter((_, k) => k !== i),
        correctAnswer: key.map((c) => (c === i ? null : c !== null && c > i ? c - 1 : c)),
    });

    return (
        <div className="space-y-4 p-4 bg-indigo-50/40 border border-indigo-200 rounded-xl text-sm">
            <div className="space-y-2">
                <p className="text-[11px] font-black uppercase tracking-wider text-gray-500">
                    Danh sách lựa chọn <span className="normal-case font-semibold text-gray-400">(dùng chung cho mọi dòng)</span>
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {choices.map((c, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <input value={c} onChange={(e) => setChoice(i, e.target.value)} placeholder={`Lựa chọn ${i + 1}`} aria-label={`Lựa chọn ${i + 1}`} className={`${fieldClass} w-full min-w-0`} />
                            {choices.length > 1 && (
                                <button type="button" onClick={() => removeChoice(i)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded" title="Xóa lựa chọn">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
                <button type="button" onClick={() => onChange({ choices: [...choices, ''] })} className="text-xs font-bold text-indigo-700 hover:text-indigo-900 flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Thêm lựa chọn
                </button>
            </div>

            <div className="space-y-2">
                <p className="text-[11px] font-black uppercase tracking-wider text-gray-500">
                    Các dòng và đáp án đúng
                </p>
                {rows.map((row, i) => (
                    <div key={i} className="flex flex-wrap sm:flex-nowrap items-start gap-2">
                        <div className="flex-1 min-w-[12rem]">
                            <RichTextEditor value={row} onChange={(v) => setRow(i, v)} compact placeholder={`Dòng ${i + 1}, VD: DL=10`} />
                        </div>
                        <select
                            value={key[i] ?? ''}
                            onChange={(e) => setKey(i, e.target.value === '' ? null : Number(e.target.value))}
                            aria-label={`Đáp án đúng của dòng ${i + 1}`}
                            className={`${fieldClass} w-40 shrink-0 ${key[i] === null ? 'text-gray-400' : 'text-gray-800 font-semibold'}`}
                        >
                            <option value="">— Đáp án —</option>
                            {choices.map((c, k) => <option key={k} value={k}>{c.trim() || `Lựa chọn ${k + 1}`}</option>)}
                        </select>
                        {rows.length > 1 && (
                            <button type="button" onClick={() => removeRow(i)} className="mt-1 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded" title="Xóa dòng">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                ))}
                <button type="button" onClick={addRow} className="text-xs font-bold text-indigo-700 hover:text-indigo-900 flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Thêm dòng
                </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-black uppercase tracking-wider text-gray-500">Chấm điểm:</span>
                <select value={q.scoringMethod === 'all' ? 'all' : 'partial'} onChange={(e) => onChange({ scoringMethod: e.target.value })} aria-label="Cách chấm điểm" className={fieldClass}>
                    <option value="partial">Theo tỉ lệ số dòng đúng</option>
                    <option value="all">Đúng tất cả các dòng mới có điểm</option>
                </select>
            </div>
        </div>
    );
}
