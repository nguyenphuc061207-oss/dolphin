import { Plus, Trash2 } from 'lucide-react';

const inputBase = 'px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent';
const toNumber = (v) => (v === '' ? undefined : Number(v));

/**
 * Answer key of a short-answer question: accepted answers, and for numbers a tolerance and optional units.
 * Controlled – `question` holds the short-answer fields and every edit is sent as a patch to `onChange`.
 */
export default function ShortAnswerEditor({ question, onChange }) {
    const q = question;
    const numeric = q.answerKind === 'number';
    const answers = Array.isArray(q.acceptedAnswers) && q.acceptedAnswers.length ? q.acceptedAnswers : [''];
    const units = Array.isArray(q.units) ? q.units : [];
    const converts = numeric && Array.isArray(q.unitFactors);

    const setAnswer = (i, v) => onChange({ acceptedAnswers: answers.map((a, k) => (k === i ? v : a)) });
    const removeAnswer = (i) => onChange({ acceptedAnswers: answers.filter((_, k) => k !== i) });

    const addUnit = () => onChange({
        units: [...units, ''],
        correctUnit: units.length ? q.correctUnit : 0,
        ...(converts && { unitFactors: [...q.unitFactors, 1] }),
    });
    const removeUnit = (i) => {
        if (units.length === 1) return onChange({ units: undefined, correctUnit: undefined, unitFactors: undefined });
        const correctUnit = q.correctUnit === i ? 0 : q.correctUnit > i ? q.correctUnit - 1 : q.correctUnit;
        onChange({
            units: units.filter((_, k) => k !== i),
            correctUnit,
            ...(converts && { unitFactors: q.unitFactors.filter((_, k) => k !== i) }),
        });
    };

    return (
        <div className="space-y-4 p-4 bg-cyan-50/40 border border-cyan-200 rounded-xl text-sm">
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-black uppercase tracking-wider text-cyan-800">Kiểu đáp án:</span>
                {[{ value: 'text', label: 'Chữ' }, { value: 'number', label: 'Số' }].map((o) => (
                    <button
                        key={o.value}
                        type="button"
                        aria-pressed={(q.answerKind || 'text') === o.value}
                        onClick={() => onChange({ answerKind: o.value })}
                        className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-all ${(q.answerKind || 'text') === o.value ? 'bg-cyan-600 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'}`}
                    >
                        {o.label}
                    </button>
                ))}
            </div>

            <div className="space-y-2">
                <p className="text-[11px] font-black uppercase tracking-wider text-gray-500">
                    Đáp án được chấp nhận {answers.length > 1 && <span className="normal-case font-semibold text-gray-400">(khớp một trong các đáp án là đúng)</span>}
                </p>
                {answers.map((a, i) => (
                    <div key={i} className="flex items-center gap-2">
                        <input
                            value={a}
                            onChange={(e) => setAnswer(i, e.target.value)}
                            inputMode={numeric ? 'decimal' : undefined}
                            placeholder={numeric ? 'VD: 4096 hoặc 3,14' : 'VD: Hà Nội'}
                            aria-label={`Đáp án ${i + 1}`}
                            className={`${inputBase} w-full min-w-0`}
                        />
                        {answers.length > 1 && (
                            <button type="button" onClick={() => removeAnswer(i)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded" title="Xóa đáp án">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                ))}
                <button type="button" onClick={() => onChange({ acceptedAnswers: [...answers, ''] })} className="text-xs font-bold text-cyan-700 hover:text-cyan-900 flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Thêm cách viết khác
                </button>
                {!numeric && (
                    <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                        <input type="checkbox" checked={!!q.caseSensitive} onChange={(e) => onChange({ caseSensitive: e.target.checked })} className="accent-cyan-600" />
                        Phân biệt chữ hoa / chữ thường
                    </label>
                )}
                {numeric && (
                    <p className="text-[11px] text-gray-500">Học sinh có thể dùng dấu phẩy hoặc dấu chấm thập phân. Không dùng dấu phân cách hàng nghìn.</p>
                )}
            </div>

            {numeric && (
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-black uppercase tracking-wider text-gray-500">Sai số cho phép:</span>
                    <input
                        type="number"
                        min="0"
                        step="any"
                        value={q.tolerance ?? ''}
                        onChange={(e) => onChange({ tolerance: toNumber(e.target.value) })}
                        placeholder="0"
                        aria-label="Sai số cho phép"
                        className={`${inputBase} w-28 shrink-0`}
                    />
                    <select
                        value={q.toleranceMode || 'absolute'}
                        onChange={(e) => onChange({ toleranceMode: e.target.value })}
                        aria-label="Cách tính sai số"
                        className="px-2 py-2 text-sm bg-white border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-cyan-400"
                    >
                        <option value="absolute">± giá trị</option>
                        <option value="percent">± %</option>
                    </select>
                </div>
            )}

            <div className="space-y-2">
                <p className="text-[11px] font-black uppercase tracking-wider text-gray-500">
                    Đơn vị <span className="normal-case font-semibold text-gray-400">(không bắt buộc – học sinh chọn trong danh sách)</span>
                </p>
                {units.length > 0 && numeric && (
                    <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={converts}
                            onChange={(e) => onChange({ unitFactors: e.target.checked ? units.map(() => 1) : undefined })}
                            className="accent-cyan-600"
                        />
                        Chấp nhận đơn vị quy đổi (VD: 4 MB đúng khi đáp án là 4096 KB)
                    </label>
                )}
                {units.map((u, i) => (
                    <div key={i} className="flex items-center gap-2">
                        <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500 shrink-0 cursor-pointer" title="Đơn vị của đáp án đúng">
                            <input type="radio" checked={q.correctUnit === i} onChange={() => onChange({ correctUnit: i })} className="accent-cyan-600" /> Đúng
                        </label>
                        <input
                            value={u}
                            onChange={(e) => onChange({ units: units.map((x, k) => (k === i ? e.target.value : x)) })}
                            placeholder="VD: KB"
                            aria-label={`Đơn vị ${i + 1}`}
                            className={`${inputBase} w-full min-w-0`}
                        />
                        {converts && (
                            <>
                                <span className="text-xs text-gray-400 shrink-0">=</span>
                                <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={q.unitFactors[i] ?? ''}
                                    onChange={(e) => onChange({ unitFactors: q.unitFactors.map((f, k) => (k === i ? toNumber(e.target.value) : f)) })}
                                    aria-label={`Hệ số của đơn vị ${i + 1}`}
                                    title="Giá trị của 1 đơn vị này tính theo đơn vị gốc"
                                    className={`${inputBase} w-28 shrink-0`}
                                />
                            </>
                        )}
                        <button type="button" onClick={() => removeUnit(i)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded" title="Xóa đơn vị">
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                ))}
                {converts && (
                    <p className="text-[11px] text-gray-500">Hệ số là giá trị của 1 đơn vị tính theo đơn vị gốc. VD: KB = 1, MB = 1024, GB = 1048576.</p>
                )}
                <button type="button" onClick={addUnit} className="text-xs font-bold text-cyan-700 hover:text-cyan-900 flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Thêm đơn vị
                </button>
            </div>
        </div>
    );
}
