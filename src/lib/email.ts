import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM = process.env.SMTP_FROM || "noreply@musiccollabhub.com";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/**
 * Send a project invitation email.
 *
 * Best-effort: logs failures but does not throw.
 * The invitation is persisted in the DB regardless of email delivery.
 */
export async function sendInvitationEmail(opts: {
  to: string;
  inviterEmail: string;
  projectTitle: string;
  role: string;
  token: string;
}): Promise<boolean> {
  const inviteUrl = `${APP_URL}/invitations/accept?token=${opts.token}`;

  try {
    await transporter.sendMail({
      from: FROM,
      to: opts.to,
      subject: `You've been invited to "${opts.projectTitle}" on MusicCollabHub`,
      text: [
        `${opts.inviterEmail} invited you to collaborate on "${opts.projectTitle}" as ${opts.role}.`,
        "",
        `Accept the invitation: ${inviteUrl}`,
        "",
        "This invitation expires in 7 days.",
      ].join("\n"),
      html: `
        <p><strong>${opts.inviterEmail}</strong> invited you to collaborate on
        <strong>"${opts.projectTitle}"</strong> as <strong>${opts.role}</strong>.</p>
        <p><a href="${inviteUrl}">Accept Invitation</a></p>
        <p style="color:#666;font-size:12px">This invitation expires in 7 days.</p>
      `,
    });
    return true;
  } catch (error) {
    console.error("[Email] Failed to send invitation email:", {
      to: opts.to,
      error,
    });
    return false;
  }
}
