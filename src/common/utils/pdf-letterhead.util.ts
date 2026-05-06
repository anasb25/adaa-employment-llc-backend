/**
 * Letterhead + Chrome PDF margins for invoice/payroll.
 * Uses Puppeteer headerTemplate/footerTemplate so header/footer repeat on every page.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as puppeteer from 'puppeteer';

const LOGO_FILENAMES = [
  'letterhead-logo.png',
  'letterhead-logo.jpg',
  'letterhead-logo.jpeg',
  'logo-icon.png',
];

export const PDF_LETTERHEAD = {
  navy: '#16213e',
  orange: '#e85d04',
  muted: '#3d4f6f',
} as const;

const FOOTER_CONTACT = {
  phone: '+971 4 398 1139',
  email: 'info@adaaemployment.com',
  web: 'www.adaaemployment.com',
  address:
    'P.O.Box: 393539, 207, Al Asmawi Building, DIP 1, Dubai, UAE',
} as const;

/** Reserved for Chrome headerTemplate/footerTemplate (main body is inset — do not use @page{margin:0} in document HTML). */
export const PDF_LETTERHEAD_PAGE_MARGINS = {
  top: '38mm',
  bottom: '44mm',
  left: '15mm',
  right: '15mm',
} as const;

export function getPdfMainDocumentBaseCss(): string {
  return `
    /* Let page.pdf(margin) define insets; @page{margin:0} would bleed into header/footer */
    html { margin: 0; }
    body {
      margin: 0;
      padding: 5mm 0 0 0;
      box-sizing: border-box;
    }
  `;
}

function collectLogoSearchDirs(): string[] {
  return [
    ...new Set([
      path.join(process.cwd(), 'src', 'assets'),
      path.join(process.cwd(), 'dist', 'assets'),
      path.join(__dirname, '..', '..', '..', 'assets'),
      path.join(__dirname, '..', '..', '..', '..', 'src', 'assets'),
    ]),
  ];
}

export function resolveLetterheadLogoDataUri(): string {
  const dirs = collectLogoSearchDirs();
  for (const dir of dirs) {
    for (const file of LOGO_FILENAMES) {
      const full = path.join(dir, file);
      try {
        if (fs.existsSync(full)) {
          const buf = fs.readFileSync(full);
          const ext = path.extname(file).toLowerCase();
          const mime =
            ext === '.png'
              ? 'image/png'
              : ext === '.jpg' || ext === '.jpeg'
                ? 'image/jpeg'
                : 'image/png';
          return `data:${mime};base64,${buf.toString('base64')}`;
        }
      } catch {
        // continue
      }
    }
  }
  return '';
}

export function escapePdfPlainText(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const { navy, orange } = PDF_LETTERHEAD;

function svgPhone(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="${orange}" style="flex-shrink:0"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>`;
}

function svgEnvelope(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="${orange}" style="flex-shrink:0"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>`;
}

function svgGlobe(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${orange}" stroke-width="1.85" stroke-linecap="round" style="flex-shrink:0"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 3.8 2.6 14.2 0 18M12 3c-2.6 3.8-2.6 14.2 0 18"/></svg>`;
}

function svgPin(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="${orange}" style="flex-shrink:0"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`;
}

/**
 * Puppeteer-only: appears at top of every PDF page (inline styles required).
 */
export function buildPuppeteerHeaderTemplate(logoDataUri: string): string {
  const left = logoDataUri
    ? `<img src="${logoDataUri}" alt="" style="height:40px;max-width:200px;width:auto;object-fit:contain;display:block;" />`
    : `<span style="font-size:14px;font-weight:bold;color:${navy};">ADAA EMPLOYMENT</span>`;

  return `
<div style="width:100%;-webkit-print-color-adjust:exact;print-color-adjust:exact;box-sizing:border-box;margin:0;padding:6px 10mm 10px;font-family:Arial,Helvetica,sans-serif;font-size:10px;color:${navy};border-bottom:2px solid ${navy};position:relative;display:flex;justify-content:space-between;align-items:center;">
  <span style="position:absolute;left:4mm;top:50%;margin-top:-4px;width:8px;height:8px;background:${orange};border-radius:1px;"></span>
  <span style="position:absolute;right:4mm;top:50%;margin-top:-4px;width:8px;height:8px;background:${orange};border-radius:1px;"></span>
  <div style="padding-left:16px;display:flex;align-items:center;">${left}</div>
  <div style="padding-right:16px;font-size:11px;font-weight:600;color:${navy};letter-spacing:0.35px;white-space:nowrap;">Engage. Produce. Grow</div>
</div>`;
}

/**
 * Puppeteer-only: pinned to bottom band of every PDF page — matches brand footer (icons + two rows).
 */
export function buildPuppeteerFooterTemplate(supplementalPlainText?: string): string {
  const { phone, email, web, address } = FOOTER_CONTACT;

  const item = (
    svg: string,
    labelHtml: string,
  ) => `<span style="display:inline-flex;align-items:center;gap:6px;white-space:nowrap;">${svg}<span style="color:${navy};font-size:9px;">${labelHtml}</span></span>`;

  const row1 = `
    <div style="display:flex;flex-wrap:wrap;justify-content:center;align-items:center;column-gap:28px;row-gap:6px;margin-bottom:8px;">
      ${item(svgPhone(), phone)}
      ${item(svgEnvelope(), email)}
      ${item(svgGlobe(), web)}
    </div>`;

  const row2 = `
    <div style="display:flex;justify-content:center;align-items:center;gap:6px;">
      ${svgPin()}<span style="color:${navy};font-size:9px;text-align:center;">${address}</span>
    </div>`;

  const note = supplementalPlainText
    ? `<div style="margin-top:8px;text-align:center;font-size:7.5px;color:${PDF_LETTERHEAD.muted};line-height:1.4;">${escapePdfPlainText(supplementalPlainText)}</div>`
    : '';

  return `
<div style="width:100%;-webkit-print-color-adjust:exact;print-color-adjust:exact;box-sizing:border-box;margin:0;padding:8px 8mm 4px;font-family:Arial,Helvetica,sans-serif;border-top:2px solid ${navy};">
  ${row1}
  ${row2}
  ${note}
</div>`;
}

/**
 * Renders HTML body to PDF with repeating letterhead header/footer on all pages.
 */
export async function printHtmlToPdfWithLetterhead(
  html: string,
  supplementalFooterNote?: string,
): Promise<Buffer> {
  const logo = resolveLetterheadLogoDataUri();
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: buildPuppeteerHeaderTemplate(logo),
      footerTemplate: buildPuppeteerFooterTemplate(supplementalFooterNote),
      margin: { ...PDF_LETTERHEAD_PAGE_MARGINS },
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}
