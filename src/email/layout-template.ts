const template = `<!DOCTYPE html>
<html lang="en" style="margin: 0; padding: 0; background-color: #f6f9fc; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ADAA Employment LLC</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: #f6f9fc;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f6f9fc; padding: 40px 0;">
      <tr>
        <td align="center">
          <!-- Main Container -->
          <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #e6e6e6; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
            
            <!-- Header -->
            <tr>
              <td align="center" style="background-color: #161950; padding: 24px;">
                <a href="https://adaaemployment.com" target="_blank" style="text-decoration: none; display: inline-flex; align-items: center;">
                  
                  <span style="margin-left: 12px; color: #ffffff; font-weight: 600; font-size: 20px;">
                    ADAA Employment LLC
                  </span>
                </a>
              </td>
            </tr>

            <!-- Divider -->
            <tr>
              <td style="border-bottom: 1px solid #e5e7eb;"></td>
            </tr>

            <!-- Dynamic Email Content -->
            <tr>
              <td style="padding: 32px 40px; color: #111827; font-size: 15px; line-height: 1.6;">
                {{content}}
              </td>
            </tr>

            <!-- Divider -->
            <tr>
              <td style="border-top: 1px solid #e5e7eb;"></td>
            </tr>

            <!-- Footer -->
            <tr>
              <td align="center" style="padding: 16px 24px; font-size: 13px; color: white; background-color: #9aa1ad;">
                <p style="margin: 0;">This is an automated message — please do not reply directly to this email.</p>
                <p style="margin: 6px 0;">ADAA Employment LLC. All rights reserved.</p>
                <p style="margin: 0;">
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

export function useLayoutTemplate(content: string) {
  return template.replace('{{content}}', content);
}
