import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { addressSchema, createOrderSchema } from "../modules/orders/order.schemas.js";
import { createOrder, getOrderForCustomer } from "../modules/orders/order.service.js";
import { buildWhatsAppMessage } from "../lib/whatsapp.js";
import { lookupAddressByCep } from "../modules/address/cep.service.js";
import { calculateDeliveryQuote } from "../modules/delivery/openroute.service.js";

export async function publicRoutes(app: FastifyInstance) {
  app.get("/store", async () => {
    const [settings, hours, deliveryZones] = await Promise.all([
      prisma.storeSettings.findUnique({ where: { singletonKey: "default" } }),
      prisma.businessHour.findMany({ orderBy: { weekday: "asc" } }),
      prisma.deliveryZone.findMany({ where: { active: true }, orderBy: [{ position: "asc" }, { name: "asc" }] }),
    ]);
    return { settings, hours, deliveryZones };
  });

  app.get("/menu", async () => {
    const categories = await prisma.category.findMany({
      where: { active: true },
      orderBy: [{ position: "asc" }, { createdAt: "desc" }],
      include: {
        products: {
          where: { active: true },
          orderBy: [{ position: "asc" }, { createdAt: "desc" }],
          include: {
            optionGroups: {
              where: { active: true },
              orderBy: { position: "asc" },
              include: { options: { where: { active: true }, orderBy: { position: "asc" } } },
            },
          },
        },
      },
    });
    return { categories };
  });

  app.get(
    "/address/cep/:cep",
    { config: { rateLimit: { max: 40, timeWindow: "10 minutes" } } },
    async (request) => {
      const { cep } = z.object({ cep: z.string() }).parse(request.params);
      return lookupAddressByCep(cep);
    },
  );

  app.post(
    "/delivery/quote",
    { config: { rateLimit: { max: 30, timeWindow: "10 minutes" } } },
    async (request) => {
      const address = addressSchema.parse(request.body);
      const settings = await prisma.storeSettings.findUnique({
        where: { singletonKey: "default" },
      });

      if (!settings) {
        throw new Error("Store settings not found");
      }

      return calculateDeliveryQuote(settings, address);
    },
  );

  app.post("/orders", { config: { rateLimit: { max: 15, timeWindow: "10 minutes" } } }, async (request, reply) => {
    const input = createOrderSchema.parse(request.body);
    const result = await createOrder(input);
    return reply.code(201).send(result);
  });

  app.get("/orders/:publicId", async (request) => {
    const params = z.object({ publicId: z.string() }).parse(request.params);
    const query = z.object({ token: z.string().min(20) }).parse(request.query);
    return getOrderForCustomer(params.publicId, query.token);
  });

  app.get("/orders/:publicId/whatsapp", async (request) => {
    const params = z.object({ publicId: z.string() }).parse(request.params);
    const query = z.object({ token: z.string().min(20) }).parse(request.query);
    const result = await getOrderForCustomer(params.publicId, query.token);
    const settings = await prisma.storeSettings.findUnique({ where: { singletonKey: "default" } });
    const message = buildWhatsAppMessage({
      publicId: result.order.publicId,
      customerName: result.order.customerName,
      totalCents: result.order.totalCents,
      fulfillment: result.order.fulfillment,
      items: result.order.items.map((item) => ({ productName: item.productName, quantity: item.quantity, options: item.options })),
    });
    return { url: `https://wa.me/${settings?.whatsappNumber ?? ""}?text=${encodeURIComponent(message)}` };
  });
}
