// C++17 comment and student PII sanitizer with strict 1:1 line preservation.
// Every newline in rawCode stays at the exact same index so line numbers never shift.

const RAW_PREFIXES = new Set(['R', 'u8R', 'uR', 'UR', 'LR']);
const CHAR_PREFIXES = new Set(['u', 'U', 'L', 'u8']);
const SAFE_NUMERIC_CONSTANTS = new Set(['998244353', '2147483647', '4294967295']);

/**
 * @param {string} ch
 * @returns {boolean}
 */
function isIdentOrDigit(ch) {
  const c = ch.charCodeAt(0);
  return (
    (c >= 48 && c <= 57) || // 0-9
    (c >= 65 && c <= 90) || // A-Z
    (c >= 97 && c <= 122) || // a-z
    c === 95 // _
  );
}

/**
 * Extracts the contiguous ASCII identifier/number token immediately preceding `index`.
 *
 * @param {string} src
 * @param {number} index
 * @returns {string}
 */
function readPrecedingWord(src, index) {
  let start = index;
  while (start > 0 && isIdentOrDigit(src[start - 1])) {
    start--;
  }
  return src.slice(start, index);
}

/**
 * Checks whether a numeric token is a standard competitive-programming bound or modulus
 * rather than a student ID (e.g., 10000000, 10000005, 1000000007).
 *
 * @param {string} digits
 * @returns {boolean}
 */
function isSafeNumericConstant(digits) {
  if (SAFE_NUMERIC_CONSTANTS.has(digits)) return true;
  return /^10+(?:[579])?$/.test(digits);
}

/**
 * Replaces every character except `\n` in `chars[start..end)` with `' '`.
 *
 * @param {string[]} chars
 * @param {number} start
 * @param {number} end
 */
function blankSpan(chars, start, end) {
  for (let k = start; k < end; k++) {
    if (chars[k] !== '\n') {
      chars[k] = ' ';
    }
  }
}

/**
 * Applies regex matches on `text` by blanking matched ranges in `chars` offset by `baseOffset`.
 *
 * @param {string[]} chars
 * @param {string} text
 * @param {number} baseOffset
 * @param {RegExp} pattern
 * @param {(match: RegExpExecArray) => boolean} [shouldScrub]
 */
function scrubRegex(chars, text, baseOffset, pattern, shouldScrub) {
  pattern.lastIndex = 0;
  let m = pattern.exec(text);
  while (m !== null) {
    if (!shouldScrub || shouldScrub(m)) {
      blankSpan(chars, baseOffset + m.index, baseOffset + m.index + m[0].length);
    }
    m = pattern.exec(text);
  }
}

/**
 * @typedef {{
 *   originalLines: string[],
 *   strippedLines: string[],
 *   numberedPromptCode: string
 * }} SanitizedSource
 *
 * Strips all C++17 line/block comments (outside string and character literals) and
 * scrubs student PII while guaranteeing `originalLines.length === strippedLines.length`.
 *
 * @param {string} rawCode
 * @returns {SanitizedSource}
 */
export function sanitizeCode(rawCode) {
  const normalized = String(rawCode).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const originalLines = normalized.split('\n');
  const len = normalized.length;
  const out = Array.from(normalized);

  /** @type {Array<{ start: number, end: number }>} */
  const stringSpans = [];

  let i = 0;
  while (i < len) {
    const ch = normalized[i];
    const next = i + 1 < len ? normalized[i + 1] : '';

    // 1. Line comment `// ...` (including backslash-newline splicing)
    if (ch === '/' && next === '/') {
      out[i] = ' ';
      out[i + 1] = ' ';
      i += 2;
      while (i < len) {
        if (normalized[i] === '\n') {
          // Check if the last non-horizontal-whitespace char before '\n' in raw source was '\'
          let p = i - 1;
          while (p >= 0 && (normalized[p] === ' ' || normalized[p] === '\t')) {
            p--;
          }
          const spliced = p >= 0 && normalized[p] === '\\';
          i++;
          if (!spliced) break;
        } else {
          out[i] = ' ';
          i++;
        }
      }
      continue;
    }

    // 2. Block comment `/* ... */`
    if (ch === '/' && next === '*') {
      out[i] = ' ';
      out[i + 1] = ' ';
      i += 2;
      while (i < len) {
        if (normalized[i] === '*' && i + 1 < len && normalized[i + 1] === '/') {
          out[i] = ' ';
          out[i + 1] = ' ';
          i += 2;
          break;
        }
        if (normalized[i] !== '\n') {
          out[i] = ' ';
        }
        i++;
      }
      continue;
    }

    // 3. Raw string literal `R"delim(...)delim"` (with optional u8/u/U/L prefix)
    if (ch === '"') {
      const prefix = readPrecedingWord(normalized, i);
      if (RAW_PREFIXES.has(prefix)) {
        let p = i + 1;
        let validDelim = true;
        while (p < len && normalized[p] !== '(') {
          const dc = normalized[p];
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
        if (validDelim && p < len && normalized[p] === '(') {
          const delim = normalized.slice(i + 1, p);
          const closing = `)${delim}"`;
          const bodyStart = p + 1;
          const closeIdx = normalized.indexOf(closing, bodyStart);
          if (closeIdx !== -1) {
            stringSpans.push({ start: bodyStart, end: closeIdx });
            i = closeIdx + closing.length;
            continue;
          }
          stringSpans.push({ start: bodyStart, end: len });
          i = len;
          continue;
        }
      }

      // 4. Standard string literal `"..."`
      const bodyStart = i + 1;
      i++;
      while (i < len) {
        if (normalized[i] === '\\' && i + 1 < len) {
          i += 2;
          continue;
        }
        if (normalized[i] === '"' || normalized[i] === '\n') {
          break;
        }
        i++;
      }
      stringSpans.push({ start: bodyStart, end: i });
      if (i < len && normalized[i] === '"') i++;
      continue;
    }

    // 5. Character literal `'...'` (skipping C++14 digit separators like `1'000'000`)
    if (ch === "'") {
      const prevWord = readPrecedingWord(normalized, i);
      const isDigitSep = prevWord.length > 0 && !CHAR_PREFIXES.has(prevWord);
      if (!isDigitSep) {
        i++;
        while (i < len) {
          if (normalized[i] === '\\' && i + 1 < len) {
            i += 2;
            continue;
          }
          if (normalized[i] === "'" || normalized[i] === '\n') {
            if (normalized[i] === "'") i++;
            break;
          }
          i++;
        }
        continue;
      }
    }

    i++;
  }

  // Scrub PII inside string literals first (emails, explicit Author/MSSV tags, 7-10 digit IDs)
  for (const span of stringSpans) {
    const slice = out.slice(span.start, span.end).join('');
    scrubRegex(out, slice, span.start, /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g);
    scrubRegex(
      out,
      slice,
      span.start,
      /(?:Author|Student(?:\s*ID|\s*Name)?|MSSV|Full\s*Name|Ho\s*(?:va\s*)?ten)\s*[:=-][^\n"']*/gi,
    );
    scrubRegex(out, slice, span.start, /\b\d{7,10}\b/g);
  }

  // Scrub emails, identity labels, and non-bound student IDs anywhere in remaining text
  const currentText = out.join('');
  scrubRegex(out, currentText, 0, /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g);
  scrubRegex(
    out,
    currentText,
    0,
    /(?:Author|Student(?:\s*ID|\s*Name)?|MSSV|Full\s*Name|Ho\s*(?:va\s*)?ten)\s*[:=-][^\n"']*/gi,
  );
  scrubRegex(out, currentText, 0, /\b\d{7,10}\b/g, (m) => {
    if (isSafeNumericConstant(m[0])) return false;
    // Preserve array bounds inside `[10000005]`
    let before = m.index - 1;
    while (before >= 0 && (currentText[before] === ' ' || currentText[before] === '\t')) {
      before--;
    }
    let after = m.index + m[0].length;
    while (
      after < currentText.length &&
      (currentText[after] === ' ' || currentText[after] === '\t')
    ) {
      after++;
    }
    if (
      before >= 0 &&
      currentText[before] === '[' &&
      after < currentText.length &&
      currentText[after] === ']'
    ) {
      return false;
    }
    return true;
  });

  const strippedLines = out.join('').split('\n');
  const numberedPromptCode = strippedLines.map((line, idx) => `${idx + 1}: ${line}`).join('\n');

  return {
    originalLines,
    strippedLines,
    numberedPromptCode,
  };
}
