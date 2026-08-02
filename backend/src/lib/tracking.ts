import { createHash, randomBytes } from "node:crypto";

export function createPublicOrderId() {
  const date = new Date();
  const datePart = `${String(date.getFullYear()).slice(-2)}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  const random = randomBytes(3).toString("hex").toUpperCase();
  return `M4-${datePart}-${random}`;
}

export function createTrackingToken() {
  return randomBytes(24).toString("base64url");
}

export function hashTrackingToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
