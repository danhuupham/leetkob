import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { checkSubmissionConstraints } from '../checker/pipeline.js';

const USAGE_TEXT =
  'Usage: node src/cli/check-dataset.js --data <dataset-folder> --out <predictions.jsonl|-> [--call-log <file.jsonl>] [--model <name>] [--concurrency <1..16>] [--delay-ms <0..60000>] [--help]';

/**
 * @typedef {{
 *   solutionId: string,
 *   problemId: string,
 *   statement: string,
 *   constraints: Array<{ id: string, text: string, deduction?: number }>,
 *   code: string
 * }} DatasetSubmissionItem
 *
 * @typedef {{
 *   dataDir: string,
 *   outPath: string,
 *   callLogPath: string | null,
 *   concurrency: number,
 *   delayMs: number,
 *   modelName: string | null,
 *   help: boolean
 * }} CheckerCliArgs
 */

/**
 * Parses CLI flags for `check-dataset.js`.
 *
 * @param {string[]} argv
 * @returns {CheckerCliArgs}
 */
export function parseCliArgs(argv) {
  /** @type {string | null} */
  let dataDir = null;
  /** @type {string | null} */
  let outPath = null;
  /** @type {string | null} */
  let callLogPath = null;
  /** @type {string | null} */
  let modelName = null;
  let concurrency = 4;
  let delayMs = 0;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      return {
        dataDir: '',
        outPath: '',
        callLogPath: null,
        concurrency,
        delayMs,
        modelName,
        help: true,
      };
    } else if (arg === '--data') {
      if (i + 1 >= argv.length) throw new Error('--data requires a directory path');
      dataDir = argv[++i];
    } else if (arg === '--out') {
      if (i + 1 >= argv.length) throw new Error('--out requires a file path or "-"');
      outPath = argv[++i];
    } else if (arg === '--call-log') {
      if (i + 1 >= argv.length) throw new Error('--call-log requires a file path');
      callLogPath = argv[++i];
    } else if (arg === '--model') {
      if (i + 1 >= argv.length) throw new Error('--model requires a model name');
      modelName = argv[++i];
    } else if (arg === '--concurrency') {
      if (i + 1 >= argv.length) throw new Error('--concurrency requires an integer');
      const parsed = Number(argv[++i]);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 16) {
        throw new Error(`Invalid --concurrency value: ${argv[i]}`);
      }
      concurrency = parsed;
    } else if (arg === '--delay-ms') {
      if (i + 1 >= argv.length) throw new Error('--delay-ms requires a non-negative integer');
      const parsed = Number(argv[++i]);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 60000) {
        throw new Error(`Invalid --delay-ms value: ${argv[i]}`);
      }
      delayMs = parsed;
    } else {
      throw new Error(`Unknown CLI argument: ${arg}`);
    }
  }

  if (!dataDir || !outPath) {
    throw new Error(USAGE_TEXT);
  }

  return { dataDir, outPath, callLogPath, concurrency, delayMs, modelName, help: false };
}

/**
 * Discovers problem statements, constraints, and C++ solutions purely from
 * `<dataDir>/problems/<pid>/` and `<dataDir>/solutions/<pid>/*.cpp`.
 * Never reads answer/ground-truth files.
 *
 * @param {string} dataDir
 * @returns {DatasetSubmissionItem[]}
 */
export function discoverDataset(dataDir) {
  const root = resolve(dataDir);
  const problemsDir = join(root, 'problems');
  const solutionsDir = join(root, 'solutions');

  if (!existsSync(problemsDir)) {
    throw new Error(`Problems directory not found: ${problemsDir}`);
  }
  if (!existsSync(solutionsDir)) {
    throw new Error(`Solutions directory not found: ${solutionsDir}`);
  }

  const problemIds = readdirSync(problemsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  /** @type {DatasetSubmissionItem[]} */
  const items = [];

  for (const pid of problemIds) {
    const problemPath = join(problemsDir, pid);
    const statementPath = join(problemPath, 'statement.md');
    const constraintsPath = join(problemPath, 'constraints.json');

    if (!existsSync(statementPath) || !existsSync(constraintsPath)) {
      throw new Error(`Missing statement.md or constraints.json for problem: ${pid}`);
    }

    const statement = readFileSync(statementPath, 'utf8');
    const constraints = JSON.parse(readFileSync(constraintsPath, 'utf8'));
    if (!Array.isArray(constraints)) {
      throw new Error(`constraints.json must be an array for problem: ${pid}`);
    }

    const solProblemDir = join(solutionsDir, pid);
    if (!existsSync(solProblemDir)) continue;

    const solFiles = readdirSync(solProblemDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.cpp'))
      .map((entry) => entry.name)
      .sort();

    for (const file of solFiles) {
      const solName = file.slice(0, -'.cpp'.length);
      const solutionId = `${pid}/${solName}`;
      const code = readFileSync(join(solProblemDir, file), 'utf8');
      items.push({
        solutionId,
        problemId: pid,
        statement,
        constraints,
        code,
      });
    }
  }

  return items;
}

/**
 * Runs the constraint checker pipeline over a discovered dataset and writes
 * JSONL predictions (and optional call-log JSONL).
 *
 * @param {{
 *   dataDir: string,
 *   outPath: string,
 *   callLogPath?: string | null,
 *   modelOff?: boolean,
 *   concurrency?: number,
 *   delayMs?: number,
 *   modelName?: string | null,
 *   llmTransport?: Parameters<typeof checkSubmissionConstraints>[0]['llmTransport'],
 *   modelConfig?: Parameters<typeof checkSubmissionConstraints>[0]['modelConfig']
 * }} opts
 * @returns {Promise<{
 *   predictionsCount: number,
 *   solutionsCount: number,
 *   callLogsCount: number
 * }>}
 */
export async function runDatasetChecker(opts) {
  const {
    dataDir,
    outPath,
    callLogPath = null,
    modelOff = process.env.MODEL_OFF === '1',
    concurrency = 4,
    delayMs = 0,
    modelName = null,
    llmTransport,
    modelConfig,
  } = opts;

  const resolvedModelName = modelConfig?.modelName ?? modelName ?? config.modelName;
  const resolvedApiKey =
    modelConfig?.modelApiKey ?? process.env.MODEL_API_KEY ?? config.modelApiKey;

  const configuredKeys = String(resolvedApiKey || '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  if (!modelOff && !llmTransport && configuredKeys.length === 0) {
    throw new Error(
      'MODEL_API_KEY is required when MODEL_OFF is not set to 1 (set MODEL_OFF=1 for offline hard-rules-only evaluation)',
    );
  }

  const effectiveModelConfig = {
    ...modelConfig,
    modelName: resolvedModelName,
    ...(resolvedApiKey ? { modelApiKey: resolvedApiKey } : {}),
  };

  const items = discoverDataset(dataDir);
  /** @type {Array<Array<Record<string, unknown>>>} */
  const predictionsByIndex = new Array(items.length);
  /** @type {Array<Array<Record<string, unknown>>>} */
  const callLogsByIndex = Array.from({ length: items.length }, () => []);

  let nextIdx = 0;
  const workerCount = Math.min(Math.max(1, concurrency), Math.max(1, items.length));

  /**
   * @param {number} itemIdx
   * @returns {Promise<boolean>}
   */
  async function evaluateItem(itemIdx) {
    const item = items[itemIdx];
    /** @type {Array<Record<string, unknown>>} */
    const itemLogs = [];
    const results = await checkSubmissionConstraints({
      statement: item.statement,
      constraints: item.constraints,
      code: item.code,
      modelOff,
      modelConfig: effectiveModelConfig,
      ...(llmTransport ? { llmTransport } : {}),
      callLogWriter: (entry) => {
        itemLogs.push({
          solution: item.solutionId,
          ...entry,
        });
      },
    });

    callLogsByIndex[itemIdx] = itemLogs;
    predictionsByIndex[itemIdx] = results.map((r) => ({
      solution: item.solutionId,
      constraint: r.constraintCode,
      verdict: r.verdict,
      evidence: r.evidence,
    }));
    return itemLogs.length > 0;
  }

  async function runWorker() {
    while (true) {
      const idx = nextIdx;
      nextIdx += 1;
      if (idx >= items.length) return;

      const madeModelCall = await evaluateItem(idx);
      if (delayMs > 0 && madeModelCall && !modelOff) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

  const callLogs = callLogsByIndex.flat();

  const lines = predictionsByIndex.flat().map((row) => JSON.stringify(row));
  const jsonlOutput = lines.length > 0 ? `${lines.join('\n')}\n` : '';

  if (outPath === '-') {
    process.stdout.write(jsonlOutput);
  } else {
    const resolvedOut = resolve(outPath);
    mkdirSync(dirname(resolvedOut), { recursive: true });
    writeFileSync(resolvedOut, jsonlOutput, 'utf8');
  }

  if (callLogPath) {
    const resolvedLog = resolve(callLogPath);
    mkdirSync(dirname(resolvedLog), { recursive: true });
    const logOutput =
      callLogs.length > 0 ? `${callLogs.map((entry) => JSON.stringify(entry)).join('\n')}\n` : '';
    writeFileSync(resolvedLog, logOutput, 'utf8');
  }

  return {
    predictionsCount: lines.length,
    solutionsCount: items.length,
    callLogsCount: callLogs.length,
  };
}

const isMain =
  process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);

if (isMain) {
  try {
    const args = parseCliArgs(process.argv.slice(2));
    if (args.help) {
      console.error(USAGE_TEXT);
      process.exit(0);
    }
    const summary = await runDatasetChecker(args);
    if (args.outPath !== '-') {
      console.error(
        `Wrote ${summary.predictionsCount} predictions for ${summary.solutionsCount} solutions (${summary.callLogsCount} model call log entries).`,
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`check-dataset error: ${msg}`);
    process.exit(1);
  }
}
