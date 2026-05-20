/**
 * Dolphin – Smart Question Parser (DOM/HTML Analysis) v6
 */
import mammoth from 'mammoth';
import JSZip from 'jszip';
import { extractMathFromXml } from './ommlParser';
import { parseQuestionsFromHtml } from './questionParser';

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

function serializeInline(node) {
    let text = "";
    if (!node) return text;
    for (const child of node.childNodes) {
        if (child.nodeType === TEXT_NODE) {
            text += child.textContent;
        } else if (child.nodeType === ELEMENT_NODE) {
            const tag = child.tagName.toLowerCase();
            if (tag === 'br') {
                text += '\n';
            } else if (['strong', 'b', 'u', 'em', 'i'].includes(tag)) {
                text += `<${tag}>${serializeInline(child)}</${tag}>`;
            } else {
                text += serializeInline(child);
            }
        }
    }
    return text;
}

export async function parseSmartExam(docxBuffer) {
    if (!docxBuffer) return { questions: [], mathDictionary: {} };
    let finalBuffer = docxBuffer;

    try {
        const zip = await JSZip.loadAsync(docxBuffer);
        const docXml = await zip.file('word/document.xml')?.async('string');
        if (docXml) {
            const xmlDoc = new DOMParser().parseFromString(docXml, 'application/xml');

            // Xử lý lõi chuyển đổi OMML sang LaTeX an toàn
            extractMathFromXml(xmlDoc);

            const newXml = new XMLSerializer().serializeToString(xmlDoc);
            zip.file('word/document.xml', newXml);
            finalBuffer = await zip.generateAsync({ type: 'arraybuffer' });
        }
    } catch (e) {
        console.error("Lỗi khi tiền xử lý dữ liệu cấu trúc OMML:", e);
    }

    const result = await mammoth.convertToHtml({ arrayBuffer: finalBuffer });
    const html = result.value;

    if (!html || !html.trim()) return { questions: [], mathDictionary: {} };

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const body = doc.body;

    const rawHtmlLines = [];
    for (const child of Array.from(body.children)) {
        const tag = child.tagName.toLowerCase();
        if (tag === 'p' || tag === 'li') {
            const inlineText = serializeInline(child);
            if (inlineText.trim() !== '') {
                rawHtmlLines.push(inlineText);
            }
        } else if (tag === 'ul' || tag === 'ol') {
            const items = Array.from(child.querySelectorAll('li'));
            items.forEach(item => {
                const inlineText = serializeInline(item);
                if (inlineText.trim() !== '') rawHtmlLines.push(inlineText);
            });
        }
    }

    const joinedHtml = rawHtmlLines.join('\n');
    const finalQuestions = parseQuestionsFromHtml(joinedHtml);

    return {
        questions: finalQuestions,
        mathDictionary: {}
    };
}