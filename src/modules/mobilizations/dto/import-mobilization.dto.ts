export interface ImportMobilizationResult {
  success: number;
  failed: number;
  errors: Array<{
    row: number;
    employee: string;
    errors: string[];
  }>;
  imported: any[];
}


