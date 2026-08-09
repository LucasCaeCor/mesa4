import type {
  FastifyInstance,
  FastifyRequest,
} from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { decryptSecret } from "../lib/secret-box.js";
import { verifyTotp } from "../lib/totp.js";
import {
  createCatalogAuthorization,
} from "../modules/security/catalog-security.service.js";

const unlockSchema = z.object({
  password: z
    .string()
    .min(8)
    .max(200),
  code: z
    .string()
    .trim()
    .min(6)
    .max(32),
});

function normalizeRecoveryCode(
  value: string,
) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-F0-9]/g, "");
}

async function audit(
  request: FastifyRequest,
  action: string,
  metadata?: unknown,
) {
  await prisma.auditLog.create({
    data: {
      adminId: request.user.sub,
      action,
      entity: "CATALOG_SECURITY",
      metadata: metadata as never,
      ip: request.ip,
    },
  });
}

async function verifyCredentials(
  request: FastifyRequest,
  password: string,
  code: string,
) {
  const admin =
    await prisma.adminUser.findUnique({
      where: {
        id: request.user.sub,
      },
    });

  if (
    !admin ||
    !admin.active ||
    !(await bcrypt.compare(
      password,
      admin.passwordHash,
    ))
  ) {
    throw new HttpError(
      401,
      "Senha administrativa inválida",
      "INVALID_ADMIN_PASSWORD",
    );
  }

  if (
    !admin.pixTotpEnabled ||
    !admin.pixTotpSecretEncrypted
  ) {
    throw new HttpError(
      409,
      "Configure o Authenticator em Configurações antes de liberar alterações sensíveis do cardápio",
      "CATALOG_TOTP_NOT_CONFIGURED",
    );
  }

  if (/^\d{6}$/.test(code.trim())) {
    const secret = decryptSecret(
      admin.pixTotpSecretEncrypted,
    );

    const matchedCounter = verifyTotp(
      secret,
      code,
      {
        window: 1,
      },
    );

    if (matchedCounter === null) {
      throw new HttpError(
        401,
        "Código do Authenticator inválido",
        "INVALID_TOTP_CODE",
      );
    }

    if (
      admin.pixTotpLastUsedCounter !==
        null &&
      admin.pixTotpLastUsedCounter !==
        undefined &&
      matchedCounter <=
        admin.pixTotpLastUsedCounter
    ) {
      throw new HttpError(
        401,
        "Este código já foi utilizado. Aguarde o próximo código do Authenticator",
        "TOTP_CODE_ALREADY_USED",
      );
    }

    await prisma.adminUser.update({
      where: {
        id: admin.id,
      },
      data: {
        pixTotpLastUsedCounter:
          matchedCounter,
      },
    });

    return {
      admin,
      method: "TOTP",
    } as const;
  }

  const normalized =
    normalizeRecoveryCode(code);

  const hashes = Array.isArray(
    admin.pixTotpRecoveryCodeHashes,
  )
    ? admin.pixTotpRecoveryCodeHashes.filter(
        (
          item,
        ): item is string =>
          typeof item === "string",
      )
    : [];

  for (
    let index = 0;
    index < hashes.length;
    index += 1
  ) {
    if (
      await bcrypt.compare(
        normalized,
        hashes[index],
      )
    ) {
      const remaining = hashes.filter(
        (_, currentIndex) =>
          currentIndex !== index,
      );

      await prisma.adminUser.update({
        where: {
          id: admin.id,
        },
        data: {
          pixTotpRecoveryCodeHashes:
            remaining,
        },
      });

      return {
        admin,
        method: "RECOVERY_CODE",
      } as const;
    }
  }

  throw new HttpError(
    401,
    "Código do Authenticator ou código de recuperação inválido",
    "INVALID_SECOND_FACTOR",
  );
}

export async function catalogSecurityRoutes(
  app: FastifyInstance,
) {
  app.post(
    "/admin/security/catalog/unlock",
    {
      preHandler: app.authenticateAdmin,
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "15 minutes",
        },
      },
    },
    async (request) => {
      const input =
        unlockSchema.parse(request.body);

      const result =
        await verifyCredentials(
          request,
          input.password,
          input.code,
        );

      const authorization =
        createCatalogAuthorization(
          app,
          result.admin.id,
        );

      await audit(
        request,
        "CATALOG_UNLOCKED",
        {
          method: result.method,
          expiresAt:
            authorization.expiresAt,
        },
      );

      return {
        token: authorization.token,
        expiresAt:
          authorization.expiresAt.toISOString(),
        expiresInSeconds:
          authorization.expiresInSeconds,
      };
    },
  );
}
