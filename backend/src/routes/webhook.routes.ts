import type { FastifyInstance } from "fastify";
import type { PaymentStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { getMercadoPagoPayment, validateMercadoPagoSignature } from "../modules/payments/mercado-pago.service.js";
import { sendOrderStatusWhatsApp } from "../modules/whatsapp/whatsapp-cloud.service.js";

function mapPaymentStatus(status: string): PaymentStatus {
  const statuses: Record<string, PaymentStatus> = {
    approved: "APPROVED",
    pending: "PENDING",
    in_process: "IN_PROCESS",
    rejected: "REJECTED",
    cancelled: "CANCELED",
    refunded: "REFUNDED",
    charged_back: "REFUNDED",
  };
  return statuses[status] ?? "PENDING";
}

export async function webhookRoutes(app: FastifyInstance) {
  app.post("/webhooks/mercadopago", async (request, reply) => {
    const query = z.record(z.string(), z.any()).parse(request.query ?? {});
    const body = z.record(z.string(), z.any()).parse(request.body ?? {});
    const dataId = String(query["data.id"] ?? body?.data?.id ?? "");
    const type = String(query.type ?? body.type ?? "");
    const xSignature = request.headers["x-signature"] as string | undefined;
    const xRequestId = request.headers["x-request-id"] as string | undefined;

    if (!validateMercadoPagoSignature({ xSignature, xRequestId, dataId })) {
      return reply.code(401).send({ message: "Assinatura inválida" });
    }
    if (!dataId || (type && type !== "payment")) return reply.code(200).send({ received: true });

    const eventKey = `${type || "payment"}:${dataId}:${xRequestId ?? String(body.id ?? body.action ?? "update")}`;
    const existing = await prisma.webhookEvent.findUnique({ where: { eventKey } });
    if (existing) return reply.code(200).send({ received: true, duplicate: true });

    const payment = await getMercadoPagoPayment(dataId);
    let localPayment = await prisma.payment.findFirst({
  where: {
    providerPaymentId: String(payment.id),
  },
  include: {
    order: true,
  },
});

if (!localPayment && payment.external_reference) {
  const relatedOrder = await prisma.order.findUnique({
    where: {
      publicId: payment.external_reference,
    },
    include: {
      payments: {
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
      },
    },
  });

  const candidate = relatedOrder?.payments[0];

  if (candidate) {
    localPayment = await prisma.payment.update({
      where: {
        id: candidate.id,
      },
      data: {
        providerPaymentId: String(payment.id),
      },
      include: {
        order: true,
      },
    });
  }
}
    if (!localPayment) return reply.code(200).send({ received: true, unmatched: true });

    const status = mapPaymentStatus(payment.status);
    await prisma.payment.update({
      where: { id: localPayment.id },
      data: {
        status,
        statusDetail: payment.status_detail,
        rawResponse: payment as unknown as Prisma.InputJsonValue,
      },
    });

    if (status === "APPROVED" && localPayment.order.status === "PENDING_PAYMENT") {
      await prisma.order.update({
        where: { id: localPayment.orderId },
        data: {
          status: "PAID",
          paidAt: new Date(),
          statusHistory: { create: { status: "PAID", note: "Pagamento PIX aprovado" } },
        },
      });
          await sendOrderStatusWhatsApp(localPayment.orderId, {
        source: "AUTO",
      }).catch((error) => {
        request.log.error(
          { err: error, orderId: localPayment.orderId },
          "WhatsApp automatic notification failed",
        );
      });
    }

    await prisma.webhookEvent.create({
      data: { eventKey, provider: "MERCADO_PAGO", eventType: type, resourceId: dataId, payload: body as Prisma.InputJsonValue },
    });
    return reply.code(200).send({ received: true });
  });
}
