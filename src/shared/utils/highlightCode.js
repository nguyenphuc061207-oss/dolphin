/**
 * Tiny, dependency-free syntax highlighter (C-family, Python, Pascal, SQL, JS).
 * Returns [{ type: 'k'|'s'|'c'|'n'|'f'|null, text }] – the caller decides how to render.
 * Deliberately approximate: it only colours, never changes the text.
 */
const words = (s) => new Set(s.split(/\s+/));
// C, C++, Java, C#, JavaScript, Python, PHP – case-sensitive.
const KEYWORDS = words(
  'if else elif for while do switch case default break continue return goto try catch finally throw throws except raise with as ' +
  'int long short float double char bool boolean byte void unsigned signed string String auto var let const static final public private protected abstract ' +
  'class struct enum union interface extends implements new delete this self super import from package using namespace include define typedef template typename ' +
  'def lambda pass yield async await function true false null None True False nullptr undefined NaN in is not and or ' +
  'global nonlocal assert del typeof instanceof of echo foreach elseif func fn mut impl pub',
);
// Pascal and SQL are case-insensitive and only colour their own words in their own listings,
// so a Python variable called `values` or `type` stays a plain name.
const PASCAL_KEYWORDS = words(
  'and array begin case const div do downto else end for function if in mod nil not of or procedure program record repeat ' +
  'set then to type until uses var while xor shl shr integer real longint byte word boolean char string true false',
);
const SQL_KEYWORDS = words(
  'select insert update delete create drop alter table from where group order by having join inner left right outer full on ' +
  'values set into as and or not null is in like between distinct limit primary key foreign references asc desc union all',
);

// Literals and `#` comments must not influence the language guess ("a;b" is not a C statement).
const withoutLiterals = (text) => text
  .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, '""')
  .replace(/#(?!\s*(?:include|define|pragma)\b).*$/gm, '');

// Python or C-family decides what `//` means: floor division or a comment.
const C_FAMILY = /;|\{\s*$|^\s*\}|\b(?:const|let|var|void|function|public|private|static)\b|\b(?:int|float|double|char|long)\s+\**[A-Za-z_]|#\s*include\b/m;
const PY_STRONG = /(?<![\w.])(?:print|input|range|len)\s*\(|^\s*(?:def\s+\w+\s*\(|from\s+\S+\s+import\s|elif\b|except\b)/m;
// Weak hints only count when nothing C-like is present: `x //= 2`, `a // b`, `(n + 1) // 2`, `3**2`, `True`.
const PY_WEAK = new RegExp([
  ':\\s*(?:#.*)?$', '^\\s*import\\s+[\\w.]+\\s*$', '\\/\\/=',
  '[\\w)\\]]\\s*\\/\\/\\s*(?:\\d|\\(|[A-Za-z_]\\w*(?:\\s*(?:[-+*\\/%)\\]<>=!,:]|$)|\\s*\\())',
  '\\w\\*\\*\\w', '\\w \\*\\* \\w', '\\b(?:True|False|None)\\b',
].join('|'), 'm');

export function isPythonLike(text) {
  const code = withoutLiterals(text);
  return PY_STRONG.test(code) || (!C_FAMILY.test(code) && PY_WEAK.test(code));
}

// Pascal: `{ … }` and `(* … *)` are comments. `:=` alone also fits Go, whose `{` opens a block.
// `begin … end` as statements, never C++ calls such as v.begin(), v.end().
const PASCAL_STRONG = /^\s*(?:program|uses)\s+\w+|(?<![\w.])begin\b(?!\s*\()[\s\S]*(?<![\w.])end\b(?!\s*\()|\b(?:writeln|readln)\b|^\s*var\s+\w+(?:\s*,\s*\w+)*\s*:\s*\w+\s*;/im;
function isPascalLike(text) {
  const code = withoutLiterals(text);
  return PASCAL_STRONG.test(code) || (/:=/.test(code) && !/\bfunc\b|\{\s*$|^\s*\}/m.test(code));
}

/** 'python' | 'pascal' | 'sql' | 'c' – decides comment syntax and keyword set. */
export function guessLanguage(text) {
  if (isPythonLike(text)) return 'python';
  if (isPascalLike(text)) return 'pascal';
  if (/^\s*(?:select|insert|update|delete|create|alter|drop)\b/im.test(text)) return 'sql';
  return 'c';
}

const COMMENTS = {
  python: '#[^\\r\\n]*',
  pascal: '\\{[^}]*\\}|\\(\\*[\\s\\S]*?\\*\\)|\\/\\/[^\\r\\n]*',
  sql: '--[^\\r\\n]*|\\/\\*[\\s\\S]*?\\*\\/',
  c: '\\/\\/[^\\r\\n]*|\\/\\*[\\s\\S]*?\\*\\/|#(?!\\s*(?:include|define|import|pragma|ifdef|ifndef|endif|undef|if|else|elif)\\b)[^\\r\\n]*',
};

function isKeyword(word, lang) {
  if (lang === 'pascal') return PASCAL_KEYWORDS.has(word.toLowerCase());
  if (lang === 'sql') return SQL_KEYWORDS.has(word.toLowerCase());
  return KEYWORDS.has(word);
}

function codeTokens(lang) {
  return new RegExp([
  `(${COMMENTS[lang]})`, // 1 comment; // is an operator in Python
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
  const lang = guessLanguage(text);
  for (const m of text.matchAll(codeTokens(lang))) {
    if (m.index > last) out.push({ type: null, text: text.slice(last, m.index) });
    let type = null;
    if (m[1]) type = 'c';
    else if (m[2]) type = 's';
    else if (m[3]) type = 'k';
    else if (m[4]) type = 'n';
    else if (m[5]) type = isKeyword(m[5], lang) ? 'k' : 'f';
    else if (m[6]) type = isKeyword(m[6], lang) ? 'k' : null;
    out.push({ type, text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: null, text: text.slice(last) });
  return out;
}
