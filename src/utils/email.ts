import nodemailer from "nodemailer";
import BrevoTransport from "nodemailer-brevo-transport";
import { logger } from "./logger.ts";

/* ---------- Email Configuration ---------- */

const BREVO_API_KEY = process.env.BREVO_API_KEY || "";
const SMTP_FROM = process.env.SMTP_FROM || "noreply@lendevent.com";

if (!BREVO_API_KEY) {
  logger.warn("BREVO_API_KEY not set. Email features will be unavailable.");
}

/* ---------- Transporter (Brevo API over HTTPS / port 443) ---------- */

const transporter = nodemailer.createTransport(
  new (BrevoTransport as unknown as new (opts: {
    apiKey: string;
  }) => nodemailer.Transport)({ apiKey: BREVO_API_KEY }),
);

/* ---------- Email Service ---------- */

export const emailService = {
  /**
   * Sends an email verification OTP to a newly registered user.
   */
  async sendEmailVerificationCode(
    to: string,
    code: string,
    firstName: string,
  ): Promise<void> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1a1a2e;">Verify your LendEvent account</h2>
        <p>Hi <strong>${firstName}</strong>,</p>
        <p>Thank you for registering. Use the following code to verify your email address and activate your account:</p>
        <div style="background: #f4f4f8; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1a1a2e;">${code}</span>
        </div>
        <p>This code expires in <strong>5 minutes</strong>.</p>
        <p style="color: #888; font-size: 13px;">If you did not register for LendEvent, you can safely ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #aaa; font-size: 12px;">LendEvent &mdash; Event Rental Management</p>
      </div>
    `;

    await transporter.sendMail({
      from: `"LendEvent" <${SMTP_FROM}>`,
      to,
      subject: "Verify your LendEvent account",
      html,
    });

    logger.info("Email verification code sent", { to });
  },

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

  /**
   * Sends an invoice email to a customer with line items and total.
   */
  async sendInvoiceEmail(
    to: string,
    firstName: string,
    invoice: {
      invoiceNumber: string;
      type: string;
      lineItems: Array<{
        description: string;
        quantity: number;
        unitPrice: number;
        totalPrice: number;
      }>;
      subtotal: number;
      taxAmount: number;
      totalAmount: number;
      amountPaid: number;
      amountDue: number;
      dueDate: Date;
      notes?: string | null | undefined;
    },
  ): Promise<void> {
    const lineItemsHtml = invoice.lineItems
      .map(
        (item) => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.description}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">$${item.unitPrice.toFixed(2)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">$${item.totalPrice.toFixed(2)}</td>
        </tr>`,
      )
      .join("");

    const dueDateStr = new Date(invoice.dueDate).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1a1a2e;">Invoice ${invoice.invoiceNumber}</h2>
        <p>Hi <strong>${firstName}</strong>,</p>
        <p>You have a new invoice from LendEvent. Here are the details:</p>

        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <thead>
            <tr style="background: #f4f4f8;">
              <th style="padding: 8px; text-align: left;">Description</th>
              <th style="padding: 8px; text-align: center;">Qty</th>
              <th style="padding: 8px; text-align: right;">Unit Price</th>
              <th style="padding: 8px; text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${lineItemsHtml}
          </tbody>
        </table>

        <div style="text-align: right; margin-top: 16px;">
          <p style="margin: 4px 0;">Subtotal: <strong>$${invoice.subtotal.toFixed(2)}</strong></p>
          <p style="margin: 4px 0;">Tax: <strong>$${invoice.taxAmount.toFixed(2)}</strong></p>
          <p style="margin: 4px 0; font-size: 18px;">Total: <strong>$${invoice.totalAmount.toFixed(2)}</strong></p>
          ${invoice.amountPaid > 0 ? `<p style="margin: 4px 0;">Paid: <strong>$${invoice.amountPaid.toFixed(2)}</strong></p>` : ""}
          <p style="margin: 4px 0; color: ${invoice.amountDue > 0 ? "#c0392b" : "#27ae60"};">Amount Due: <strong>$${invoice.amountDue.toFixed(2)}</strong></p>
        </div>

        <p style="margin-top: 16px;"><strong>Due Date:</strong> ${dueDateStr}</p>
        ${invoice.notes ? `<p style="color: #555;"><strong>Notes:</strong> ${invoice.notes}</p>` : ""}

        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #aaa; font-size: 12px;">LendEvent &mdash; Event Rental Management</p>
      </div>
    `;

    await transporter.sendMail({
      from: `"LendEvent" <${SMTP_FROM}>`,
      to,
      subject: `Invoice ${invoice.invoiceNumber} — $${invoice.amountDue.toFixed(2)} due by ${dueDateStr}`,
      html,
    });

    logger.info("Invoice email sent", {
      to,
      invoiceNumber: invoice.invoiceNumber,
    });
  },

  /**
   * Sends a notification that a loan is overdue.
   */
  async sendOverdueLoanNotification(
    to: string,
    firstName: string,
    loan: {
      loanId: string;
      customerName: string;
      endDate: Date;
      daysOverdue: number;
    },
  ): Promise<void> {
    const endDateStr = new Date(loan.endDate).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #c0392b;">Overdue Loan Alert</h2>
        <p>Hi <strong>${firstName}</strong>,</p>
        <p>Loan <strong>${loan.loanId}</strong> for customer <strong>${loan.customerName}</strong> is now <strong>${loan.daysOverdue} day(s) overdue</strong>.</p>
        <p>The loan was due on <strong>${endDateStr}</strong>. Please arrange for the return of materials as soon as possible.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #aaa; font-size: 12px;">LendEvent &mdash; Event Rental Management</p>
      </div>
    `;

    await transporter.sendMail({
      from: `"LendEvent" <${SMTP_FROM}>`,
      to,
      subject: `Overdue Loan Alert — Loan ${loan.loanId} (${loan.daysOverdue} days overdue)`,
      html,
    });

    logger.info("Overdue loan notification sent", { to, loanId: loan.loanId });
  },

  /**
   * Sends a notification that a loan request has expired.
   */
  async sendRequestExpiredNotification(
    to: string,
    firstName: string,
    request: {
      requestId: string;
      customerName: string;
      depositDueDate: Date;
    },
  ): Promise<void> {
    const dueDateStr = new Date(request.depositDueDate).toLocaleDateString(
      "en-US",
      { year: "numeric", month: "long", day: "numeric" },
    );

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #e67e22;">Request Expired</h2>
        <p>Hi <strong>${firstName}</strong>,</p>
        <p>Loan request <strong>${request.requestId}</strong> for customer <strong>${request.customerName}</strong> has expired because the deposit was not paid by the deadline (<strong>${dueDateStr}</strong>).</p>
        <p>Any reserved materials have been released. A new request can be created if needed.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #aaa; font-size: 12px;">LendEvent &mdash; Event Rental Management</p>
      </div>
    `;

    await transporter.sendMail({
      from: `"LendEvent" <${SMTP_FROM}>`,
      to,
      subject: `Request Expired — Request ${request.requestId}`,
      html,
    });

    logger.info("Request expired notification sent", {
      to,
      requestId: request.requestId,
    });
  },

  /**
   * Sends a reminder that a deposit refund is pending action.
   */
  async sendDepositRefundReminder(
    to: string,
    firstName: string,
    loan: {
      loanId: string;
      customerName: string;
      depositAmount: number;
      daysPending: number;
    },
  ): Promise<void> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #2980b9;">Deposit Refund Reminder</h2>
        <p>Hi <strong>${firstName}</strong>,</p>
        <p>Loan <strong>${loan.loanId}</strong> for customer <strong>${loan.customerName}</strong> has a deposit of <strong>$${loan.depositAmount.toFixed(2)}</strong> pending refund for <strong>${loan.daysPending} day(s)</strong>.</p>
        <p>Please process the refund at your earliest convenience.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #aaa; font-size: 12px;">LendEvent &mdash; Event Rental Management</p>
      </div>
    `;

    await transporter.sendMail({
      from: `"LendEvent" <${SMTP_FROM}>`,
      to,
      subject: `Deposit Refund Reminder — Loan ${loan.loanId} ($${loan.depositAmount.toFixed(2)})`,
      html,
    });

    logger.info("Deposit refund reminder sent", {
      to,
      loanId: loan.loanId,
    });
  },

  /**
   * Sends a login verification OTP code for two-factor authentication.
   */
  async sendLoginOtpCode(
    to: string,
    code: string,
    firstName: string,
  ): Promise<void> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1a1a2e;">LendEvent Login Verification</h2>
        <p>Hi <strong>${firstName}</strong>,</p>
        <p>Use the following code to complete your login:</p>
        <div style="background: #f4f4f8; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1a1a2e;">${code}</span>
        </div>
        <p>This code expires in <strong>5 minutes</strong>.</p>
        <p style="color: #888; font-size: 13px;">If you did not attempt to log in, someone may be trying to access your account. You can safely ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #aaa; font-size: 12px;">LendEvent &mdash; Event Rental Management</p>
      </div>
    `;

    await transporter.sendMail({
      from: `"LendEvent" <${SMTP_FROM}>`,
      to,
      subject: "LendEvent Login Verification Code",
      html,
    });

    logger.info("Login OTP code sent", { to });
  },
};
