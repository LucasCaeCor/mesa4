import type {
  FastifyInstance,
  FastifyRequest,
} from "fastify";
import { HttpError } from "../../lib/http-error.js";

const CATALOG_SCOPE =
  "CATALOG_SENSITIVE_WRITE";

type CatalogAuthorizationPayload = {
  sub: string;
  scope: string;
  kind: "STEP_UP";
  iat?: number;
  exp?: number;
};

export function createCatalogAuthorization(
  app: FastifyInstance,
  adminId: string,
) {
  const expiresInSeconds = 10 * 60;

  const token = app.jwt.sign(
    {
      sub: adminId,
      scope: CATALOG_SCOPE,
      kind: "STEP_UP",
    },
    {
      expiresIn: "10m",
    },
  );

  return {
    token,
    expiresAt: new Date(
      Date.now() +
        expiresInSeconds * 1000,
    ),
    expiresInSeconds,
  };
}

export function requireCatalogAuthorization(
  app: FastifyInstance,
  request: FastifyRequest,
) {
  const catalogRaw =
    request.headers[
      "x-catalog-authorization"
    ];

  const adminRaw =
    request.headers[
      "x-admin-authorization"
    ];

  const raw =
    adminRaw || catalogRaw;

  const token = Array.isArray(raw)
    ? raw[0]
    : raw;

  if (!token) {
    throw new HttpError(
      403,
      "Confirme sua senha e o Authenticator para alterar preços ou itens sensíveis do cardápio",
      "CATALOG_AUTHORIZATION_REQUIRED",
    );
  }

  try {
    const payload =
      app.jwt.verify<CatalogAuthorizationPayload>(
        token,
      );

    const validScope =
      payload.scope ===
        "CATALOG_SENSITIVE_WRITE" ||
      payload.scope ===
        "ADMIN_SENSITIVE_WRITE";

    if (
      payload.sub !== request.user.sub ||
      !validScope ||
      payload.kind !== "STEP_UP"
    ) {
      throw new Error(
        "Escopo de autorização inválido",
      );
    }
  } catch {
    throw new HttpError(
      403,
      "A autorização do Authenticator expirou ou é inválida",
      "CATALOG_AUTHORIZATION_INVALID",
    );
  }
}
