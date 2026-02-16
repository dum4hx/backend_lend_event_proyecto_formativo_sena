import nodemailer from "nodemailer";
import { logger } from "./logger.ts";

/* ---------- Email Configuration ---------- */

const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587", 10);
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM = process.env.SMTP_FROM || "noreply@lendevent.com";

if (!SMTP_USER || !SMTP_PASS) {
  logger.warn(
    "SMTP_USER or SMTP_PASS not set. Email features will be unavailable.",
  );
}

/* ---------- Transporter ---------- */

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

/* ---------- Email Service ---------- */

export const emailService = {
  /**
   * Sends a password reset OTP code to the user's email.
   */
  async sendPasswordResetCode(
    to: string,
    code: string,
    firstName: string,
  ): Promise<void> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1a1a2e;">LendEvent Password Reset</h2>
        <p>Hi <strong>${firstName}</strong>,</p>
        <p>You requested a password reset. Use the following verification code to continue:</p>
        <div style="background: #f4f4f8; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1a1a2e;">${code}</span>
        </div>
        <p>This code expires in <strong>10 minutes</strong>.</p>
        <p style="color: #888; font-size: 13px;">If you did not request this, please ignore this email. Your password will remain unchanged.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #aaa; font-size: 12px;">LendEvent &mdash; Event Rental Management</p>
      </div>
    `;

    await transporter.sendMail({
      from: `"LendEvent" <${SMTP_FROM}>`,
      to,
      subject: "Password Reset Verification Code",
      html,
    });

    logger.info("Password reset code sent", { to });
  },

  /**
   * Sends an organization invite email with a link to accept the invitation.
   */
  async sendInviteEmail(
    to: string,
    firstName: string,
    organizationName: string,
    inviteUrl: string,
    expiryHours: number,
  ): Promise<void> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1a1a2e;">You're Invited to LendEvent</h2>
        <p>Hi <strong>${firstName}</strong>,</p>
        <p>You've been invited to join <strong>${organizationName}</strong> on LendEvent.</p>
        <p>Click the button below to set up your password and activate your account:</p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${inviteUrl}" style="background: #1a1a2e; color: #fff; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">Accept Invitation</a>
        </div>
        <p style="color: #888; font-size: 13px;">Or copy and paste this URL into your browser:</p>
        <p style="color: #555; font-size: 13px; word-break: break-all;">${inviteUrl}</p>
        <p>This invitation expires in <strong>${expiryHours} hours</strong>.</p>
        <p style="color: #888; font-size: 13px;">If you were not expecting this invitation, you can safely ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #aaa; font-size: 12px;">LendEvent &mdash; Event Rental Management</p>
      </div>
    `;

    await transporter.sendMail({
      from: `"LendEvent" <${SMTP_FROM}>`,
      to,
      subject: `You're invited to join ${organizationName} on LendEvent`,
      html,
    });

    logger.info("Invite email sent", { to, organizationName });
  },
};
