// Types for PDF parsing

export interface ParsedDeposit {
  depositDate: Date;
  salaryMonth: Date;
  amount: number;
  employer: string;
  rawText?: string; // Original text for debugging
}

export interface ParseResult {
  success: boolean;
  deposits: ParsedDeposit[];
  errors: string[];
  warnings: string[];
  providerName: string | null;
  reportDate: Date | null;
  memberName: string | null;
}

// Input for bulk deposit creation
export interface BulkDepositInput {
  depositDate: string; // ISO date
  salaryMonth: string; // ISO date (first of month)
  amount: number;
  employer: string;
}

export interface BulkCreateDepositsRequest {
  accountId: string;
  deposits: BulkDepositInput[];
}
