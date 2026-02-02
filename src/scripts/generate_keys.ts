import { exportPKCS8, exportSPKI, generateKeyPair } from "jose";
import { writeFileSync } from "fs";
import { join } from "path";

const KEYS_DIR = "./keys";

// Generate keys
export const getAsymmetricKeys = async () => {
  const keyAlg = process.env.JWT_ASYMMETRIC_KEY_ALG || null;

  if (keyAlg == null) {
    throw new Error("No asymmetric key algorithm defined");
  }

  const { privateKey, publicKey } = await generateKeyPair(keyAlg, {
    modulusLength: 2048,
    extractable: true,
  });

  return { privateKey, publicKey };
};

// Set keys with .pem format
export const getPemFormatedKeys = async () => {
  // Get asymmetric key pair
  const { privateKey, publicKey } = await getAsymmetricKeys();

  // Get pem format for keys
  const privatePemKey = await exportPKCS8(privateKey);
  const publicPemKey = await exportSPKI(publicKey);

  return { privatePemKey, publicPemKey };
};

// Save keys to .pem files
export const savePemKeys = async () => {
  try {
    // Get pem formatted keys
    const { privatePemKey, publicPemKey } = await getPemFormatedKeys();

    const privateKeyPath = join(KEYS_DIR, "private.pem");
    const publicKeyPath = join(KEYS_DIR, "public.pem");

    // Save them
    writeFileSync(privateKeyPath, privatePemKey, {
      encoding: "utf8",
      mode: 0o600,
    });
    console.log("Private key saved to " + privateKeyPath);

    writeFileSync(publicKeyPath, publicPemKey, {
      encoding: "utf8",
      mode: 0o644,
    });
    console.log("Public key saved to " + publicKeyPath);
  } catch (err: unknown) {
    if (err instanceof Error) {
      throw err;
    }
  }
};

await savePemKeys();
