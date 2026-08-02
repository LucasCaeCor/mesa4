import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Bike, Search, Store } from "lucide-react";
import { FormEvent, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { formatMoney } from "../lib/format";
import { useCart } from "../store/cart";
import type { StoreResponse } from "../types";

type OrderResult = {
  trackingToken: string;
  order: { publicId: string };
};

type CepResult = {
  postalCode: string;
  formattedPostalCode: string;
  street: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
};

export function CheckoutPage() {
  const navigate = useNavigate();
  const numberInput = useRef<HTMLInputElement>(null);
  const { items, clear } = useCart();
  const store = useQuery({
    queryKey: ["store"],
    queryFn: () => api<StoreResponse>("/store"),
  });

  const [fulfillment, setFulfillment] = useState<"DELIVERY" | "PICKUP">(
    "DELIVERY",
  );
  const [postalCode, setPostalCode] = useState("");
  const [street, setStreet] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [stateCode, setStateCode] = useState("");

  const subtotal = useMemo(
    () =>
      items.reduce(
        (total, item) =>
          total +
          (item.basePriceCents +
            item.options.reduce(
              (sum, option) => sum + option.priceCents * option.quantity,
              0,
            )) *
            item.quantity,
        0,
      ),
    [items],
  );

  const deliveryFee = store.data?.settings.deliveryFeeCents ?? 0;
  const total =
    subtotal + (fulfillment === "DELIVERY" ? deliveryFee : 0);

  const cepLookup = useMutation({
    mutationFn: (cep: string) =>
      api<CepResult>(`/address/cep/${cep.replace(/\D/g, "")}`),
    onSuccess(data) {
      setPostalCode(data.formattedPostalCode);
      setStreet(data.street);
      setNeighborhood(data.neighborhood);
      setCity(data.city);
      setStateCode(data.state);
      window.setTimeout(() => numberInput.current?.focus(), 0);
    },
  });

  const mutation = useMutation({
    mutationFn: (payload: unknown) =>
      api<OrderResult>("/orders", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess(data) {
      clear();
      navigate(
        `/pedido/${data.order.publicId}?token=${encodeURIComponent(data.trackingToken)}`,
      );
    },
  });

  function searchPostalCode() {
    const digits = postalCode.replace(/\D/g, "");
    if (digits.length === 8) cepLookup.mutate(digits);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    mutation.mutate({
      customerName: form.get("name"),
      customerPhone: form.get("phone"),
      customerEmail: form.get("email"),
      customerDocument: form.get("document") || undefined,
      fulfillment,
      address:
        fulfillment === "DELIVERY"
          ? {
              postalCode: postalCode.replace(/\D/g, ""),
              street,
              number: form.get("number"),
              complement: form.get("complement") || undefined,
              neighborhood,
              city,
              state: stateCode,
              reference: form.get("reference") || undefined,
            }
          : undefined,
      notes: form.get("notes") || undefined,
      items: items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        notes: item.notes,
        options: item.options.map((option) => ({
          optionId: option.optionId,
          quantity: option.quantity,
        })),
      })),
    });
  }

  if (!items.length) {
    return (
      <div className="center-page">
        <h1>Seu carrinho está vazio</h1>
        <Link className="primary link-button" to="/">
          Voltar ao cardápio
        </Link>
      </div>
    );
  }

  return (
    <main className="checkout-page">
      <div className="checkout-header">
        <Link to="/" className="icon-button">
          <ArrowLeft />
        </Link>
        <div>
          <small>Finalizar pedido</small>
          <h1>Quase lá!</h1>
        </div>
      </div>

      <form className="checkout-grid" onSubmit={submit}>
        <section className="checkout-form">
          <h2>Como você quer receber?</h2>
          <div className="fulfillment">
            <button
              type="button"
              className={fulfillment === "DELIVERY" ? "selected" : ""}
              onClick={() => setFulfillment("DELIVERY")}
            >
              <Bike /> Entrega
            </button>
            <button
              type="button"
              className={fulfillment === "PICKUP" ? "selected" : ""}
              onClick={() => setFulfillment("PICKUP")}
            >
              <Store /> Retirada
            </button>
          </div>

          <h2>Seus dados</h2>
          <div className="field-grid">
            <label className="field full">
              <span>Nome</span>
              <input name="name" required minLength={2} />
            </label>
            <label className="field">
              <span>WhatsApp</span>
              <input name="phone" required inputMode="tel" />
            </label>
            <label className="field">
              <span>E-mail</span>
              <input name="email" required type="email" />
            </label>
            <label className="field full">
              <span>CPF (opcional)</span>
              <input name="document" inputMode="numeric" />
            </label>
          </div>

          {fulfillment === "DELIVERY" && (
            <>
              <h2>Endereço</h2>
              <div className="cep-search-row">
                <label className="field grow">
                  <span>CEP</span>
                  <input
                    name="postalCode"
                    value={postalCode}
                    onChange={(event) => setPostalCode(event.target.value)}
                    onBlur={searchPostalCode}
                    inputMode="numeric"
                    maxLength={9}
                    placeholder="00000-000"
                    required
                  />
                </label>
                <button
                  className="secondary"
                  type="button"
                  onClick={searchPostalCode}
                  disabled={cepLookup.isPending}
                >
                  <Search />
                  {cepLookup.isPending ? "Buscando..." : "Buscar CEP"}
                </button>
              </div>
              {cepLookup.error && (
                <p className="error-text">{cepLookup.error.message}</p>
              )}

              <div className="field-grid">
                <label className="field full">
                  <span>Rua</span>
                  <input
                    name="street"
                    value={street}
                    onChange={(event) => setStreet(event.target.value)}
                    required
                  />
                </label>
                <label className="field">
                  <span>Número</span>
                  <input ref={numberInput} name="number" required />
                </label>
                <label className="field">
                  <span>Complemento</span>
                  <input name="complement" />
                </label>
                <label className="field">
                  <span>Bairro</span>
                  <input
                    name="neighborhood"
                    value={neighborhood}
                    onChange={(event) => setNeighborhood(event.target.value)}
                    required
                  />
                </label>
                <label className="field">
                  <span>Cidade</span>
                  <input
                    name="city"
                    value={city}
                    onChange={(event) => setCity(event.target.value)}
                    required
                  />
                </label>
                <label className="field">
                  <span>Estado</span>
                  <input
                    name="state"
                    value={stateCode}
                    onChange={(event) =>
                      setStateCode(event.target.value.toUpperCase().slice(0, 2))
                    }
                    maxLength={2}
                    required
                  />
                </label>
                <label className="field full">
                  <span>Referência</span>
                  <input name="reference" />
                </label>
              </div>
            </>
          )}

          <label className="field full">
            <span>Observação geral</span>
            <textarea name="notes" maxLength={500} />
          </label>
        </section>

        <aside className="order-summary">
          <h2>Resumo</h2>
          {items.map((item) => (
            <div className="summary-item" key={item.key}>
              <span>
                {item.quantity}x {item.productName}
                <small>
                  {item.options.map((option) => option.optionName).join(", ")}
                </small>
              </span>
              <b>
                {formatMoney(
                  (item.basePriceCents +
                    item.options.reduce(
                      (sum, option) =>
                        sum + option.priceCents * option.quantity,
                      0,
                    )) *
                    item.quantity,
                )}
              </b>
            </div>
          ))}
          <hr />
          <div>
            <span>Subtotal</span>
            <b>{formatMoney(subtotal)}</b>
          </div>
          <div>
            <span>Entrega</span>
            <b>
              {fulfillment === "PICKUP"
                ? "Grátis"
                : formatMoney(deliveryFee)}
            </b>
          </div>
          <div className="summary-total">
            <span>Total</span>
            <strong>{formatMoney(total)}</strong>
          </div>
          <p className="payment-note">
            Pagamento seguro por PIX. O preço final é recalculado pelo servidor.
          </p>
          {mutation.error && (
            <p className="error-text">{mutation.error.message}</p>
          )}
          <button
            className="primary"
            disabled={mutation.isPending || store.isLoading}
          >
            {mutation.isPending
              ? "Gerando PIX..."
              : `Gerar PIX · ${formatMoney(total)}`}
          </button>
        </aside>
      </form>
    </main>
  );
}
