// Centralized environment configuration loaded and validated once at startup.
// Never default a secret to a live value, and never pass secrets to the sandbox.

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error(`Invalid NODE_ENV: ${nodeEnv}`);
  }

  const port = Number(env.PORT || 3007);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid PORT: ${env.PORT}`);
  }

  const modelMaxCostUsdPerLab = Number(env.MODEL_MAX_COST_USD_PER_LAB || 0.25);
  if (
    !Number.isFinite(modelMaxCostUsdPerLab) ||
    modelMaxCostUsdPerLab <= 0 ||
    modelMaxCostUsdPerLab > 5
  ) {
    throw new Error(`Invalid MODEL_MAX_COST_USD_PER_LAB: ${env.MODEL_MAX_COST_USD_PER_LAB}`);
  }

  const sandboxMemoryLimitMb = Number(env.SANDBOX_MEMORY_LIMIT_MB || 256);
  if (
    !Number.isInteger(sandboxMemoryLimitMb) ||
    sandboxMemoryLimitMb < 64 ||
    sandboxMemoryLimitMb > 512
  ) {
    throw new Error(
      `Invalid SANDBOX_MEMORY_LIMIT_MB (FAQ-05 requires 64..512): ${env.SANDBOX_MEMORY_LIMIT_MB}`,
    );
  }

  const sandboxPidsLimit = Number(env.SANDBOX_PIDS_LIMIT || 16);
  if (!Number.isInteger(sandboxPidsLimit) || sandboxPidsLimit < 1 || sandboxPidsLimit > 64) {
    throw new Error(`Invalid SANDBOX_PIDS_LIMIT: ${env.SANDBOX_PIDS_LIMIT}`);
  }

  const modelApiKey = env.MODEL_API_KEY || '';
  const sessionSecret = env.SESSION_SECRET || '';

  if (nodeEnv === 'production' && (!modelApiKey || !sessionSecret)) {
    throw new Error('MODEL_API_KEY and SESSION_SECRET are required when NODE_ENV=production');
  }

  return Object.freeze({
    nodeEnv,
    port,
    databaseUrl: env.DATABASE_URL || ':memory:',
    sessionSecret,
    modelProvider: env.MODEL_PROVIDER || 'gemini',
    modelName: env.MODEL_NAME || 'gemini-2.5-flash',
    modelApiKey,
    modelMaxCostUsdPerLab,
    modelTimeoutMs: Number(env.MODEL_TIMEOUT_MS || 10000),
    sandbox: Object.freeze({
      image: env.SANDBOX_IMAGE || 'gcc:13.3-bookworm',
      compilerCmd: env.SANDBOX_COMPILER_CMD || 'g++ -std=c++17 -O2',
      compileTimeoutMs: Number(env.SANDBOX_COMPILE_TIMEOUT_MS || 10000),
      cpuTimeLimitSec: Number(env.SANDBOX_CPU_TIME_LIMIT_SEC || 1),
      wallTimeLimitSec: Number(env.SANDBOX_WALL_TIME_LIMIT_SEC || 3),
      memoryLimitMb: sandboxMemoryLimitMb,
      pidsLimit: sandboxPidsLimit,
      outputLimitBytes: Number(env.SANDBOX_OUTPUT_LIMIT_BYTES || 1048576),
      maxCodeBytes: Number(env.SANDBOX_MAX_CODE_BYTES || 65536),
    }),
  });
}

/**
 * Returns the minimal sanitized environment passed to the C++ judge sandbox.
 * Brief §5 & Session 6: The sandbox must receive NO secrets (MODEL_API_KEY,
 * SESSION_SECRET, DATABASE_URL, etc. are never inherited from the worker).
 *
 * @returns {Readonly<Record<string, string>>}
 */
export function getSandboxEnv() {
  return Object.freeze({
    PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    LANG: 'C.UTF-8',
    HOME: '/tmp',
  });
}

export const config = loadConfig();
