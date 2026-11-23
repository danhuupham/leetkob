import type { ProblemDetail } from './types';

export const DEMO_TOKENS: Record<string, string> = {
  ta_a: 'tok-ta-a',
  ta_b: 'tok-ta-b',
  stu1: 'tok-stu1',
  stu2: 'tok-stu2',
  stu3: 'tok-stu3',
  admin: 'tok-admin',
};

export interface DemoAccountCard {
  username: string;
  token: string;
  roleLabel: string;
  classLabel: string;
  summary: string;
}

export const DEMO_ACCOUNTS: DemoAccountCard[] = [
  {
    username: 'ta_a',
    token: 'tok-ta-a',
    roleLabel: 'Teaching Assistant',
    classLabel: 'Class 1 · CSC13114-01',
    summary: 'Create labs, review flagged code & AI verdicts, publish Class 1 grades.',
  },
  {
    username: 'stu1',
    token: 'tok-stu1',
    roleLabel: 'Student',
    classLabel: 'Class 1 · CSC13114-01',
    summary: 'Read Class 1 labs, submit C++17 solutions, inspect live sandbox results.',
  },
  {
    username: 'stu2',
    token: 'tok-stu2',
    roleLabel: 'Student',
    classLabel: 'Class 1 · CSC13114-01',
    summary: 'Second student in Class 1 for multi-student queue & FAQ-02 testing.',
  },
  {
    username: 'ta_b',
    token: 'tok-ta-b',
    roleLabel: 'Teaching Assistant',
    classLabel: 'Class 2 · CSC13114-02',
    summary: 'Manages Class 2 labs (Lab 2 & 3). Isolated from Class 1 (404 on Lab 1).',
  },
  {
    username: 'stu3',
    token: 'tok-stu3',
    roleLabel: 'Student',
    classLabel: 'Class 2 · CSC13114-02',
    summary: 'Enrolled in Class 2. Pre-loaded Lab 3 open for immediate C++ submissions.',
  },
  {
    username: 'admin',
    token: 'tok-admin',
    roleLabel: 'Administrator',
    classLabel: 'All Classes (1 & 2)',
    summary: 'Full staff visibility and lab/publish control across all classes.',
  },
];

export class ApiError extends Error {
  readonly status: number;
  readonly problem: ProblemDetail;

  constructor(status: number, problem: ProblemDetail) {
    super(problem.detail || problem.title || `HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.problem = problem;
  }
}

export async function apiFetch<T>(
  token: string,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {};
  const trimmed = token.trim();
  if (trimmed) {
    headers.authorization = `Bearer ${trimmed}`;
  }
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
  }

  const response = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let parsed: unknown = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { title: 'Invalid server response', detail: 'Server returned non-JSON content' };
  }

  if (!response.ok) {
    const prob = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as ProblemDetail;
    throw new ApiError(response.status, prob);
  }

  return parsed as T;
}

export function isBanListRuleText(ruleText: string): boolean {
  const trimmed = ruleText.trim();
  return /^Do not (use|call)\b/i.test(trimmed) && /`[^`]+`/.test(trimmed);
}
