import nodemailer from "nodemailer";
import { Resend } from "resend";

let transporter: nodemailer.Transporter | null = null;
let resendClient: Resend | null = null;

function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter;

  // Prefer Resend SDK if API key is set
  if (process.env.RESEND_API_KEY) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }

  // Fallback to SMTP transport (for local dev or when Resend not configured)
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

/**
 * Send an email via Resend (preferred) or SMTP (fallback).
 */
async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<boolean> {
  try {
    // Try Resend SDK first
    if (resendClient) {
      await resendClient.emails.send({
        from: FROM,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
      });
      return true;
    }

    // Fallback to SMTP
    if (process.env.SMTP_HOST) {
      await getTransporter().sendMail({
        from: FROM,
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
      });
      return true;
    }

    // No email provider configured — log only
    console.log(`[email] No provider configured, would send to ${opts.to}: ${opts.subject}`);
    return true;
  } catch (error) {
    console.error("[Email] Failed to send email:", { to: opts.to, error });
    return false;
  }
}

export async function sendVerificationEmail(
  to: string,
  token: string,
): Promise<void> {
  const verifyUrl = `${APP_URL}/api/auth/verify-email?token=${token}`;

  await sendMail({
    to,
    subject: "Verify your MusicCollabHub account",
    text: `Click the link below to verify your email address: ${verifyUrl}`,
    html: `
      <h1>Welcome to MusicCollabHub</h1>
      <p>Click the link below to verify your email address:</p>
      <p><a href="${verifyUrl}">Verify Email</a></p>
      <p>This link expires in 24 hours.</p>
      <p>If you didn't create an account, you can ignore this email.</p>
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

  return sendMail({
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

  return sendMail({
    to: opts.to,
    subject: `Split ${verb} — "${opts.projectTitle}" on MusicCollabHub`,
    text: [
      `${opts.contributorEmail} has ${verb} their split allocation in "${opts.projectTitle}".`,
      "",
      "Log in to MusicCollabHub to view the current status.",
    ].join("\n"),
    html: `
      <p><strong>${opts.contributorEmail}</strong> has <strong>${verb}</strong> their split allocation
      in <strong>"${opts.projectTitle}"</strong>.</p>
      <p>Log in to MusicCollabHub to view the current status.</p>
    `,
  });
}

/**
 * Send trial ending soon notification.
 * Best-effort: logs failures but does not throw.
 */
export async function sendTrialEndingEmail(opts: {
  to: string;
  daysLeft: number;
}): Promise<boolean> {
  return sendMail({
    to: opts.to,
    subject: "Your MusicCollabHub trial ends soon",
    text: `Your free trial ends in ${opts.daysLeft} day(s). Upgrade now to keep your projects.`,
    html: `
      <p>Your MusicCollabHub free trial ends in <strong>${opts.daysLeft} day(s)</strong>.</p>
      <p>Upgrade now to keep access to your projects and collaborators.</p>
      <p><a href="${APP_URL}/pricing">View Plans</a></p>
    `,
  });
}

/**
 * Send trial expired notification.
 * Best-effort: logs failures but does not throw.
 */
export async function sendTrialExpiredEmail(opts: {
  to: string;
}): Promise<boolean> {
  return sendMail({
    to: opts.to,
    subject: "Your MusicCollabHub trial has expired",
    text: "Your free trial has expired. Upgrade to restore access.",
    html: `
      <p>Your MusicCollabHub free trial has <strong>expired</strong>.</p>
      <p>Your projects and data are safe. Upgrade to restore full access.</p>
      <p><a href="${APP_URL}/pricing">View Plans</a></p>
    `,
  });
}

/**
 * Send account deletion verification email.
 * Best-effort: logs failures but does not throw.
 */
export async function sendAccountDeleteVerifyEmail(opts: {
  to: string;
  verifyCode: string;
  requestId: string;
}): Promise<boolean> {
  return sendMail({
    to: opts.to,
    subject: "Confirm your MusicCollabHub account deletion",
    text: `Enter code ${opts.verifyCode} to confirm account deletion. Request ID: ${opts.requestId}`,
    html: `
      <p>You requested to delete your MusicCollabHub account.</p>
      <p>Verification code: <strong>${opts.verifyCode}</strong></p>
      <p>Request ID: ${opts.requestId}</p>
      <p>If you didn't request this, ignore this email.</p>
    `,
  });
}

/**
 * Send password reset email.
 * Best-effort: logs failures but does not throw.
 */
export async function sendPasswordResetEmail(opts: {
  to: string;
  token: string;
}): Promise<boolean> {
  const resetUrl = `${APP_URL}/reset-password?token=${opts.token}`;
  return sendMail({
    to: opts.to,
    subject: "Reset your MusicCollabHub password",
    text: `Click the link to reset your password: ${resetUrl}`,
    html: `
      <p>Click the link below to reset your MusicCollabHub password:</p>
      <p><a href="${resetUrl}">Reset Password</a></p>
      <p>This link expires in 1 hour.</p>
      <p>If you didn't request a password reset, ignore this email.</p>
    `,
  });
}
