import nodemailer from "nodemailer";

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
}

const FROM = process.env.SMTP_FROM || "noreply@musiccollabhub.com";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3000";

export async function sendVerificationEmail(
  to: string,
  token: string,
): Promise<void> {
  const verifyUrl = `${APP_URL}/api/auth/verify-email?token=${token}`;

  if (!process.env.SMTP_HOST) {
    console.log(`[email] Verification email to ${to}: ${verifyUrl}`);
    return;
  }

  await getTransporter().sendMail({
    from: FROM,
    to,
    subject: "Verify your MusicCollabHub account",
    html: `
      <h1>Welcome to MusicCollabHub</h1>
      <p>Click the link below to verify your email address:</p>
      <p><a href="${verifyUrl}">Verify Email</a></p>
      <p>This link expires in 24 hours.</p>
      <p>If you didn't create an account, you can ignore this email.</p>
    `,
  });
}

export async function sendPasswordResetEmail(
  to: string,
  token: string,
): Promise<void> {
  const resetUrl = `${APP_URL}/reset-password?token=${token}`;

  if (!process.env.SMTP_HOST) {
    console.log(`[email] Password reset email to ${to}: ${resetUrl}`);
    return;
  }

  await getTransporter().sendMail({
    from: FROM,
    to,
    subject: "Reset your MusicCollabHub password",
    html: `
      <h1>Reset your password</h1>
      <p>Click the link below to set a new password:</p>
      <p><a href="${resetUrl}">Reset Password</a></p>
      <p>This link expires in 1 hour.</p>
      <p>If you didn't request a password reset, you can ignore this email.</p>
    `,
  });
}

export async function sendAccountDeleteVerifyEmail(
  to: string,
  token: string,
): Promise<void> {
  const verifyUrl = `${APP_URL}/api/account/delete-request/verify?token=${token}`;

  if (!process.env.SMTP_HOST) {
    console.log(`[email] Account delete verify email to ${to}: ${verifyUrl}`);
    return;
  }

  await getTransporter().sendMail({
    from: FROM,
    to,
    subject: "Confirm your MusicCollabHub account deletion request",
    html: `
      <h1>Confirm account deletion</h1>
      <p>You requested to delete your MusicCollabHub account. Click the link below
         to confirm. After confirmation, your account will be permanently deleted
         in 30 days. You can cancel anytime before then from
         <a href="${APP_URL}/settings/account">Account settings</a>.</p>
      <p><a href="${verifyUrl}">Confirm deletion</a></p>
      <p>This link expires in 1 hour.</p>
      <p>If you didn't request this, ignore this email and review your account
         security.</p>
    `,
  });
}

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

  if (!process.env.SMTP_HOST) {
    console.log(`[email] Invitation email to ${opts.to}: ${inviteUrl}`);
    return true;
  }

  try {
    await getTransporter().sendMail({
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

/**
 * Notify a trialing user that their trial ends soon.
 *
 * Best-effort: logs failures but does not throw.
 */
export async function sendTrialEndingEmail(
  to: string,
  opts: { daysRemaining: number; trialEndsAt: Date },
): Promise<boolean> {
  const pricingUrl = `${APP_URL}/pricing`;
  const dayLabel = opts.daysRemaining === 1 ? "day" : "days";
  const endDate = opts.trialEndsAt.toISOString().slice(0, 10);

  if (!process.env.SMTP_HOST) {
    console.log(
      `[email] Trial ending email to ${to}: ${opts.daysRemaining} ${dayLabel} left (ends ${endDate})`,
    );
    return true;
  }

  try {
    await getTransporter().sendMail({
      from: FROM,
      to,
      subject: `Your MusicCollabHub trial ends in ${opts.daysRemaining} ${dayLabel}`,
      text: [
        `Your free trial ends on ${endDate} (${opts.daysRemaining} ${dayLabel} from now).`,
        "",
        `Choose a plan to keep working without interruption: ${pricingUrl}`,
      ].join("\n"),
      html: `
        <p>Your free trial ends on <strong>${endDate}</strong>
        (${opts.daysRemaining} ${dayLabel} from now).</p>
        <p>Choose a plan to keep working without interruption.</p>
        <p><a href="${pricingUrl}">View plans</a></p>
      `,
    });
    return true;
  } catch (error) {
    console.error("[Email] Failed to send trial ending email:", { to, error });
    return false;
  }
}

/**
 * Notify a user that their trial has expired.
 *
 * Best-effort: logs failures but does not throw.
 */
export async function sendTrialExpiredEmail(to: string): Promise<boolean> {
  const pricingUrl = `${APP_URL}/pricing`;

  if (!process.env.SMTP_HOST) {
    console.log(`[email] Trial expired email to ${to}: ${pricingUrl}`);
    return true;
  }

  try {
    await getTransporter().sendMail({
      from: FROM,
      to,
      subject: "Your MusicCollabHub trial has expired",
      text: [
        "Your free trial has expired and your account is now read-only.",
        "",
        `Choose a plan to restore full access: ${pricingUrl}`,
      ].join("\n"),
      html: `
        <p>Your free trial has expired and your account is now read-only.</p>
        <p>Choose a plan to restore full access.</p>
        <p><a href="${pricingUrl}">View plans</a></p>
      `,
    });
    return true;
  } catch (error) {
    console.error("[Email] Failed to send trial expired email:", { to, error });
    return false;
  }
}

/**
 * Notify the split owner that a contributor has confirmed or rejected their allocation.
 *
 * Best-effort: logs failures but does not throw.
 */
export async function sendConfirmationResponseEmail(opts: {
  to: string;
  contributorEmail: string;
  projectTitle: string;
  response: "confirmed" | "rejected";
}): Promise<boolean> {
  const verb = opts.response === "confirmed" ? "confirmed" : "rejected";

  if (!process.env.SMTP_HOST) {
    console.log(
      `[email] Split confirmation: ${opts.contributorEmail} ${verb} their allocation in "${opts.projectTitle}"`,
    );
    return true;
  }

  try {
    await getTransporter().sendMail({
      from: FROM,
      to: opts.to,
      subject: `Split ${verb} — "${opts.projectTitle}" on MusicCollabHub`,
      text: [
        `${opts.contributorEmail} has ${verb} their split allocation in "${opts.projectTitle}".`,
        "",
        `Log in to MusicCollabHub to view the current status.`,
      ].join("\n"),
      html: `
        <p><strong>${opts.contributorEmail}</strong> has <strong>${verb}</strong> their split allocation
        in <strong>"${opts.projectTitle}"</strong>.</p>
        <p>Log in to MusicCollabHub to view the current status.</p>
      `,
    });
    return true;
  } catch (error) {
    console.error("[Email] Failed to send confirmation response email:", {
      to: opts.to,
      error,
    });
    return false;
  }
}
