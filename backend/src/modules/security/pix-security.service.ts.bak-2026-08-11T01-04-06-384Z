import {
  createHash,
  randomBytes,
} from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../lib/http-error.js";

const PIX_FIELDS = [
  "pixEnabled",
  "pixPaymentMode",
  "manualPixKeyType",
  "manualPixKey",
  "manualPixReceiverName",
  "manualPixReceiverCity",
] as const;

type SettingsLike =
  | Record<string, unknown>
  | null
  | undefined;

function normalizeValue(
  value: unknown,
) {
  if (
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  return value;
}

export function pixSettingsChanged(
  current: SettingsLike,
  next: SettingsLike,
) {
  if (!next) {
    return false;
  }

  return PIX_FIELDS.some((field) => {
    return (
      normalizeValue(current?.[field]) !==
      normalizeValue(next[field])
    );
  });
}

export function hashPixAuthorizationToken(
  token: string,
) {
  return createHash("sha256")
    .update(token)
    .digest("hex");
}

export async function createPixChangeAuthorization(
  adminId: string,
) {
  const token = randomBytes(32)
    .toString("base64url");
  const tokenHash =
    hashPixAuthorizationToken(token);
  const expiresAt = new Date(
    Date.now() + 5 * 60 * 1000,
  );

  await prisma.pixChangeAuthorization.create({
    data: {
      adminId,
      tokenHash,
      expiresAt,
    },
  });

  return {
    token,
    expiresAt,
    expiresInSeconds: 5 * 60,
  };
}

export async function requirePixAuthorizationForSettings(
  input: {
    adminId: string;
    token:
      | string
      | string[]
      | undefined;
    currentSettings: SettingsLike;
    nextSettings: SettingsLike;
  },
) {
  if (
    !pixSettingsChanged(
      input.currentSettings,
      input.nextSettings,
    )
  ) {
    return;
  }

  const admin =
    await prisma.adminUser.findUnique({
      where: {
        id: input.adminId,
      },
      select: {
        pixTotpEnabled: true,
      },
    });

  if (!admin?.pixTotpEnabled) {
    throw new HttpError(
      403,
      "Configure a autenticação de dois fatores antes de alterar os dados do Pix",
      "PIX_TOTP_REQUIRED",
    );
  }

  const token = Array.isArray(input.token)
    ? input.token[0]
    : input.token;

  if (!token) {
    throw new HttpError(
      403,
      "Confirme sua senha e o código do Authenticator para alterar o Pix",
      "PIX_AUTHORIZATION_REQUIRED",
    );
  }

  const now = new Date();
  const tokenHash =
    hashPixAuthorizationToken(token);

  const consumed =
    await prisma.pixChangeAuthorization.updateMany({
      where: {
        adminId: input.adminId,
        tokenHash,
        usedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      data: {
        usedAt: now,
      },
    });

  if (consumed.count !== 1) {
    throw new HttpError(
      403,
      "A autorização para alterar o Pix expirou ou já foi utilizada",
      "PIX_AUTHORIZATION_INVALID",
    );
  }
}
