import "@fastify/jwt";
import "fastify";

interface AdminJwtPayload {
  sub: string;
  email: string;
  name: string;
  role: "ADMIN";
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: AdminJwtPayload;
    user: AdminJwtPayload;
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticateAdmin: import("fastify").preHandlerHookHandler;
  }
}
