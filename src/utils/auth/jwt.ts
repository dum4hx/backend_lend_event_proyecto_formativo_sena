import { readFileSync, existsSync } from "fs";
import { SignJWT, jwtVerify, importSPKI, importPKCS8 } from "jose";
import type { CryptoKey, KeyObject } from "jose";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { AppError } from "../../errors/AppError.ts";
import type { UserRole } from "../../modules/user/models/user.model.ts";
import { logger } from "../logger.ts";

// Define KeyLike as the union type (jose 6.x uses CryptoKey | KeyObject)
type KeyLike = CryptoKey | KeyObject;

/* ---------- Configuration ---------- */

const __dirname = dirname(fileURLToPath(import.meta.url));
const KEYS_DIR_PATH = join(__dirname, "../../../keys");

const JWT_ALG = process.env.JWT_ASYMMETRIC_KEY_ALG ?? "RS256";
const JWT_ACCESS_EXPIRATION = process.env.JWT_ACCESS_EXPIRATION ?? "15m";
const JWT_REFRESH_EXPIRATION = process.env.JWT_REFRESH_EXPIRATION ?? "7d";
const JWT_ISSUER = process.env.JWT_ISSUER ?? "lend-event-api";
const JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? "lend-event-client";

/* ---------- Types ---------- */

export interface JWTPayload {
  sub: string; // userId
  org: string; // organizationId
  role: UserRole;
  email: string;
  type: "access" | "refresh";
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/* ---------- Key Management ---------- */

let privateKey: KeyLike | null = null;
let publicKey: KeyLike | null = null;

/**
 * Loads asymmetric keys from .pem files.
 * Keys are cached in memory after first load.
 */
export const loadAsymmetricKeys = async (): Promise<{
  privateKey: KeyLike;
  publicKey: KeyLike;
}> => {
  if (privateKey && publicKey) {
    return { privateKey, publicKey };
  }

  const publicKeyPath = join(KEYS_DIR_PATH, "public.pem");
  const privateKeyPath = join(KEYS_DIR_PATH, "private.pem");

  if (!existsSync(publicKeyPath) || !existsSync(privateKeyPath)) {
    throw AppError.internal(
      "JWT keys not found. Run 'npm run generate-keys' to create them.",
    );
  }

  try {
    const privateKeyPem = readFileSync(privateKeyPath, "utf-8");
    const publicKeyPem = readFileSync(publicKeyPath, "utf-8");

    privateKey = await importPKCS8(privateKeyPem, JWT_ALG);
    publicKey = await importSPKI(publicKeyPem, JWT_ALG);

    return { privateKey, publicKey };
  } catch (err: unknown) {
    throw AppError.internal("Failed to load JWT keys", err);
  }
};

/* ---------- Token Generation ---------- */

/**
 * Generates a JWT access token.
 */
export const generateAccessToken = async (
  payload: Omit<JWTPayload, "type">,
): Promise<string> => {
  const { privateKey } = await loadAsymmetricKeys();

  return new SignJWT({ ...payload, type: "access" } as unknown as Record<
    string,
    unknown
  >)
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime(JWT_ACCESS_EXPIRATION)
    .setSubject(payload.sub)
    .sign(privateKey);
};

/**
 * Generates a JWT refresh token.
 */
export const generateRefreshToken = async (
  payload: Omit<JWTPayload, "type">,
): Promise<string> => {
  const { privateKey } = await loadAsymmetricKeys();

  return new SignJWT({ ...payload, type: "refresh" } as unknown as Record<
    string,
    unknown
  >)
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime(JWT_REFRESH_EXPIRATION)
    .setSubject(payload.sub)
    .sign(privateKey);
};

/**
 * Generates both access and refresh tokens.
 */
export const generateTokenPair = async (
  payload: Omit<JWTPayload, "type">,
): Promise<TokenPair> => {
  const [accessToken, refreshToken] = await Promise.all([
    generateAccessToken(payload),
    generateRefreshToken(payload),
  ]);

  return { accessToken, refreshToken };
};

/* ---------- Token Verification ---------- */

/**
 * Verifies a JWT token and returns the payload.
 */
export const verifyToken = async (
  token: string,
  expectedType?: "access" | "refresh",
): Promise<JWTPayload> => {
  const { publicKey } = await loadAsymmetricKeys();

  try {
    const { payload } = await jwtVerify(token, publicKey, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    const jwtPayload = payload as unknown as JWTPayload;

    // Verify token type if specified
    if (expectedType && jwtPayload.type !== expectedType) {
      throw AppError.unauthorized(
        `Invalid token type. Expected ${expectedType}.`,
      );
    }

    return jwtPayload;
  } catch (err: unknown) {
    if (err instanceof AppError) {
      throw err;
    }

    // Handle specific JWT errors
    if (err instanceof Error) {
      if (err.message.includes("expired")) {
        throw AppError.unauthorized("Token has expired");
      }
      if (err.message.includes("signature")) {
        throw AppError.unauthorized("Invalid token signature");
      }
    }

    throw AppError.unauthorized("Invalid token");
  }
};

/**
 * Verifies an access token specifically.
 */
export const verifyAccessToken = async (token: string): Promise<JWTPayload> => {
  return verifyToken(token, "access");
};

/**
 * Verifies a refresh token specifically.
 */
export const verifyRefreshToken = async (
  token: string,
): Promise<JWTPayload> => {
  return verifyToken(token, "refresh");
};
