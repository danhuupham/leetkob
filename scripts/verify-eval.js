// Verifies that the published LeeTKOB dev-set evaluation files remain byte-for-byte
// identical to fithcmus/awad-leetkob-eval (PA#3 & PA#4 rubrics).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const EXPECTED_SHA256 = [
  ['leetkob-eval/eval.mjs', 'c836edd8713521bbbd3c9c8299b5f0893cdbac0efab2209d6ae4397234516aa7'],
  ['leetkob-eval/labels.jsonl', '262cda7b0ef5612e192cd6197e1df31a4e8af52c8da0ccceeb75f2b1e56ca47f'],
];

const ROOT = fileURLToPath(new URL('..', import.meta.url));

export function verifyEvalIntegrity(root = ROOT) {
  for (const [relPath, expected] of EXPECTED_SHA256) {
    const bytes = readFileSync(resolve(root, relPath));
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (actual !== expected) {
      throw new Error(
        `${relPath} SHA-256 mismatch: expected ${expected.slice(0, 16)}..., got ${actual.slice(0, 16)}...`,
      );
    }
  }
}

const isMain =
  process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);

if (isMain) {
  verifyEvalIntegrity();
  console.log('leetkob-eval SHA-256 integrity verified (eval.mjs & labels.jsonl intact)');
}
