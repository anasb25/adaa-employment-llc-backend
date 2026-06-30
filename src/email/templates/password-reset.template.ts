import { useLayoutTemplate } from '../layout-template';

export const passwordResetEmailTemplate = (resetUrl: string) => {
  const content = `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #111827; background-color: #ffffff; padding: 24px 32px; border-radius: 8px;">
      
      <!-- Title -->
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #161950; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.3px;">
          Password Reset Request
        </h1>
      </div>

      <!-- Message -->
      <div style="margin-bottom: 28px;">
        <p style="color: #374151; font-size: 16px; line-height: 1.7; margin: 0 0 16px 0;">
          Hello,
        </p>
        <p style="color: #374151; font-size: 16px; line-height: 1.7; margin: 0;">
          You requested to reset your password for your ADAA Employment LLC account. Click the button below to reset your password.
        </p>
      </div>

      <!-- Call to Action -->
      <div style="text-align: center; margin-bottom: 32px;">
        <a href="${resetUrl}"
           style="background-color: #161950; color: #ffffff; padding: 14px 36px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600; font-size: 16px; letter-spacing: 0.3px;">
          Reset Password
        </a>
      </div>

      <!-- Security Note -->
      <div style="background-color: #f9fafb; padding: 16px; border-radius: 6px; border-left: 4px solid #f59e0b;">
        <p style="color: #92400e; font-size: 14px; margin: 0;">
          <strong>Security Note:</strong> This link will expire in 1 hour. If you didn't request this password reset, please ignore this email and your password will remain unchanged.
        </p>
      </div>

      <!-- Alternative Link -->
      <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
        <p style="color: #6b7280; font-size: 14px; margin: 0;">
          If the button doesn't work, you can copy and paste this link into your browser:
        </p>
        <p style="color: #161950; font-size: 12px; margin: 8px 0 0 0; word-break: break-all;">
          ${resetUrl}
        </p>
      </div>

    </div>
  `;

  return useLayoutTemplate(content);
};
