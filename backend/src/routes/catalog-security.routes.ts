import type { FastifyInstance } from "fastify";

/**
 * Rota legada mantida temporariamente apenas por compatibilidade.
 *
 * A proteção separada do cardápio foi removida.
 * O Authenticator agora protege o login administrativo,
 * e a confirmação adicional permanece somente na área PIX.
 */
export async function catalogSecurityRoutes(
  _app: FastifyInstance,
) {
  // Intencionalmente vazio.
}
