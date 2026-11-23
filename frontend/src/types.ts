export type UserRole = 'admin' | 'ta' | 'student';

export interface ClassDetail {
  id: number;
  code: string;
  title: string;
}

export interface MeResponse {
  id: number;
  name: string;
  role: UserRole;
  classes: number[];
  classDetails?: ClassDetail[];
}

export interface StudentLatestSummary {
  id: number;
  judgeStatus: 'queued' | 'running' | 'done';
  testVerdict: string;
  submittedAt: string;
  mark?: number;
}

export interface LabSummary {
  id: number;
  classId: number;
  classCode: string;
  classTitle: string;
  title: string;
  deadlineAt: string;
  deadlinePassed: boolean;
  publishedAt: string | null;
  cpuLimitSec: number;
  memoryLimitMb: number;
  constraintCount: number;
  costSpentUsd?: number;
  submissionCount?: number;
  pendingReviews?: number;
  latestSubmission?: StudentLatestSummary | null;
}

export interface LabConstraint {
  code: string;
  text: string;
  deduction: number;
}

export interface LabTestCase {
  input: string;
  expectedOutput: string;
}

export interface LabDetail {
  id: number;
  classId: number;
  classCode?: string;
  classTitle?: string;
  title: string;
  statement: string;
  deadlineAt: string;
  deadlinePassed?: boolean;
  publishedAt: string | null;
  cpuLimitSec: number;
  memoryLimitMb: number;
  costSpentUsd?: number;
  reviewNotice: string;
  constraints: LabConstraint[];
}

export interface EvidenceLine {
  line: number;
  text: string;
}

export interface SingleTestResult {
  ordinal: number;
  verdict: string;
}

export interface ConfirmedDeduction {
  constraintCode: string;
  text: string;
  deduction: number;
  evidence: EvidenceLine[];
}

export interface ConstraintVerdictItem {
  verdictId: number;
  constraintCode: string;
  ruleText?: string | null;
  text?: string | null;
  deduction: number | null;
  verdict: 'pass' | 'violation' | 'unsure';
  source: 'hard_rule' | 'model' | 'ta_override';
  unsureReason: string | null;
  evidence: EvidenceLine[];
  rationale: string | null;
  taDecision: 'pass' | 'violation' | null;
}

export interface QueueItem {
  id: number;
  verdictId?: number;
  student: string;
  verdict: string;
  decision: string | null;
  constraintCode?: string;
  ruleText?: string;
  deduction?: number;
  source?: 'hard_rule' | 'model' | 'ta_override';
  unsureReason?: string | null;
  evidence?: EvidenceLine[];
  rationale?: string | null;
  taDecision?: 'pass' | 'violation' | null;
}

export interface CountedSubmission {
  id: number;
  student: string;
  judgeStatus: 'queued' | 'running' | 'done';
  jobStatus: 'queued' | 'running' | 'done' | 'failed' | null;
  testVerdict: string;
  submittedAt: string;
  verdicts: ConstraintVerdictItem[];
}

export interface QueueResponse {
  lab: number;
  publishedAt: string | null;
  costSpentUsd: number;
  items: QueueItem[];
  submissions: CountedSubmission[];
}

export interface SubmissionRecord {
  id: number;
  labId: number;
  judgeStatus: 'queued' | 'running' | 'done';
  status?: 'queued' | 'running' | 'done';
  jobStatus: 'queued' | 'running' | 'done' | 'failed' | null;
  counted: boolean;
  testVerdict: string;
  testResults: SingleTestResult[];
  submittedAt: string;
  code?: string;
  student?: string;
  studentId?: number;
  mark?: number;
  deductions?: ConfirmedDeduction[];
  manualReason?: string;
  constraintVerdicts?: ConstraintVerdictItem[];
}

export interface LabSubmissionsResponse {
  labId: number;
  publishedAt: string | null;
  submissions: SubmissionRecord[];
}

export interface ProblemDetail {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  pending?: number;
  deadlineAt?: string;
}
