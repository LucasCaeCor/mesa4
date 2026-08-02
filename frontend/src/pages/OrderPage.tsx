import { useQuery } from "@tanstack/react-query";
import { Check, Copy, MessageCircle } from "lucide-react";
import { useSearchParams, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { formatMoney } from "../lib/format";
import type { OrderStatus } from "../types";

type Result = { order: { publicId: string; customerName: string; status: OrderStatus; totalCents: number; fulfillment: string; items: Array<{ id: string; quantity: number; productName: string; options: Array<{ id: string; optionName: string }> }>; statusHistory: Array<{ id: string; status: OrderStatus; createdAt: string }> }; payment: { status: string; qrCode?: string; qrCodeBase64?: string; ticketUrl?: string } | null };
const labels: Record<OrderStatus, string> = { PENDING_PAYMENT: "Aguardando pagamento", PAID: "Pagamento aprovado", CONFIRMED: "Pedido confirmado", PREPARING: "Em preparo", READY: "Pronto", OUT_FOR_DELIVERY: "Saiu para entrega", DELIVERED: "Entregue", CANCELED: "Cancelado" };

export function OrderPage() {
  const { publicId = "" } = useParams();
  const [search] = useSearchParams();
  const token = search.get("token") ?? "";
  const order = useQuery({ queryKey: ["order", publicId, token], queryFn: () => api<Result>(`/orders/${publicId}?token=${encodeURIComponent(token)}`), refetchInterval: 8000 });
  async function whatsapp() { const result = await api<{ url: string }>(`/orders/${publicId}/whatsapp?token=${encodeURIComponent(token)}`); window.open(result.url, "_blank", "noopener,noreferrer"); }
  if (order.isLoading) return <div className="center-page"><p>Carregando pedido...</p></div>;
  if (!order.data) return <div className="center-page"><h1>Pedido não encontrado</h1></div>;
  const data = order.data;
  return <main className="order-page"><section className="order-card"><div className="success-icon"><Check /></div><small>Pedido {data.order.publicId}</small><h1>{labels[data.order.status]}</h1><p>Olá, {data.order.customerName}. Esta página atualiza automaticamente.</p>{data.order.status === "PENDING_PAYMENT" && data.payment && <div className="pix-box"><h2>Pague com PIX</h2>{data.payment.qrCodeBase64 && <img src={`data:image/png;base64,${data.payment.qrCodeBase64}`} alt="QR Code PIX" />}<button className="secondary" onClick={() => { navigator.clipboard.writeText(data.payment?.qrCode ?? ""); alert("Código PIX copiado"); }}><Copy />Copiar código PIX</button></div>}<div className="timeline">{data.order.statusHistory.map((history, index) => <div className="timeline-item" key={history.id}><span className={index === data.order.statusHistory.length - 1 ? "active" : ""}><Check /></span><div><strong>{labels[history.status]}</strong><small>{new Date(history.createdAt).toLocaleString("pt-BR")}</small></div></div>)}</div><div className="order-products">{data.order.items.map((item) => <div key={item.id}><span>{item.quantity}x {item.productName}<small>{item.options.map((option) => option.optionName).join(", ")}</small></span></div>)}<strong>Total: {formatMoney(data.order.totalCents)}</strong></div><button className="whatsapp" onClick={whatsapp}><MessageCircle />Enviar pedido no WhatsApp</button></section></main>;
}
