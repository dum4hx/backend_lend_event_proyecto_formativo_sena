import * as argon2 from "argon2";
import crypto from "node:crypto";
import { Types } from "mongoose";
import { LoginOtp } from "./models/login_otp.model.ts";
import { User } from "../user/models/user.model.ts";
import { emailService } from "../../utils/email.ts";
import { AppError } from "../../errors/AppError.ts";
import { logger } from "../../utils/logger.ts";

const LOGIN_OTP_LENGTH = 6;
const LOGIN_OTP_EXPIRY_MINUTES = 5;
const MAX_OTP_ATTEMPTS = 5;
const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_LENGTH = 8;

/* ---------- Two-Factor Auth Service ---------- */

export const twoFactorService = {
  /**
   * Generates a 6-digit OTP, stores a hashed copy, and sends it to the
   * user's email. Invalidates any previous OTP for the same user.
   */
  async sendLoginOtp(
    userId: Types.ObjectId | string,
    email: string,
    firstName: string,
  ): Promise<void> {
    // Invalidate previous OTPs for this user
    await LoginOtp.deleteMany({ userId });

    const code =
      process.env.NODE_ENV === "test"
        ? "123456"
        : crypto
            .randomInt(0, 10 ** LOGIN_OTP_LENGTH)
            .toString()
            .padStart(LOGIN_OTP_LENGTH, "0");

    const hashedCode = await argon2.hash(code);

    await LoginOtp.create({
      userId,
      email: email.toLowerCase().trim(),
      code: hashedCode,
      expiresAt: new Date(Date.now() + LOGIN_OTP_EXPIRY_MINUTES * 60 * 1000),
    });

    // Send email (same pattern as forgotPassword — always call the service)
    await emailService.sendLoginOtpCode(email, code, firstName);

    logger.info("Login OTP sent", { userId: userId.toString(), email });
  },

  /**
   * Verifies the OTP code submitted by the user during login.
   * Returns `true` on success, throws on failure.
   */
  async verifyLoginOtp(
    email: string,
    code: string,
  ): Promise<{ userId: string }> {
    const normalizedEmail = email.toLowerCase().trim();

    const record = await LoginOtp.findOne({ email: normalizedEmail });

    if (!record) {
      throw AppError.badRequest(
        "No pending login verification found. Please log in again.",
        { code: "OTP_NOT_FOUND" },
      );
    }

    if (record.expiresAt < new Date()) {
      await LoginOtp.deleteOne({ _id: record._id });
      throw AppError.badRequest(
        "Verification code has expired. Please log in again to receive a new code.",
        { code: "OTP_EXPIRED" },
      );
    }

    if (record.attempts >= MAX_OTP_ATTEMPTS) {
      await LoginOtp.deleteOne({ _id: record._id });
      throw AppError.badRequest(
        "Too many failed verification attempts. Please log in again to receive a new code.",
        { code: "OTP_MAX_ATTEMPTS" },
      );
    }

    const isValid = await argon2.verify(record.code, code);
    if (!isValid) {
      record.attempts += 1;
      await record.save();
      const remaining = MAX_OTP_ATTEMPTS - record.attempts;
      throw AppError.badRequest(
        `Invalid verification code. ${remaining} attempt(s) remaining.`,
        { code: "OTP_INVALID", attemptsLeft: remaining },
      );
    }

    // OTP verified — clean up
    const userId = (record.userId as Types.ObjectId).toString();
    await LoginOtp.deleteMany({ userId: record.userId });

    logger.info("Login OTP verified", { userId });
    return { userId };
  },

  /**
   * Generates `BACKUP_CODE_COUNT` backup codes, hashes them, stores the
   * hashes on the user document, and returns the plain-text codes (shown
   * once to the user).
   */
  async generateBackupCodes(
    userId: Types.ObjectId | string,
  ): Promise<string[]> {
    const codes: string[] = [];
    const hashed: { codeHash: string; used: boolean; usedAt: Date | null }[] =
      [];

    for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
      const raw = crypto
        .randomBytes(BACKUP_CODE_LENGTH)
        .toString("hex")
        .slice(0, BACKUP_CODE_LENGTH)
        .toUpperCase();
      codes.push(raw);
      hashed.push({
        codeHash: await argon2.hash(raw),
        used: false,
        usedAt: null,
      });
    }

    await User.updateOne({ _id: userId }, { backupCodes: hashed });

    logger.info("Backup codes generated", { userId: userId.toString() });
    return codes;
  },

  /**
   * Verifies a backup code for the given email. If valid, marks it as used
   * and returns the userId. Throws otherwise.
   */
  async verifyBackupCode(
    email: string,
    backupCode: string,
  ): Promise<{ userId: string }> {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail }).select(
      "+backupCodes",
    );

    if (!user) {
      throw AppError.unauthorized("Invalid email or backup code");
    }

    if (!user.backupCodes || user.backupCodes.length === 0) {
      throw AppError.badRequest(
        "No backup codes are configured for this account.",
        { code: "NO_BACKUP_CODES" },
      );
    }

    // Try to find a matching unused code
    const normalizedInput = backupCode.trim().toUpperCase();
    for (let i = 0; i < user.backupCodes.length; i++) {
      const entry = user.backupCodes[i] as {
        codeHash: string;
        used: boolean;
        usedAt: Date | null;
      };
      if (entry.used) continue;

      const match = await argon2.verify(entry.codeHash, normalizedInput);
      if (match) {
        // Mark as used
        await User.updateOne(
          { _id: user._id, "backupCodes.codeHash": entry.codeHash },
          {
            $set: {
              "backupCodes.$.used": true,
              "backupCodes.$.usedAt": new Date(),
            },
          },
        );

        // Clean up any pending OTP since backup code bypasses it
        await LoginOtp.deleteMany({ userId: user._id });

        logger.info("Backup code used", {
          userId: user._id.toString(),
          remainingCodes:
            user.backupCodes.filter((c: { used: boolean }) => !c.used).length -
            1,
        });

        return { userId: user._id.toString() };
      }
    }

    throw AppError.badRequest("Invalid or already used backup code.", {
      code: "BACKUP_CODE_INVALID",
    });
  },

  /**
   * Returns the count of remaining (unused) backup codes for a user.
   */
  async getRemainingBackupCodeCount(
    userId: Types.ObjectId | string,
  ): Promise<number> {
    const user = await User.findById(userId).select("+backupCodes").lean();
    if (!user || !user.backupCodes) return 0;
    return user.backupCodes.filter((c: { used: boolean }) => !c.used).length;
  },
};
