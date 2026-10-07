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

const TOKEN = new RegExp([
  '(\\/\\/.*|\\/\\*.*?\\*\\/|--\\s.*|#(?!\\s*(?:include|define|import|pragma|ifdef|ifndef|endif|undef|if|else|elif)\\b).*)', // 1 comment
  '("(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\'|`(?:[^`\\\\]|\\\\.)*`)',                                                      // 2 string
  '(#\\s*[a-z]+)',                                                                                                            // 3 preprocessor
  '(\\b\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b|\\b0x[0-9a-fA-F]+\\b)',                                                          // 4 number
  '([A-Za-z_]\\w*)(?=\\s*\\()',                                                                                              // 5 call / definition
  '([A-Za-z_]\\w*)',                                                                                                          // 6 word
].join('|'), 'gi');

export function highlightCode(text) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
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
