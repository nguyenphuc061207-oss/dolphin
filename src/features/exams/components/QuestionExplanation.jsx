import { Lightbulb } from 'lucide-react';
import RichTextRenderer from '@/shared/components/RichTextRenderer';
import { normalizeExplanation } from '@/shared/utils/richText';

export default function QuestionExplanation({ content, mathDict, compact = false }) {
    const explanation = normalizeExplanation(content);
    if (!explanation) return null;
    return (
        <section className={`explanation-box${compact ? ' explanation-compact' : ''}`} aria-label="Giải thích">
            <p className="explanation-title"><Lightbulb className="w-4 h-4" aria-hidden="true" /> Giải thích</p>
            <RichTextRenderer content={explanation} mathDict={mathDict} />
        </section>
    );
}
