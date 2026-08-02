import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Bike, Store } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { formatMoney } from "../lib/format";
import { useCart } from "../store/cart";
import type { StoreResponse } from "../types";

type OrderResult = { trackingToken: string; order: { publicId: string } };

export function CheckoutPage() {
  const navigate = useNavigate();
  const { items, clear } = useCart();
  const store = useQuery({ queryKey: ["store"], queryFn: () => api<StoreResponse>("/store") });
  const [fulfillment, setFulfillment] = useState<"DELIVERY" | "PICKUP">("DELIVERY");
  const [zoneId, setZoneId] = useState("");
  const subtotal = useMemo(() => items.reduce((total, item) => total + (item.basePriceCents + item.options.reduce((sum, option) => sum + option.priceCents * option.quantity, 0)) * item.quantity, 0), [items]);
  const zone = store.data?.deliveryZones.find((candidate) => candidate.id === zoneId);
  const total = subtotal + (fulfillment === "DELIVERY" ? zone?.feeCents ?? 0 : 0);
  const mutation = useMutation({
    mutationFn: (payload: unknown) => api<OrderResult>("/orders", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess(data) { clear(); navigate(`/pedido/${data.order.publicId}?token=${encodeURIComponent(data.trackingToken)}`); },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    mutation.mutate({
      customerName: form.get("name"), customerPhone: form.get("phone"), customerEmail: form.get("email"), customerDocument: form.get("document") || undefined,
      fulfillment, deliveryZoneId: fulfillment === "DELIVERY" ? zoneId : undefined,
      address: fulfillment === "DELIVERY" ? { street: form.get("street"), number: form.get("number"), complement: form.get("complement") || undefined, neighborhood: form.get("neighborhood"), city: form.get("city"), reference: form.get("reference") || undefined } : undefined,
      notes: form.get("notes") || undefined,
      items: items.map((item) => ({ productId: item.productId, quantity: item.quantity, notes: item.notes, options: item.options.map((option) => ({ optionId: option.optionId, quantity: option.quantity })) })),
    });
  }

  if (!items.length) return <div className="center-page"><h1>Seu carrinho está vazio</h1><Link className="primary link-button" to="/">Voltar ao cardápio</Link></div>;
  return <main className="checkout-page"><div className="checkout-header"><Link to="/" className="icon-button"><ArrowLeft /></Link><div><small>Finalizar pedido</small><h1>Quase lá!</h1></div></div><form className="checkout-grid" onSubmit={submit}><section className="checkout-form"><h2>Como você quer receber?</h2><div className="fulfillment"><button type="button" className={fulfillment === "DELIVERY" ? "selected" : ""} onClick={() => setFulfillment("DELIVERY")}><Bike />Entrega</button><button type="button" className={fulfillment === "PICKUP" ? "selected" : ""} onClick={() => setFulfillment("PICKUP")}><Store />Retirada</button></div><h2>Seus dados</h2><div className="field-grid"><label className="field full"><span>Nome</span><input name="name" required minLength={2} /></label><label className="field"><span>WhatsApp</span><input name="phone" required inputMode="tel" /></label><label className="field"><span>E-mail</span><input name="email" required type="email" /></label><label className="field full"><span>CPF (opcional)</span><input name="document" inputMode="numeric" /></label></div>{fulfillment === "DELIVERY" && <><h2>Endereço</h2><label className="field full"><span>Região de entrega</span><select value={zoneId} onChange={(event) => setZoneId(event.target.value)} required><option value="">Selecione</option>{store.data?.deliveryZones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name} — {formatMoney(zone.feeCents)}</option>)}</select></label><div className="field-grid"><label className="field full"><span>Rua</span><input name="street" required /></label><label className="field"><span>Número</span><input name="number" required /></label><label className="field"><span>Complemento</span><input name="complement" /></label><label className="field"><span>Bairro</span><input name="neighborhood" required /></label><label className="field"><span>Cidade</span><input name="city" required /></label><label className="field full"><span>Referência</span><input name="reference" /></label></div></>}<label className="field full"><span>Observação geral</span><textarea name="notes" maxLength={500} /></label></section><aside className="order-summary"><h2>Resumo</h2>{items.map((item) => <div className="summary-item" key={item.key}><span>{item.quantity}x {item.productName}<small>{item.options.map((option) => option.optionName).join(", ")}</small></span><b>{formatMoney((item.basePriceCents + item.options.reduce((sum, option) => sum + option.priceCents * option.quantity, 0)) * item.quantity)}</b></div>)}<hr /><div><span>Subtotal</span><b>{formatMoney(subtotal)}</b></div><div><span>Entrega</span><b>{fulfillment === "PICKUP" ? "Grátis" : zone ? formatMoney(zone.feeCents) : "—"}</b></div><div className="summary-total"><span>Total</span><strong>{formatMoney(total)}</strong></div><p className="payment-note">Pagamento seguro por PIX. O preço final é recalculado pelo servidor.</p>{mutation.error && <p className="error-text">{mutation.error.message}</p>}<button className="primary" disabled={mutation.isPending || (fulfillment === "DELIVERY" && !zoneId)}>{mutation.isPending ? "Gerando PIX..." : `Gerar PIX · ${formatMoney(total)}`}</button></aside></form></main>;
}
