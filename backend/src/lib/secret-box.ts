import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { env } from "../config/env.js";

function getEncryptionKey() {
  const key = Buffer.from(
    env.PIX_TOTP_ENCRYPTION_KEY,
    "base64",
  );

  if (key.length !== 32) {
    throw new Error(
      "PIX_TOTP_ENCRYPTION_KEY precisa conter exatamente 32 bytes em Base64",
    );
  }

  return key;
}

export function encryptSecret(
  value: string,
) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    iv,
  );

  const ciphertext = Buffer.concat([
    cipher.update(
      value,
      "utf8",
    ),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptSecret(
  encrypted: string,
) {
  const [
    version,
    ivEncoded,
    authTagEncoded,
    ciphertextEncoded,
  ] = encrypted.split(".");

  if (
    version !== "v1" ||
    !ivEncoded ||
    !authTagEncoded ||
    !ciphertextEncoded
  ) {
    throw new Error(
      "Formato do segredo criptografado inválido",
    );
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivEncoded, "base64url"),
  );

  decipher.setAuthTag(
    Buffer.from(
      authTagEncoded,
      "base64url",
    ),
  );

  const plaintext = Buffer.concat([
    decipher.update(
      Buffer.from(
        ciphertextEncoded,
        "base64url",
      ),
    ),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}
