import { readFileSync } from "fs";
import { importSPKI, importPKCS8 } from "jose";
import { join } from "path";

const KEYS_DIR_PATH = "../../../keys";

/**
 * Loads private and public keys from .pem files.
 */
const loadAsymmetricKeys = async () => {
  try {
    const keyAlg = process.env.JWT_ASYMMETRIC_KEY_ALG || null;

    if (keyAlg == null) {
      throw new Error("No asymmetric key algorithm defined");
    }

    const publicKeyPath = join(KEYS_DIR_PATH, "public.pem");
    const privateKeyPath = join(KEYS_DIR_PATH, "private.pem");

    // Import keys
    const privateKey = await importPKCS8(
      readFileSync(privateKeyPath, "utf-8"),
      keyAlg,
    );

    const publicKey = await importSPKI(
      readFileSync(publicKeyPath, "utf-8"),
      keyAlg,
    );

    return { privateKey, publicKey };
  } catch (err: unknown) {
    if (err instanceof Error) {
      throw new Error("Could not load asymmetric keys from files");
    }
  }
};

// Generate JWT

// Log in

// Verification
