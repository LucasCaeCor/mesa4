#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const staged = new Map();

function absolute(relative) {
  return resolve(root, relative);
}

function read(relative) {
  if (staged.has(relative)) {
    return staged.get(relative);
  }

  const file = absolute(relative);

  if (!existsSync(file)) {
    throw new Error(
      `Arquivo não encontrado: ${relative}`,
    );
  }

  const content = readFileSync(file, "utf8")
    .replace(/\r\n/g, "\n");

  staged.set(relative, content);
  return content;
}

function set(relative, content) {
  staged.set(relative, content);
}

function replaceRegex(
  relative,
  pattern,
  replacement,
  marker,
) {
  const current = read(relative);

  if (marker && current.includes(marker)) {
    console.log(`↷ ${relative} já atualizado`);
    return;
  }

  if (!pattern.test(current)) {
    throw new Error(
      `Não encontrei a estrutura esperada em ${relative}.\n` +
        "Nenhum arquivo foi gravado. Envie esse arquivo para revisão.",
    );
  }

  set(relative, current.replace(pattern, replacement));
}

function appendOnce(relative, marker, block) {
  const current = read(relative);

  if (current.includes(marker)) {
    console.log(`↷ ${relative} já atualizado`);
    return;
  }

  set(
    relative,
    `${current.trimEnd()}\n\n${block.trim()}\n`,
  );
}

const whatsappService =
  "backend/src/modules/whatsapp/whatsapp-cloud.service.ts";

if (!existsSync(absolute(whatsappService))) {
  throw new Error(
    "O bot de WhatsApp não foi encontrado. " +
      "Este instalador v3 é específico para o projeto com o bot já aplicado.",
  );
}

// Prisma ----------------------------------------------------------------------

replaceRegex(
  "backend/prisma/schema.prisma",
  /enum PaymentMethod\s*\{\s*PIX\s*\}/,
  `enum PaymentMethod {
  PIX
}

enum PixPaymentMode {
  MERCADO_PAGO
  MANUAL
}

enum PixKeyType {
  CPF
  CNPJ
  EMAIL
  PHONE
  RANDOM
}`,
  "enum PixPaymentMode",
);

replaceRegex(
  "backend/prisma/schema.prisma",
  /(\n\s*pixEnabled\s+Boolean\s+@default\(true\)\s*\n)/,
  `$1  pixPaymentMode        PixPaymentMode? @default(MERCADO_PAGO)
  manualPixKeyType      PixKeyType?
  manualPixKey          String?
  manualPixReceiverName String?
  manualPixReceiverCity String?
`,
  "pixPaymentMode",
);

replaceRegex(
  "backend/prisma/schema.prisma",
  /(\n\s*expiresAt\s+DateTime\?\s*\n)/,
  `$1  reportedAt            DateTime?
`,
  "reportedAt",
);

// Mercado Pago opcional quando o modo manual estiver ativo --------------------

replaceRegex(
  "backend/src/config/env.ts",
  /MERCADO_PAGO_ACCESS_TOKEN:\s*z\.string\(\)\.min\(1\),/,
  `MERCADO_PAGO_ACCESS_TOKEN: z.string().optional().default(""),`,
  'MERCADO_PAGO_ACCESS_TOKEN: z.string().optional().default("")',
);

replaceRegex(
  "backend/src/modules/payments/mercado-pago.service.ts",
  /(async function mercadoPagoRequest<T>\([\s\S]*?\)\s*\{\s*)/,
  `$1
  if (!env.MERCADO_PAGO_ACCESS_TOKEN) {
    throw new HttpError(
      503,
      "O Mercado Pago não está configurado",
      "MERCADO_PAGO_NOT_CONFIGURED",
    );
  }
`,
  "MERCADO_PAGO_NOT_CONFIGURED",
);

// Dependências ----------------------------------------------------------------

{
  const relative = "backend/package.json";
  const packageJson = JSON.parse(read(relative));

  packageJson.dependencies ??= {};
  packageJson.devDependencies ??= {};

  packageJson.dependencies.qrcode = "^1.5.4";
  packageJson.devDependencies["@types/qrcode"] =
    "^1.5.6";

  set(
    relative,
    `${JSON.stringify(packageJson, null, 2)}\n`,
  );
}

// Serviço do Pix manual --------------------------------------------------------

set(
  "backend/src/modules/payments/manual-pix.service.ts",
  "import QRCode from \"qrcode\";\nimport { HttpError } from \"../../lib/http-error.js\";\n\ntype PixKeyType = \"CPF\" | \"CNPJ\" | \"EMAIL\" | \"PHONE\" | \"RANDOM\";\n\ntype CreateManualPixInput = {\n  keyType: PixKeyType;\n  key: string;\n  receiverName: string;\n  receiverCity: string;\n  amountCents: number;\n  txid: string;\n};\n\nfunction emvField(id: string, value: string) {\n  const length = Buffer.byteLength(value, \"utf8\");\n\n  if (length > 99) {\n    throw new HttpError(\n      422,\n      `Campo ${id} excede o limite do Pix`,\n      \"INVALID_PIX_FIELD\",\n    );\n  }\n\n  return `${id}${String(length).padStart(2, \"0\")}${value}`;\n}\n\nfunction normalizeText(value: string, maxLength: number) {\n  return value\n    .normalize(\"NFD\")\n    .replace(/[\\u0300-\\u036f]/g, \"\")\n    .toUpperCase()\n    .replace(/[^A-Z0-9 ]/g, \" \")\n    .replace(/\\s+/g, \" \")\n    .trim()\n    .slice(0, maxLength);\n}\n\nfunction normalizePixKey(type: PixKeyType, value: string) {\n  const trimmed = value.trim();\n\n  if (type === \"CPF\") {\n    const digits = trimmed.replace(/\\D/g, \"\");\n\n    if (digits.length !== 11) {\n      throw new HttpError(\n        422,\n        \"A chave CPF deve ter 11 dígitos\",\n        \"INVALID_PIX_KEY\",\n      );\n    }\n\n    return digits;\n  }\n\n  if (type === \"CNPJ\") {\n    const digits = trimmed.replace(/\\D/g, \"\");\n\n    if (digits.length !== 14) {\n      throw new HttpError(\n        422,\n        \"A chave CNPJ deve ter 14 dígitos\",\n        \"INVALID_PIX_KEY\",\n      );\n    }\n\n    return digits;\n  }\n\n  if (type === \"PHONE\") {\n    const digits = trimmed.replace(/\\D/g, \"\");\n\n    if (digits.length === 10 || digits.length === 11) {\n      return `+55${digits}`;\n    }\n\n    if (\n      (digits.length === 12 || digits.length === 13) &&\n      digits.startsWith(\"55\")\n    ) {\n      return `+${digits}`;\n    }\n\n    throw new HttpError(\n      422,\n      \"Informe o telefone Pix com DDD\",\n      \"INVALID_PIX_KEY\",\n    );\n  }\n\n  if (type === \"EMAIL\") {\n    const email = trimmed.toLowerCase();\n\n    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {\n      throw new HttpError(\n        422,\n        \"A chave Pix de e-mail é inválida\",\n        \"INVALID_PIX_KEY\",\n      );\n    }\n\n    return email;\n  }\n\n  if (trimmed.length < 10 || trimmed.length > 100) {\n    throw new HttpError(\n      422,\n      \"A chave Pix aleatória é inválida\",\n      \"INVALID_PIX_KEY\",\n    );\n  }\n\n  return trimmed;\n}\n\nfunction crc16Ccitt(payload: string) {\n  let crc = 0xffff;\n\n  for (const character of Buffer.from(payload, \"utf8\")) {\n    crc ^= character << 8;\n\n    for (let bit = 0; bit < 8; bit += 1) {\n      crc =\n        crc & 0x8000\n          ? ((crc << 1) ^ 0x1021) & 0xffff\n          : (crc << 1) & 0xffff;\n    }\n  }\n\n  return crc.toString(16).toUpperCase().padStart(4, \"0\");\n}\n\nexport async function createManualPixPayment(\n  input: CreateManualPixInput,\n) {\n  if (\n    !Number.isInteger(input.amountCents) ||\n    input.amountCents <= 0\n  ) {\n    throw new HttpError(\n      422,\n      \"O valor do Pix é inválido\",\n      \"INVALID_PIX_AMOUNT\",\n    );\n  }\n\n  const key = normalizePixKey(input.keyType, input.key);\n  const receiverName = normalizeText(input.receiverName, 25);\n  const receiverCity = normalizeText(input.receiverCity, 15);\n  const txid =\n    normalizeText(input.txid, 25)\n      .replace(/\\s/g, \"\")\n      .slice(0, 25) || \"***\";\n\n  if (!receiverName || !receiverCity) {\n    throw new HttpError(\n      422,\n      \"Nome e cidade do recebedor são obrigatórios\",\n      \"INVALID_PIX_RECEIVER\",\n    );\n  }\n\n  const merchantAccount =\n    emvField(\"00\", \"br.gov.bcb.pix\") +\n    emvField(\"01\", key);\n\n  const additionalData = emvField(\"05\", txid);\n  const amount = (input.amountCents / 100).toFixed(2);\n\n  const payloadWithoutCrc =\n    emvField(\"00\", \"01\") +\n    emvField(\"26\", merchantAccount) +\n    emvField(\"52\", \"0000\") +\n    emvField(\"53\", \"986\") +\n    emvField(\"54\", amount) +\n    emvField(\"58\", \"BR\") +\n    emvField(\"59\", receiverName) +\n    emvField(\"60\", receiverCity) +\n    emvField(\"62\", additionalData) +\n    \"6304\";\n\n  const payload =\n    `${payloadWithoutCrc}${crc16Ccitt(payloadWithoutCrc)}`;\n\n  const dataUrl = await QRCode.toDataURL(payload, {\n    errorCorrectionLevel: \"M\",\n    margin: 2,\n    width: 420,\n  });\n\n  return {\n    provider: \"MANUAL_PIX\" as const,\n    txid,\n    qrCode: payload,\n    qrCodeBase64: dataUrl.replace(\n      /^data:image\\/png;base64,/,\n      \"\",\n    ),\n  };\n}\n",
);

// Serviço de pedidos -----------------------------------------------------------

replaceRegex(
  "backend/src/modules/orders/order.service.ts",
  /(import\s+\{\s*createPixPayment\s*\}\s+from\s+"\.\.\/payments\/mercado-pago\.service\.js";)/,
  `$1
import { createManualPixPayment } from "../payments/manual-pix.service.js";`,
  "createManualPixPayment",
);

replaceRegex(
  "backend/src/modules/orders/order.service.ts",
  /  const idempotencyKey\s*=\s*`pix-\$\{publicId\}`;/,
  `  const paymentMode =
    settings.pixPaymentMode ?? "MERCADO_PAGO";
  const idempotencyKey =
    paymentMode === "MANUAL"
      ? \`manual-pix-\${publicId}\`
      : \`pix-\${publicId}\`;`,
  "manual-pix-",
);

replaceRegex(
  "backend/src/modules/orders/order.service.ts",
  /(\s*payments:\s*\{\s*create:\s*\{\s*)(amountCents:\s*totalCents,)/,
  `$1provider:
            paymentMode === "MANUAL"
              ? "MANUAL_PIX"
              : "MERCADO_PAGO",
          $2`,
  'paymentMode === "MANUAL"\n              ? "MANUAL_PIX"',
);

replaceRegex(
  "backend/src/modules/orders/order.service.ts",
  /  try \{\s*const mpPayment = await createPixPayment\([\s\S]*?\n  \}\s*return getOrderForCustomer\(publicId, trackingToken\);/,
  `  try {
    if (paymentMode === "MANUAL") {
      if (
        !settings.manualPixKeyType ||
        !settings.manualPixKey ||
        !settings.manualPixReceiverName ||
        !settings.manualPixReceiverCity
      ) {
        throw new HttpError(
          409,
          "O Pix manual ainda não foi configurado no painel",
          "MANUAL_PIX_NOT_CONFIGURED",
        );
      }

      const manualPayment =
        await createManualPixPayment({
          keyType: settings.manualPixKeyType,
          key: settings.manualPixKey,
          receiverName:
            settings.manualPixReceiverName,
          receiverCity:
            settings.manualPixReceiverCity,
          amountCents: totalCents,
          txid: publicId,
        });

      await prisma.payment.update({
        where: { idempotencyKey },
        data: {
          provider: manualPayment.provider,
          providerPaymentId:
            manualPayment.txid,
          qrCode: manualPayment.qrCode,
          qrCodeBase64:
            manualPayment.qrCodeBase64,
          statusDetail:
            "AWAITING_MANUAL_CONFIRMATION",
          rawResponse: {
            txid: manualPayment.txid,
            mode: "STATIC_PIX",
          } as Prisma.InputJsonValue,
        },
      });
    } else {
      const mpPayment = await createPixPayment({
        amountCents: totalCents,
        description:
          \`Pedido \${publicId} - Mesa IV Burgers\`,
        email: input.customerEmail,
        firstName:
          input.customerName.split(" ")[0] ??
          input.customerName,
        externalReference: publicId,
        idempotencyKey,
      });

      const transactionData =
        mpPayment.point_of_interaction
          ?.transaction_data;
      const paymentStatus =
        mapPaymentStatus(mpPayment.status);

      await prisma.payment.update({
        where: { idempotencyKey },
        data: {
          providerPaymentId: String(mpPayment.id),
          status: paymentStatus,
          statusDetail: mpPayment.status_detail,
          qrCode: transactionData?.qr_code,
          qrCodeBase64:
            transactionData?.qr_code_base64,
          ticketUrl: transactionData?.ticket_url,
          expiresAt: mpPayment.date_of_expiration
            ? new Date(
                mpPayment.date_of_expiration,
              )
            : undefined,
          rawResponse:
            mpPayment as unknown as Prisma.InputJsonValue,
        },
      });

      if (paymentStatus === "APPROVED") {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: "PAID",
            paidAt: new Date(),
            statusHistory: {
              create: {
                status: "PAID",
                note: "Pagamento PIX aprovado",
              },
            },
          },
        });

        await sendOrderStatusWhatsApp(order.id, {
          source: "AUTO",
        }).catch((error) => {
          console.error(
            "WhatsApp automatic notification failed",
            {
              orderId: order.id,
              error,
            },
          );
        });
      }
    }
  } catch (error) {
    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: "CANCELED",
        canceledAt: new Date(),
        statusHistory: {
          create: {
            status: "CANCELED",
            note: "Falha ao gerar pagamento",
          },
        },
      },
    });

    throw error;
  }

  return getOrderForCustomer(
    publicId,
    trackingToken,
  );`,
  "AWAITING_MANUAL_CONFIRMATION",
);

replaceRegex(
  "backend/src/modules/orders/order.service.ts",
  /export async function getOrderForCustomer\(/,
  `export async function reportManualPayment(
  publicId: string,
  trackingToken: string,
) {
  const order = await prisma.order.findUnique({
    where: { publicId },
    include: {
      payments: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (
    !order ||
    hashTrackingToken(trackingToken) !==
      order.trackingTokenHash
  ) {
    throw new HttpError(
      404,
      "Pedido não encontrado",
      "ORDER_NOT_FOUND",
    );
  }

  const payment = order.payments[0];

  if (
    !payment ||
    payment.provider !== "MANUAL_PIX"
  ) {
    throw new HttpError(
      409,
      "Este pedido não utiliza Pix manual",
      "NOT_MANUAL_PIX",
    );
  }

  if (order.status !== "PENDING_PAYMENT") {
    return getOrderForCustomer(
      publicId,
      trackingToken,
    );
  }

  if (!payment.reportedAt) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        reportedAt: new Date(),
        statusDetail:
          "CUSTOMER_REPORTED_PAYMENT",
      },
    });
  }

  return getOrderForCustomer(
    publicId,
    trackingToken,
  );
}

export async function getOrderForCustomer(`,
  "reportManualPayment",
);

replaceRegex(
  "backend/src/modules/orders/order.service.ts",
  /payment:\s*payment\s*\?\s*\{\s*status:\s*payment\.status,/,
  `payment: payment ? {
      provider: payment.provider,
      status: payment.status,
      statusDetail: payment.statusDetail,
      reportedAt: payment.reportedAt,`,
  "reportedAt: payment.reportedAt",
);

// Rotas públicas ---------------------------------------------------------------

replaceRegex(
  "backend/src/routes/public.routes.ts",
  /import\s*\{\s*createOrder,\s*getOrderForCustomer\s*\}\s*from\s*"\.\.\/modules\/orders\/order\.service\.js";/,
  `import {
  createOrder,
  getOrderForCustomer,
  reportManualPayment,
} from "../modules/orders/order.service.js";`,
  "reportManualPayment",
);

replaceRegex(
  "backend/src/routes/public.routes.ts",
  /  app\.get\("\/store", async \(\) => \{[\s\S]*?\n  \}\);\s*(?=app\.get\("\/menu")/,
  `  app.get("/store", async () => {
    const [settings, hours, deliveryZones] =
      await Promise.all([
        prisma.storeSettings.findUnique({
          where: { singletonKey: "default" },
        }),
        prisma.businessHour.findMany({
          orderBy: { weekday: "asc" },
        }),
        prisma.deliveryZone.findMany({
          where: { active: true },
          orderBy: [
            { position: "asc" },
            { name: "asc" },
          ],
        }),
      ]);

    const publicSettings = settings
      ? {
          ...settings,
          manualPixKey: undefined,
          manualPixKeyType: undefined,
          manualPixReceiverName: undefined,
          manualPixReceiverCity: undefined,
          pixPaymentMode:
            settings.pixPaymentMode ??
            "MERCADO_PAGO",
        }
      : settings;

    return {
      settings: publicSettings,
      hours,
      deliveryZones,
    };
  });
  `,
  "manualPixKey: undefined",
);

replaceRegex(
  "backend/src/routes/public.routes.ts",
  /(\n\s*app\.get\("\/orders\/:publicId",)/,
  `
  app.post(
    "/orders/:publicId/payment-reported",
    {
      config: {
        rateLimit: {
          max: 8,
          timeWindow: "15 minutes",
        },
      },
    },
    async (request) => {
      const params = z
        .object({ publicId: z.string() })
        .parse(request.params);
      const query = z
        .object({ token: z.string().min(20) })
        .parse(request.query);

      return reportManualPayment(
        params.publicId,
        query.token,
      );
    },
  );
$1`,
  '"/orders/:publicId/payment-reported"',
);

// Rotas administrativas --------------------------------------------------------

replaceRegex(
  "backend/src/routes/admin.routes.ts",
  /const settingsSchema = z\.object\(\{[\s\S]*?\n\}\);\s*(?=async function audit)/,
  `const settingsSchema = z.object({
  storeName: z.string().trim().min(2).max(100),
  description: z
    .string()
    .trim()
    .max(500)
    .optional(),
  whatsappNumber: z
    .string()
    .regex(/^\\d{10,15}$/),
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
`,
  "pixPaymentMode: z",
);

replaceRegex(
  "backend/src/routes/admin.routes.ts",
  /  app\.patch\("\/admin\/orders\/:id\/status"[\s\S]*?(?=\n\s*app\.post\(\s*\n\s*"\/admin\/orders\/:id\/whatsapp")/,
  `  app.patch(
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
`,
  "MANUALLY_CONFIRMED_BY_ADMIN",
);

// Frontend --------------------------------------------------------------------

replaceRegex(
  "frontend/src/types.ts",
  /export type StoreSettings = \{[\s\S]*?\};/,
  `export type StoreSettings = {
  storeName: string;
  description?: string;
  whatsappNumber: string;
  instagramUrl?: string;
  logoUrl?: string;
  heroImageUrl?: string;
  pickupAddress?: string;
  minimumOrderCents: number;
  deliveryFeeCents?: number | null;
  dynamicDeliveryEnabled?: boolean | null;
  deliveryBaseFeeCents?: number | null;
  deliveryIncludedKm?: number | null;
  deliveryPricePerKmCents?: number | null;
  deliveryMaxDistanceKm?: number | null;
  defaultPrepMinutes: number;
  acceptingOrders: boolean;
  pixEnabled: boolean;
  pixPaymentMode?:
    | "MERCADO_PAGO"
    | "MANUAL"
    | null;
  manualPixKeyType?:
    | "CPF"
    | "CNPJ"
    | "EMAIL"
    | "PHONE"
    | "RANDOM"
    | null;
  manualPixKey?: string | null;
  manualPixReceiverName?: string | null;
  manualPixReceiverCity?: string | null;
  whatsappConfirmation: boolean;
  whatsappNotificationsEnabled?:
    | boolean
    | null;
};`,
  'pixPaymentMode?:',
);

replaceRegex(
  "frontend/src/pages/CheckoutPage.tsx",
  /<p className="payment-note">\s*Pagamento seguro por PIX\.[\s\S]*?<\/p>/,
  `<p className="payment-note">
            {store.data?.settings.pixPaymentMode ===
            "MANUAL"
              ? "Pix direto para a chave da loja. Depois de pagar, avise pelo acompanhamento e aguarde a conferência."
              : "Pagamento seguro por PIX com confirmação automática. O preço final é recalculado pelo servidor."}
          </p>`,
  'settings.pixPaymentMode ===',
);

set(
  "frontend/src/pages/OrderPage.tsx",
  "import {\n  useMutation,\n  useQuery,\n} from \"@tanstack/react-query\";\nimport {\n  Check,\n  Copy,\n  MessageCircle,\n  ShieldCheck,\n} from \"lucide-react\";\nimport {\n  useParams,\n  useSearchParams,\n} from \"react-router-dom\";\nimport { api } from \"../lib/api\";\nimport { formatMoney } from \"../lib/format\";\nimport type { OrderStatus } from \"../types\";\n\ntype Result = {\n  order: {\n    publicId: string;\n    customerName: string;\n    status: OrderStatus;\n    totalCents: number;\n    fulfillment: string;\n    items: Array<{\n      id: string;\n      quantity: number;\n      productName: string;\n      options: Array<{\n        id: string;\n        optionName: string;\n      }>;\n    }>;\n    statusHistory: Array<{\n      id: string;\n      status: OrderStatus;\n      createdAt: string;\n    }>;\n  };\n  payment: {\n    provider: string;\n    status: string;\n    statusDetail?: string;\n    reportedAt?: string;\n    qrCode?: string;\n    qrCodeBase64?: string;\n    ticketUrl?: string;\n  } | null;\n};\n\nconst labels: Record<OrderStatus, string> = {\n  PENDING_PAYMENT: \"Aguardando pagamento\",\n  PAID: \"Pagamento aprovado\",\n  CONFIRMED: \"Pedido confirmado\",\n  PREPARING: \"Em preparo\",\n  READY: \"Pronto\",\n  OUT_FOR_DELIVERY: \"Saiu para entrega\",\n  DELIVERED: \"Entregue\",\n  CANCELED: \"Cancelado\",\n};\n\nexport function OrderPage() {\n  const { publicId = \"\" } = useParams();\n  const [search] = useSearchParams();\n  const token = search.get(\"token\") ?? \"\";\n\n  const order = useQuery({\n    queryKey: [\"order\", publicId, token],\n    queryFn: () =>\n      api<Result>(\n        `/orders/${publicId}?token=${encodeURIComponent(token)}`,\n      ),\n    refetchInterval: 8000,\n  });\n\n  const reportPayment = useMutation({\n    mutationFn: () =>\n      api<Result>(\n        `/orders/${publicId}/payment-reported?token=${encodeURIComponent(token)}`,\n        {\n          method: \"POST\",\n        },\n      ),\n    onSuccess: () => order.refetch(),\n  });\n\n  async function whatsapp() {\n    const result = await api<{ url: string }>(\n      `/orders/${publicId}/whatsapp?token=${encodeURIComponent(token)}`,\n    );\n\n    window.open(\n      result.url,\n      \"_blank\",\n      \"noopener,noreferrer\",\n    );\n  }\n\n  async function copyPix() {\n    await navigator.clipboard.writeText(\n      order.data?.payment?.qrCode ?? \"\",\n    );\n\n    alert(\"Código PIX copiado\");\n  }\n\n  if (order.isLoading) {\n    return (\n      <div className=\"center-page\">\n        <p>Carregando pedido...</p>\n      </div>\n    );\n  }\n\n  if (!order.data) {\n    return (\n      <div className=\"center-page\">\n        <h1>Pedido não encontrado</h1>\n      </div>\n    );\n  }\n\n  const data = order.data;\n  const isManualPix =\n    data.payment?.provider === \"MANUAL_PIX\";\n\n  return (\n    <main className=\"order-page\">\n      <section className=\"order-card\">\n        <div className=\"success-icon\">\n          <Check />\n        </div>\n\n        <small>Pedido {data.order.publicId}</small>\n        <h1>{labels[data.order.status]}</h1>\n\n        <p>\n          Olá, {data.order.customerName}. Esta página\n          atualiza automaticamente.\n        </p>\n\n        {data.order.status === \"PENDING_PAYMENT\" &&\n          data.payment && (\n            <div className=\"pix-box\">\n              <h2>\n                {isManualPix\n                  ? \"Pix direto para a loja\"\n                  : \"Pague com PIX\"}\n              </h2>\n\n              {data.payment.qrCodeBase64 && (\n                <img\n                  src={`data:image/png;base64,${data.payment.qrCodeBase64}`}\n                  alt=\"QR Code PIX\"\n                />\n              )}\n\n              <button\n                className=\"secondary\"\n                type=\"button\"\n                onClick={copyPix}\n              >\n                <Copy />\n                Copiar código PIX\n              </button>\n\n              {isManualPix ? (\n                <div className=\"manual-pix-customer\">\n                  <p>\n                    Depois de pagar, avise a loja. O\n                    pedido só será confirmado após a\n                    conferência no aplicativo bancário.\n                  </p>\n\n                  {data.payment.reportedAt ? (\n                    <div className=\"manual-payment-reported\">\n                      <ShieldCheck />\n                      <span>\n                        Pagamento informado. Aguardando\n                        conferência da loja.\n                      </span>\n                    </div>\n                  ) : (\n                    <button\n                      className=\"primary\"\n                      type=\"button\"\n                      disabled={reportPayment.isPending}\n                      onClick={() =>\n                        reportPayment.mutate()\n                      }\n                    >\n                      {reportPayment.isPending\n                        ? \"Avisando a loja...\"\n                        : \"Já fiz o PIX\"}\n                    </button>\n                  )}\n\n                  {reportPayment.error && (\n                    <p className=\"error-text\">\n                      {reportPayment.error.message}\n                    </p>\n                  )}\n                </div>\n              ) : (\n                <p className=\"pix-provider-note\">\n                  A confirmação é automática pelo\n                  Mercado Pago.\n                </p>\n              )}\n            </div>\n          )}\n\n        <div className=\"timeline\">\n          {data.order.statusHistory.map(\n            (history, index) => (\n              <div\n                className=\"timeline-item\"\n                key={history.id}\n              >\n                <span\n                  className={\n                    index ===\n                    data.order.statusHistory.length - 1\n                      ? \"active\"\n                      : \"\"\n                  }\n                >\n                  <Check />\n                </span>\n\n                <div>\n                  <strong>\n                    {labels[history.status]}\n                  </strong>\n                  <small>\n                    {new Date(\n                      history.createdAt,\n                    ).toLocaleString(\"pt-BR\")}\n                  </small>\n                </div>\n              </div>\n            ),\n          )}\n        </div>\n\n        <div className=\"order-products\">\n          {data.order.items.map((item) => (\n            <div key={item.id}>\n              <span>\n                {item.quantity}x {item.productName}\n                <small>\n                  {item.options\n                    .map(\n                      (option) => option.optionName,\n                    )\n                    .join(\", \")}\n                </small>\n              </span>\n            </div>\n          ))}\n\n          <strong>\n            Total: {formatMoney(data.order.totalCents)}\n          </strong>\n        </div>\n\n        <button\n          className=\"whatsapp\"\n          type=\"button\"\n          onClick={whatsapp}\n        >\n          <MessageCircle />\n          Enviar pedido no WhatsApp\n        </button>\n      </section>\n    </main>\n  );\n}\n",
);

set(
  "frontend/src/pages/AdminDashboardPage.tsx",
  "import {\n  useMutation,\n  useQuery,\n  useQueryClient,\n} from \"@tanstack/react-query\";\nimport {\n  Banknote,\n  MessageCircle,\n  RefreshCw,\n} from \"lucide-react\";\nimport { useNavigate } from \"react-router-dom\";\nimport { AdminNav } from \"../components/AdminNav\";\nimport { adminApi } from \"../lib/api\";\nimport { formatMoney } from \"../lib/format\";\nimport type { OrderStatus } from \"../types\";\n\ntype WhatsAppNotification = {\n  id: string;\n  orderStatus: OrderStatus;\n  deliveryStatus: string;\n  errorMessage?: string;\n  createdAt: string;\n};\n\ntype AdminPayment = {\n  id: string;\n  provider: string;\n  status: string;\n  statusDetail?: string;\n  reportedAt?: string;\n};\n\ntype AdminOrder = {\n  id: string;\n  publicId: string;\n  customerName: string;\n  customerPhone: string;\n  whatsappOptIn?: boolean | null;\n  fulfillment: string;\n  totalCents: number;\n  status: OrderStatus;\n  createdAt: string;\n  deliveryZoneName?: string;\n  street?: string;\n  number?: string;\n  neighborhood?: string;\n  payments: AdminPayment[];\n  whatsappNotifications?: WhatsAppNotification[];\n  items: Array<{\n    id: string;\n    quantity: number;\n    productName: string;\n    options: Array<{\n      id: string;\n      optionName: string;\n    }>;\n  }>;\n};\n\ntype Dashboard = {\n  openOrders: number;\n  paidToday: number;\n  revenueTodayCents: number;\n};\n\nconst flow: OrderStatus[] = [\n  \"PAID\",\n  \"CONFIRMED\",\n  \"PREPARING\",\n  \"READY\",\n  \"OUT_FOR_DELIVERY\",\n  \"DELIVERED\",\n  \"CANCELED\",\n];\n\nconst labels: Record<OrderStatus, string> = {\n  PENDING_PAYMENT: \"Aguardando PIX\",\n  PAID: \"Pago\",\n  CONFIRMED: \"Confirmado\",\n  PREPARING: \"Preparando\",\n  READY: \"Pronto\",\n  OUT_FOR_DELIVERY: \"Em entrega\",\n  DELIVERED: \"Entregue\",\n  CANCELED: \"Cancelado\",\n};\n\nconst notificationLabels: Record<string, string> = {\n  SENDING: \"Enviando\",\n  ACCEPTED: \"Aceita pela Meta\",\n  SENT: \"Enviada\",\n  DELIVERED: \"Entregue\",\n  READ: \"Lida\",\n  FAILED: \"Falhou\",\n};\n\nexport function AdminDashboardPage() {\n  const navigate = useNavigate();\n  const queryClient = useQueryClient();\n\n  const orders = useQuery({\n    queryKey: [\"admin-orders\"],\n    queryFn: () =>\n      adminApi<AdminOrder[]>(\"/admin/orders\"),\n    refetchInterval: 10000,\n    retry: false,\n  });\n\n  const dashboard = useQuery({\n    queryKey: [\"admin-dashboard\"],\n    queryFn: () =>\n      adminApi<Dashboard>(\"/admin/dashboard\"),\n    refetchInterval: 15000,\n    retry: false,\n  });\n\n  const update = useMutation({\n    mutationFn: ({\n      id,\n      status,\n    }: {\n      id: string;\n      status: OrderStatus;\n    }) =>\n      adminApi(`/admin/orders/${id}/status`, {\n        method: \"PATCH\",\n        body: JSON.stringify({ status }),\n      }),\n    onSuccess() {\n      queryClient.invalidateQueries({\n        queryKey: [\"admin-orders\"],\n      });\n      queryClient.invalidateQueries({\n        queryKey: [\"admin-dashboard\"],\n      });\n    },\n  });\n\n  const notify = useMutation({\n    mutationFn: (id: string) =>\n      adminApi(`/admin/orders/${id}/whatsapp`, {\n        method: \"POST\",\n      }),\n    onSuccess() {\n      queryClient.invalidateQueries({\n        queryKey: [\"admin-orders\"],\n      });\n    },\n  });\n\n  if (\n    orders.error &&\n    (orders.error as { status?: number }).status ===\n      401\n  ) {\n    sessionStorage.removeItem(\n      \"mesa4.admin.token\",\n    );\n    navigate(\"/admin/login\");\n    return null;\n  }\n\n  return (\n    <main className=\"admin-page\">\n      <AdminNav />\n\n      <header className=\"admin-header\">\n        <div>\n          <small>Painel de pedidos</small>\n          <h1>Mesa IV Burgers</h1>\n        </div>\n\n        <div>\n          <button\n            className=\"secondary\"\n            type=\"button\"\n            onClick={() =>\n              queryClient.invalidateQueries()\n            }\n          >\n            <RefreshCw />\n            Atualizar\n          </button>\n        </div>\n      </header>\n\n      <section className=\"stats\">\n        <article>\n          <span>Pedidos abertos</span>\n          <strong>\n            {dashboard.data?.openOrders ?? 0}\n          </strong>\n        </article>\n\n        <article>\n          <span>Pagos hoje</span>\n          <strong>\n            {dashboard.data?.paidToday ?? 0}\n          </strong>\n        </article>\n\n        <article>\n          <span>Faturamento hoje</span>\n          <strong>\n            {formatMoney(\n              dashboard.data?.revenueTodayCents ??\n                0,\n            )}\n          </strong>\n        </article>\n      </section>\n\n      <section className=\"admin-orders\">\n        <div className=\"section-title\">\n          <h2>Pedidos recentes</h2>\n          <span>Atualização automática</span>\n        </div>\n\n        {orders.data?.map((order) => {\n          const payment = order.payments?.[0];\n          const isManualPix =\n            payment?.provider === \"MANUAL_PIX\";\n          const customerReported =\n            Boolean(payment?.reportedAt);\n          const lastNotification =\n            order.whatsappNotifications?.[0];\n\n          return (\n            <article\n              className=\"admin-order\"\n              key={order.id}\n            >\n              <div className=\"admin-order-head\">\n                <div>\n                  <span\n                    className={`status-chip ${order.status.toLowerCase()}`}\n                  >\n                    {labels[order.status]}\n                  </span>\n\n                  <h3>{order.publicId}</h3>\n                  <p>\n                    {order.customerName} ·{\" \"}\n                    {order.customerPhone}\n                  </p>\n\n                  <div className=\"payment-provider-row\">\n                    <span className=\"payment-provider-chip\">\n                      <Banknote />\n                      {isManualPix\n                        ? \"Pix manual\"\n                        : \"Mercado Pago\"}\n                    </span>\n\n                    {isManualPix &&\n                      order.status ===\n                        \"PENDING_PAYMENT\" && (\n                        <span\n                          className={`manual-report-chip ${\n                            customerReported\n                              ? \"reported\"\n                              : \"\"\n                          }`}\n                        >\n                          {customerReported\n                            ? \"Cliente informou pagamento\"\n                            : \"Aguardando cliente pagar\"}\n                        </span>\n                      )}\n                  </div>\n\n                  <div className=\"whatsapp-admin-status\">\n                    <span\n                      className={\n                        order.whatsappOptIn\n                          ? \"whatsapp-opted-in\"\n                          : \"whatsapp-opted-out\"\n                      }\n                    >\n                      <MessageCircle size={15} />\n                      {order.whatsappOptIn\n                        ? \"WhatsApp autorizado\"\n                        : \"Sem autorização\"}\n                    </span>\n\n                    {lastNotification && (\n                      <small\n                        title={\n                          lastNotification.errorMessage ??\n                          \"\"\n                        }\n                      >\n                        Último envio:{\" \"}\n                        {notificationLabels[\n                          lastNotification.deliveryStatus\n                        ] ??\n                          lastNotification.deliveryStatus}\n                      </small>\n                    )}\n                  </div>\n                </div>\n\n                <div>\n                  <strong>\n                    {formatMoney(order.totalCents)}\n                  </strong>\n                  <small>\n                    {new Date(\n                      order.createdAt,\n                    ).toLocaleString(\"pt-BR\")}\n                  </small>\n                </div>\n              </div>\n\n              <div className=\"admin-order-body\">\n                <div>\n                  {order.items.map((item) => (\n                    <p key={item.id}>\n                      <b>{item.quantity}x</b>{\" \"}\n                      {item.productName}\n                      <small>\n                        {item.options\n                          .map(\n                            (option) =>\n                              option.optionName,\n                          )\n                          .join(\", \")}\n                      </small>\n                    </p>\n                  ))}\n                </div>\n\n                <div>\n                  <b>\n                    {order.fulfillment ===\n                    \"DELIVERY\"\n                      ? \"Entrega\"\n                      : \"Retirada\"}\n                  </b>\n\n                  {order.fulfillment ===\n                    \"DELIVERY\" && (\n                    <p>\n                      {order.street}, {order.number} —{\" \"}\n                      {order.neighborhood}\n                    </p>\n                  )}\n                </div>\n              </div>\n\n              <div className=\"status-actions\">\n                {flow.map((status) => {\n                  if (\n                    status === \"PAID\" &&\n                    !isManualPix &&\n                    order.status ===\n                      \"PENDING_PAYMENT\"\n                  ) {\n                    return null;\n                  }\n\n                  const buttonLabel =\n                    status === \"PAID\" &&\n                    isManualPix\n                      ? \"Confirmar Pix manual\"\n                      : labels[status];\n\n                  return (\n                    <button\n                      key={status}\n                      disabled={\n                        update.isPending ||\n                        order.status === status\n                      }\n                      onClick={() =>\n                        update.mutate({\n                          id: order.id,\n                          status,\n                        })\n                      }\n                    >\n                      {buttonLabel}\n                    </button>\n                  );\n                })}\n              </div>\n\n              <div className=\"whatsapp-admin-actions\">\n                <button\n                  className=\"secondary\"\n                  type=\"button\"\n                  disabled={\n                    !order.whatsappOptIn ||\n                    notify.isPending\n                  }\n                  onClick={() =>\n                    notify.mutate(order.id)\n                  }\n                >\n                  <MessageCircle />\n                  {notify.isPending\n                    ? \"Enviando...\"\n                    : \"Reenviar status no WhatsApp\"}\n                </button>\n              </div>\n\n              {update.error && (\n                <p className=\"error-text\">\n                  {update.error.message}\n                </p>\n              )}\n\n              {notify.error && (\n                <p className=\"error-text\">\n                  {notify.error.message}\n                </p>\n              )}\n            </article>\n          );\n        })}\n      </section>\n    </main>\n  );\n}\n",
);

set(
  "frontend/src/pages/AdminSettingsPage.tsx",
  "import {\n  FormEvent,\n  useEffect,\n  useState,\n} from \"react\";\nimport {\n  useMutation,\n  useQuery,\n  useQueryClient,\n} from \"@tanstack/react-query\";\nimport { AdminNav } from \"../components/AdminNav\";\nimport { adminApi } from \"../lib/api\";\nimport type { StoreSettings } from \"../types\";\n\ntype Hour = {\n  weekday: number;\n  enabled: boolean;\n  opensAt: string;\n  closesAt: string;\n};\n\nconst weekdayNames = [\n  \"Domingo\",\n  \"Segunda\",\n  \"Terça\",\n  \"Quarta\",\n  \"Quinta\",\n  \"Sexta\",\n  \"Sábado\",\n];\n\nexport function AdminSettingsPage() {\n  const client = useQueryClient();\n  const [pixPaymentMode, setPixPaymentMode] =\n    useState<\"MERCADO_PAGO\" | \"MANUAL\">(\n      \"MERCADO_PAGO\",\n    );\n\n  const settings = useQuery({\n    queryKey: [\"admin-settings\"],\n    queryFn: () =>\n      adminApi<StoreSettings>(\"/admin/settings\"),\n  });\n\n  useEffect(() => {\n    setPixPaymentMode(\n      settings.data?.pixPaymentMode ??\n        \"MERCADO_PAGO\",\n    );\n  }, [settings.data?.pixPaymentMode]);\n\n  const hours = useQuery({\n    queryKey: [\"admin-hours\"],\n    queryFn: () =>\n      adminApi<Hour[]>(\"/admin/business-hours\"),\n  });\n\n  const saveSettings = useMutation({\n    mutationFn: (body: unknown) =>\n      adminApi(\"/admin/settings\", {\n        method: \"PUT\",\n        body: JSON.stringify(body),\n      }),\n    onSuccess: () =>\n      client.invalidateQueries({\n        queryKey: [\"admin-settings\"],\n      }),\n  });\n\n  const saveHours = useMutation({\n    mutationFn: (body: unknown) =>\n      adminApi(\"/admin/business-hours\", {\n        method: \"PUT\",\n        body: JSON.stringify(body),\n      }),\n    onSuccess: () =>\n      client.invalidateQueries({\n        queryKey: [\"admin-hours\"],\n      }),\n  });\n\n  function submitSettings(\n    event: FormEvent<HTMLFormElement>,\n  ) {\n    event.preventDefault();\n    const form = new FormData(event.currentTarget);\n\n    saveSettings.mutate({\n      storeName: form.get(\"storeName\"),\n      description:\n        form.get(\"description\") || undefined,\n      whatsappNumber: String(\n        form.get(\"whatsappNumber\"),\n      ).replace(/\\D/g, \"\"),\n      instagramUrl:\n        form.get(\"instagramUrl\") || \"\",\n      logoUrl: form.get(\"logoUrl\") || \"\",\n      heroImageUrl:\n        form.get(\"heroImageUrl\") || \"\",\n      pickupAddress:\n        form.get(\"pickupAddress\") || undefined,\n      minimumOrderCents: Math.round(\n        Number(form.get(\"minimumOrder\")) * 100,\n      ),\n      deliveryFeeCents: Math.round(\n        Number(form.get(\"deliveryFee\")) * 100,\n      ),\n      dynamicDeliveryEnabled:\n        form.get(\"dynamicDeliveryEnabled\") ===\n        \"on\",\n      deliveryBaseFeeCents: Math.round(\n        Number(form.get(\"deliveryBaseFee\")) *\n          100,\n      ),\n      deliveryIncludedKm: Number(\n        form.get(\"deliveryIncludedKm\"),\n      ),\n      deliveryPricePerKmCents: Math.round(\n        Number(\n          form.get(\"deliveryPricePerKm\"),\n        ) * 100,\n      ),\n      deliveryMaxDistanceKm: Number(\n        form.get(\"deliveryMaxDistanceKm\"),\n      ),\n      defaultPrepMinutes: Number(\n        form.get(\"prepMinutes\"),\n      ),\n      acceptingOrders:\n        form.get(\"acceptingOrders\") === \"on\",\n      pixEnabled:\n        form.get(\"pixEnabled\") === \"on\",\n      pixPaymentMode,\n      manualPixKeyType:\n        form.get(\"manualPixKeyType\") ||\n        undefined,\n      manualPixKey:\n        form.get(\"manualPixKey\") || undefined,\n      manualPixReceiverName:\n        form.get(\"manualPixReceiverName\") ||\n        undefined,\n      manualPixReceiverCity:\n        form.get(\"manualPixReceiverCity\") ||\n        undefined,\n      whatsappConfirmation: true,\n      whatsappNotificationsEnabled:\n        form.get(\n          \"whatsappNotificationsEnabled\",\n        ) === \"on\",\n    });\n  }\n\n  function submitHours(\n    event: FormEvent<HTMLFormElement>,\n  ) {\n    event.preventDefault();\n    const form = new FormData(event.currentTarget);\n    const body = weekdayNames.map(\n      (_, weekday) => ({\n        weekday,\n        enabled:\n          form.get(`enabled-${weekday}`) ===\n          \"on\",\n        opensAt: form.get(`opens-${weekday}`),\n        closesAt: form.get(\n          `closes-${weekday}`,\n        ),\n      }),\n    );\n\n    saveHours.mutate(body);\n  }\n\n  const s = settings.data;\n\n  return (\n    <main className=\"admin-page\">\n      <AdminNav />\n\n      <header className=\"admin-header\">\n        <div>\n          <small>Loja e entrega</small>\n          <h1>Configurações</h1>\n        </div>\n      </header>\n\n      {s && (\n        <form\n          className=\"admin-form settings-form\"\n          onSubmit={submitSettings}\n        >\n          <h2>Dados da loja</h2>\n\n          <div className=\"field-grid\">\n            <label className=\"field\">\n              <span>Nome da loja</span>\n              <input\n                name=\"storeName\"\n                defaultValue={s.storeName}\n                required\n              />\n            </label>\n\n            <label className=\"field\">\n              <span>WhatsApp com DDI</span>\n              <input\n                name=\"whatsappNumber\"\n                defaultValue={s.whatsappNumber}\n                required\n              />\n            </label>\n\n            <label className=\"field full\">\n              <span>Descrição</span>\n              <textarea\n                name=\"description\"\n                defaultValue={s.description}\n              />\n            </label>\n\n            <label className=\"field full\">\n              <span>Endereço de retirada</span>\n              <input\n                name=\"pickupAddress\"\n                defaultValue={s.pickupAddress}\n              />\n            </label>\n\n            <label className=\"field\">\n              <span>Pedido mínimo em R$</span>\n              <input\n                name=\"minimumOrder\"\n                type=\"number\"\n                min=\"0\"\n                step=\"0.01\"\n                defaultValue={\n                  s.minimumOrderCents / 100\n                }\n              />\n            </label>\n\n            <label className=\"field\">\n              <span>Taxa fixa em R$</span>\n              <input\n                name=\"deliveryFee\"\n                type=\"number\"\n                min=\"0\"\n                step=\"0.01\"\n                defaultValue={\n                  (s.deliveryFeeCents ?? 0) /\n                  100\n                }\n                required\n              />\n              <small className=\"field-help\">\n                Usada quando o cálculo por distância\n                estiver desligado.\n              </small>\n            </label>\n\n            <label className=\"field\">\n              <span>\n                Taxa base dinâmica em R$\n              </span>\n              <input\n                name=\"deliveryBaseFee\"\n                type=\"number\"\n                min=\"0\"\n                step=\"0.01\"\n                defaultValue={\n                  (s.deliveryBaseFeeCents ?? 0) /\n                  100\n                }\n                required\n              />\n            </label>\n\n            <label className=\"field\">\n              <span>Quilômetros incluídos</span>\n              <input\n                name=\"deliveryIncludedKm\"\n                type=\"number\"\n                min=\"0\"\n                step=\"0.1\"\n                defaultValue={\n                  s.deliveryIncludedKm ?? 0\n                }\n                required\n              />\n            </label>\n\n            <label className=\"field\">\n              <span>\n                Valor por km adicional em R$\n              </span>\n              <input\n                name=\"deliveryPricePerKm\"\n                type=\"number\"\n                min=\"0\"\n                step=\"0.01\"\n                defaultValue={\n                  (s.deliveryPricePerKmCents ??\n                    0) / 100\n                }\n                required\n              />\n            </label>\n\n            <label className=\"field\">\n              <span>Distância máxima em km</span>\n              <input\n                name=\"deliveryMaxDistanceKm\"\n                type=\"number\"\n                min=\"0.1\"\n                step=\"0.1\"\n                defaultValue={\n                  s.deliveryMaxDistanceKm ?? 15\n                }\n                required\n              />\n            </label>\n\n            <label className=\"field\">\n              <span>Preparo em minutos</span>\n              <input\n                name=\"prepMinutes\"\n                type=\"number\"\n                defaultValue={\n                  s.defaultPrepMinutes\n                }\n              />\n            </label>\n\n            <label className=\"field full\">\n              <span>Instagram</span>\n              <input\n                name=\"instagramUrl\"\n                type=\"url\"\n                defaultValue={s.instagramUrl}\n              />\n            </label>\n\n            <label className=\"field\">\n              <span>URL da logo</span>\n              <input\n                name=\"logoUrl\"\n                type=\"url\"\n                defaultValue={s.logoUrl}\n              />\n            </label>\n\n            <label className=\"field\">\n              <span>URL da capa</span>\n              <input\n                name=\"heroImageUrl\"\n                type=\"url\"\n                defaultValue={s.heroImageUrl}\n              />\n            </label>\n          </div>\n\n          <section className=\"payment-mode-section\">\n            <h2>Recebimento por Pix</h2>\n            <p>\n              Escolha se o sistema confirma o\n              pagamento automaticamente ou se a loja\n              confere no aplicativo bancário.\n            </p>\n\n            <div className=\"payment-mode-grid\">\n              <label\n                className={`payment-mode-card ${\n                  pixPaymentMode ===\n                  \"MERCADO_PAGO\"\n                    ? \"selected\"\n                    : \"\"\n                }`}\n              >\n                <input\n                  type=\"radio\"\n                  name=\"pixPaymentMode\"\n                  value=\"MERCADO_PAGO\"\n                  checked={\n                    pixPaymentMode ===\n                    \"MERCADO_PAGO\"\n                  }\n                  onChange={() =>\n                    setPixPaymentMode(\n                      \"MERCADO_PAGO\",\n                    )\n                  }\n                />\n                <span>\n                  <strong>Mercado Pago</strong>\n                  <small>\n                    Gera o Pix e confirma\n                    automaticamente pelo webhook.\n                  </small>\n                </span>\n              </label>\n\n              <label\n                className={`payment-mode-card ${\n                  pixPaymentMode === \"MANUAL\"\n                    ? \"selected\"\n                    : \"\"\n                }`}\n              >\n                <input\n                  type=\"radio\"\n                  name=\"pixPaymentMode\"\n                  value=\"MANUAL\"\n                  checked={\n                    pixPaymentMode === \"MANUAL\"\n                  }\n                  onChange={() =>\n                    setPixPaymentMode(\"MANUAL\")\n                  }\n                />\n                <span>\n                  <strong>Pix manual</strong>\n                  <small>\n                    O dinheiro cai direto na chave da\n                    loja e o administrador confirma no\n                    painel.\n                  </small>\n                </span>\n              </label>\n            </div>\n\n            {pixPaymentMode === \"MANUAL\" && (\n              <div className=\"field-grid manual-pix-fields\">\n                <label className=\"field\">\n                  <span>Tipo da chave</span>\n                  <select\n                    name=\"manualPixKeyType\"\n                    defaultValue={\n                      s.manualPixKeyType ??\n                      \"RANDOM\"\n                    }\n                    required\n                  >\n                    <option value=\"CPF\">\n                      CPF\n                    </option>\n                    <option value=\"CNPJ\">\n                      CNPJ\n                    </option>\n                    <option value=\"EMAIL\">\n                      E-mail\n                    </option>\n                    <option value=\"PHONE\">\n                      Telefone\n                    </option>\n                    <option value=\"RANDOM\">\n                      Chave aleatória\n                    </option>\n                  </select>\n                </label>\n\n                <label className=\"field\">\n                  <span>Chave Pix</span>\n                  <input\n                    name=\"manualPixKey\"\n                    defaultValue={\n                      s.manualPixKey ?? \"\"\n                    }\n                    required\n                  />\n                </label>\n\n                <label className=\"field\">\n                  <span>Nome do recebedor</span>\n                  <input\n                    name=\"manualPixReceiverName\"\n                    maxLength={25}\n                    defaultValue={\n                      s.manualPixReceiverName ??\n                      \"\"\n                    }\n                    required\n                  />\n                </label>\n\n                <label className=\"field\">\n                  <span>Cidade do recebedor</span>\n                  <input\n                    name=\"manualPixReceiverCity\"\n                    maxLength={15}\n                    defaultValue={\n                      s.manualPixReceiverCity ??\n                      \"\"\n                    }\n                    required\n                  />\n                </label>\n\n                <p className=\"manual-pix-warning\">\n                  O sistema gera o QR Code com o valor\n                  e o identificador do pedido, mas não\n                  consulta o banco. Confirme somente\n                  depois de verificar o recebimento.\n                </p>\n              </div>\n            )}\n          </section>\n\n          <div className=\"check-row\">\n            <label>\n              <input\n                name=\"dynamicDeliveryEnabled\"\n                type=\"checkbox\"\n                defaultChecked={\n                  s.dynamicDeliveryEnabled ?? false\n                }\n              />{\" \"}\n              Calcular entrega por distância\n            </label>\n\n            <label>\n              <input\n                name=\"acceptingOrders\"\n                type=\"checkbox\"\n                defaultChecked={\n                  s.acceptingOrders\n                }\n              />{\" \"}\n              Aceitando pedidos\n            </label>\n\n            <label>\n              <input\n                name=\"pixEnabled\"\n                type=\"checkbox\"\n                defaultChecked={s.pixEnabled}\n              />{\" \"}\n              PIX habilitado\n            </label>\n\n            <label>\n              <input\n                name=\"whatsappNotificationsEnabled\"\n                type=\"checkbox\"\n                defaultChecked={\n                  s.whatsappNotificationsEnabled ??\n                  false\n                }\n              />{\" \"}\n              Notificações automáticas pelo\n              WhatsApp\n            </label>\n          </div>\n\n          {saveSettings.error && (\n            <p className=\"error-text\">\n              {saveSettings.error.message}\n            </p>\n          )}\n\n          <button\n            className=\"primary\"\n            disabled={saveSettings.isPending}\n          >\n            {saveSettings.isPending\n              ? \"Salvando...\"\n              : \"Salvar configurações\"}\n          </button>\n        </form>\n      )}\n\n      <form\n        className=\"admin-form settings-form\"\n        onSubmit={submitHours}\n      >\n        <h2>Horários</h2>\n\n        {hours.data?.map((hour) => (\n          <div\n            className=\"hour-row\"\n            key={hour.weekday}\n          >\n            <label>\n              <input\n                name={`enabled-${hour.weekday}`}\n                type=\"checkbox\"\n                defaultChecked={hour.enabled}\n              />\n              {weekdayNames[hour.weekday]}\n            </label>\n\n            <input\n              name={`opens-${hour.weekday}`}\n              type=\"time\"\n              defaultValue={hour.opensAt}\n              required\n            />\n\n            <span>até</span>\n\n            <input\n              name={`closes-${hour.weekday}`}\n              type=\"time\"\n              defaultValue={hour.closesAt}\n              required\n            />\n          </div>\n        ))}\n\n        <button\n          className=\"primary\"\n          disabled={saveHours.isPending}\n        >\n          {saveHours.isPending\n            ? \"Salvando...\"\n            : \"Salvar horários\"}\n        </button>\n      </form>\n    </main>\n  );\n}\n",
);

appendOnce(
  "frontend/src/styles.css",
  ".payment-mode-section {",
  "\n.payment-mode-section {\n  margin-top: 2rem;\n  padding-top: 1.5rem;\n  border-top: 1px solid var(--border);\n}\n\n.payment-mode-section > p {\n  color: var(--muted);\n  line-height: 1.5;\n}\n\n.payment-mode-grid {\n  display: grid;\n  grid-template-columns: repeat(2, 1fr);\n  gap: 0.9rem;\n  margin: 1rem 0 1.25rem;\n}\n\n.payment-mode-card {\n  display: flex;\n  align-items: flex-start;\n  gap: 0.75rem;\n  padding: 1rem;\n  border: 1px solid var(--border);\n  border-radius: 14px;\n  background: #161411;\n  cursor: pointer;\n}\n\n.payment-mode-card.selected {\n  border-color: var(--orange);\n  background: rgba(255, 107, 26, 0.08);\n}\n\n.payment-mode-card input {\n  margin-top: 0.25rem;\n  accent-color: var(--orange);\n}\n\n.payment-mode-card span {\n  display: grid;\n  gap: 0.25rem;\n}\n\n.payment-mode-card small {\n  color: var(--muted);\n  line-height: 1.4;\n}\n\n.manual-pix-fields {\n  margin-bottom: 1.25rem;\n  padding: 1rem;\n  border: 1px solid rgba(255, 196, 61, 0.25);\n  border-radius: 14px;\n  background: rgba(255, 196, 61, 0.05);\n}\n\n.manual-pix-warning {\n  grid-column: 1 / -1;\n  margin: 0;\n  color: #e9c96f;\n  font-size: 0.9rem;\n  line-height: 1.5;\n}\n\n.manual-pix-customer {\n  display: grid;\n  gap: 0.85rem;\n  margin-top: 1rem;\n}\n\n.manual-pix-customer > p,\n.pix-provider-note {\n  margin: 0;\n  color: #4e473f;\n  font-size: 0.9rem;\n  line-height: 1.5;\n}\n\n.manual-pix-customer .primary {\n  width: 100%;\n}\n\n.manual-payment-reported {\n  display: flex;\n  align-items: center;\n  gap: 0.55rem;\n  padding: 0.85rem;\n  border-radius: 11px;\n  background: rgba(24, 135, 65, 0.12);\n  color: #176b36;\n  font-weight: 700;\n}\n\n.payment-provider-row {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 0.5rem;\n  margin-top: 0.7rem;\n}\n\n.payment-provider-chip,\n.manual-report-chip {\n  display: inline-flex;\n  align-items: center;\n  gap: 0.35rem;\n  padding: 0.35rem 0.65rem;\n  border-radius: 999px;\n  font-size: 0.75rem;\n  font-weight: 700;\n}\n\n.payment-provider-chip {\n  color: #f1d071;\n  background: rgba(255, 196, 61, 0.1);\n  border: 1px solid rgba(255, 196, 61, 0.2);\n}\n\n.payment-provider-chip svg {\n  width: 14px;\n  height: 14px;\n}\n\n.manual-report-chip {\n  color: var(--muted);\n  background: rgba(255, 255, 255, 0.04);\n  border: 1px solid rgba(255, 255, 255, 0.09);\n}\n\n.manual-report-chip.reported {\n  color: #7ae599;\n  background: rgba(54, 210, 103, 0.1);\n  border-color: rgba(54, 210, 103, 0.22);\n}\n\n@media (max-width: 700px) {\n  .payment-mode-grid {\n    grid-template-columns: 1fr;\n  }\n}\n",
);

// Grava somente depois de todas as validações ----------------------------------

for (const [relative, content] of staged) {
  const file = absolute(relative);
  mkdirSync(dirname(file), {
    recursive: true,
  });
  writeFileSync(file, content, "utf8");
  console.log(`✓ ${relative}`);
}

console.log(`
Pix automático + Pix manual aplicado sem remover o bot de WhatsApp.

Agora execute:

  cd backend
  npm install
  npm run prisma:generate
  npm run prisma:push
  npm run build

  cd ../frontend
  npm run build
`);
