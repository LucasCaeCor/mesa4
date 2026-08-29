import { z } from "zod";

const optionSchema = z.object({
  optionId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(10).default(1),
});

const itemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(20),
  notes: z.string().trim().max(300).optional(),
  options: z.array(optionSchema).max(20).default([]),
});

export const addressSchema = z.object({
  postalCode: z.string().trim().regex(/^\d{8}$/, "CEP inválido"),
  street: z.string().trim().min(2).max(120),
  number: z.string().trim().min(1).max(20),
  complement: z.string().trim().max(80).optional(),
  neighborhood: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().length(2),
  reference: z.string().trim().max(150).optional(),
});

export const createOrderSchema = z.object({
  customerName: z.string().trim().min(2).max(100),
  customerPhone: z.string().trim().min(10).max(20),
  whatsappOptIn: z.boolean().default(false),
  customerEmail: z.string().trim().email().max(150),
  customerDocument: z.string().trim().max(20).optional(),
  fulfillment: z.enum(["DELIVERY", "PICKUP"]),
  deliveryZoneId: z.string().optional(),
  address: addressSchema.optional(),
  notes: z.string().trim().max(500).optional(),
  items: z.array(itemSchema).min(1).max(40),
}).superRefine((data, ctx) => {
  if (data.fulfillment === "DELIVERY" && !data.address) {
    ctx.addIssue({
      code: "custom",
      path: ["address"],
      message: "Informe o endereço de entrega",
    });
  }
});
