/**
 * Dolphin – Smart Question Parser (Advanced OOXML Semantic Engine)
 */
import JSZip from 'jszip';
import { extractMathFromXml } from './ommlParser';
import { parseQuestionsFromText } from './questionParser';

const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

class NumberingDictionary {
    constructor(numXmlStr) {
        this.numMap = new Map(); // numId -> abstractNumId
        this.abstractMap = new Map(); // abstractNumId -> { ilvl: { fmt, text, start } }
        this.counters = new Map(); // key (numId_ilvl) -> current count
        
        if (numXmlStr) {
            const doc = new DOMParser().parseFromString(numXmlStr, 'application/xml');
            
            // Parse abstractNum
            const abstractNums = doc.getElementsByTagNameNS('*', 'abstractNum');
            for (const aNum of abstractNums) {
                const aId = aNum.getAttribute('w:abstractNumId');
                const levels = {};
                for (const lvl of aNum.getElementsByTagNameNS('*', 'lvl')) {
                    const ilvl = lvl.getAttribute('w:ilvl');
                    const numFmt = lvl.getElementsByTagNameNS('*', 'numFmt')[0]?.getAttribute('w:val') || 'decimal';
                    const lvlText = lvl.getElementsByTagNameNS('*', 'lvlText')[0]?.getAttribute('w:val') || '';
                    const start = parseInt(lvl.getElementsByTagNameNS('*', 'start')[0]?.getAttribute('w:val') || '1', 10);
                    levels[ilvl] = { fmt: numFmt, text: lvlText, start };
                }
                this.abstractMap.set(aId, levels);
            }
            
            // Parse num
            const nums = doc.getElementsByTagNameNS('*', 'num');
            for (const num of nums) {
                const nId = num.getAttribute('w:numId');
                const aId = num.getElementsByTagNameNS('*', 'abstractNumId')[0]?.getAttribute('w:val');
                if (aId) this.numMap.set(nId, aId);
            }
        }
    }

    getNumberingString(numId, ilvl) {
        const aId = this.numMap.get(numId);
        if (!aId) return '';
        const levelData = this.abstractMap.get(aId)?.[ilvl];
        if (!levelData) return '';
        
        const key = `${numId}_${ilvl}`;
        let count = this.counters.get(key);
        if (count === undefined) count = levelData.start;
        else count++;
        this.counters.set(key, count);

        // Format count
        let strVal = count.toString();
        if (levelData.fmt === 'upperLetter') {
            strVal = String.fromCharCode(64 + count);
        } else if (levelData.fmt === 'lowerLetter') {
            strVal = String.fromCharCode(96 + count);
        }
        
        // lvlText is like "%1."
        return levelData.text.replace(/%\d/g, strVal);
    }
}

function extractTextFromParagraph(pNode) {
    let text = '';
    const ts = pNode.getElementsByTagNameNS('*', '*');
    for (const t of ts) {
        if (t.localName === 't') {
            text += t.textContent;
        } else if (t.localName === 'tab') {
            text += '\t';
        }
    }
    return text;
}

export async function parseSmartExam(docxBuffer) {
    if (!docxBuffer) return { questions: [], mathDictionary: {} };

    try {
        const zip = await JSZip.loadAsync(docxBuffer);
        const docXmlStr = await zip.file('word/document.xml')?.async('string');
        if (!docXmlStr) return { questions: [], mathDictionary: {} };
        
        const numXmlStr = await zip.file('word/numbering.xml')?.async('string');
        const numberingDict = new NumberingDictionary(numXmlStr);
        
        const docXml = new DOMParser().parseFromString(docXmlStr, 'application/xml');
        
        // Core: Process OMML math blocks into w:t text nodes naturally embedded in OOXML DOM
        extractMathFromXml(docXml);

        const paragraphs = [];
        const body = docXml.getElementsByTagNameNS('*', 'body')[0] || docXml.documentElement;
        
        // Structure Analysis: traverse block level elements
        for (const el of body.childNodes) {
            if (el.localName === 'p') {
                let prefix = '';
                const pPr = el.getElementsByTagNameNS('*', 'pPr')[0];
                if (pPr) {
                    const numPr = pPr.getElementsByTagNameNS('*', 'numPr')[0];
                    if (numPr) {
                        const ilvlNode = numPr.getElementsByTagNameNS('*', 'ilvl')[0];
                        const numIdNode = numPr.getElementsByTagNameNS('*', 'numId')[0];
                        if (ilvlNode && numIdNode) {
                            const ilvl = ilvlNode.getAttribute('w:val');
                            const numId = numIdNode.getAttribute('w:val');
                            const numStr = numberingDict.getNumberingString(numId, ilvl);
                            if (numStr) prefix = numStr + ' ';
                        }
                    }
                }
                
                let pText = extractTextFromParagraph(el);
                if (pText.trim() !== '') {
                    paragraphs.push(prefix + pText);
                }
            } else if (el.localName === 'tbl') {
                // Table layout extraction: extract paragraphs from table cells sequentially
                const trs = el.getElementsByTagNameNS('*', 'tr');
                for (const tr of trs) {
                    const tcs = tr.getElementsByTagNameNS('*', 'tc');
                    for (const tc of tcs) {
                        const tcPs = tc.getElementsByTagNameNS('*', 'p');
                        for (const tcp of tcPs) {
                            let pText = extractTextFromParagraph(tcp);
                            if (pText.trim() !== '') paragraphs.push(pText);
                        }
                    }
                }
            }
        }
        
        const plainText = paragraphs.join('\n');
        
        // Hand off normalized structure string to semantic tokenizer
        const finalQuestions = parseQuestionsFromText(plainText);
        
        return {
            questions: finalQuestions,
            mathDictionary: {}
        };
    } catch (e) {
        console.error("Advanced OOXML Parse Error:", e);
        return { questions: [], mathDictionary: {} };
    }
}