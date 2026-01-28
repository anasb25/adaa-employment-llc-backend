import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { Settlement } from '../entities/settlement.entity';

@Injectable()
export class SettlementExcelService {
  /**
   * Generate Excel buffer from settlement data
   */
  async generateExcel(settlement: Settlement): Promise<Buffer> {
    const workbook = XLSX.utils.book_new();

    // Main settlement data
    const settlementData = [
      ['Final Settlement Computation', '', '', ''],
      ['', '', '', ''],
      ['Employee Information', '', '', ''],
      ['Emp Name', settlement.empName, 'Emp Code', settlement.empCode],
      ['Job Title', settlement.jobTitle || '-', 'Date of Join', this.formatDate(settlement.dateOfJoin)],
      ['Last Date of Work', this.formatDate(settlement.lastDateOfWork), 'Last Total Salary', `${settlement.lastTotalSalary || 0} AED`],
      ['Total Days Absent', settlement.totalDaysAbsent || 0, 'Contract Type', settlement.contractType || '-'],
      ['', '', '', ''],
      ['Salary Information', '', '', ''],
      ['Basic Salary', settlement.hourlySalary || '-', 'HOURLY RATE', settlement.hourlyRate || '-'],
      ['HRA Allowance', settlement.allowance || '-', 'Transport Allowance', settlement.transportAllowance || '-'],
      ['Other Allowance', settlement.otherAllowances || '-', 'Total Years of Service', settlement.totalYearsOfService || '-'],
      ['Annual Leave Days Bal', settlement.annualLeaveBalance ? Number(settlement.annualLeaveBalance).toFixed(2) : '-', '', ''],
      ['', '', '', ''],
      ['Gratuity Information', '', '', ''],
      ['Eligible for Gratuity', settlement.eligibleForGratuity ? 'YES' : 'NO', 'Days Per Year', settlement.gratuityDaysPerYear || 21],
      ['', '', '', ''],
      ['Payment Details', '', '', ''],
      ['DESCRIPTION', 'AMOUNT', '', ''],
    ];

    // Add payment items
    (settlement.paymentItems || []).forEach((item) => {
      const isLastMonth = item.description.includes('SALARY') && 
        !item.fromDate && 
        settlement.lastMonthSalaryPaid && 
        item.amount === 0;
      
      settlementData.push([
        item.description,
        isLastMonth ? 'PAID' : Number(item.amount).toFixed(2),
        '',
        ''
      ]);
    });

    settlementData.push(['TOTAL DUE', Number(settlement.totalDue).toFixed(2), '', '']);

    // Add deduction items if any
    if (settlement.deductionItems && settlement.deductionItems.length > 0) {
      settlementData.push(['', '', '', '']);
      settlementData.push(['DEDUCTION DETAILS', '', '', '']);
      settlementData.push(['DESCRIPTION', 'AMOUNT', '', '']);
      settlement.deductionItems.forEach((item) => {
        settlementData.push([item.description, Number(item.amount).toFixed(2), '', '']);
      });
      settlementData.push(['TOTAL DEDUCTION', Number(settlement.totalDeduction).toFixed(2), '', '']);
    }

    settlementData.push(['', '', '', '']);
    settlementData.push(['TOTAL AMOUNT DUE FOR EOSB', Number(settlement.finalAmount).toFixed(2), '', '']);

    // Air Ticket
    if (settlement.employee?.air_tickets && settlement.employee.air_tickets > 0) {
      settlementData.push(['', '', '', '']);
      settlementData.push(['AIR TICKET', settlement.employee.air_tickets, '', '']);
    }

    const worksheet = XLSX.utils.aoa_to_sheet(settlementData);
    
    // Set column widths
    worksheet['!cols'] = [
      { wch: 30 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Settlement');

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  private formatDate(dateStr?: string): string {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
    }
  }
}
