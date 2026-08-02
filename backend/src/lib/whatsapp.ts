type WhatsAppOrder = {
  publicId: string;
  customerName: string;
  totalCents: number;
  fulfillment: string;
  items: Array<{ productName: string; quantity: number; options: Array<{ optionName: string }> }>;
};

export function buildWhatsAppMessage(order: WhatsAppOrder) {
  const lines = [
    `Olá! Acabei de fazer o pedido *${order.publicId}* pelo site.`,
    "",
    ...order.items.map((item) => {
      const options = item.options.length ? ` (${item.options.map((option) => option.optionName).join(", ")})` : "";
      return `${item.quantity}x ${item.productName}${options}`;
    }),
    "",
    `Total: R$ ${(order.totalCents / 100).toFixed(2).replace(".", ",")}`,
    `Forma: ${order.fulfillment === "DELIVERY" ? "Entrega" : "Retirada"}`,
    `Cliente: ${order.customerName}`,
  ];
  return lines.join("\n");
}
