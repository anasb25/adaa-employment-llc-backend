import { Injectable } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import { Invoice } from '../entities/invoice.entity';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class InvoicePdfService {
  /**
   * Generate PDF buffer from invoice data
   */
  async generatePdf(invoice: Invoice): Promise<Buffer> {
    const html = this.generateInvoiceHtml(invoice);

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '0mm',
        right: '0mm',
        bottom: '0mm',
        left: '0mm',
      },
    });

    await browser.close();

    return Buffer.from(pdfBuffer);
  }

  /**
   * Generate HTML template matching the exact layout from screenshot
   */
  private generateInvoiceHtml(invoice: Invoice): string {
    // Debug: Log invoice data to see what we're working with
    console.log('Invoice data for PDF:', {
      invoiceNumber: invoice.invoiceNumber,
      projectName: invoice.project?.name,
      clientName: invoice.project?.client?.name,
      clientAddress: invoice.project?.client?.address,
      clientTrn: invoice.project?.client?.trn,
    });
    // Read header image and convert to base64
    // Try multiple paths to support both dev and production
    const possiblePaths = [
      path.join(__dirname, '../../../assets/invoice-header.png'), // compiled (dist)
      path.join(__dirname, '../../../../src/assets/invoice-header.png'), // compiled -> src
      path.join(process.cwd(), 'src/assets/invoice-header.png'), // from project root
      path.join(process.cwd(), 'dist/assets/invoice-header.png'), // from project root (dist)
    ];

    let headerImageBase64 = '';

    for (const imagePath of possiblePaths) {
      try {
        if (fs.existsSync(imagePath)) {
          const imageBuffer = fs.readFileSync(imagePath);
          headerImageBase64 = `data:image/png;base64,${imageBuffer.toString('base64')}`;
          break;
        }
      } catch (error) {
        // Try next path
      }
    }

    if (!headerImageBase64) {
      console.warn('Header image not found in any expected location');
    }

    const totalTaxableAmount = Number(invoice.totalTaxableAmount);
    const totalTax = Number(invoice.totalTax);
    const totalAmount = Number(invoice.totalAmount);

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: Arial, sans-serif;
      font-size: 10px;
      line-height: 1.4;
      color: #000;
      padding: 10mm 15mm;
    }
    
    @page {
      margin: 0;
    }
    
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
      border-bottom: 1px solid #000;
      padding-bottom: 8px;
    }
    
    .header-left {
      width: 120px;
    }
    
    .header-image {
      width: 100%;
      height: auto;
    }
    
    .header-right {
      font-size: 10px;
      font-weight: normal;
      color: #555;
    }
    
    .company-details {
      margin-bottom: 10px;
    }
    
    .company-name {
      font-size: 14px;
      font-weight: bold;
      margin-bottom: 3px;
      letter-spacing: 0.5px;
    }
    
    .company-info {
      font-size: 8.5px;
      line-height: 1.4;
    }
    
    .invoice-title-section {
      border: 1px solid #000;
      padding: 10px;
      margin-bottom: 10px;
      display: table;
      width: 100%;
    }
    
    .invoice-row {
      display: table-row;
    }
    
    .invoice-left {
      display: table-cell;
      width: 35%;
      vertical-align: top;
    }
    
    .invoice-center {
      display: table-cell;
      width: 30%;
      vertical-align: middle;
      text-align: center;
    }
    
    .invoice-right {
      display: table-cell;
      width: 35%;
      vertical-align: top;
      text-align: right;
    }
    
    .invoice-details-row {
      display: flex;
      margin-bottom: 2px;
      font-size: 8.5px;
    }
    
    .invoice-details-label {
      width: 75px;
      font-weight: normal;
    }
    
    .invoice-details-value {
      font-weight: bold;
    }
    
    .invoice-title {
      font-size: 20px;
      font-weight: bold;
      letter-spacing: 1px;
    }
    
    .site-label {
      font-size: 8.5px;
      font-weight: normal;
      margin-bottom: 2px;
    }
    
    .site-value {
      font-size: 8.5px;
      font-weight: bold;
    }
    
    .bill-to-section {
      border: 1px solid #000;
      padding: 10px;
      margin-bottom: 10px;
    }
    
    .section-title {
      font-weight: bold;
      font-size: 9px;
      margin-bottom: 8px;
    }
    
    .client-name {
      font-size: 10px;
      font-weight: bold;
      margin-bottom: 3px;
    }
    
    .client-info {
      font-size: 8.5px;
      line-height: 1.5;
    }
    
    .subject-section {
      margin: 10px 0;
      font-size: 8.5px;
    }
    
    .subject-label {
      font-weight: bold;
      margin-bottom: 5px;
    }
    
    .subject-text {
      line-height: 1.4;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 10px;
      font-size: 8.5px;
    }
    
    th {
      background-color: #e8e8e8;
      border: 1px solid #000;
      padding: 5px 3px;
      text-align: left;
      font-weight: bold;
      font-size: 7.5px;
      line-height: 1.3;
    }
    
    th.center, td.center {
      text-align: center;
    }
    
    th.right, td.right {
      text-align: right;
    }
    
    td {
      border: 1px solid #000;
      padding: 4px 3px;
      vertical-align: middle;
    }
    
    .totals-section {
      margin-left: auto;
      width: 280px;
      margin-bottom: 10px;
    }
    
    .totals-row {
      display: flex;
      justify-content: space-between;
      padding: 3px 0;
      font-size: 8.5px;
    }
    
    .totals-row.grand-total {
      border-top: 1px solid #000;
      font-weight: bold;
      font-size: 10px;
      padding-top: 5px;
      margin-top: 3px;
    }
    
    .total-in-words {
      margin-bottom: 12px;
      font-size: 8.5px;
      font-weight: bold;
      line-height: 1.5;
    }
    
    .bank-details {
      margin-bottom: 12px;
      font-size: 7.5px;
      line-height: 1.5;
    }
    
    .bank-details-title {
      font-weight: bold;
      margin-bottom: 4px;
    }
    
    .notes-section {
      margin-bottom: 15px;
      font-size: 7.5px;
      line-height: 1.6;
    }
    
    .notes-title {
      font-weight: bold;
      margin-bottom: 4px;
    }
    
    .footer {
      text-align: center;
      font-size: 7.5px;
      line-height: 1.5;
      border-top: 1px solid #000;
      padding-top: 8px;
      margin-top: 15px;
    }
    
    .footer-company {
      font-weight: bold;
      margin-bottom: 2px;
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="header">
    <div class="header-left">
      ${headerImageBase64 ? `<img src="${headerImageBase64}" class="header-image" alt="Company Logo" />` : ''}
    </div>
    <div class="header-right">
      Engage. Produce. Grow
    </div>
  </div>
  
  <!-- Company Details -->
  <div class="company-details">
    <div class="company-name">ADAA EMPLOYMENT L.L.C</div>
    <div class="company-info">
      Dubai<br/>
      U.A.E<br/>
      TRN 100476365000003
    </div>
  </div>
  
  <!-- Invoice Title and Details -->
  <div class="invoice-title-section">
    <div class="invoice-row">
      <div class="invoice-left">
        <div class="invoice-details-row">
          <div class="invoice-details-label">Invoice#</div>
          <div class="invoice-details-value">: ${invoice.invoiceNumber}</div>
        </div>
        <div class="invoice-details-row">
          <div class="invoice-details-label">Invoice Date</div>
          <div class="invoice-details-value">: ${this.formatDate(invoice.invoiceDate)}</div>
        </div>
        <div class="invoice-details-row">
          <div class="invoice-details-label">Terms</div>
          <div class="invoice-details-value">: Net ${invoice.project?.client?.paymentTerms || '30'}</div>
        </div>
        <div class="invoice-details-row">
          <div class="invoice-details-label">Due Date</div>
          <div class="invoice-details-value">: ${this.formatDate(invoice.dueDate)}</div>
        </div>
      </div>
      <div class="invoice-center">
        <div class="invoice-title">TAX INVOICE</div>
      </div>
      <div class="invoice-right">
        <div class="site-label">Site</div>
        <div class="site-value">: ${invoice.project?.name || ''}</div>
      </div>
    </div>
  </div>
  
  <!-- Bill To -->
  <div class="bill-to-section">
    <div class="section-title">Bill To</div>
    ${
      invoice.project?.client
        ? `
    <div class="client-name">${invoice.project.client.name}</div>
    <div class="client-info">
      ${invoice.project.client.address ? invoice.project.client.address.split('\n').join('<br/>') + '<br/>' : ''}Dubai<br/>
      U.A.E<br/>
      ${invoice.project.client.trn ? 'TRN ' + invoice.project.client.trn : ''}
    </div>
    `
        : '<div class="client-info">No client information available</div>'
    }
  </div>
  
  <!-- Subject -->
  ${
    invoice.subject
      ? `
  <div class="subject-section">
    <div class="subject-label">Subject :</div>
    <div class="subject-text">${invoice.subject}</div>
  </div>
  `
      : ''
  }
  
  <!-- Items Table -->
  <table>
    <thead>
      <tr>
        <th class="center" style="width: 30px;">#</th>
        <th>Item & Description</th>
        <th class="center" style="width: 70px;">No. of<br/>Hours</th>
        <th class="right" style="width: 70px;">Rate per<br/>Hour<br/>(AED)</th>
        <th class="center" style="width: 50px;">Tax %</th>
        <th class="right" style="width: 70px;">Tax (AED)</th>
        <th class="right" style="width: 85px;">Amount<br/>(AED)</th>
      </tr>
    </thead>
    <tbody>
      ${this.generateTableRows(invoice)}
    </tbody>
  </table>
  
  <!-- Totals -->
  <div style="display: flex; justify-content: flex-end;">
    <div class="totals-section">
      <div class="totals-row">
        <span>Total No. of Hours ${this.calculateTotalHours(invoice)}</span>
        <span>Total Taxable Amount</span>
        <span>${this.formatCurrency(totalTaxableAmount)}</span>
      </div>
      <div class="totals-row">
        <span></span>
        <span>Standard Rate (5%)</span>
        <span>${this.formatCurrency(totalTax)}</span>
      </div>
      <div class="totals-row grand-total">
        <span></span>
        <span>Total</span>
        <span>AED${this.formatCurrency(totalAmount)}</span>
      </div>
      <div class="totals-row" style="margin-top: 8px;">
        <span></span>
        <span>Balance Due</span>
        <span style="font-weight: bold;">AED${this.formatCurrency(totalAmount)}</span>
      </div>
    </div>
  </div>
  
  <!-- Total in Words -->
  ${
    invoice.totalInWords
      ? `
  <div class="total-in-words">
    Total in Words<br/>
    ${invoice.totalInWords}
  </div>
  `
      : ''
  }
  
  <!-- Bank Details -->
  <div class="bank-details">
    <div class="bank-details-title">Bank Details</div>
    A/C No.:0191004070662 A/C Name :ADAA Employment LLC<br/>
    IBAN No. :AE750330000019100470662 Branch Name:Sheikh Zayed<br/>
    Road Bank Name :MASHREQ BANK
  </div>
  
  <!-- Notes -->
  <div class="notes-section">
    <div class="notes-title">IMPORTANT NOTE:</div>
    NOTE 1: ANY ERROR IN THE INVOICE SHOULD BE NOTIFIED WITHIN 5<br/>
    WORKING DAYS ELSE WE WILL ASSUME THAT THE INVOICE IS<br/>
    CORRECT.<br/>
    NOTE 2: AFTER THE DUE DATE INTEREST SHOULD BE CALCULATED<br/>
    FROM THE DATE OF INVOICE.
  </div>
  
  <!-- Footer -->
  <div class="footer">
    <div class="footer-company">505 Lake Central Tower - Business Bay - Dubai, UAE</div>
    <div>info@adaaemployment.com - www.employment.com</div>
    <div>+971 4 574 1141 - P. O. Box : 393539</div>
  </div>
</body>
</html>
    `;
  }

  /**
   * Generate table rows for line items
   */
  private generateTableRows(invoice: Invoice): string {
    let rows = '';
    let rowNumber = 1;

    for (const lineItem of invoice.lineItems) {
      for (const variant of lineItem.rateVariants) {
        const hours = Number(variant.hours);
        const ratePerHour = Number(variant.ratePerHour);
        const taxPercentage = Number(variant.taxPercentage);
        const taxAmount = Number(variant.taxAmount);
        const amount = Number(variant.amount);

        rows += `
        <tr>
          <td class="center">${rowNumber}</td>
          <td>
            ${lineItem.skillName}<br/>
            <span style="font-size: 7.5px; color: #666;">${variant.variantName}</span>
          </td>
          <td class="center">${this.formatNumber(hours)}</td>
          <td class="right">${this.formatNumber(ratePerHour)}</td>
          <td class="center">${this.formatNumber(taxPercentage)}</td>
          <td class="right">${this.formatNumber(taxAmount)}</td>
          <td class="right">${this.formatNumber(amount)}</td>
        </tr>
        `;
        rowNumber++;
      }
    }

    return rows;
  }

  /**
   * Calculate total hours from all line items
   */
  private calculateTotalHours(invoice: Invoice): string {
    let total = 0;
    for (const lineItem of invoice.lineItems) {
      for (const variant of lineItem.rateVariants) {
        total += Number(variant.hours);
      }
    }
    return this.formatNumber(total);
  }

  /**
   * Format date as DD MMM YYYY
   */
  private formatDate(date: Date | string): string {
    const d = new Date(date);
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
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }

  /**
   * Format currency (no AED prefix in table cells)
   */
  private formatCurrency(amount: number): string {
    return amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  /**
   * Format number with 2 decimal places
   */
  private formatNumber(num: number): string {
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
}
