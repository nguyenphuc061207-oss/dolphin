/**
 * Tiny, dependency-free syntax highlighter (C-family, Python, Pascal, SQL, JS).
 * Returns [{ type: 'k'|'s'|'c'|'n'|'f'|null, text }] – the caller decides how to render.
 * Deliberately approximate: it only colours, never changes the text.
 */
const KEYWORDS = new Set((
  'if else elif for while do switch case default break continue return goto try catch finally throw throws except raise with as ' +
  'int long short float double char bool boolean byte void unsigned signed string String auto var let const static final public private protected abstract ' +
  'class struct enum union interface extends implements new delete this self super import from package using namespace include define typedef template typename ' +
  'def lambda pass yield async await function true false null None True False nullptr undefined NaN in is not and or ' +
  'begin end program procedure then repeat until uses unit type array of record nil div mod ' +
  'select insert update delete create drop alter table from where group order by having join on values set into'
).split(/\s+/));

function codeTokens(text) {
  const python = /\b(?:print|input|range|len|type)\s*\(|^\s*(?:def\s|from\s+\S+\s+import\s|import\s|elif\s|except\b)|:\s*(?:#.*)?$/m.test(text)
    || (!/\b(?:const|let|var|int|float|double|char|void)\b|;/.test(text) && /\S\s*\/\/\s*\d/.test(text));
  const sql = /^\s*(?:select|insert|update|delete|create|alter|drop)\b/im.test(text);
  const comments = python ? '#[^\\r\\n]*' : '\\/\\/[^\\r\\n]*|\\/\\*[\\s\\S]*?\\*\\/|#(?!\\s*(?:include|define|import|pragma|ifdef|ifndef|endif|undef|if|else|elif)\\b)[^\\r\\n]*';
  return new RegExp([
  `(${comments}${sql ? '|--[^\\r\\n]*' : ''})`, // 1 comment; // is an operator in Python
  '("""[\\s\\S]*?"""|\'\'\'[\\s\\S]*?\'\'\'|"(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\'|`(?:[^`\\\\]|\\\\.)*`)', // 2 string
  '(#\\s*[a-z]+)',                                                                                                            // 3 preprocessor
  '(\\b0[xX][0-9a-fA-F]+\\b|\\b0[bB][01]+\\b|\\b\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b)', // 4 number
  '([A-Za-z_]\\w*)(?=\\s*\\()',                                                                                              // 5 call / definition
  '([A-Za-z_]\\w*)',                                                                                                          // 6 word
].join('|'), 'gi');
}

export function highlightCode(text) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(codeTokens(text))) {
    if (m.index > last) out.push({ type: null, text: text.slice(last, m.index) });
    let type = null;
    if (m[1]) type = 'c';
    else if (m[2]) type = 's';
    else if (m[3]) type = 'k';
    else if (m[4]) type = 'n';
    else if (m[5]) type = KEYWORDS.has(m[5].toLowerCase()) ? 'k' : 'f';
    else if (m[6]) type = KEYWORDS.has(m[6]) || KEYWORDS.has(m[6].toLowerCase()) ? 'k' : null;
    out.push({ type, text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: null, text: text.slice(last) });
  return out;
}
