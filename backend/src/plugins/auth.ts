import jwt from "@fastify/jwt";
import type { FastifyInstance } from "fastify";
import { env } from "../config/env.js";

export async function registerAuth(app: FastifyInstance) {
  await app.register(jwt, { secret: env.JWT_SECRET });

  app.decorate("authenticateAdmin", async function authenticateAdmin(request, reply) {
    try {
      await request.jwtVerify();
      if (request.user.role !== "ADMIN") {
        return reply.code(403).send({ message: "Acesso negado" });
      }
    } catch {
      return reply.code(401).send({ message: "Sessão inválida ou expirada" });
    }
  });
}
