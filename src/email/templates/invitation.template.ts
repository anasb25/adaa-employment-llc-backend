import { useLayoutTemplate } from '../layout-template';

export const invitationEmailTemplate = (invitation: {
  inviter: { firstName: string; lastName: string };
  role: string;
  expiresAt: Date;
  invitationUrl: string;
}) => {
  const content = `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #111827; background-color: #ffffff; padding: 24px 32px; border-radius: 8px;">
  
  <!-- Title -->
  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="color: #161950; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.3px;">
      You're Invited!
    </h1>
  </div>

  <!-- Message -->
  <div style="margin-bottom: 28px;">
    <p style="color: #374151; font-size: 16px; line-height: 1.7; margin: 0 0 16px 0;">
      Hello,
    </p>
    <p style="color: #374151; font-size: 16px; line-height: 1.7; margin: 0;">
      You’ve been invited by
      <strong style="color: #161950;">
        ${invitation.inviter.firstName} ${invitation.inviter.lastName}
      </strong>
      to join our platform.
    </p>
  </div>

  <!-- Invitation Details -->
  <div style="background-color: #f9fafb; padding: 24px 28px; border-radius: 8px; border-left: 5px solid #161950; margin-bottom: 32px;">
    <h3 style="color: #161950; margin-top: 0; margin-bottom: 16px; font-size: 18px; font-weight: 600;">
      Invitation Details
    </h3>
    <p style="color: #374151; margin: 8px 0;">
      <strong>Role:</strong> ${invitation.role}
    </p>
    <p style="color: #374151; margin: 8px 0;">
      <strong>Expires:</strong> ${invitation.expiresAt.toLocaleDateString()}
    </p>
  </div>

  <!-- Call to Action -->
  <div style="text-align: center; margin-bottom: 8px;">
    <a href="${invitation.invitationUrl}"
       style="background-color: #161950; color: #ffffff; padding: 14px 36px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600; font-size: 16px; letter-spacing: 0.3px;">
      Accept Invitation
    </a>
  </div>

  <!-- Optional Note -->
  <div style="text-align: center; margin-top: 20px;">
  </div>

</div>
  `;

  return useLayoutTemplate(content);
};
