// Deterministic C++17 syntax-aware ban-list constraint engine (`D1`).
// Parses tokens, preprocessor directives, nested scopes, namespaces, aliases, and user declarations
// without referencing any problem IDs or relying on raw substring regexes.

const RAW_PREFIXES = new Set(['R', 'u8R', 'uR', 'UR', 'LR']);
const CHAR_PREFIXES = new Set(['u', 'U', 'L', 'u8']);

const CPP_KEYWORDS = new Set(
  [
    'alignas alignof and and_eq asm auto bitand bitor bool break case catch char char8_t char16_t char32_t',
    'class compl concept const consteval constexpr constinit const_cast continue co_await co_return co_yield',
    'decltype default delete do double dynamic_cast else enum explicit export extern false float for friend',
    'goto if inline int long mutable namespace new noexcept not not_eq nullptr operator or or_eq private',
    'protected public register reinterpret_cast requires return short signed sizeof static static_assert',
    'static_cast struct switch template this thread_local throw true try typedef typeid typename union',
    'unsigned using virtual void volatile wchar_t while xor xor_eq',
  ]
    .join(' ')
    .split(' '),
);

const BUILTIN_TYPE_STARTERS = new Set(
  [
    'void bool char char8_t char16_t char32_t wchar_t short int long signed unsigned float double auto',
    'const constexpr static inline volatile mutable extern register size_t ssize_t ptrdiff_t',
    'int8_t int16_t int32_t int64_t uint8_t uint16_t uint32_t uint64_t',
  ]
    .join(' ')
    .split(' '),
);

const MULTI_PUNCT =
  '->* ... <<= >>= :: -> .* <= >= == != && || ++ -- += -= *= /= %= &= |= ^= << ##'.split(' ');

/**
 * @typedef {{
 *   type: 'ident' | 'number' | 'string' | 'char' | 'punct',
 *   value: string,
 *   line: number,
 *   adjacent: boolean
 * }} Token
 *
 * @typedef {{
 *   name: string,
 *   params: Set<string> | null,
 *   bodyTokens: Token[],
 *   line: number
 * }} MacroDef
 *
 * @typedef {{
 *   parent: Scope | null,
 *   kind: 'namespace' | 'class' | 'function' | 'block',
 *   nsPath: string,
 *   usingNamespaces: string[],
 *   namespaceAliases: Map<string, string>,
 *   usingDecls: Map<string, { target: string, line: number }>,
 *   aliases: Map<string, { rhsTokens: Token[], scope: Scope, line: number }>,
 *   userNamespaces: Set<string>,
 *   userTypes: Set<string>,
 *   userVars: Set<string>,
 *   userFunctions: Map<string, Array<{ minArgs: number, maxArgs: number }>>
 * }} Scope
 */

/**
 * @param {string} ch
 * @returns {boolean}
 */
function isIdentStart(ch) {
  const c = ch.charCodeAt(0);
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
}

/**
 * @param {string} ch
 * @returns {boolean}
 */
function isIdentPart(ch) {
  const c = ch.charCodeAt(0);
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
}

/**
 * @param {string} ch
 * @returns {boolean}
 */
function isDigit(ch) {
  const c = ch.charCodeAt(0);
  return c >= 48 && c <= 57;
}

/**
 * Returns true iff `ruleText` starts with `"Do not use"` or `"Do not call"` (case-insensitive)
 * and contains at least one backtick-delimited target.
 *
 * @param {string} ruleText
 * @returns {{ isBanList: boolean, bannedTargets: string[] }}
 */
export function parseBanListConstraint(ruleText) {
  if (typeof ruleText !== 'string' || !/^\s*Do not (?:use|call)\b/i.test(ruleText)) {
    return { isBanList: false, bannedTargets: [] };
  }

  /** @type {string[]} */
  const bannedTargets = [];
  const seen = new Set();
  const re = /`([^`]+)`/g;
  let m = re.exec(ruleText);
  while (m !== null) {
    const token = m[1].trim();
    if (token.length > 0 && !seen.has(token)) {
      seen.add(token);
      bannedTargets.push(token);
    }
    m = re.exec(ruleText);
  }

  if (bannedTargets.length === 0) {
    return { isBanList: false, bannedTargets: [] };
  }
  return { isBanList: true, bannedTargets };
}

/**
 * Tokenizes a slice of C++17 code (no preprocessor splitting) while tracking 1-based line numbers.
 * Note: `>` is emitted as single `>` tokens rather than `>>` so nested templates `vector<vector<int>>`
 * parse cleanly without splitting tokens.
 *
 * @param {string} src
 * @param {number} startLine
 * @returns {Token[]}
 */
function lexSlice(src, startLine) {
  /** @type {Token[]} */
  const tokens = [];
  const len = src.length;
  let i = 0;
  let line = startLine;
  let hadSpace = true;

  while (i < len) {
    const ch = src[i];
    const next = i + 1 < len ? src[i + 1] : '';

    if (ch === '\n') {
      line++;
      hadSpace = true;
      i++;
      continue;
    }
    if (ch === ' ' || ch === '\t' || ch === '\v' || ch === '\f' || ch === '\r') {
      hadSpace = true;
      i++;
      continue;
    }
    if (ch === '\\' && next === '\n') {
      line++;
      i += 2;
      continue;
    }

    // Line comment `// ...` (with backslash-newline continuation)
    if (ch === '/' && next === '/') {
      hadSpace = true;
      i += 2;
      while (i < len) {
        if (src[i] === '\n') {
          let p = i - 1;
          while (p >= 0 && (src[p] === ' ' || src[p] === '\t' || src[p] === '\r')) p--;
          const spliced = p >= 0 && src[p] === '\\';
          line++;
          i++;
          if (!spliced) break;
        } else {
          i++;
        }
      }
      continue;
    }

    // Block comment `/* ... */`
    if (ch === '/' && next === '*') {
      hadSpace = true;
      i += 2;
      while (i < len) {
        if (src[i] === '*' && i + 1 < len && src[i + 1] === '/') {
          i += 2;
          break;
        }
        if (src[i] === '\n') line++;
        i++;
      }
      continue;
    }

    // Identifier, keyword, or prefixed string/char literal
    if (isIdentStart(ch)) {
      const tokLine = line;
      const adjacent = !hadSpace;
      const start = i;
      while (i < len && isIdentPart(src[i])) i++;
      const word = src.slice(start, i);

      // Raw string literal `R"delim(...)delim"`
      if (i < len && src[i] === '"' && RAW_PREFIXES.has(word)) {
        let p = i + 1;
        let validDelim = true;
        while (p < len && src[p] !== '(') {
          const dc = src[p];
          if (
            p - (i + 1) >= 16 ||
            dc === ' ' ||
            dc === ')' ||
            dc === '\\' ||
            dc === '\t' ||
            dc === '\v' ||
            dc === '\f' ||
            dc === '\n'
          ) {
            validDelim = false;
            break;
          }
          p++;
        }
        if (validDelim && p < len && src[p] === '(') {
          const delim = src.slice(i + 1, p);
          const closing = `)${delim}"`;
          const closeIdx = src.indexOf(closing, p + 1);
          const endIdx = closeIdx !== -1 ? closeIdx + closing.length : len;
          for (let k = i; k < endIdx; k++) {
            if (src[k] === '\n') line++;
          }
          tokens.push({ type: 'string', value: src.slice(start, endIdx), line: tokLine, adjacent });
          i = endIdx;
          hadSpace = false;
          continue;
        }
      }

      // Prefixed standard string literal (`u8"..."`, `L"..."`)
      if (i < len && src[i] === '"' && CHAR_PREFIXES.has(word)) {
        i++;
        while (i < len) {
          if (src[i] === '\\' && i + 1 < len) {
            if (src[i + 1] === '\n') line++;
            i += 2;
            continue;
          }
          if (src[i] === '"') {
            i++;
            break;
          }
          if (src[i] === '\n') break;
          i++;
        }
        tokens.push({ type: 'string', value: src.slice(start, i), line: tokLine, adjacent });
        hadSpace = false;
        continue;
      }

      // Prefixed character literal (`u'a'`, `L'a'`)
      if (i < len && src[i] === "'" && CHAR_PREFIXES.has(word)) {
        i++;
        while (i < len) {
          if (src[i] === '\\' && i + 1 < len) {
            if (src[i + 1] === '\n') line++;
            i += 2;
            continue;
          }
          if (src[i] === "'") {
            i++;
            break;
          }
          if (src[i] === '\n') break;
          i++;
        }
        tokens.push({ type: 'char', value: src.slice(start, i), line: tokLine, adjacent });
        hadSpace = false;
        continue;
      }

      tokens.push({ type: 'ident', value: word, line: tokLine, adjacent });
      hadSpace = false;
      continue;
    }

    // Numeric literal (pp-number with C++14 `'` digit separators)
    if (isDigit(ch) || (ch === '.' && isDigit(next))) {
      const tokLine = line;
      const adjacent = !hadSpace;
      const start = i;
      i++;
      while (i < len) {
        const c = src[i];
        if (
          (c === 'e' || c === 'E' || c === 'p' || c === 'P') &&
          (src[i + 1] === '+' || src[i + 1] === '-')
        ) {
          i += 2;
          continue;
        }
        if (c === "'" && i + 1 < len && isIdentPart(src[i + 1])) {
          i += 2;
          continue;
        }
        if (isIdentPart(c) || c === '.') {
          i++;
          continue;
        }
        break;
      }
      tokens.push({ type: 'number', value: src.slice(start, i), line: tokLine, adjacent });
      hadSpace = false;
      continue;
    }

    // Unprefixed string literal `"..."`
    if (ch === '"') {
      const tokLine = line;
      const adjacent = !hadSpace;
      const start = i;
      i++;
      while (i < len) {
        if (src[i] === '\\' && i + 1 < len) {
          if (src[i + 1] === '\n') line++;
          i += 2;
          continue;
        }
        if (src[i] === '"') {
          i++;
          break;
        }
        if (src[i] === '\n') break;
        i++;
      }
      tokens.push({ type: 'string', value: src.slice(start, i), line: tokLine, adjacent });
      hadSpace = false;
      continue;
    }

    // Unprefixed character literal `'...'`
    if (ch === "'") {
      const tokLine = line;
      const adjacent = !hadSpace;
      const start = i;
      i++;
      while (i < len) {
        if (src[i] === '\\' && i + 1 < len) {
          if (src[i + 1] === '\n') line++;
          i += 2;
          continue;
        }
        if (src[i] === "'") {
          i++;
          break;
        }
        if (src[i] === '\n') break;
        i++;
      }
      tokens.push({ type: 'char', value: src.slice(start, i), line: tokLine, adjacent });
      hadSpace = false;
      continue;
    }

    // Punctuators
    const tokLine = line;
    const adjacent = !hadSpace;
    let matchedPunct = '';
    for (const mp of MULTI_PUNCT) {
      if (src.startsWith(mp, i)) {
        matchedPunct = mp;
        break;
      }
    }
    if (matchedPunct) {
      tokens.push({ type: 'punct', value: matchedPunct, line: tokLine, adjacent });
      i += matchedPunct.length;
    } else {
      tokens.push({ type: 'punct', value: ch, line: tokLine, adjacent });
      i++;
    }
    hadSpace = false;
  }

  return tokens;
}

/**
 * Applies `##` token pasting inside a `#define` replacement token list.
 *
 * @param {Token[]} bodyTokens
 * @returns {Token[]}
 */
function foldTokenPasting(bodyTokens) {
  /** @type {Token[]} */
  const out = [];
  let i = 0;
  while (i < bodyTokens.length) {
    if (
      i + 2 < bodyTokens.length &&
      bodyTokens[i + 1].type === 'punct' &&
      bodyTokens[i + 1].value === '##' &&
      bodyTokens[i].type === 'ident' &&
      bodyTokens[i + 2].type === 'ident'
    ) {
      let combined = bodyTokens[i].value + bodyTokens[i + 2].value;
      const baseLine = bodyTokens[i].line;
      const adjacent = bodyTokens[i].adjacent;
      i += 3;
      while (
        i + 1 < bodyTokens.length &&
        bodyTokens[i].type === 'punct' &&
        bodyTokens[i].value === '##' &&
        bodyTokens[i + 1].type === 'ident'
      ) {
        combined += bodyTokens[i + 1].value;
        i += 2;
      }
      out.push({ type: 'ident', value: combined, line: baseLine, adjacent });
      continue;
    }
    out.push(bodyTokens[i]);
    i++;
  }
  return out;
}

/**
 * Separates preprocessor directives (`#include`, `#define`, etc.) from C++ code tokens
 * while preserving exact 1-based line numbers across comments and line continuations.
 *
 * @param {string} normalizedCode
 * @returns {{
 *   tokens: Token[],
 *   includes: Array<{ header: string, line: number }>,
 *   macros: Map<string, MacroDef>
 * }}
 */
function tokenizeCpp(normalizedCode) {
  /** @type {Array<{ header: string, line: number }>} */
  const includes = [];
  /** @type {Map<string, MacroDef>} */
  const macros = new Map();

  const chars = Array.from(normalizedCode);
  const len = normalizedCode.length;
  let i = 0;
  let line = 1;
  let atLineStart = true;

  while (i < len) {
    const ch = normalizedCode[i];
    const next = i + 1 < len ? normalizedCode[i + 1] : '';

    if (ch === '\n') {
      line++;
      atLineStart = true;
      i++;
      continue;
    }
    if (ch === ' ' || ch === '\t' || ch === '\v' || ch === '\f') {
      i++;
      continue;
    }

    // Skip comments before checking `#` at start of line
    if (ch === '/' && next === '/') {
      i += 2;
      while (i < len) {
        if (normalizedCode[i] === '\n') {
          let p = i - 1;
          while (p >= 0 && (normalizedCode[p] === ' ' || normalizedCode[p] === '\t')) p--;
          const spliced = p >= 0 && normalizedCode[p] === '\\';
          line++;
          i++;
          if (!spliced) {
            atLineStart = true;
            break;
          }
        } else {
          i++;
        }
      }
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < len) {
        if (normalizedCode[i] === '*' && i + 1 < len && normalizedCode[i + 1] === '/') {
          i += 2;
          break;
        }
        if (normalizedCode[i] === '\n') line++;
        i++;
      }
      continue;
    }

    // Preprocessor directive starting with `#` at beginning of logical line
    if (atLineStart && ch === '#') {
      const dirStart = i;
      const dirLine = line;
      while (i < len) {
        // Respect block comments inside preprocessor directives
        if (normalizedCode[i] === '/' && normalizedCode[i + 1] === '*') {
          i += 2;
          while (i < len) {
            if (normalizedCode[i] === '*' && normalizedCode[i + 1] === '/') {
              i += 2;
              break;
            }
            if (normalizedCode[i] === '\n') line++;
            i++;
          }
          continue;
        }
        // Respect line comments at end of preprocessor directive
        if (normalizedCode[i] === '/' && normalizedCode[i + 1] === '/') {
          while (i < len && normalizedCode[i] !== '\n') i++;
          break;
        }
        if (normalizedCode[i] === '\n') {
          let p = i - 1;
          while (p >= dirStart && (normalizedCode[p] === ' ' || normalizedCode[p] === '\t')) p--;
          const spliced = p >= dirStart && normalizedCode[p] === '\\';
          if (!spliced) break;
          line++;
          i++;
          continue;
        }
        i++;
      }

      const dirText = normalizedCode.slice(dirStart, i);
      // Blank directive out of `chars` (keeping `\n`) so code lexer doesn't re-lex it
      for (let k = dirStart; k < i; k++) {
        if (chars[k] !== '\n') chars[k] = ' ';
      }

      const incMatch = /^\s*#\s*include\s*(<[^>]+>|"[^"]+")/.exec(dirText);
      if (incMatch) {
        includes.push({ header: incMatch[1], line: dirLine });
      } else {
        const dirTokens = lexSlice(dirText, dirLine);
        // dirTokens[0] is '#', dirTokens[1] is directive keyword
        if (
          dirTokens.length >= 3 &&
          dirTokens[1].type === 'ident' &&
          dirTokens[1].value === 'define' &&
          dirTokens[2].type === 'ident'
        ) {
          const macroName = dirTokens[2].value;
          let bodyIdx = 3;
          /** @type {Set<string> | null} */
          let params = null;
          if (
            bodyIdx < dirTokens.length &&
            dirTokens[bodyIdx].type === 'punct' &&
            dirTokens[bodyIdx].value === '(' &&
            dirTokens[bodyIdx].adjacent
          ) {
            params = new Set();
            bodyIdx++;
            while (bodyIdx < dirTokens.length) {
              const pt = dirTokens[bodyIdx];
              bodyIdx++;
              if (pt.type === 'punct' && pt.value === ')') break;
              if (pt.type === 'ident') params.add(pt.value);
            }
          }
          const bodyTokens = foldTokenPasting(dirTokens.slice(bodyIdx));
          macros.set(macroName, { name: macroName, params, bodyTokens, line: dirLine });
        }
      }
      atLineStart = true;
      continue;
    }

    // Skip strings/raw-strings/char-literals so `#` inside a multi-line raw string is ignored
    if (isIdentStart(ch)) {
      const start = i;
      while (i < len && isIdentPart(normalizedCode[i])) i++;
      const word = normalizedCode.slice(start, i);
      if (i < len && normalizedCode[i] === '"' && RAW_PREFIXES.has(word)) {
        let p = i + 1;
        let validDelim = true;
        while (p < len && normalizedCode[p] !== '(') {
          const dc = normalizedCode[p];
          if (
            p - (i + 1) >= 16 ||
            dc === ' ' ||
            dc === ')' ||
            dc === '\\' ||
            dc === '\t' ||
            dc === '\v' ||
            dc === '\f' ||
            dc === '\n'
          ) {
            validDelim = false;
            break;
          }
          p++;
        }
        if (validDelim && p < len && normalizedCode[p] === '(') {
          const closing = `)${normalizedCode.slice(i + 1, p)}"`;
          const closeIdx = normalizedCode.indexOf(closing, p + 1);
          const endIdx = closeIdx !== -1 ? closeIdx + closing.length : len;
          for (let k = i; k < endIdx; k++) {
            if (normalizedCode[k] === '\n') line++;
          }
          i = endIdx;
          atLineStart = false;
          continue;
        }
      }
      atLineStart = false;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      if (quote === "'" && i > 0 && isIdentPart(normalizedCode[i - 1])) {
        // C++14 digit separator inside number
        i++;
        atLineStart = false;
        continue;
      }
      i++;
      while (i < len) {
        if (normalizedCode[i] === '\\' && i + 1 < len) {
          if (normalizedCode[i + 1] === '\n') line++;
          i += 2;
          continue;
        }
        if (normalizedCode[i] === quote) {
          i++;
          break;
        }
        if (normalizedCode[i] === '\n') break;
        i++;
      }
      atLineStart = false;
      continue;
    }

    atLineStart = false;
    i++;
  }

  const tokens = lexSlice(chars.join(''), 1);
  return { tokens, includes, macros };
}

/**
 * @param {Scope | null} parent
 * @param {Scope['kind']} kind
 * @param {string} nsPath
 * @returns {Scope}
 */
function createScope(parent, kind, nsPath) {
  return {
    parent,
    kind,
    nsPath,
    usingNamespaces: [],
    namespaceAliases: new Map(),
    usingDecls: new Map(),
    aliases: new Map(),
    userNamespaces: new Set(),
    userTypes: new Set(),
    userVars: new Set(),
    userFunctions: new Map(),
  };
}

/**
 * Finds the matching closing token (`)`, `}`, `]`) starting at `openIdx`.
 *
 * @param {Token[]} tokens
 * @param {number} openIdx
 * @param {string} openCh
 * @param {string} closeCh
 * @returns {number}
 */
function findMatchingDelim(tokens, openIdx, openCh, closeCh) {
  let depth = 0;
  for (let i = openIdx; i < tokens.length; i++) {
    if (tokens[i].type === 'punct') {
      if (tokens[i].value === openCh) depth++;
      else if (tokens[i].value === closeCh) {
        depth--;
        if (depth === 0) return i;
      }
    }
  }
  return -1;
}

/**
 * Skips balanced `< ... >` template arguments starting at `ltIdx`, ignoring `<`/`>` inside `(...)` or `[...]`.
 * Returns index of matching `>`, or `-1` if `<` was a comparison operator rather than a template list.
 *
 * @param {Token[]} tokens
 * @param {number} ltIdx
 * @returns {number}
 */
function findMatchingAngle(tokens, ltIdx) {
  let angleDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  for (let i = ltIdx; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'punct') continue;
    if (t.value === ';' || t.value === '{' || t.value === '}') return -1;
    if (t.value === '(') parenDepth++;
    else if (t.value === ')') {
      if (parenDepth === 0) return -1;
      parenDepth--;
    } else if (t.value === '[') bracketDepth++;
    else if (t.value === ']') {
      if (bracketDepth === 0) return -1;
      bracketDepth--;
    } else if (parenDepth === 0 && bracketDepth === 0) {
      if (t.value === '<') angleDepth++;
      else if (t.value === '>') {
        angleDepth--;
        if (angleDepth === 0) return i;
      }
    }
  }
  return -1;
}

/**
 * Resolves a namespace prefix (e.g., `rg` -> `std::ranges`, or `ranges` under `using namespace std;` -> `std::ranges`).
 *
 * @param {Scope} scope
 * @param {string[]} parts
 * @param {boolean} globalQualified
 * @returns {string}
 */
function resolveNamespaceParts(scope, parts, globalQualified) {
  if (parts.length === 0) return '';
  if (globalQualified) return parts.join('::');

  const first = parts[0];
  /** @type {Scope | null} */
  let cur = scope;
  while (cur !== null) {
    const aliased = cur.namespaceAliases.get(first);
    if (aliased !== undefined) {
      return [aliased, ...parts.slice(1)].join('::');
    }
    cur = cur.parent;
  }

  // Relative namespace under active `using namespace` (e.g., `using namespace ranges;` after `using namespace std;`)
  if (first !== 'std') {
    cur = scope;
    while (cur !== null) {
      for (const ns of cur.usingNamespaces) {
        if (ns === 'std' && (first === 'ranges' || first === 'chrono' || first === 'filesystem')) {
          return `${ns}::${parts.join('::')}`;
        }
      }
      cur = cur.parent;
    }
  }

  return parts.join('::');
}

/**
 * Counts `[minArgs, maxArgs]` for a function parameter list `( ... )` (`openParen`..`closeParen`).
 *
 * @param {Token[]} tokens
 * @param {number} openParen
 * @param {number} closeParen
 * @returns {{ minArgs: number, maxArgs: number, paramNames: string[], paramNameIndices: number[] }}
 */
function parseFunctionParams(tokens, openParen, closeParen) {
  /** @type {string[]} */
  const paramNames = [];
  /** @type {number[]} */
  const paramNameIndices = [];

  if (closeParen === openParen + 1) {
    return { minArgs: 0, maxArgs: 0, paramNames, paramNameIndices };
  }
  if (
    closeParen === openParen + 2 &&
    tokens[openParen + 1].type === 'ident' &&
    tokens[openParen + 1].value === 'void'
  ) {
    return { minArgs: 0, maxArgs: 0, paramNames, paramNameIndices };
  }

  let minArgs = 0;
  let maxArgs = 0;
  let hasVariadic = false;

  // Split top-level parameters by comma
  /** @type {Array<{ start: number, end: number }>} */
  const segments = [];
  let segStart = openParen + 1;
  let pDepth = 0;
  let bDepth = 0;
  for (let i = openParen + 1; i < closeParen; i++) {
    const t = tokens[i];
    if (t.type === 'punct') {
      if (t.value === '(') pDepth++;
      else if (t.value === ')') pDepth = Math.max(0, pDepth - 1);
      else if (t.value === '[') bDepth++;
      else if (t.value === ']') bDepth = Math.max(0, bDepth - 1);
      else if (pDepth === 0 && bDepth === 0 && t.value === '<') {
        const endAngle = findMatchingAngle(tokens, i);
        if (endAngle !== -1 && endAngle < closeParen) {
          i = endAngle;
          continue;
        }
      } else if (pDepth === 0 && bDepth === 0 && t.value === ',') {
        segments.push({ start: segStart, end: i });
        segStart = i + 1;
      }
    }
  }
  segments.push({ start: segStart, end: closeParen });

  for (const seg of segments) {
    if (seg.start >= seg.end) continue;
    let hasDefault = false;
    let eqIdx = seg.end;
    for (let k = seg.start; k < seg.end; k++) {
      if (tokens[k].type === 'punct' && tokens[k].value === '...') {
        hasVariadic = true;
      }
      if (tokens[k].type === 'punct' && tokens[k].value === '=') {
        hasDefault = true;
        eqIdx = k;
        break;
      }
    }
    if (!hasVariadic) {
      maxArgs++;
      if (!hasDefault) minArgs++;
    }
    // Parameter name is typically the last identifier before `=` or `[`
    let nameIdx = -1;
    for (let k = eqIdx - 1; k >= seg.start; k--) {
      if (tokens[k].type === 'punct' && tokens[k].value === ']') {
        while (k >= seg.start && !(tokens[k].type === 'punct' && tokens[k].value === '[')) k--;
        continue;
      }
      if (
        tokens[k].type === 'ident' &&
        !CPP_KEYWORDS.has(tokens[k].value) &&
        !BUILTIN_TYPE_STARTERS.has(tokens[k].value)
      ) {
        // Ensure there is at least one type token before `k`
        if (k > seg.start) {
          nameIdx = k;
        }
        break;
      }
      break;
    }
    if (nameIdx !== -1) {
      paramNames.push(tokens[nameIdx].value);
      paramNameIndices.push(nameIdx);
    }
  }

  return {
    minArgs,
    maxArgs: hasVariadic ? Number.POSITIVE_INFINITY : maxArgs,
    paramNames,
    paramNameIndices,
  };
}

/**
 * Counts arguments in a call expression `( arg1, arg2, ... )`.
 *
 * @param {Token[]} tokens
 * @param {number} openParen
 * @returns {number}
 */
function countCallArgs(tokens, openParen) {
  const closeParen = findMatchingDelim(tokens, openParen, '(', ')');
  if (closeParen === -1 || closeParen === openParen + 1) return 0;

  let count = 1;
  let pDepth = 0;
  let bDepth = 0;
  let braceDepth = 0;
  for (let i = openParen + 1; i < closeParen; i++) {
    const t = tokens[i];
    if (t.type !== 'punct') continue;
    if (t.value === '(') pDepth++;
    else if (t.value === ')') pDepth = Math.max(0, pDepth - 1);
    else if (t.value === '[') bDepth++;
    else if (t.value === ']') bDepth = Math.max(0, bDepth - 1);
    else if (t.value === '{') braceDepth++;
    else if (t.value === '}') braceDepth = Math.max(0, braceDepth - 1);
    else if (pDepth === 0 && bDepth === 0 && braceDepth === 0 && t.value === ',') {
      count++;
    }
  }
  return count;
}

/**
 * Checks if `name` is a known user type in `scope` or enclosing scopes.
 *
 * @param {Scope} scope
 * @param {string} name
 * @returns {boolean}
 */
function isUserTypeInScope(scope, name) {
  /** @type {Scope | null} */
  let cur = scope;
  while (cur !== null) {
    if (cur.userTypes.has(name)) return true;
    cur = cur.parent;
  }
  return false;
}

/**
 * Attempts to consume a C++ type specifier starting at `idx`.
 * Returns the index immediately after the type specifier (including `*`, `&`, `const`, `<...>`),
 * or `-1` if `tokens[idx]` does not start a type specifier.
 *
 * @param {Token[]} tokens
 * @param {number} idx
 * @param {number} endIdx
 * @param {Scope} scope
 * @returns {number}
 */
function consumeTypeSpecifier(tokens, idx, endIdx, scope) {
  let i = idx;
  let sawCoreType = false;

  // Leading cv/storage qualifiers (`const`, `static`, `unsigned`, `long`, `typename`, etc.)
  while (i < endIdx && tokens[i].type === 'ident' && BUILTIN_TYPE_STARTERS.has(tokens[i].value)) {
    const val = tokens[i].value;
    if (
      val !== 'const' &&
      val !== 'constexpr' &&
      val !== 'static' &&
      val !== 'inline' &&
      val !== 'volatile' &&
      val !== 'mutable' &&
      val !== 'extern' &&
      val !== 'register'
    ) {
      sawCoreType = true;
    }
    i++;
  }

  if (i < endIdx && tokens[i].type === 'ident' && tokens[i].value === 'typename') {
    i++;
  }

  // Optional qualified/template type name (e.g., `std::vector<int>`, `MyStruct`, `Buffer`)
  if (!sawCoreType && i < endIdx) {
    let p = i;
    if (tokens[p].type === 'punct' && tokens[p].value === '::') p++;
    if (p < endIdx && tokens[p].type === 'ident' && !CPP_KEYWORDS.has(tokens[p].value)) {
      let hasNsPrefix = p > i;
      while (
        p + 2 < endIdx &&
        tokens[p + 1].type === 'punct' &&
        tokens[p + 1].value === '::' &&
        tokens[p + 2].type === 'ident'
      ) {
        hasNsPrefix = true;
        p += 2;
      }
      const typeLeaf = tokens[p].value;
      p++;
      let hasTemplate = false;
      if (p < endIdx && tokens[p].type === 'punct' && tokens[p].value === '<') {
        const endAngle = findMatchingAngle(tokens, p);
        if (endAngle !== -1 && endAngle < endIdx) {
          hasTemplate = true;
          p = endAngle + 1;
        }
      }
      // Accept if qualified (`std::string`), templated (`vector<int>`), known user type (`CustomSeq`),
      // or followed immediately by pointer/ref/identifier (`string s;`)
      const nextTok = p < endIdx ? tokens[p] : null;
      const followedByDeclarator =
        nextTok !== null &&
        ((nextTok.type === 'ident' && !CPP_KEYWORDS.has(nextTok.value)) ||
          (nextTok.type === 'punct' &&
            (nextTok.value === '*' || nextTok.value === '&' || nextTok.value === '&&')));
      if (
        hasNsPrefix ||
        hasTemplate ||
        isUserTypeInScope(scope, typeLeaf) ||
        followedByDeclarator
      ) {
        sawCoreType = true;
        i = p;
      }
    }
  } else if (sawCoreType && i < endIdx && tokens[i].type === 'punct' && tokens[i].value === '<') {
    const endAngle = findMatchingAngle(tokens, i);
    if (endAngle !== -1 && endAngle < endIdx) i = endAngle + 1;
  }

  if (!sawCoreType) return -1;

  // Trailing cv-qualifiers, pointers, and references
  while (i < endIdx) {
    const t = tokens[i];
    if (t.type === 'ident' && (t.value === 'const' || t.value === 'volatile')) {
      i++;
      continue;
    }
    if (t.type === 'punct' && (t.value === '*' || t.value === '&' || t.value === '&&')) {
      i++;
      continue;
    }
    break;
  }

  return i;
}

/**
 * Builds the scope tree, resolves `using` directives/declarations, aliases, user types/functions/vars,
 * and maps every token index to its enclosing lexical `Scope`.
 *
 * @param {Token[]} tokens
 * @returns {{
 *   rootScope: Scope,
 *   tokenScopes: Scope[],
 *   declIndices: Set<number>,
 *   userClassMembers: Set<string>,
 *   allUserNamespaces: Set<string>
 * }}
 */
function analyzeProgram(tokens) {
  const rootScope = createScope(null, 'namespace', '');
  /** @type {Scope[]} */
  const tokenScopes = new Array(tokens.length).fill(rootScope);
  /** @type {Set<number>} */
  const declIndices = new Set();
  /** @type {Set<string>} */
  const userClassMembers = new Set();
  /** @type {Set<string>} */
  const allUserNamespaces = new Set();

  /**
   * @param {Scope} scope
   * @param {string} name
   * @param {{ minArgs: number, maxArgs: number }} sig
   */
  function addUserFunction(scope, name, sig) {
    let list = scope.userFunctions.get(name);
    if (!list) {
      list = [];
      scope.userFunctions.set(name, list);
    }
    list.push(sig);
  }

  /**
   * @param {number} start
   * @param {number} end
   * @param {Scope} scope
   */
  function walkRange(start, end, scope) {
    for (let k = start; k < end; k++) {
      tokenScopes[k] = scope;
    }

    let i = start;
    while (i < end) {
      tokenScopes[i] = scope;
      const tok = tokens[i];

      // 1. Labels (`label:` at statement level, not `public:`/`private:`/`protected:`/`case`/`default`)
      if (
        tok.type === 'ident' &&
        !CPP_KEYWORDS.has(tok.value) &&
        i + 1 < end &&
        tokens[i + 1].type === 'punct' &&
        tokens[i + 1].value === ':' &&
        (i === start ||
          (tokens[i - 1].type === 'punct' &&
            (tokens[i - 1].value === ';' ||
              tokens[i - 1].value === '{' ||
              tokens[i - 1].value === '}')))
      ) {
        declIndices.add(i);
        i += 2;
        continue;
      }

      // 2. `namespace` definitions and `namespace alias = ...;`
      if (tok.type === 'ident' && tok.value === 'namespace') {
        // `namespace alias = ns1::ns2;`
        if (
          i + 2 < end &&
          tokens[i + 1].type === 'ident' &&
          tokens[i + 2].type === 'punct' &&
          tokens[i + 2].value === '='
        ) {
          const aliasName = tokens[i + 1].value;
          declIndices.add(i + 1);
          let p = i + 3;
          let globalQual = false;
          if (p < end && tokens[p].type === 'punct' && tokens[p].value === '::') {
            globalQual = true;
            p++;
          }
          /** @type {string[]} */
          const parts = [];
          while (p < end && tokens[p].type === 'ident') {
            parts.push(tokens[p].value);
            p++;
            if (p < end && tokens[p].type === 'punct' && tokens[p].value === '::') p++;
            else break;
          }
          if (parts.length > 0) {
            scope.namespaceAliases.set(aliasName, resolveNamespaceParts(scope, parts, globalQual));
          }
          while (p < end && !(tokens[p].type === 'punct' && tokens[p].value === ';')) p++;
          i = p + 1;
          continue;
        }

        // `namespace foo[::bar] { ... }` or anonymous `namespace { ... }`
        let p = i + 1;
        /** @type {string[]} */
        const nsParts = [];
        while (p < end && tokens[p].type === 'ident') {
          nsParts.push(tokens[p].value);
          scope.userNamespaces.add(tokens[p].value);
          allUserNamespaces.add(tokens[p].value);
          declIndices.add(p);
          p++;
          if (p < end && tokens[p].type === 'punct' && tokens[p].value === '::') p++;
          else break;
        }
        if (p < end && tokens[p].type === 'punct' && tokens[p].value === '{') {
          const closeBrace = findMatchingDelim(tokens, p, '{', '}');
          if (closeBrace !== -1 && closeBrace < end) {
            const subPath = nsParts.join('::');
            const fullPath =
              scope.nsPath && subPath ? `${scope.nsPath}::${subPath}` : scope.nsPath || subPath;
            if (fullPath) allUserNamespaces.add(fullPath);
            const nsScope = createScope(scope, 'namespace', fullPath);
            walkRange(p + 1, closeBrace, nsScope);
            tokenScopes[closeBrace] = scope;
            i = closeBrace + 1;
            continue;
          }
        }
      }

      // 3. `using` directives, `using` type aliases, and `using` declarations
      if (tok.type === 'ident' && tok.value === 'using') {
        let semi = i + 1;
        while (semi < end && !(tokens[semi].type === 'punct' && tokens[semi].value === ';')) semi++;

        // `using namespace ...;`
        if (i + 1 < semi && tokens[i + 1].type === 'ident' && tokens[i + 1].value === 'namespace') {
          let p = i + 2;
          let globalQual = false;
          if (p < semi && tokens[p].type === 'punct' && tokens[p].value === '::') {
            globalQual = true;
            p++;
          }
          /** @type {string[]} */
          const parts = [];
          while (p < semi && tokens[p].type === 'ident') {
            parts.push(tokens[p].value);
            p++;
            if (p < semi && tokens[p].type === 'punct' && tokens[p].value === '::') p++;
            else break;
          }
          if (parts.length > 0) {
            const resolved = resolveNamespaceParts(scope, parts, globalQual);
            if (!scope.usingNamespaces.includes(resolved)) {
              scope.usingNamespaces.push(resolved);
            }
          }
          i = semi + 1;
          continue;
        }

        // `using Alias = RHS;`
        if (
          i + 2 < semi &&
          tokens[i + 1].type === 'ident' &&
          tokens[i + 2].type === 'punct' &&
          tokens[i + 2].value === '='
        ) {
          const aliasName = tokens[i + 1].value;
          declIndices.add(i + 1);
          scope.userTypes.add(aliasName);
          scope.aliases.set(aliasName, {
            rhsTokens: tokens.slice(i + 3, semi),
            scope,
            line: tok.line,
          });
          i = semi + 1;
          continue;
        }

        // `using ns::name;`
        let p = i + 1;
        let globalQual = false;
        if (p < semi && tokens[p].type === 'punct' && tokens[p].value === '::') {
          globalQual = true;
          p++;
        }
        /** @type {number[]} */
        const partIndices = [];
        while (p < semi && tokens[p].type === 'ident') {
          partIndices.push(p);
          p++;
          if (p < semi && tokens[p].type === 'punct' && tokens[p].value === '::') p++;
          else break;
        }
        if (partIndices.length >= 2) {
          const leafIdx = partIndices[partIndices.length - 1];
          const leaf = tokens[leafIdx].value;
          const prefixParts = partIndices.slice(0, -1).map((idx) => tokens[idx].value);
          const resolvedPrefix = resolveNamespaceParts(scope, prefixParts, globalQual);
          declIndices.add(leafIdx);
          scope.usingDecls.set(leaf, { target: `${resolvedPrefix}::${leaf}`, line: tok.line });
        }
        i = semi + 1;
        continue;
      }

      // 4. `typedef RHS AliasName;`
      if (tok.type === 'ident' && tok.value === 'typedef') {
        let semi = i + 1;
        let braceDepth = 0;
        while (semi < end) {
          if (tokens[semi].type === 'punct') {
            if (tokens[semi].value === '{') braceDepth++;
            else if (tokens[semi].value === '}') braceDepth = Math.max(0, braceDepth - 1);
            else if (braceDepth === 0 && tokens[semi].value === ';') break;
          }
          semi++;
        }
        if (semi < end) {
          // Find alias identifier (either before `;`/`[` or inside `(*AliasName)(...)`)
          let aliasIdx = -1;
          let k = semi - 1;
          while (k > i && tokens[k].type === 'punct' && tokens[k].value === ']') {
            while (k > i && !(tokens[k].type === 'punct' && tokens[k].value === '[')) k--;
            k--;
          }
          if (k > i && tokens[k].type === 'ident' && !CPP_KEYWORDS.has(tokens[k].value)) {
            aliasIdx = k;
          } else if (k > i && tokens[k].type === 'punct' && tokens[k].value === ')') {
            // Function pointer typedef `typedef Ret (*Alias)(Args);`
            const openArgs = findMatchingDelimLeft(tokens, k, '(', ')');
            if (
              openArgs > i + 1 &&
              tokens[openArgs - 1].type === 'punct' &&
              tokens[openArgs - 1].value === ')'
            ) {
              const openPtr = findMatchingDelimLeft(tokens, openArgs - 1, '(', ')');
              for (let m = openArgs - 2; m > openPtr; m--) {
                if (tokens[m].type === 'ident' && !CPP_KEYWORDS.has(tokens[m].value)) {
                  aliasIdx = m;
                  break;
                }
              }
            }
          }
          if (aliasIdx !== -1) {
            const aliasName = tokens[aliasIdx].value;
            declIndices.add(aliasIdx);
            scope.userTypes.add(aliasName);
            const rhsTokens = tokens
              .slice(i + 1, semi)
              .filter((_, idx) => i + 1 + idx !== aliasIdx);
            scope.aliases.set(aliasName, { rhsTokens, scope, line: tok.line });
          }
          i = semi + 1;
          continue;
        }
      }

      // 5. `class` / `struct` / `union` / `enum` definitions
      if (
        tok.type === 'ident' &&
        (tok.value === 'class' ||
          tok.value === 'struct' ||
          tok.value === 'union' ||
          tok.value === 'enum')
      ) {
        let p = i + 1;
        if (
          tok.value === 'enum' &&
          p < end &&
          tokens[p].type === 'ident' &&
          tokens[p].value === 'class'
        ) {
          p++;
        }
        let nameIdx = -1;
        if (p < end && tokens[p].type === 'ident' && !CPP_KEYWORDS.has(tokens[p].value)) {
          nameIdx = p;
          p++;
        }
        // Scan for `{` (definition) before `;` or `(`
        let bodyOpen = -1;
        let scan = p;
        while (scan < end) {
          if (tokens[scan].type === 'punct') {
            if (tokens[scan].value === '{') {
              bodyOpen = scan;
              break;
            }
            if (
              tokens[scan].value === ';' ||
              tokens[scan].value === '(' ||
              tokens[scan].value === '='
            ) {
              break;
            }
          }
          scan++;
        }
        if (
          nameIdx !== -1 &&
          (bodyOpen !== -1 || (tokens[scan]?.type === 'punct' && tokens[scan]?.value === ';'))
        ) {
          declIndices.add(nameIdx);
          scope.userTypes.add(tokens[nameIdx].value);
        }
        if (bodyOpen !== -1) {
          const bodyClose = findMatchingDelim(tokens, bodyOpen, '{', '}');
          if (bodyClose !== -1 && bodyClose < end) {
            const classScope = createScope(
              scope,
              tok.value === 'enum' ? 'block' : 'class',
              scope.nsPath,
            );
            walkRange(bodyOpen + 1, bodyClose, classScope);
            if (tok.value !== 'enum') {
              for (const fnName of classScope.userFunctions.keys()) userClassMembers.add(fnName);
              for (const varName of classScope.userVars) userClassMembers.add(varName);
            }
            tokenScopes[bodyClose] = scope;
            i = bodyClose + 1;
            continue;
          }
        }
      }

      // 6. `for (...)` loop scope (handles both `for (int i = 0; ...)` and range-for `for (auto& x : a)`)
      if (
        tok.type === 'ident' &&
        tok.value === 'for' &&
        i + 1 < end &&
        tokens[i + 1].type === 'punct' &&
        tokens[i + 1].value === '('
      ) {
        const closeParen = findMatchingDelim(tokens, i + 1, '(', ')');
        if (closeParen !== -1 && closeParen < end) {
          const forScope = createScope(scope, 'block', scope.nsPath);
          for (let k = i + 1; k <= closeParen; k++) tokenScopes[k] = forScope;
          // Extract loop variable(s) declared inside `for (...)`
          const afterType = consumeTypeSpecifier(tokens, i + 2, closeParen, forScope);
          if (afterType !== -1 && afterType < closeParen && tokens[afterType].type === 'ident') {
            declIndices.add(afterType);
            forScope.userVars.add(tokens[afterType].value);
          }
          const bodyStart = closeParen + 1;
          if (
            bodyStart < end &&
            tokens[bodyStart].type === 'punct' &&
            tokens[bodyStart].value === '{'
          ) {
            const closeBrace = findMatchingDelim(tokens, bodyStart, '{', '}');
            if (closeBrace !== -1 && closeBrace < end) {
              walkRange(bodyStart + 1, closeBrace, forScope);
              tokenScopes[closeBrace] = forScope;
              i = closeBrace + 1;
              continue;
            }
          }
          i = bodyStart;
          continue;
        }
      }

      // 7. Function declarations/definitions & variable declarations starting with a type specifier
      const atStmtStart =
        i === start ||
        (tokens[i - 1].type === 'punct' &&
          (tokens[i - 1].value === ';' ||
            tokens[i - 1].value === '{' ||
            tokens[i - 1].value === '}' ||
            tokens[i - 1].value === ':'));

      if (atStmtStart) {
        // Skip optional `template <...>` prefix
        let declStart = i;
        if (
          tokens[declStart].type === 'ident' &&
          tokens[declStart].value === 'template' &&
          declStart + 1 < end &&
          tokens[declStart + 1].type === 'punct' &&
          tokens[declStart + 1].value === '<'
        ) {
          const endAngle = findMatchingAngle(tokens, declStart + 1);
          if (endAngle !== -1 && endAngle < end) {
            declStart = endAngle + 1;
          }
        }

        const afterType = consumeTypeSpecifier(tokens, declStart, end, scope);
        if (afterType !== -1 && afterType < end && tokens[afterType].type === 'ident') {
          const nameTok = tokens[afterType];
          if (!CPP_KEYWORDS.has(nameTok.value)) {
            // 7a. Function definition or forward declaration: `Type funcName(params...)`
            if (
              afterType + 1 < end &&
              tokens[afterType + 1].type === 'punct' &&
              tokens[afterType + 1].value === '('
            ) {
              const closeParen = findMatchingDelim(tokens, afterType + 1, '(', ')');
              if (closeParen !== -1 && closeParen < end) {
                let post = closeParen + 1;
                // Skip trailing `const`, `noexcept`, `override`, `final`, `-> RetType`
                while (post < end) {
                  const pt = tokens[post];
                  if (
                    pt.type === 'ident' &&
                    (pt.value === 'const' ||
                      pt.value === 'noexcept' ||
                      pt.value === 'override' ||
                      pt.value === 'final')
                  ) {
                    post++;
                    continue;
                  }
                  if (pt.type === 'punct' && pt.value === '->') {
                    const afterTrail = consumeTypeSpecifier(tokens, post + 1, end, scope);
                    if (afterTrail !== -1) {
                      post = afterTrail;
                      continue;
                    }
                  }
                  break;
                }

                if (post < end && tokens[post].type === 'punct' && tokens[post].value === '{') {
                  const closeBrace = findMatchingDelim(tokens, post, '{', '}');
                  if (closeBrace !== -1 && closeBrace < end) {
                    const parsedParams = parseFunctionParams(tokens, afterType + 1, closeParen);
                    declIndices.add(afterType);
                    for (const pIdx of parsedParams.paramNameIndices) declIndices.add(pIdx);
                    addUserFunction(scope, nameTok.value, {
                      minArgs: parsedParams.minArgs,
                      maxArgs: parsedParams.maxArgs,
                    });
                    if (scope.kind === 'class') userClassMembers.add(nameTok.value);

                    const fnScope = createScope(scope, 'function', scope.nsPath);
                    for (const pName of parsedParams.paramNames) fnScope.userVars.add(pName);
                    for (let k = afterType + 1; k <= post; k++) tokenScopes[k] = fnScope;
                    walkRange(post + 1, closeBrace, fnScope);
                    tokenScopes[closeBrace] = scope;
                    i = closeBrace + 1;
                    continue;
                  }
                } else if (
                  (scope.kind === 'namespace' || scope.kind === 'class') &&
                  post < end &&
                  tokens[post].type === 'punct' &&
                  tokens[post].value === ';'
                ) {
                  // Forward function declaration OR global direct-initialized variable `vector<int> v(n);`
                  const parsedParams = parseFunctionParams(tokens, afterType + 1, closeParen);
                  declIndices.add(afterType);
                  for (const pIdx of parsedParams.paramNameIndices) declIndices.add(pIdx);
                  addUserFunction(scope, nameTok.value, {
                    minArgs: parsedParams.minArgs,
                    maxArgs: parsedParams.maxArgs,
                  });
                  scope.userVars.add(nameTok.value);
                  if (scope.kind === 'class') userClassMembers.add(nameTok.value);
                  i = post + 1;
                  continue;
                }
              }
            }

            // 7b. Variable declaration list: `Type var1 [= init1], *var2 [= init2];`
            let scan = afterType;
            let semi = afterType;
            let pDepth = 0;
            let bDepth = 0;
            let braceDepth = 0;
            while (semi < end) {
              const t = tokens[semi];
              if (t.type === 'punct') {
                if (t.value === '(') pDepth++;
                else if (t.value === ')') pDepth = Math.max(0, pDepth - 1);
                else if (t.value === '[') bDepth++;
                else if (t.value === ']') bDepth = Math.max(0, bDepth - 1);
                else if (t.value === '{') braceDepth++;
                else if (t.value === '}') {
                  if (braceDepth === 0) break;
                  braceDepth--;
                } else if (pDepth === 0 && bDepth === 0 && braceDepth === 0 && t.value === ';') {
                  break;
                }
              }
              semi++;
            }

            if (semi < end && tokens[semi].value === ';') {
              // Extract comma-separated declarators in `afterType..semi`
              while (scan < semi) {
                while (
                  scan < semi &&
                  tokens[scan].type === 'punct' &&
                  (tokens[scan].value === '*' ||
                    tokens[scan].value === '&' ||
                    tokens[scan].value === '&&')
                ) {
                  scan++;
                }
                if (
                  scan < semi &&
                  tokens[scan].type === 'ident' &&
                  !CPP_KEYWORDS.has(tokens[scan].value)
                ) {
                  const varIdx = scan;
                  const varName = tokens[varIdx].value;
                  declIndices.add(varIdx);
                  scope.userVars.add(varName);
                  if (scope.kind === 'class') userClassMembers.add(varName);
                  scan++;

                  // Skip array bounds `[N]` or constructor args `(...)`
                  while (
                    scan < semi &&
                    tokens[scan].type === 'punct' &&
                    (tokens[scan].value === '[' || tokens[scan].value === '(')
                  ) {
                    const closeCh = tokens[scan].value === '[' ? ']' : ')';
                    const closeIdx = findMatchingDelim(tokens, scan, tokens[scan].value, closeCh);
                    if (closeIdx === -1 || closeIdx >= semi) {
                      scan = semi;
                      break;
                    }
                    scan = closeIdx + 1;
                  }

                  // Check `= initExpr` for function-pointer / lambda / container aliases
                  if (scan < semi && tokens[scan].type === 'punct' && tokens[scan].value === '=') {
                    const initStart = scan + 1;
                    let initEnd = initStart;
                    let ip = 0;
                    let ib = 0;
                    let ic = 0;
                    while (initEnd < semi) {
                      const it = tokens[initEnd];
                      if (it.type === 'punct') {
                        if (it.value === '(') ip++;
                        else if (it.value === ')') ip = Math.max(0, ip - 1);
                        else if (it.value === '[') ib++;
                        else if (it.value === ']') ib = Math.max(0, ib - 1);
                        else if (it.value === '{') ic++;
                        else if (it.value === '}') ic = Math.max(0, ic - 1);
                        else if (ip === 0 && ib === 0 && ic === 0 && it.value === ',') break;
                      }
                      initEnd++;
                    }
                    scope.aliases.set(varName, {
                      rhsTokens: tokens.slice(initStart, initEnd),
                      scope,
                      line: tokens[varIdx].line,
                    });
                    // Walk inside lambda bodies `{ ... }` within `initStart..initEnd`
                    for (let m = initStart; m < initEnd; m++) {
                      if (tokens[m].type === 'punct' && tokens[m].value === '{') {
                        const cb = findMatchingDelim(tokens, m, '{', '}');
                        if (cb !== -1 && cb <= initEnd) {
                          const lamScope = createScope(scope, 'function', scope.nsPath);
                          walkRange(m + 1, cb, lamScope);
                          m = cb;
                        }
                      }
                    }
                    scan = initEnd;
                  }
                }
                // Advance to next top-level `,`
                while (
                  scan < semi &&
                  !(tokens[scan].type === 'punct' && tokens[scan].value === ',')
                ) {
                  if (tokens[scan].type === 'punct' && tokens[scan].value === '{') {
                    const cb = findMatchingDelim(tokens, scan, '{', '}');
                    if (cb !== -1 && cb < semi) {
                      scan = cb + 1;
                      continue;
                    }
                  }
                  scan++;
                }
                if (scan < semi && tokens[scan].value === ',') scan++;
              }
              i = semi + 1;
              continue;
            }
          }
        }
      }

      // 8. Plain nested block `{ ... }`
      if (tok.type === 'punct' && tok.value === '{') {
        const closeBrace = findMatchingDelim(tokens, i, '{', '}');
        if (closeBrace !== -1 && closeBrace < end) {
          const blockScope = createScope(scope, 'block', scope.nsPath);
          walkRange(i + 1, closeBrace, blockScope);
          tokenScopes[closeBrace] = scope;
          i = closeBrace + 1;
          continue;
        }
      }

      i++;
    }
  }

  walkRange(0, tokens.length, rootScope);
  return { rootScope, tokenScopes, declIndices, userClassMembers, allUserNamespaces };
}

/**
 * Finds the matching opening delimiter to the left of `closeIdx`.
 *
 * @param {Token[]} tokens
 * @param {number} closeIdx
 * @param {string} openCh
 * @param {string} closeCh
 * @returns {number}
 */
function findMatchingDelimLeft(tokens, closeIdx, openCh, closeCh) {
  let depth = 0;
  for (let i = closeIdx; i >= 0; i--) {
    if (tokens[i].type === 'punct') {
      if (tokens[i].value === closeCh) depth++;
      else if (tokens[i].value === openCh) {
        depth--;
        if (depth === 0) return i;
      }
    }
  }
  return -1;
}

/**
 * Collects all active `using namespace` prefixes visible from `scope`.
 *
 * @param {Scope} scope
 * @returns {Set<string>}
 */
function getActiveUsingNamespaces(scope) {
  const active = new Set();
  /** @type {Scope | null} */
  let cur = scope;
  while (cur !== null) {
    for (const ns of cur.usingNamespaces) active.add(ns);
    cur = cur.parent;
  }
  return active;
}

/**
 * Looks up a `using ns::name;` declaration in `scope` or enclosing scopes.
 *
 * @param {Scope} scope
 * @param {string} name
 * @returns {{ target: string, line: number } | null}
 */
function lookupUsingDecl(scope, name) {
  /** @type {Scope | null} */
  let cur = scope;
  while (cur !== null) {
    const d = cur.usingDecls.get(name);
    if (d) return d;
    cur = cur.parent;
  }
  return null;
}

/**
 * Looks up a `typedef` / `using Alias = ...` / `auto fn = ...` alias in `scope` or enclosing scopes.
 *
 * @param {Scope} scope
 * @param {string} name
 * @returns {{ rhsTokens: Token[], scope: Scope, line: number } | null}
 */
function lookupAlias(scope, name) {
  /** @type {Scope | null} */
  let cur = scope;
  while (cur !== null) {
    const a = cur.aliases.get(name);
    if (a) return a;
    cur = cur.parent;
  }
  return null;
}

/**
 * Checks whether an unqualified identifier `name` at `identIdx` in `tokens` is shadowed
 * by a user-declared variable, type, or matching-arity function in `scope`.
 *
 * @param {Scope} scope
 * @param {string} name
 * @param {Token[]} tokens
 * @param {number} identIdx
 * @returns {boolean}
 */
function isShadowedByUserSymbol(scope, name, tokens, identIdx) {
  // Check if followed by `(` (or `<...>()`) indicating a function call
  let callParenIdx = -1;
  let nextIdx = identIdx + 1;
  if (
    nextIdx < tokens.length &&
    tokens[nextIdx].type === 'punct' &&
    tokens[nextIdx].value === '<'
  ) {
    const endAngle = findMatchingAngle(tokens, nextIdx);
    if (endAngle !== -1) nextIdx = endAngle + 1;
  }
  if (
    nextIdx < tokens.length &&
    tokens[nextIdx].type === 'punct' &&
    tokens[nextIdx].value === '('
  ) {
    callParenIdx = nextIdx;
  }

  /** @type {Scope | null} */
  let cur = scope;
  while (cur !== null) {
    if (cur.userTypes.has(name)) return true;
    if (cur.userVars.has(name) && callParenIdx === -1) return true;

    const fnSigs = cur.userFunctions.get(name);
    if (fnSigs && fnSigs.length > 0) {
      if (callParenIdx === -1) return true;
      const argCount = countCallArgs(tokens, callParenIdx);
      if (fnSigs.some((sig) => argCount >= sig.minArgs && argCount <= sig.maxArgs)) {
        return true;
      }
    }

    cur = cur.parent;
  }
  return false;
}

/**
 * Scans a token slice for occurrences of a single banned target `target` inside a given `defaultScope`
 * (or per-token `tokenScopes`), expanding `#define` macros and `typedef`/`using`/`auto` aliases.
 *
 * @param {{
 *   target: string,
 *   tokens: Token[],
 *   tokenScopes: Scope[] | null,
 *   defaultScope: Scope,
 *   declIndices: Set<number> | null,
 *   includes: Array<{ header: string, line: number }>,
 *   macros: Map<string, MacroDef>,
 *   userClassMembers: Set<string>,
 *   allUserNamespaces: Set<string>,
 *   visitedMacros: Set<string>,
 *   visitedAliases: Set<string>
 * }} ctx
 * @returns {number[]} 1-based violation line numbers
 */
function scanTokensForTarget(ctx) {
  const {
    target,
    tokens,
    tokenScopes,
    defaultScope,
    declIndices,
    includes,
    macros,
    userClassMembers,
    allUserNamespaces,
    visitedMacros,
    visitedAliases,
  } = ctx;

  /** @type {number[]} */
  const hitLines = [];

  // Category 1: Header target (`<bits/stdc++.h>` or `"..."`)
  if (
    (target.startsWith('<') && target.endsWith('>')) ||
    (target.startsWith('"') && target.endsWith('"'))
  ) {
    for (const inc of includes) {
      if (inc.header === target) hitLines.push(inc.line);
    }
    return hitLines;
  }

  const isNewArray = target === 'new[]';
  const isDeleteArray = target === 'delete[]';
  const isKeywordTarget = isNewArray || isDeleteArray || CPP_KEYWORDS.has(target);
  const normalizedTarget = target.startsWith('::') ? target.slice(2) : target;
  const isQualifiedTarget = !isKeywordTarget && normalizedTarget.includes('::');
  const targetParts = isQualifiedTarget ? normalizedTarget.split('::') : [normalizedTarget];
  const targetPrefix = isQualifiedTarget ? targetParts.slice(0, -1).join('::') : '';
  const targetLeaf = targetParts[targetParts.length - 1];

  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];
    const scope = tokenScopes ? tokenScopes[i] : defaultScope;

    // Expand `#define` macro invocations in any category
    if (tok.type === 'ident' && macros.has(tok.value) && !visitedMacros.has(tok.value)) {
      const macro = macros.get(tok.value);
      if (macro) {
        const isCallOk =
          macro.params === null ||
          (i + 1 < tokens.length && tokens[i + 1].type === 'punct' && tokens[i + 1].value === '(');
        if (isCallOk) {
          const nextVisited = new Set(visitedMacros);
          nextVisited.add(tok.value);
          const subHits = scanTokensForTarget({
            ...ctx,
            tokens: macro.bodyTokens,
            tokenScopes: null,
            defaultScope: scope,
            declIndices: null,
            visitedMacros: nextVisited,
          });
          if (subHits.length > 0) {
            hitLines.push(macro.line, tok.line, ...subHits);
          }
        }
      }
    }

    // Category 2: C++ Keyword / `new[]` / `delete[]`
    if (isKeywordTarget) {
      if (isNewArray) {
        if (tok.type === 'ident' && tok.value === 'new') {
          let k = i + 1;
          while (
            k < tokens.length &&
            !(
              tokens[k].type === 'punct' &&
              (tokens[k].value === ';' || tokens[k].value === ',' || tokens[k].value === ')')
            )
          ) {
            if (tokens[k].type === 'punct' && tokens[k].value === '[') {
              hitLines.push(tok.line);
              break;
            }
            k++;
          }
        }
      } else if (isDeleteArray) {
        if (
          tok.type === 'ident' &&
          tok.value === 'delete' &&
          i + 2 < tokens.length &&
          tokens[i + 1].type === 'punct' &&
          tokens[i + 1].value === '[' &&
          tokens[i + 2].type === 'punct' &&
          tokens[i + 2].value === ']'
        ) {
          hitLines.push(tok.line);
        }
      } else if (tok.type === 'ident' && tok.value === target) {
        hitLines.push(tok.line);
      }
      i++;
      continue;
    }

    // Follow `typedef` / `using Alias = ...` / `auto fn = ...` tainted aliases on usage
    if (
      tok.type === 'ident' &&
      !(declIndices && declIndices.has(i)) &&
      !visitedAliases.has(tok.value)
    ) {
      const prev = i > 0 ? tokens[i - 1] : null;
      const isMember =
        prev !== null && prev.type === 'punct' && (prev.value === '.' || prev.value === '->');
      if (!isMember) {
        const aliasEntry = lookupAlias(scope, tok.value);
        if (aliasEntry) {
          const nextVisitedAliases = new Set(visitedAliases);
          nextVisitedAliases.add(tok.value);
          const aliasHits = scanTokensForTarget({
            ...ctx,
            tokens: aliasEntry.rhsTokens,
            tokenScopes: null,
            defaultScope: aliasEntry.scope,
            declIndices: null,
            visitedAliases: nextVisitedAliases,
          });
          if (aliasHits.length > 0) {
            hitLines.push(aliasEntry.line, tok.line, ...aliasHits);
          }
        }
      }
    }

    // Parse qualified chain `[::] id1 :: id2 :: ... :: idN`
    const prevTok = i > 0 ? tokens[i - 1] : null;
    const precededByMemberOp =
      prevTok !== null &&
      prevTok.type === 'punct' &&
      (prevTok.value === '.' ||
        prevTok.value === '->' ||
        prevTok.value === '.*' ||
        prevTok.value === '->*');

    if (
      !precededByMemberOp &&
      ((tok.type === 'punct' &&
        tok.value === '::' &&
        i + 1 < tokens.length &&
        tokens[i + 1].type === 'ident') ||
        tok.type === 'ident')
    ) {
      let globalQual = false;
      let p = i;
      if (tokens[p].type === 'punct' && tokens[p].value === '::') {
        globalQual = true;
        p++;
      }

      /** @type {number[]} */
      const chainIndices = [];
      while (p < tokens.length && tokens[p].type === 'ident') {
        chainIndices.push(p);
        if (
          p + 2 < tokens.length &&
          tokens[p + 1].type === 'punct' &&
          tokens[p + 1].value === '::' &&
          tokens[p + 2].type === 'ident'
        ) {
          p += 2;
        } else {
          break;
        }
      }

      if (chainIndices.length >= 2 || globalQual) {
        const chainNames = chainIndices.map((idx) => tokens[idx].value);
        const leafIdx = chainIndices[chainIndices.length - 1];
        const leafName = chainNames[chainNames.length - 1];
        const lineNum = tokens[leafIdx].line;

        if (isQualifiedTarget) {
          if (chainIndices.length >= 2 && leafName === targetLeaf) {
            const prefixNames = chainNames.slice(0, -1);
            const resolvedPrefix = resolveNamespaceParts(scope, prefixNames, globalQual);
            if (resolvedPrefix === targetPrefix) {
              hitLines.push(lineNum);
            } else if (!globalQual && !allUserNamespaces.has(prefixNames[0])) {
              const activeNs = getActiveUsingNamespaces(scope);
              for (const ns of activeNs) {
                if (`${ns}::${resolvedPrefix}` === targetPrefix) {
                  hitLines.push(lineNum);
                  break;
                }
              }
            }
          }
        } else if (leafName === targetLeaf) {
          // Unqualified target (`qsort`, `__gcd`, `rbegin`, etc.) called as `::qsort` or `std::qsort`
          if (globalQual && chainIndices.length === 1) {
            if (!isShadowedByUserSymbol(scope, leafName, tokens, leafIdx)) {
              hitLines.push(lineNum);
            }
          } else if (chainIndices.length >= 2) {
            const resolvedPrefix = resolveNamespaceParts(
              scope,
              chainNames.slice(0, -1),
              globalQual,
            );
            if (resolvedPrefix === 'std' || resolvedPrefix === 'std::ranges') {
              hitLines.push(lineNum);
            }
          }
        }

        i = leafIdx + 1;
        continue;
      }
    }

    // Single identifier (`tok.type === 'ident'`)
    if (tok.type === 'ident' && tok.value === targetLeaf) {
      const isDeclSite = Boolean(declIndices && declIndices.has(i));
      if (!isDeclSite) {
        if (isQualifiedTarget) {
          // Category 3b: Unqualified reference to a namespace-qualified target (`std::sort`, `std::vector`)
          if (!precededByMemberOp) {
            const usingDecl = lookupUsingDecl(scope, targetLeaf);
            if (usingDecl && usingDecl.target === normalizedTarget) {
              hitLines.push(usingDecl.line, tok.line);
            } else {
              const activeNs = getActiveUsingNamespaces(scope);
              if (
                activeNs.has(targetPrefix) &&
                !isShadowedByUserSymbol(scope, targetLeaf, tokens, i)
              ) {
                hitLines.push(tok.line);
              }
            }
          }
        } else {
          // Category 4: Unqualified target (`rbegin`, `rend`, `qsort`, `bsearch`, `__gcd`)
          if (precededByMemberOp) {
            if (!userClassMembers.has(targetLeaf)) {
              hitLines.push(tok.line);
            }
          } else if (!isShadowedByUserSymbol(scope, targetLeaf, tokens, i)) {
            hitLines.push(tok.line);
          }
        }
      }
    }

    i++;
  }

  return hitLines;
}

/**
 * Evaluates a ban-list constraint using C++17 lexical, preprocessor, and scope/AST resolution.
 * Returns `null` if the constraint is semantic (not a ban-list rule) so the pipeline routes it to the LLM.
 *
 * @param {{ id: string, text: string }} constraint
 * @param {string} rawCode
 * @returns {Promise<{ verdict: 'pass' | 'violation', evidence: Array<{ line: number, text: string }> } | null>}
 */
export async function evaluateHardRule(constraint, rawCode) {
  const { isBanList, bannedTargets } = parseBanListConstraint(constraint.text);
  if (!isBanList) {
    return null;
  }

  const normalized = String(rawCode).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const originalLines = normalized.split('\n');
  const { tokens, includes, macros } = tokenizeCpp(normalized);
  const { rootScope, tokenScopes, declIndices, userClassMembers, allUserNamespaces } =
    analyzeProgram(tokens);

  /** @type {Set<number>} */
  const violationLineSet = new Set();

  for (const target of bannedTargets) {
    // 1. Scan normal code (including macro invocations and alias usages)
    const codeHits = scanTokensForTarget({
      target,
      tokens,
      tokenScopes,
      defaultScope: rootScope,
      declIndices,
      includes,
      macros,
      userClassMembers,
      allUserNamespaces,
      visitedMacros: new Set(),
      visitedAliases: new Set(),
    });
    for (const ln of codeHits) {
      if (ln >= 1 && ln <= originalLines.length) violationLineSet.add(ln);
    }

    // 2. Also flag standalone `#define` macros whose body explicitly contains a banned keyword/qualified target
    for (const macro of macros.values()) {
      const macroHits = scanTokensForTarget({
        target,
        tokens: macro.bodyTokens,
        tokenScopes: null,
        defaultScope: rootScope,
        declIndices: null,
        includes: [],
        macros,
        userClassMembers,
        allUserNamespaces,
        visitedMacros: new Set([macro.name]),
        visitedAliases: new Set(),
      });
      if (macroHits.length > 0 && macro.line >= 1 && macro.line <= originalLines.length) {
        violationLineSet.add(macro.line);
      }
    }
  }

  if (violationLineSet.size === 0) {
    return { verdict: 'pass', evidence: [] };
  }

  const sortedLines = Array.from(violationLineSet).sort((a, b) => a - b);
  const evidence = sortedLines.map((line) => ({
    line,
    text: originalLines[line - 1],
  }));

  return {
    verdict: 'violation',
    evidence,
  };
}
