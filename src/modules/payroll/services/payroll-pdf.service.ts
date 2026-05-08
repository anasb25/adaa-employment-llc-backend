import { Injectable } from '@nestjs/common';
import { Payroll } from '../entities/payroll.entity';
import { parseAirTicketsHistory } from '../../employees/utils/air-ticket-history.util';
import {
  PDF_LETTERHEAD,
  printHtmlToPdfWithLetterhead,
  getPdfMainDocumentBaseCss,
} from '../../../common/utils/pdf-letterhead.util';

@Injectable()
export class PayrollPdfService {
  async generatePdf(payroll: Payroll): Promise<Buffer> {
    return printHtmlToPdfWithLetterhead(this.generatePayrollHtml(payroll));
  }

  private escapeHtml(s: string | null | undefined): string {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private formatDecimalHours(decimal: number): string {
    if (decimal == null || isNaN(Number(decimal))) return '0';
    const rounded = Math.round(Number(decimal) * 100) / 100;
    return rounded.toFixed(2).replace(/\.?0+$/, '');
  }

  private formatNumber(num: number): string {
    return Number(num || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  /**
   * Total air tickets recorded as subtracted during the payroll calendar month (UTC),
   * using `employee.air_tickets_history`.
   */
  private airTicketsUsedInPayrollMonth(payroll: Payroll): number {
    const emp = payroll.employee;
    const history = parseAirTicketsHistory(emp?.air_tickets_history);
    const month = payroll.month?.trim();
    if (!month || !/^\d{4}-\d{2}$/.test(month)) return 0;

    const [yStr, mStr] = month.split('-');
    const y = parseInt(yStr, 10);
    const mo = parseInt(mStr, 10);
    const start = Date.UTC(y, mo - 1, 1, 0, 0, 0, 0);
    const end = Date.UTC(y, mo, 1, 0, 0, 0, 0);

    let total = 0;
    for (const entry of history) {
      if (entry?.type !== 'subtract') continue;
      const t = new Date(entry.at).getTime();
      if (Number.isNaN(t)) continue;
      if (t >= start && t < end) {
        total += Math.max(0, Math.floor(Number(entry.amount) || 0));
      }
    }
    return total;
  }

  private formatDate(d: string): string {
    const dt = new Date(d);
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    return `${dt.getDate()} ${months[dt.getMonth()]} ${dt.getFullYear()}`;
  }

  private descBlock(
    category: string,
    titleLine: string,
    subLine?: string,
  ): string {
    let inner = `<strong>${this.escapeHtml(category)}</strong><br/><span>${this.escapeHtml(titleLine)}</span>`;
    if (subLine) {
      inner += `<br/><span class="muted">${this.escapeHtml(subLine)}</span>`;
    }
    return inner;
  }

  private addonSubline(additionalAmount: number): string | undefined {
    const n = Number(additionalAmount) || 0;
    if (n === 0) return undefined;
    const prefix = n > 0 ? '+' : '';
    return `${prefix}${this.formatNumber(n)} AED/hr add-on`;
  }

  /**
   * Single main table: all hour-based lines (same idea as invoice line items).
   */
  private generateHourLineRows(payroll: Payroll): string {
    let rows = '';
    let rowNumber = 1;
    const hb = payroll.hoursBreakdown;

    if (hb) {
      for (const r of hb.regular || []) {
        const add = this.addonSubline(Number(r.additionalAmount) || 0);
        rows += `
        <tr>
          <td class="center">${rowNumber++}</td>
          <td>${this.descBlock('Regular', String(r.rateVariantName), add)}</td>
          <td class="center">${this.formatDecimalHours(Number(r.hours))}</td>
          <td class="right">${this.formatNumber(Number(r.hourlyRate))}</td>
          <td class="right">${this.formatNumber(Number(r.amount))}</td>
        </tr>`;
      }
      for (const r of hb.specialDays || []) {
        const add = this.addonSubline(Number(r.additionalAmount) || 0);
        rows += `
        <tr>
          <td class="center">${rowNumber++}</td>
          <td>${this.descBlock('Special day', String(r.specialDayName), add)}</td>
          <td class="center">${this.formatDecimalHours(Number(r.hours))}</td>
          <td class="right">${this.formatNumber(Number(r.hourlyRate))}</td>
          <td class="right">${this.formatNumber(Number(r.amount))}</td>
        </tr>`;
      }
      for (const r of hb.offDays || []) {
        const add = this.addonSubline(Number(r.additionalAmount) || 0);
        const dateStr = this.formatDate(r.date);
        rows += `
        <tr>
          <td class="center">${rowNumber++}</td>
          <td>${this.descBlock('Off day worked', dateStr, add)}</td>
          <td class="center">${this.formatDecimalHours(Number(r.hours))}</td>
          <td class="right">${this.formatNumber(Number(r.hourlyRate))}</td>
          <td class="right">${this.formatNumber(Number(r.amount))}</td>
        </tr>`;
      }
      const idleEntries = hb.idle || [];
      if (idleEntries.length > 0) {
        let sumIdleHours = 0;
        let sumIdleAmount = 0;
        for (const r of idleEntries) {
          sumIdleHours += Number(r.hours) || 0;
          sumIdleAmount += Number(r.amount) || 0;
        }
        const firstAdd = Number(idleEntries[0]?.additionalAmount) || 0;
        const uniformAdd = idleEntries.every(
          (r) => Math.abs((Number(r.additionalAmount) || 0) - firstAdd) < 1e-6,
        );
        const addSub =
          uniformAdd && firstAdd !== 0
            ? this.addonSubline(firstAdd)
            : undefined;
        const effIdleRate = sumIdleHours > 0 ? sumIdleAmount / sumIdleHours : 0;
        let idleDesc = '<strong>Idle</strong>';
        if (addSub) {
          idleDesc += `<br/><span class="muted">${this.escapeHtml(addSub)}</span>`;
        }
        rows += `
        <tr>
          <td class="center">${rowNumber++}</td>
          <td>${idleDesc}</td>
          <td class="center">${this.formatDecimalHours(sumIdleHours)}</td>
          <td class="right">${sumIdleHours > 0 ? this.formatNumber(effIdleRate) : this.formatNumber(0)}</td>
          <td class="right">${this.formatNumber(sumIdleAmount)}</td>
        </tr>`;
      }
    }

    if (!rows) {
      const th = Number(payroll.totalHours) || 0;
      const tot = Number(payroll.totalOtHours) || 0;
      const toff = Number(payroll.totalOffdaysWorkedHours) || 0;
      const tidle = Number(payroll.totalIdleDayHours) || 0;
      if (th > 0) {
        rows += `
        <tr>
          <td class="center">${rowNumber++}</td>
          <td>${this.descBlock('Regular hours', 'Month summary (no rate breakdown)')}</td>
          <td class="center">${this.formatDecimalHours(th)}</td>
          <td class="center">—</td>
          <td class="center">—</td>
        </tr>`;
      }
      if (tot > 0) {
        rows += `
        <tr>
          <td class="center">${rowNumber++}</td>
          <td>${this.descBlock('OT hours', 'Month summary')}</td>
          <td class="center">${this.formatDecimalHours(tot)}</td>
          <td class="center">—</td>
          <td class="center">—</td>
        </tr>`;
      }
      if (toff > 0) {
        rows += `
        <tr>
          <td class="center">${rowNumber++}</td>
          <td>${this.descBlock('Off-days hours', 'Month summary')}</td>
          <td class="center">${this.formatDecimalHours(toff)}</td>
          <td class="center">—</td>
          <td class="center">—</td>
        </tr>`;
      }
      if (tidle > 0) {
        rows += `
        <tr>
          <td class="center">${rowNumber++}</td>
          <td>${this.descBlock('Idle hours', 'Month summary')}</td>
          <td class="center">${this.formatDecimalHours(tidle)}</td>
          <td class="center">—</td>
          <td class="center">—</td>
        </tr>`;
      }
      if (!rows) {
        rows = `
        <tr>
          <td class="center">1</td>
          <td>${this.descBlock('Hours', 'No hour detail for this payroll')}</td>
          <td class="center">—</td>
          <td class="center">—</td>
          <td class="center">—</td>
        </tr>`;
      }
    }

    return rows;
  }

  private totalPaidHours(p: Payroll): number {
    return (
      (Number(p.totalHours) || 0) +
      (Number(p.totalOtHours) || 0) +
      (Number(p.totalOffdaysWorkedHours) || 0) +
      (Number(p.totalIdleDayHours) || 0)
    );
  }

  private generateTotalsSection(payroll: Payroll): string {
    const allowanceEntries = payroll.allowances
      ? Object.entries(payroll.allowances)
      : [];
    const otherDed = payroll.otherDeductions
      ? Object.entries(payroll.otherDeductions)
      : [];

    let html = `
    <div style="display: flex; justify-content: flex-end;">
      <div class="totals-section">
        <div class="totals-row">
          <span>Total paid hours</span>
          <span></span>
          <span>${this.formatDecimalHours(this.totalPaidHours(payroll))}</span>
        </div>
        <div class="totals-row">
          <span>Base hourly rate (AED)</span>
          <span></span>
          <span>${this.formatNumber(Number(payroll.baseHourlyRate) || 0)}</span>
        </div>`;

    if (allowanceEntries.length > 0) {
      for (const [k, v] of allowanceEntries) {
        html += `
        <div class="totals-row">
          <span>Allowance — ${this.escapeHtml(k)}</span>
          <span></span>
          <span>${this.formatNumber(Number(v) || 0)}</span>
        </div>`;
      }
    } else {
      html += `
        <div class="totals-row">
          <span>Additional allowances</span>
          <span></span>
          <span>${this.formatNumber(0)}</span>
        </div>`;
    }

    html += `
        <div class="totals-row">
          <span>Absent Days</span>
          <span></span>
          <span>${this.formatNumber(Number(payroll.absentDaysDeductible) || 0)}</span>
        </div>`;

    if (otherDed.length > 0) {
      for (const [k, v] of otherDed) {
        html += `
        <div class="totals-row">
          <span>Deduction — ${this.escapeHtml(k)}</span>
          <span></span>
          <span>${this.formatNumber(Number(v) || 0)}</span>
        </div>`;
      }
    } else {
      html += `
        <div class="totals-row">
          <span>Deductions</span>
          <span></span>
          <span>${this.formatNumber(0)}</span>
        </div>`;
    }

    html += `
        <div class="totals-row grand-total">
          <span>Total gross salary</span>
          <span></span>
          <span>AED ${this.formatNumber(Number(payroll.totalGrossSalary) || 0)}</span>
        </div>
        <div class="totals-row grand-total" style="margin-top: 6px;">
          <span>Net salary</span>
          <span></span>
          <span>AED ${this.formatNumber(Number(payroll.netSalary) || 0)}</span>
        </div>
      </div>
    </div>`;

    return html;
  }

  private generatePayrollHtml(payroll: Payroll): string {
    const emp = payroll.employee;
    const monthLabel = this.escapeHtml(payroll.month);
    const genDate = new Date().toLocaleString('en-GB');
    const ticketsUsed = this.airTicketsUsedInPayrollMonth(payroll);
    const airTicketTakenRow =
      ticketsUsed > 0
        ? `
    <div class="invoice-details-row">
      <div class="invoice-details-label">Air Ticket Used</div>
      <div class="invoice-details-value">: ${ticketsUsed}</div>
    </div>`
        : '';
    const notesBlock =
      payroll.notes && payroll.notes.trim()
        ? `
  <div class="notes-section">
    <div class="notes-title">Notes</div>
    <div>${this.escapeHtml(payroll.notes).replace(/\r?\n/g, '<br/>')}</div>
  </div>`
        : '';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    ${getPdfMainDocumentBaseCss()}
    body {
      font-family: Arial, sans-serif;
      font-size: 10px;
      line-height: 1.4;
      color: #000;
    }
    .payslip-page-wrap {
      display: flex;
      flex-direction: column;
      min-height: 200mm;
    }
    .payslip-body-content {
      flex: 1 1 auto;
    }
    .company-name { font-size: 14px; font-weight: bold; margin-bottom: 3px; color: ${PDF_LETTERHEAD.navy}; }
    .company-info { font-size: 8.5px; line-height: 1.4; margin-bottom: 10px; }
    .invoice-title-section {
      border: 1px solid #000;
      padding: 10px;
      margin-bottom: 10px;
      width: 100%;
    }
    .invoice-details-row {
      display: flex;
      margin-bottom: 3px;
      font-size: 8.5px;
    }
    .invoice-details-label { width: 110px; }
    .invoice-details-value { font-weight: bold; }
    .title-center { text-align: center; font-size: 18px; font-weight: bold; letter-spacing: 1px; margin: 10px 0 8px 0; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
      font-size: 8.5px;
    }
    th {
      background-color: #e8e8e8;
      border: 1px solid #000;
      padding: 5px 3px;
      font-weight: bold;
      font-size: 7.5px;
    }
    th.center, td.center { text-align: center; }
    th.right, td.right { text-align: right; }
    td {
      border: 1px solid #000;
      padding: 4px 3px;
      vertical-align: top;
    }
    .muted { font-size: 7.5px; color: #555; }
    .totals-section {
      margin-left: auto;
      width: 320px;
      margin-bottom: 12px;
    }
    .totals-row {
      display: flex;
      justify-content: space-between;
      padding: 3px 0;
      font-size: 8.5px;
      gap: 8px;
    }
    .totals-row span:nth-child(1) { flex: 1; text-align: left; }
    .totals-row span:nth-child(3) {
      min-width: 95px;
      text-align: right;
      font-weight: bold;
    }
    .grand-total {
      border-top: 1px solid #000;
      padding-top: 5px;
      margin-top: 4px;
      font-size: 10px;
    }
    .notes-section {
      margin-top: 12px;
      font-size: 8px;
      line-height: 1.5;
    }
    .notes-title { font-weight: bold; margin-bottom: 4px; }
    .payslip-signature-footer {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      flex-shrink: 0;
      margin-top: auto;
      padding-top: 20px;
      font-size: 8.5px;
      gap: 24px;
    }
    .payslip-signature-footer .sig-col-left {
      width: 45%;
      max-width: 240px;
      flex-shrink: 0;
    }
    .payslip-signature-footer .sig-col-right {
      width: 45%;
      max-width: 240px;
      flex-shrink: 0;
      text-align: right;
    }
    .payslip-signature-footer .sig-line {
      border-bottom: 1px solid #000;
      min-height: 32px;
      margin-bottom: 4px;
      width: 100%;
    }
    .payslip-signature-footer .sig-caption {
      color: #000;
    }
  </style>
</head>
<body>
  <div class="payslip-page-wrap">
  <div class="payslip-body-content">
  <div class="company-name">ADAA EMPLOYMENT L.L.C</div>
  <div class="company-info">Dubai, U.A.E</div>

  <div class="title-center">PAYSLIP</div>

  <div class="invoice-title-section">
    <div class="invoice-details-row">
      <div class="invoice-details-label">Employee</div>
      <div class="invoice-details-value">: ${this.escapeHtml(emp?.name || 'N/A')}</div>
    </div>
    <div class="invoice-details-row">
      <div class="invoice-details-label">Employee code</div>
      <div class="invoice-details-value">: ${this.escapeHtml(emp?.adaa_emp_code || 'N/A')}</div>
    </div>
    <div class="invoice-details-row">
      <div class="invoice-details-label">Payroll month</div>
      <div class="invoice-details-value">: ${monthLabel}</div>
    </div>${airTicketTakenRow}
    <div class="invoice-details-row">
      <div class="invoice-details-label">Generated</div>
      <div class="invoice-details-value">: ${this.escapeHtml(genDate)}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="center" style="width: 28px;">#</th>
        <th>Item & description</th>
        <th class="center" style="width: 72px;">No. of<br/>hours</th>
        <th class="right" style="width: 78px;">Rate per<br/>hour<br/>(AED)</th>
        <th class="right" style="width: 88px;">Amount<br/>(AED)</th>
      </tr>
    </thead>
    <tbody>
      ${this.generateHourLineRows(payroll)}
    </tbody>
  </table>

  ${this.generateTotalsSection(payroll)}

  ${notesBlock}

  </div>
  <div class="payslip-signature-footer">
    <div class="sig-col-left">
      <div class="sig-line"></div>
      <div class="sig-caption">Signature</div>
    </div>
    <div class="sig-col-right">
      <div class="sig-line"></div>
      <div class="sig-caption">Date</div>
    </div>
  </div>

  </div>

</body>
</html>`;
  }
}
