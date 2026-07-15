import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { isDemoMode } from "@/lib/server/demo-store";

function encryptionKey() {
  const configured = process.env.API_KEY_ENCRYPTION_KEY;
  if (configured && /^[a-fA-F0-9]{64}$/.test(configured)) return Buffer.from(configured, "hex");
  if (isDemoMode()) return createHash("sha256").update("synthnet-local-development-key").digest();
  throw new Error("API_KEY_ENCRYPTION_KEY must be a 64-character hexadecimal secret.");
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptSecret(payload: string) {
  const [version, iv, tag, ciphertext] = payload.split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext) throw new Error("Unsupported encrypted payload.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
