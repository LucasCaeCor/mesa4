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

type DeliveryQuoteResult = {
  mode: "FLAT" | "DISTANCE";
  deliveryFeeCents: number;
  distanceMeters?: number;
  distanceKm?: number;
  durationSeconds?: number;
  durationMinutes?: number;
  maxDistanceKm?: number;
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
  const [number, setNumber] = useState("");
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

  const dynamicDeliveryEnabled =
    store.data?.settings.dynamicDeliveryEnabled ?? false;

  const deliveryQuote = useMutation({
    mutationFn: () =>
      api<DeliveryQuoteResult>("/delivery/quote", {
        method: "POST",
        body: JSON.stringify({
          postalCode: postalCode.replace(/\D/g, ""),
          street,
          number,
          neighborhood,
          city,
          state: stateCode,
        }),
      }),
  });

  const deliveryFee =
    fulfillment === "DELIVERY"
      ? dynamicDeliveryEnabled
        ? deliveryQuote.data?.deliveryFeeCents ?? 0
        : store.data?.settings.deliveryFeeCents ?? 0
      : 0;

  const total = subtotal + deliveryFee;

  const cepLookup = useMutation({
    mutationFn: (cep: string) =>
      api<CepResult>(`/address/cep/${cep.replace(/\D/g, "")}`),
    onSuccess(data) {
      deliveryQuote.reset();
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

  const canCalculateDelivery =
    postalCode.replace(/\D/g, "").length === 8 &&
    street.trim().length >= 2 &&
    number.trim().length >= 1 &&
    neighborhood.trim().length >= 2 &&
    city.trim().length >= 2 &&
    stateCode.trim().length === 2;

  function searchPostalCode() {
    const digits = postalCode.replace(/\D/g, "");
    if (digits.length === 8) cepLookup.mutate(digits);
  }

  function calculateDelivery() {
    if (canCalculateDelivery) {
      deliveryQuote.mutate();
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    mutation.mutate({
      customerName: form.get("name"),
      customerPhone: form.get("phone"),
      whatsappOptIn: form.get("whatsappOptIn") === "on",
      customerEmail: form.get("email"),
      customerDocument: form.get("document") || undefined,
      fulfillment,
      address:
        fulfillment === "DELIVERY"
          ? {
              postalCode: postalCode.replace(/\D/g, ""),
              street,
              number,
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


          <label className="whatsapp-opt-in">
            <input
              name="whatsappOptIn"
              type="checkbox"
            />
            <span>
              <strong>Receber atualizações pelo WhatsApp</strong>
              <small>
                A Mesa IV Burgers poderá avisar sobre pagamento,
                preparo, saída para entrega e conclusão deste pedido.
              </small>
            </span>
          </label>

          {fulfillment === "DELIVERY" && (
            <>
              <h2>Endereço</h2>
              <div className="cep-search-row">
                <label className="field grow">
                  <span>CEP</span>
                  <input
                    name="postalCode"
                    value={postalCode}
                    onChange={(event) => {
                      deliveryQuote.reset();
                      setPostalCode(event.target.value);
                    }}
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
                    onChange={(event) => {
                      deliveryQuote.reset();
                      setStreet(event.target.value);
                    }}
                    required
                  />
                </label>
                <label className="field">
                  <span>Número</span>
                  <input
                    ref={numberInput}
                    name="number"
                    value={number}
                    onChange={(event) => {
                      deliveryQuote.reset();
                      setNumber(event.target.value);
                    }}
                    onBlur={() => {
                      if (dynamicDeliveryEnabled && canCalculateDelivery) {
                        calculateDelivery();
                      }
                    }}
                    required
                  />
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
                    onChange={(event) => {
                      deliveryQuote.reset();
                      setNeighborhood(event.target.value);
                    }}
                    required
                  />
                </label>
                <label className="field">
                  <span>Cidade</span>
                  <input
                    name="city"
                    value={city}
                    onChange={(event) => {
                      deliveryQuote.reset();
                      setCity(event.target.value);
                    }}
                    required
                  />
                </label>
                <label className="field">
                  <span>Estado</span>
                  <input
                    name="state"
                    value={stateCode}
                    onChange={(event) => {
                      deliveryQuote.reset();
                      setStateCode(
                        event.target.value.toUpperCase().slice(0, 2),
                      );
                    }}
                    maxLength={2}
                    required
                  />
                </label>
                <label className="field full">
                  <span>Referência</span>
                  <input name="reference" />
                </label>
              </div>

              {dynamicDeliveryEnabled && (
                <div className="delivery-quote-box">
                  <button
                    className="secondary"
                    type="button"
                    onClick={calculateDelivery}
                    disabled={!canCalculateDelivery || deliveryQuote.isPending}
                  >
                    {deliveryQuote.isPending
                      ? "Calculando entrega..."
                      : "Calcular valor da entrega"}
                  </button>

                  {deliveryQuote.data?.mode === "DISTANCE" && (
                    <div className="delivery-quote-result">
                      <strong>
                        Entrega: {formatMoney(deliveryQuote.data.deliveryFeeCents)}
                      </strong>
                      <span>
                        {deliveryQuote.data.distanceKm?.toFixed(1)} km
                        {deliveryQuote.data.durationMinutes
                          ? ` · cerca de ${deliveryQuote.data.durationMinutes} min de trajeto`
                          : ""}
                      </span>
                    </div>
                  )}

                  {deliveryQuote.error && (
                    <p className="error-text">
                      {deliveryQuote.error.message}
                    </p>
                  )}
                </div>
              )}
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
                : dynamicDeliveryEnabled && !deliveryQuote.data
                  ? "Calcule o endereço"
                  : formatMoney(deliveryFee)}
            </b>
          </div>
          <div className="summary-total">
            <span>Total</span>
            <strong>{formatMoney(total)}</strong>
          </div>
          <p className="payment-note">
            {store.data?.settings.pixPaymentMode ===
            "MANUAL"
              ? "Pix direto para a chave da loja. Depois de pagar, avise pelo acompanhamento e aguarde a conferência."
              : "Pagamento seguro por PIX com confirmação automática. O preço final é recalculado pelo servidor."}
          </p>
          {mutation.error && (
            <p className="error-text">{mutation.error.message}</p>
          )}
          <button
            className="primary"
            disabled={
              mutation.isPending ||
              store.isLoading ||
              (fulfillment === "DELIVERY" &&
                dynamicDeliveryEnabled &&
                !deliveryQuote.data)
            }
          >
            {mutation.isPending
              ? "Gerando PIX..."
              : fulfillment === "DELIVERY" &&
                  dynamicDeliveryEnabled &&
                  !deliveryQuote.data
                ? "Calcule a entrega para continuar"
                : `Gerar PIX · ${formatMoney(total)}`}
          </button>
        </aside>
      </form>
    </main>
  );
}
