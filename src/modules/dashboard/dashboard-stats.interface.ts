export interface DashboardStats {
  asOf: string;
  month: string;
  counts: {
    employees: number;
    adaaEmployees: number;
    otherEmployees: number;
    projects: number;
    clients: number;
    expiringDocuments: number;
  };
  workforce: {
    total: number;
    active: number;
    idle: number;
    onLeave: number;
    off: number;
    other: number;
  };
  workforceByStatus: Array<{ status: string; count: number }>;
  timesheets: {
    draft: number;
    submitted: number;
    approved: number;
    rejected: number;
    total: number;
  };
  payroll: {
    records: number;
    totalHours: number;
    totalGross: number;
    totalNet: number;
  };
  invoices: {
    draft: number;
    pending: number;
    approved: number;
    sent: number;
    paid: number;
    cancelled: number;
    outstandingAmount: number;
  };
  settlements: {
    draft: number;
    pendingApproval: number;
    approved: number;
    paid: number;
    cancelled: number;
  };
  topProjects: Array<{ projectId: number; projectName: string; headcount: number }>;
  employeesBySupplier: Array<{ supplierName: string; count: number }>;
  payrollTrend: Array<{ month: string; gross: number; net: number; records: number }>;
}
