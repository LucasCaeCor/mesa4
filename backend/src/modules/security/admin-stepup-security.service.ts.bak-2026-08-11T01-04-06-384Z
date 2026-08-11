import type {
  FastifyInstance,
  FastifyRequest,
} from "fastify";
import { HttpError } from "../../lib/http-error.js";

const ADMIN_STEP_UP_SCOPE =
  "ADMIN_SENSITIVE_WRITE";

type AdminStepUpPayload = {
  sub: string;
  scope: string;
  kind: "STEP_UP";
  iat?: number;
  exp?: number;
};

export function createAdminStepUpAuthorization(
  app: FastifyInstance,
  adminId: string,
) {
  const expiresInSeconds = 10 * 60;

  const token = app.jwt.sign(
    {
      sub: adminId,
      scope: ADMIN_STEP_UP_SCOPE,
      kind: "STEP_UP",
    },
    {
      expiresIn: "10m",
    },
  );

  return {
    token,
    expiresAt: new Date(
      Date.now() + expiresInSeconds * 1000,
    ),
    expiresInSeconds,
  };
}

export async function requireAdminStepUpAuthorization(
  app: FastifyInstance,
  request: FastifyRequest,
) {
  // O hook global das rotas sensíveis roda antes do preHandler
  // específico da rota. Por isso validamos também o JWT principal aqui.
  try {
    if (!request.user?.sub) {
      await request.jwtVerify();
    }
  } catch {
    throw new HttpError(
      401,
      "Sessão inválida ou expirada",
      "INVALID_ADMIN_SESSION",
    );
  }

  if (request.user.role !== "ADMIN") {
    throw new HttpError(
      403,
      "Acesso negado",
      "ADMIN_ACCESS_DENIED",
    );
  }

  const raw =
    request.headers["x-admin-authorization"];

  const token = Array.isArray(raw)
    ? raw[0]
    : raw;

  if (!token) {
    throw new HttpError(
      403,
      "Confirme sua senha e o Authenticator para executar esta ação",
      "ADMIN_STEP_UP_REQUIRED",
    );
  }

  try {
    const payload =
      app.jwt.verify<AdminStepUpPayload>(
        token,
      );

    if (
      payload.sub !== request.user.sub ||
      payload.scope !== ADMIN_STEP_UP_SCOPE ||
      payload.kind !== "STEP_UP"
    ) {
      throw new Error(
        "Autorização administrativa inválida",
      );
    }
  } catch {
    throw new HttpError(
      403,
      "A autorização do Authenticator expirou ou é inválida. Desbloqueie novamente",
      "ADMIN_STEP_UP_INVALID",
    );
  }
}
