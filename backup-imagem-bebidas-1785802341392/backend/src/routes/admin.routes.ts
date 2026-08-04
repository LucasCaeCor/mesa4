import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { slugify } from "../lib/slug.js";
import {
  deleteCloudinaryImage,
  uploadProductImage,
} from "../lib/cloudinary.js";
import { sendOrderStatusWhatsApp } from "../modules/whatsapp/whatsapp-cloud.service.js";

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
  imagePublicId: z.string().trim().max(200).optional().or(z.literal("")),
  featured: z.boolean().default(false),
  active: z.boolean().default(true),
  soldOut: z.boolean().default(false),
  position: z.coerce.number().int().min(0).default(0),
});
const addonSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z.string().trim().optional(),
  priceCents: z.coerce.number().int().min(0),
  position: z.coerce.number().int().min(0).default(0),
  active: z.boolean().default(true),
});

const productAddonsSchema = z.object({
  addonIds: z.array(z.string().min(1)).max(50).default([]),
  maxSelection: z.coerce.number().int().min(1).max(50).default(10),
});

const zoneSchema = z.object({
  name: z.string().trim().min(2).max(100),
  feeCents: z.coerce.number().int().min(0),
  minimumOrderCents: z.coerce.number().int().min(0).default(0),
  estimatedMinutes: z.coerce.number().int().min(1).max(300).optional(),
  active: z.boolean().default(true),
  position: z.coerce.number().int().min(0).default(0),
});
const optionGroupBaseSchema = z.object({
  name: z.string().trim().min(2).max(100),
  required: z.boolean().default(false),
  minSelection: z.coerce.number().int().min(0).default(0),
  maxSelection: z.coerce.number().int().min(1).max(20).default(1),
  position: z.coerce.number().int().min(0).default(0),
  active: z.boolean().default(true),
});

const optionGroupSchema = optionGroupBaseSchema.refine(
  (data) => data.minSelection <= data.maxSelection,
  {
    message: "Seleção mínima não pode ser maior que a máxima",
    path: ["minSelection"],
  },
);

const optionGroupUpdateSchema = optionGroupBaseSchema.partial();
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
  description: z
    .string()
    .trim()
    .max(500)
    .optional(),
  whatsappNumber: z
    .string()
    .regex(/^\d{10,15}$/),
  instagramUrl: z
    .string()
    .url()
    .optional()
    .or(z.literal("")),
  logoUrl: z
    .string()
    .url()
    .optional()
    .or(z.literal("")),
  heroImageUrl: z
    .string()
    .url()
    .optional()
    .or(z.literal("")),
  pickupAddress: z
    .string()
    .trim()
    .max(200)
    .optional(),
  minimumOrderCents: z.coerce
    .number()
    .int()
    .min(0),
  deliveryFeeCents: z.coerce
    .number()
    .int()
    .min(0),
  dynamicDeliveryEnabled: z
    .boolean()
    .default(false),
  deliveryBaseFeeCents: z.coerce
    .number()
    .int()
    .min(0)
    .default(0),
  deliveryIncludedKm: z.coerce
    .number()
    .min(0)
    .max(100)
    .default(0),
  deliveryPricePerKmCents: z.coerce
    .number()
    .int()
    .min(0)
    .default(0),
  deliveryMaxDistanceKm: z.coerce
    .number()
    .positive()
    .max(100)
    .default(15),
  defaultPrepMinutes: z.coerce
    .number()
    .int()
    .min(1)
    .max(300),
  acceptingOrders: z.boolean(),
  pixEnabled: z.boolean(),
  pixPaymentMode: z
    .enum(["MERCADO_PAGO", "MANUAL"])
    .default("MERCADO_PAGO"),
  manualPixKeyType: z
    .enum([
      "CPF",
      "CNPJ",
      "EMAIL",
      "PHONE",
      "RANDOM",
    ])
    .optional(),
  manualPixKey: z
    .string()
    .trim()
    .max(120)
    .optional()
    .or(z.literal("")),
  manualPixReceiverName: z
    .string()
    .trim()
    .max(25)
    .optional()
    .or(z.literal("")),
  manualPixReceiverCity: z
    .string()
    .trim()
    .max(15)
    .optional()
    .or(z.literal("")),
  whatsappConfirmation: z.boolean(),
  whatsappNotificationsEnabled: z
    .boolean()
    .default(false),
}).superRefine((data, ctx) => {
  if (data.pixPaymentMode !== "MANUAL") {
    return;
  }

  const requiredFields = [
    [
      "manualPixKeyType",
      data.manualPixKeyType,
    ],
    ["manualPixKey", data.manualPixKey],
    [
      "manualPixReceiverName",
      data.manualPixReceiverName,
    ],
    [
      "manualPixReceiverCity",
      data.manualPixReceiverCity,
    ],
  ] as const;

  for (const [path, value] of requiredFields) {
    if (!value) {
      ctx.addIssue({
        code: "custom",
        path: [path],
        message:
          "Campo obrigatório no modo Pix manual",
      });
    }
  }
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
      include: {
        items: { include: { options: true } },
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
        statusHistory: {
          orderBy: { createdAt: "asc" },
        },
        whatsappNotifications: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
  });

  app.patch(
    "/admin/orders/:id/status",
    { preHandler: app.authenticateAdmin },
    async (request) => {
      const { id } = z
        .object({ id: z.string() })
        .parse(request.params);
      const input = orderStatusSchema.parse(
        request.body,
      );

      const currentOrder =
        await prisma.order.findUnique({
          where: { id },
          include: {
            payments: {
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        });

      if (!currentOrder) {
        throw new HttpError(
          404,
          "Pedido não encontrado",
          "ORDER_NOT_FOUND",
        );
      }

      const payment = currentOrder.payments[0];

      if (
        input.status === "PAID" &&
        currentOrder.status ===
          "PENDING_PAYMENT"
      ) {
        if (
          !payment ||
          payment.provider !== "MANUAL_PIX"
        ) {
          throw new HttpError(
            409,
            "Pagamentos do Mercado Pago são confirmados automaticamente",
            "AUTOMATIC_PAYMENT_CONFIRMATION",
          );
        }

        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: "APPROVED",
            statusDetail:
              "MANUALLY_CONFIRMED_BY_ADMIN",
          },
        });
      }

      if (
        input.status === "CANCELED" &&
        payment?.provider === "MANUAL_PIX" &&
        payment.status === "PENDING"
      ) {
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: "CANCELED",
            statusDetail:
              "CANCELED_BY_ADMIN",
          },
        });
      }

      const note =
        input.note ??
        (input.status === "PAID" &&
        payment?.provider === "MANUAL_PIX"
          ? "Pagamento Pix manual confirmado"
          : undefined);

      const order = await prisma.order.update({
        where: { id },
        data: {
          status: input.status,
          paidAt:
            input.status === "PAID"
              ? currentOrder.paidAt ??
                new Date()
              : undefined,
          canceledAt:
            input.status === "CANCELED"
              ? new Date()
              : undefined,
          statusHistory: {
            create: {
              status: input.status,
              note,
            },
          },
        },
      });

      await audit(
        request,
        "UPDATE_STATUS",
        "ORDER",
        id,
        input,
      );

      const whatsapp =
        await sendOrderStatusWhatsApp(
          order.id,
          {
            source: "AUTO",
          },
        ).catch((error) => {
          request.log.error(
            {
              err: error,
              orderId: order.id,
            },
            "WhatsApp automatic notification failed",
          );

          return { sent: false };
        });

      return {
        ...order,
        whatsapp,
      };
    },
  );


  app.post(
    "/admin/orders/:id/whatsapp",
    { preHandler: app.authenticateAdmin },
    async (request) => {
      const { id } = z.object({ id: z.string() }).parse(request.params);

      const result = await sendOrderStatusWhatsApp(id, {
        source: "MANUAL",
        force: true,
        throwOnError: true,
      });

      await audit(
        request,
        "SEND_WHATSAPP",
        "ORDER",
        id,
        result,
      );

      return result;
    },
  );

  app.post(
    "/admin/uploads/images",
    { preHandler: app.authenticateAdmin },
    async (request, reply) => {
      const file = await request.file();

      if (!file) {
        throw new HttpError(
          422,
          "Selecione uma imagem",
          "IMAGE_REQUIRED",
        );
      }

      if (!file.mimetype.startsWith("image/")) {
        throw new HttpError(
          422,
          "O arquivo selecionado não é uma imagem",
          "INVALID_IMAGE_TYPE",
        );
      }

      const buffer = await file.toBuffer();

      if (buffer.length > 5 * 1024 * 1024) {
        throw new HttpError(
          422,
          "A imagem deve ter no máximo 5 MB",
          "IMAGE_TOO_LARGE",
        );
      }

      const uploaded =
        await uploadProductImage(buffer);

      await audit(
        request,
        "UPLOAD",
        "PRODUCT_IMAGE",
        uploaded.imagePublicId,
        {
          bytes: uploaded.bytes,
          width: uploaded.width,
          height: uploaded.height,
          format: uploaded.format,
        },
      );

      return reply.code(201).send(uploaded);
    },
  );

  app.get(
    "/admin/addons",
    { preHandler: app.authenticateAdmin },
    async () =>
      prisma.addonLibraryItem.findMany({
        orderBy: [
          { position: "asc" },
          { name: "asc" },
        ],
      }),
  );

  app.post(
    "/admin/addons",
    { preHandler: app.authenticateAdmin },
    async (request, reply) => {
      const input = addonSchema.parse(request.body);
      const addon =
        await prisma.addonLibraryItem.create({
          data: {
            ...input,
            slug: slugify(
              input.slug || input.name,
            ),
          },
        });

      await audit(
        request,
        "CREATE",
        "ADDON_LIBRARY",
        addon.id,
        input,
      );

      return reply.code(201).send(addon);
    },
  );

  app.patch(
    "/admin/addons/:id",
    { preHandler: app.authenticateAdmin },
    async (request) => {
      const { id } = z
        .object({ id: z.string() })
        .parse(request.params);
      const input =
        addonSchema.partial().parse(request.body);

      const addon =
        await prisma.addonLibraryItem.update({
          where: { id },
          data: {
            ...input,
            ...(input.slug || input.name
              ? {
                  slug: slugify(
                    input.slug ||
                      input.name ||
                      "",
                  ),
                }
              : {}),
          },
        });

      await prisma.productOption.updateMany({
        where: { addonLibraryId: id },
        data: {
          name: addon.name,
          priceCents: addon.priceCents,
          position: addon.position,
          active: addon.active,
        },
      });

      await audit(
        request,
        "UPDATE",
        "ADDON_LIBRARY",
        id,
        input,
      );

      return addon;
    },
  );

  app.delete(
    "/admin/addons/:id",
    { preHandler: app.authenticateAdmin },
    async (request, reply) => {
      const { id } = z
        .object({ id: z.string() })
        .parse(request.params);

      await prisma.productOption.deleteMany({
        where: { addonLibraryId: id },
      });

      await prisma.addonLibraryItem.delete({
        where: { id },
      });

      await audit(
        request,
        "DELETE",
        "ADDON_LIBRARY",
        id,
      );

      return reply.code(204).send();
    },
  );

  app.get("/admin/categories", { preHandler: app.authenticateAdmin }, async () => prisma.category.findMany({ orderBy: [{ position: "asc" }, { createdAt: "desc" }] }));
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

  app.get("/admin/products", { preHandler: app.authenticateAdmin }, async () => prisma.product.findMany({ orderBy: [{ position: "asc" }, { createdAt: "desc" }], include: { category: true, optionGroups: { include: { options: true } } } }));
  app.post("/admin/products", { preHandler: app.authenticateAdmin }, async (request, reply) => {
    const input = productSchema.parse(request.body);
    const product = await prisma.product.create({ data: {
      ...input,
      imageUrl: input.imageUrl || undefined,
      imagePublicId:
        input.imagePublicId || undefined,
      slug: slugify(input.slug || input.name) } });
    await audit(request, "CREATE", "PRODUCT", product.id, input);
    return reply.code(201).send(product);
  });
  app.patch("/admin/products/:id", { preHandler: app.authenticateAdmin }, async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = productSchema.partial().parse(request.body);
    const product = await prisma.product.update({ where: { id }, data: { ...input, ...(input.imageUrl !== undefined
      ? { imageUrl: input.imageUrl || null }
      : {}),
    ...(input.imagePublicId !== undefined
      ? {
          imagePublicId:
            input.imagePublicId || null,
        }
      : {}), ...(input.slug || input.name ? { slug: slugify(input.slug || input.name || "") } : {}) } });
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


  app.put(
    "/admin/products/:productId/addons",
    { preHandler: app.authenticateAdmin },
    async (request) => {
      const { productId } = z
        .object({ productId: z.string() })
        .parse(request.params);
      const input =
        productAddonsSchema.parse(request.body);

      const product = await prisma.product.findUnique({
        where: { id: productId },
      });

      if (!product) {
        throw new HttpError(
          404,
          "Produto não encontrado",
          "PRODUCT_NOT_FOUND",
        );
      }

      const addons =
        input.addonIds.length > 0
          ? await prisma.addonLibraryItem.findMany({
              where: {
                id: { in: input.addonIds },
              },
            })
          : [];

      if (addons.length !== input.addonIds.length) {
        throw new HttpError(
          422,
          "Um dos adicionais selecionados não existe",
          "ADDON_NOT_FOUND",
        );
      }

      let group =
        await prisma.productOptionGroup.findFirst({
          where: {
            productId,
            libraryManaged: true,
          },
        });

      if (!group && input.addonIds.length > 0) {
        group =
          await prisma.productOptionGroup.create({
            data: {
              productId,
              name: "Adicionais",
              required: false,
              minSelection: 0,
              maxSelection:
                input.maxSelection,
              position: 100,
              active: true,
              libraryManaged: true,
            },
          });
      }

      if (group) {
        await prisma.productOptionGroup.update({
          where: { id: group.id },
          data: {
            maxSelection:
              input.maxSelection,
            active: true,
          },
        });

        const currentOptions =
          await prisma.productOption.findMany({
            where: {
              groupId: group.id,
              addonLibraryId: {
                not: null,
              },
            },
          });

        const selectedSet = new Set(
          input.addonIds,
        );

        const optionsToDelete =
          currentOptions.filter(
            (option) =>
              !option.addonLibraryId ||
              !selectedSet.has(
                option.addonLibraryId,
              ),
          );

        if (optionsToDelete.length > 0) {
          await prisma.productOption.deleteMany({
            where: {
              id: {
                in: optionsToDelete.map(
                  (option) => option.id,
                ),
              },
            },
          });
        }

        for (const addon of addons) {
          const existing =
            currentOptions.find(
              (option) =>
                option.addonLibraryId === addon.id,
            );

          if (existing) {
            await prisma.productOption.update({
              where: { id: existing.id },
              data: {
                name: addon.name,
                priceCents:
                  addon.priceCents,
                position: addon.position,
                active: addon.active,
              },
            });
          } else {
            await prisma.productOption.create({
              data: {
                groupId: group.id,
                addonLibraryId: addon.id,
                name: addon.name,
                priceCents:
                  addon.priceCents,
                position: addon.position,
                active: addon.active,
              },
            });
          }
        }
      }

      await audit(
        request,
        "SYNC_ADDONS",
        "PRODUCT",
        productId,
        input,
      );

      return prisma.product.findUnique({
        where: { id: productId },
        include: {
          category: true,
          optionGroups: {
            include: {
              options: true,
            },
          },
        },
      });
    },
  );

  app.post("/admin/products/:productId/option-groups", { preHandler: app.authenticateAdmin }, async (request, reply) => {
    const { productId } = z.object({ productId: z.string() }).parse(request.params);
    const input = optionGroupSchema.parse(request.body);
    const group = await prisma.productOptionGroup.create({ data: { productId, ...input } });
    await audit(request, "CREATE", "OPTION_GROUP", group.id, input);
    return reply.code(201).send(group);
  });
  app.patch(
  "/admin/option-groups/:id",
  { preHandler: app.authenticateAdmin },
  async (request) => {
    const { id } = z.object({
      id: z.string(),
    }).parse(request.params);

    const changes = optionGroupUpdateSchema.parse(request.body);

    const currentGroup = await prisma.productOptionGroup.findUnique({
      where: { id },
    });

    if (!currentGroup) {
      throw new HttpError(
        404,
        "Grupo de opções não encontrado",
        "OPTION_GROUP_NOT_FOUND",
      );
    }

    // Valida mínimo e máximo usando os valores atuais
    // combinados com os campos que foram alterados.
    optionGroupSchema.parse({
      name: changes.name ?? currentGroup.name,
      required: changes.required ?? currentGroup.required,
      minSelection:
        changes.minSelection ?? currentGroup.minSelection,
      maxSelection:
        changes.maxSelection ?? currentGroup.maxSelection,
      position: changes.position ?? currentGroup.position,
      active: changes.active ?? currentGroup.active,
    });

    const group = await prisma.productOptionGroup.update({
      where: { id },
      data: changes,
    });

    await audit(
      request,
      "UPDATE",
      "OPTION_GROUP",
      id,
      changes,
    );

    return group;
  },
);
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

    if (input.dynamicDeliveryEnabled && !input.pickupAddress?.trim()) {
      throw new HttpError(
        422,
        "Informe o endereço completo da loja para calcular entregas por distância",
        "STORE_ADDRESS_REQUIRED",
      );
    }

    const settings = await prisma.storeSettings.upsert({
      where: { singletonKey: "default" },
      update: { ...input, instagramUrl: input.instagramUrl || undefined, logoUrl: input.logoUrl || undefined, heroImageUrl: input.heroImageUrl || undefined },
      create: { singletonKey: "default", ...input, instagramUrl: input.instagramUrl || undefined, logoUrl: input.logoUrl || undefined, heroImageUrl: input.heroImageUrl || undefined },
    });
    await audit(request, "UPDATE", "SETTINGS", settings.id, input);
    return settings;
  });
}
