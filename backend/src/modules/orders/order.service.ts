import { PaymentStatus, type Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../lib/http-error.js";
import { createPublicOrderId, createTrackingToken, hashTrackingToken } from "../../lib/tracking.js";
import { createPixPayment } from "../payments/mercado-pago.service.js";
import type { z } from "zod";
import type { createOrderSchema } from "./order.schemas.js";

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

function mapPaymentStatus(status: string): PaymentStatus {
  const values: Record<string, PaymentStatus> = {
    approved: "APPROVED",
    pending: "PENDING",
    in_process: "IN_PROCESS",
    rejected: "REJECTED",
    cancelled: "CANCELED",
    refunded: "REFUNDED",
    charged_back: "REFUNDED",
  };
  return values[status] ?? "PENDING";
}

export async function createOrder(input: CreateOrderInput) {
  const settings = await prisma.storeSettings.findUnique({ where: { singletonKey: "default" } });
  if (!settings?.acceptingOrders) throw new HttpError(409, "A loja está fechada para novos pedidos", "STORE_CLOSED");
  if (!settings.pixEnabled) throw new HttpError(409, "Pagamento PIX temporariamente indisponível", "PIX_DISABLED");

  const productIds = [...new Set(input.items.map((item) => item.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, active: true, soldOut: false },
    include: {
      optionGroups: {
        where: { active: true },
        include: { options: { where: { active: true } } },
      },
    },
  });
  const productMap = new Map(products.map((product) => [product.id, product]));

  let subtotalCents = 0;
  const itemCreates: Prisma.OrderItemCreateWithoutOrderInput[] = [];

  for (const requestedItem of input.items) {
    const product = productMap.get(requestedItem.productId);
    if (!product) throw new HttpError(409, "Um produto não está mais disponível", "PRODUCT_UNAVAILABLE");

    const selectedCounts = new Map<string, number>();
    const selectedOptions: Array<{ optionId: string; groupName: string; optionName: string; unitPriceCents: number; quantity: number }> = [];
    let optionsUnitCents = 0;

    for (const selected of requestedItem.options) {
      const group = product.optionGroups.find((candidate) => candidate.options.some((option) => option.id === selected.optionId));
      const option = group?.options.find((candidate) => candidate.id === selected.optionId);
      if (!group || !option) throw new HttpError(409, "Um adicional não está mais disponível", "OPTION_UNAVAILABLE");
      selectedCounts.set(group.id, (selectedCounts.get(group.id) ?? 0) + selected.quantity);
      optionsUnitCents += option.priceCents * selected.quantity;
      selectedOptions.push({
        optionId: option.id,
        groupName: group.name,
        optionName: option.name,
        unitPriceCents: option.priceCents,
        quantity: selected.quantity,
      });
    }

    for (const group of product.optionGroups) {
      const count = selectedCounts.get(group.id) ?? 0;
      const minimum = group.required ? Math.max(1, group.minSelection) : group.minSelection;
      if (count < minimum || count > group.maxSelection) {
        throw new HttpError(422, `Seleção inválida em ${group.name}`, "INVALID_OPTION_SELECTION");
      }
    }

    const unitPriceCents = product.priceCents + optionsUnitCents;
    const lineTotalCents = unitPriceCents * requestedItem.quantity;
    subtotalCents += lineTotalCents;
    itemCreates.push({
      productId: product.id,
      productName: product.name,
      unitPriceCents,
      quantity: requestedItem.quantity,
      notes: requestedItem.notes,
      lineTotalCents,
      options: { create: selectedOptions },
    });
  }

  const deliveryFeeCents = input.fulfillment === "DELIVERY"
    ? (settings.deliveryFeeCents ?? 0)
    : 0;
  const deliveryZoneName = input.fulfillment === "DELIVERY"
    ? "Taxa padrão"
    : undefined;

  if (subtotalCents < settings.minimumOrderCents) throw new HttpError(422, "Pedido abaixo do valor mínimo da loja", "MINIMUM_ORDER");

  const totalCents = subtotalCents + deliveryFeeCents;
  const publicId = createPublicOrderId();
  const trackingToken = createTrackingToken();
  const idempotencyKey = `pix-${publicId}`;

  const order = await prisma.order.create({
    data: {
      publicId,
      trackingTokenHash: hashTrackingToken(trackingToken),
      customerName: input.customerName,
      customerPhone: input.customerPhone.replace(/\D/g, ""),
      customerEmail: input.customerEmail.toLowerCase(),
      customerDocument: input.customerDocument?.replace(/\D/g, ""),
      fulfillment: input.fulfillment,
      deliveryZoneId: undefined,
      deliveryZoneName,
      postalCode: input.address?.postalCode,
      street: input.address?.street,
      number: input.address?.number,
      complement: input.address?.complement,
      neighborhood: input.address?.neighborhood,
      city: input.address?.city,
      state: input.address?.state.toUpperCase(),
      reference: input.address?.reference,
      notes: input.notes,
      subtotalCents,
      deliveryFeeCents,
      totalCents,
      items: { create: itemCreates },
      statusHistory: { create: { status: "PENDING_PAYMENT", note: "Pedido criado" } },
      payments: {
        create: {
          amountCents: totalCents,
          idempotencyKey,
          status: "PENDING",
        },
      },
    },
    include: { items: { include: { options: true } }, payments: true },
  });

  try {
    const mpPayment = await createPixPayment({
      amountCents: totalCents,
      description: `Pedido ${publicId} - Mesa IV Burgers`,
      email: input.customerEmail,
      firstName: input.customerName.split(" ")[0] ?? input.customerName,
      externalReference: publicId,
      idempotencyKey,
    });
    const transactionData = mpPayment.point_of_interaction?.transaction_data;
    const paymentStatus = mapPaymentStatus(mpPayment.status);
    await prisma.payment.update({
      where: { idempotencyKey },
      data: {
        providerPaymentId: String(mpPayment.id),
        status: paymentStatus,
        statusDetail: mpPayment.status_detail,
        qrCode: transactionData?.qr_code,
        qrCodeBase64: transactionData?.qr_code_base64,
        ticketUrl: transactionData?.ticket_url,
        expiresAt: mpPayment.date_of_expiration ? new Date(mpPayment.date_of_expiration) : undefined,
        rawResponse: mpPayment as unknown as Prisma.InputJsonValue,
      },
    });
    if (paymentStatus === "APPROVED") {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          status: "PAID",
          paidAt: new Date(),
          statusHistory: { create: { status: "PAID", note: "Pagamento PIX aprovado" } },
        },
      });
    }
  } catch (error) {
    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: "CANCELED",
        canceledAt: new Date(),
        statusHistory: { create: { status: "CANCELED", note: "Falha ao gerar pagamento" } },
      },
    });
    throw error;
  }

  return getOrderForCustomer(publicId, trackingToken);
}

export async function getOrderForCustomer(publicId: string, trackingToken: string) {
  const order = await prisma.order.findUnique({
    where: { publicId },
    include: {
      items: { include: { options: true } },
      payments: { orderBy: { createdAt: "desc" }, take: 1 },
      statusHistory: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!order || hashTrackingToken(trackingToken) !== order.trackingTokenHash) {
    throw new HttpError(404, "Pedido não encontrado", "ORDER_NOT_FOUND");
  }
  const payment = order.payments[0];
  return {
    trackingToken,
    order: {
      publicId: order.publicId,
      customerName: order.customerName,
      fulfillment: order.fulfillment,
      status: order.status,
      subtotalCents: order.subtotalCents,
      deliveryFeeCents: order.deliveryFeeCents,
      totalCents: order.totalCents,
      createdAt: order.createdAt,
      items: order.items,
      statusHistory: order.statusHistory,
    },
    payment: payment ? {
      status: payment.status,
      qrCode: payment.qrCode,
      qrCodeBase64: payment.qrCodeBase64,
      ticketUrl: payment.ticketUrl,
      expiresAt: payment.expiresAt,
    } : null,
  };
}
