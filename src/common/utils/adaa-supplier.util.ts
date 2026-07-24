import { SelectQueryBuilder } from 'typeorm';
import { ADAA_SUPPLIER_NAME } from '../constants/supplier.constants';
import { Payroll } from '../../modules/payroll/entities/payroll.entity';

export function applyAdaaSupplierPayrollFilter<T extends Payroll>(
  qb: SelectQueryBuilder<T>,
  options?: {
    payrollAlias?: string;
    employeeAlias?: string;
    supplierAlias?: string;
    selectEmployee?: boolean;
  },
): SelectQueryBuilder<T> {
  const payrollAlias = options?.payrollAlias ?? 'p';
  const employeeAlias = options?.employeeAlias ?? 'employee';
  const supplierAlias = options?.supplierAlias ?? 'supplier';
  const selectEmployee = options?.selectEmployee ?? false;

  if (selectEmployee) {
    qb.innerJoinAndSelect(`${payrollAlias}.employee`, employeeAlias);
    qb.innerJoinAndSelect(`${employeeAlias}.supplier`, supplierAlias);
  } else {
    qb.innerJoin(`${payrollAlias}.employee`, employeeAlias);
    qb.innerJoin(`${employeeAlias}.supplier`, supplierAlias);
  }

  return qb.andWhere(`${supplierAlias}.name = :adaaSupplier`, {
    adaaSupplier: ADAA_SUPPLIER_NAME,
  });
}

export interface PayrollMonthTotals {
  employeeCount: number;
  totalHours: number;
  totalOtHours: number;
  totalOffdaysWorkedHours: number;
  totalIdleDayHours: number;
  totalPaidHours: number;
  grossSalary: number;
  netSalary: number;
}

export function mapPayrollMonthTotalsRow(row: {
  employeeCount?: string | number;
  totalHours?: string | number;
  totalOtHours?: string | number;
  totalOffdaysWorkedHours?: string | number;
  totalIdleDayHours?: string | number;
  grossSalary?: string | number;
  netSalary?: string | number;
}): PayrollMonthTotals {
  const totalHours = Math.round((Number(row.totalHours) || 0) * 100) / 100;
  const totalOtHours = Math.round((Number(row.totalOtHours) || 0) * 100) / 100;
  const totalOffdaysWorkedHours =
    Math.round((Number(row.totalOffdaysWorkedHours) || 0) * 100) / 100;
  const totalIdleDayHours =
    Math.round((Number(row.totalIdleDayHours) || 0) * 100) / 100;

  return {
    employeeCount: Number(row.employeeCount) || 0,
    totalHours,
    totalOtHours,
    totalOffdaysWorkedHours,
    totalIdleDayHours,
    totalPaidHours:
      Math.round(
        (totalHours +
          totalOtHours +
          totalOffdaysWorkedHours +
          totalIdleDayHours) *
          100,
      ) / 100,
    grossSalary: Math.round((Number(row.grossSalary) || 0) * 100) / 100,
    netSalary: Math.round((Number(row.netSalary) || 0) * 100) / 100,
  };
}
