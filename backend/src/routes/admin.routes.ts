import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { slugify } from "../lib/slug.js";

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(8).max(200) });
const orderStatusSchema = z.object({
  status: z.enum(["PAID", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELED"]),
  note: z.string().trim().max(300).optional(),
});
const categorySchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().optional(),
  position: z.coerce.number().int().min(0).default(0),
  active: z.boolean().default(true),
});
const productSchema = z.object({
  categoryId: z.string().min(1),
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().optional(),
  description: z.string().trim().max(1000).optional(),
  priceCents: z.coerce.number().int().min(0),
  imageUrl: z.string().url().optional().or(z.literal("")),
  featured: z.boolean().default(false),
  active: z.boolean().default(true),
  soldOut: z.boolean().default(false),
  position: z.coerce.number().int().min(0).default(0),
});
const zoneSchema = z.object({
  name: z.string().trim().min(2).max(100),
  feeCents: z.coerce.number().int().min(0),
  minimumOrderCents: z.coerce.number().int().min(0).default(0),
  estimatedMinutes: z.coerce.number().int().min(1).max(300).optional(),
  active: z.boolean().default(true),
  position: z.coerce.number().int().min(0).default(0),
});
const optionGroupSchema = z.object({
  name: z.string().trim().min(2).max(100),
  required: z.boolean().default(false),
  minSelection: z.coerce.number().int().min(0).default(0),
  maxSelection: z.coerce.number().int().min(1).max(20).default(1),
  position: z.coerce.number().int().min(0).default(0),
  active: z.boolean().default(true),
}).refine((data) => data.minSelection <= data.maxSelection, { message: "Seleção mínima não pode ser maior que a máxima" });
const optionSchema = z.object({
  name: z.string().trim().min(1).max(100),
  priceCents: z.coerce.number().int().min(0).default(0),
  position: z.coerce.number().int().min(0).default(0),
  active: z.boolean().default(true),
});
const businessHourSchema = z.object({
  weekday: z.coerce.number().int().min(0).max(6),
  enabled: z.boolean(),
  opensAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  closesAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});

const settingsSchema = z.object({
  storeName: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional(),
  whatsappNumber: z.string().regex(/^\d{10,15}$/),
  instagramUrl: z.string().url().optional().or(z.literal("")),
  logoUrl: z.string().url().optional().or(z.literal("")),
  heroImageUrl: z.string().url().optional().or(z.literal("")),
  pickupAddress: z.string().trim().max(200).optional(),
  minimumOrderCents: z.coerce.number().int().min(0),
  defaultPrepMinutes: z.coerce.number().int().min(1).max(300),
  acceptingOrders: z.boolean(),
  pixEnabled: z.boolean(),
  whatsappConfirmation: z.boolean(),
});

async function audit(request: any, action: string, entity: string, entityId?: string, metadata?: unknown) {
  await prisma.auditLog.create({
    data: {
      adminId: request.user?.sub,
      action,
      entity,
      entityId,
      metadata: metadata as any,
      ip: request.ip,
    },
  });
}

export async function adminRoutes(app: FastifyInstance) {
  app.post("/admin/auth/login", { config: { rateLimit: { max: 8, timeWindow: "15 minutes" } } }, async (request) => {
    const input = loginSchema.parse(request.body);
    const admin = await prisma.adminUser.findUnique({ where: { email: input.email.toLowerCase() } });
    if (!admin || !admin.active || !(await bcrypt.compare(input.password, admin.passwordHash))) {
      throw new HttpError(401, "E-mail ou senha inválidos", "INVALID_CREDENTIALS");
    }
    const token = app.jwt.sign(
      { sub: admin.id, email: admin.email, name: admin.name, role: admin.role },
      { expiresIn: "8h" },
    );
    return { token, admin: { id: admin.id, name: admin.name, email: admin.email } };
  });

  app.get("/admin/me", { preHandler: app.authenticateAdmin }, async (request) => ({ admin: request.user }));

  app.get("/admin/dashboard", { preHandler: app.authenticateAdmin }, async () => {
    const [openOrders, paidToday, revenueToday] = await Promise.all([
      prisma.order.count({ where: { status: { in: ["PAID", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY"] } } }),
      prisma.order.count({ where: { paidAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
      prisma.order.aggregate({ _sum: { totalCents: true }, where: { paidAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
    ]);
    return { openOrders, paidToday, revenueTodayCents: revenueToday._sum.totalCents ?? 0 };
  });

  app.get("/admin/orders", { preHandler: app.authenticateAdmin }, async (request) => {
    const query = z.object({ status: z.string().optional(), limit: z.coerce.number().int().min(1).max(200).default(100) }).parse(request.query);
    const allowed = ["PENDING_PAYMENT", "PAID", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELED"] as const;
    const status = allowed.includes(query.status as any) ? query.status as typeof allowed[number] : undefined;
    return prisma.order.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: "desc" },
      take: query.limit,
      include: { items: { include: { options: true } }, payments: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
  });

  app.patch("/admin/orders/:id/status", { preHandler: app.authenticateAdmin }, async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = orderStatusSchema.parse(request.body);
    const order = await prisma.order.update({
      where: { id },
      data: {
        status: input.status,
        canceledAt: input.status === "CANCELED" ? new Date() : undefined,
        statusHistory: { create: { status: input.status, note: input.note } },
      },
    });
    await audit(request, "UPDATE_STATUS", "ORDER", id, input);
    return order;
  });

  app.get("/admin/categories", { preHandler: app.authenticateAdmin }, async () => prisma.category.findMany({ orderBy: [{ position: "asc" }, { name: "asc" }] }));
  app.post("/admin/categories", { preHandler: app.authenticateAdmin }, async (request, reply) => {
    const input = categorySchema.parse(request.body);
    const category = await prisma.category.create({ data: { ...input, slug: slugify(input.slug || input.name) } });
    await audit(request, "CREATE", "CATEGORY", category.id, input);
    return reply.code(201).send(category);
  });
  app.patch("/admin/categories/:id", { preHandler: app.authenticateAdmin }, async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = categorySchema.partial().parse(request.body);
    const category = await prisma.category.update({ where: { id }, data: { ...input, ...(input.slug || input.name ? { slug: slugify(input.slug || input.name || "") } : {}) } });
    await audit(request, "UPDATE", "CATEGORY", id, input);
    return category;
  });
  app.delete("/admin/categories/:id", { preHandler: app.authenticateAdmin }, async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    if (await prisma.product.count({ where: { categoryId: id } })) throw new HttpError(409, "Remova ou mova os produtos desta categoria", "CATEGORY_IN_USE");
    await prisma.category.delete({ where: { id } });
    await audit(request, "DELETE", "CATEGORY", id);
    return reply.code(204).send();
  });

  app.get("/admin/products", { preHandler: app.authenticateAdmin }, async () => prisma.product.findMany({ orderBy: [{ position: "asc" }, { name: "asc" }], include: { category: true, optionGroups: { include: { options: true } } } }));
  app.post("/admin/products", { preHandler: app.authenticateAdmin }, async (request, reply) => {
    const input = productSchema.parse(request.body);
    const product = await prisma.product.create({ data: { ...input, imageUrl: input.imageUrl || undefined, slug: slugify(input.slug || input.name) } });
    await audit(request, "CREATE", "PRODUCT", product.id, input);
    return reply.code(201).send(product);
  });
  app.patch("/admin/products/:id", { preHandler: app.authenticateAdmin }, async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = productSchema.partial().parse(request.body);
    const product = await prisma.product.update({ where: { id }, data: { ...input, imageUrl: input.imageUrl || undefined, ...(input.slug || input.name ? { slug: slugify(input.slug || input.name || "") } : {}) } });
    await audit(request, "UPDATE", "PRODUCT", id, input);
    return product;
  });
  app.delete("/admin/products/:id", { preHandler: app.authenticateAdmin }, async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const groups = await prisma.productOptionGroup.findMany({ where: { productId: id }, select: { id: true } });
    await prisma.productOption.deleteMany({ where: { groupId: { in: groups.map((group) => group.id) } } });
    await prisma.productOptionGroup.deleteMany({ where: { productId: id } });
    await prisma.product.delete({ where: { id } });
    await audit(request, "DELETE", "PRODUCT", id);
    return reply.code(204).send();
  });

  app.get("/admin/delivery-zones", { preHandler: app.authenticateAdmin }, async () => prisma.deliveryZone.findMany({ orderBy: [{ position: "asc" }, { name: "asc" }] }));
  app.post("/admin/delivery-zones", { preHandler: app.authenticateAdmin }, async (request, reply) => {
    const input = zoneSchema.parse(request.body);
    const zone = await prisma.deliveryZone.create({ data: input });
    await audit(request, "CREATE", "DELIVERY_ZONE", zone.id, input);
    return reply.code(201).send(zone);
  });
  app.patch("/admin/delivery-zones/:id", { preHandler: app.authenticateAdmin }, async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = zoneSchema.partial().parse(request.body);
    const zone = await prisma.deliveryZone.update({ where: { id }, data: input });
    await audit(request, "UPDATE", "DELIVERY_ZONE", id, input);
    return zone;
  });
  app.delete("/admin/delivery-zones/:id", { preHandler: app.authenticateAdmin }, async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    await prisma.deliveryZone.delete({ where: { id } });
    await audit(request, "DELETE", "DELIVERY_ZONE", id);
    return reply.code(204).send();
  });


  app.post("/admin/products/:productId/option-groups", { preHandler: app.authenticateAdmin }, async (request, reply) => {
    const { productId } = z.object({ productId: z.string() }).parse(request.params);
    const input = optionGroupSchema.parse(request.body);
    const group = await prisma.productOptionGroup.create({ data: { productId, ...input } });
    await audit(request, "CREATE", "OPTION_GROUP", group.id, input);
    return reply.code(201).send(group);
  });
  app.patch("/admin/option-groups/:id", { preHandler: app.authenticateAdmin }, async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = optionGroupSchema.partial().parse(request.body);
    const group = await prisma.productOptionGroup.update({ where: { id }, data: input });
    await audit(request, "UPDATE", "OPTION_GROUP", id, input);
    return group;
  });
  app.delete("/admin/option-groups/:id", { preHandler: app.authenticateAdmin }, async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    await prisma.productOption.deleteMany({ where: { groupId: id } });
    await prisma.productOptionGroup.delete({ where: { id } });
    await audit(request, "DELETE", "OPTION_GROUP", id);
    return reply.code(204).send();
  });
  app.post("/admin/option-groups/:groupId/options", { preHandler: app.authenticateAdmin }, async (request, reply) => {
    const { groupId } = z.object({ groupId: z.string() }).parse(request.params);
    const input = optionSchema.parse(request.body);
    const option = await prisma.productOption.create({ data: { groupId, ...input } });
    await audit(request, "CREATE", "OPTION", option.id, input);
    return reply.code(201).send(option);
  });
  app.patch("/admin/options/:id", { preHandler: app.authenticateAdmin }, async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = optionSchema.partial().parse(request.body);
    const option = await prisma.productOption.update({ where: { id }, data: input });
    await audit(request, "UPDATE", "OPTION", id, input);
    return option;
  });
  app.delete("/admin/options/:id", { preHandler: app.authenticateAdmin }, async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    await prisma.productOption.delete({ where: { id } });
    await audit(request, "DELETE", "OPTION", id);
    return reply.code(204).send();
  });

  app.get("/admin/business-hours", { preHandler: app.authenticateAdmin }, async () => prisma.businessHour.findMany({ orderBy: { weekday: "asc" } }));
  app.put("/admin/business-hours", { preHandler: app.authenticateAdmin }, async (request) => {
    const input = z.array(businessHourSchema).length(7).parse(request.body);
    for (const hour of input) {
      await prisma.businessHour.upsert({ where: { weekday: hour.weekday }, update: hour, create: hour });
    }
    await audit(request, "UPDATE", "BUSINESS_HOURS", undefined, input);
    return prisma.businessHour.findMany({ orderBy: { weekday: "asc" } });
  });

  app.get("/admin/settings", { preHandler: app.authenticateAdmin }, async () => prisma.storeSettings.findUnique({ where: { singletonKey: "default" } }));
  app.put("/admin/settings", { preHandler: app.authenticateAdmin }, async (request) => {
    const input = settingsSchema.parse(request.body);
    const settings = await prisma.storeSettings.upsert({
      where: { singletonKey: "default" },
      update: { ...input, instagramUrl: input.instagramUrl || undefined, logoUrl: input.logoUrl || undefined, heroImageUrl: input.heroImageUrl || undefined },
      create: { singletonKey: "default", ...input, instagramUrl: input.instagramUrl || undefined, logoUrl: input.logoUrl || undefined, heroImageUrl: input.heroImageUrl || undefined },
    });
    await audit(request, "UPDATE", "SETTINGS", settings.id, input);
    return settings;
  });
}
