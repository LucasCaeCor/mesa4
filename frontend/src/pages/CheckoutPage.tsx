import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Banknote,
  CreditCard,
  QrCode,
  Search,
  Trash2,
} from "lucide-react";
import { FormEvent, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { formatMoney } from "../lib/format";
import { useCart } from "../store/cart";
import type {
  MenuResponse,
  Product,
  StoreResponse,
} from "../types";
import { ProductModal } from "../components/ProductModal";

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

type PaymentMethod =
  | "PIX"
  | "CASH"
  | "DEBIT"
  | "CREDIT"
  | "TICKET"
  | "VR_ALIMENTACAO"
  | "VR_REFEICAO"
  | "PLUXEE";

const paymentMethodLabels: Record<PaymentMethod, string> = {
  PIX: "Pix",
  CASH: "Dinheiro",
  DEBIT: "Débito",
  CREDIT: "Crédito",
  TICKET: "Ticket",
  VR_ALIMENTACAO: "VR Alimentação",
  VR_REFEICAO: "VR Refeição",
  PLUXEE: "Pluxee",
};

export function CheckoutPage() {
  const navigate = useNavigate();
  const numberInput = useRef<HTMLInputElement>(null);
  const {
    items,
    clear,
    addItem,
    setOpen,
    removeItem,
  } = useCart();
  const store = useQuery({
    queryKey: ["store"],
    queryFn: () =>
      api<StoreResponse>("/store", {
        cache: "no-store",
      }),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  /* MESA4_CHECKOUT_BUSINESS_HOURS */
  const isStoreOpen =
    store.data?.availability.isOpen ?? false;

  /* MESA4_CHECKOUT_SUGGESTIONS */
  const menu = useQuery({
    queryKey: ["menu"],
    queryFn: () => api<MenuResponse>("/menu"),
  });
  const [
    suggestionProduct,
    setSuggestionProduct,
  ] = useState<Product | null>(null);

  const suggestedProducts = useMemo(() => {
    const products =
      menu.data?.categories.flatMap(
        (category) => category.products,
      ) ?? [];
    const productsInCart = new Set(
      items.map((item) => item.productId),
    );

    return products
      .filter(
        (product) =>
          product.suggestAtCheckout &&
          !product.soldOut &&
          !productsInCart.has(product.id),
      )
      .slice(0, 4);
  }, [items, menu.data]);

  function addSuggestedProduct(
    product: Product,
  ) {
    if (product.optionGroups.length > 0) {
      setSuggestionProduct(product);
      return;
    }

    addItem({
      productId: product.id,
      productName: product.name,
      imageUrl: product.imageUrl,
      basePriceCents: product.priceCents,
      quantity: 1,
      options: [],
    });

    setOpen(false);
  }

 const fulfillment = "DELIVERY" as const;
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>("PIX");
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

    if (!isStoreOpen) {
      return;
    }

    const form = new FormData(event.currentTarget);

    mutation.mutate({
      customerName: form.get("name"),
      customerPhone: form.get("phone"),
      whatsappOptIn: form.get("whatsappOptIn") === "on",
      paymentMethod,
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
          <h2>Forma de pagamento</h2>
          <div className="fulfillment payment-methods">
            <button
              type="button"
              className={paymentMethod === "PIX" ? "selected" : ""}
              onClick={() => setPaymentMethod("PIX")}
              disabled={store.data?.settings.pixEnabled === false}
            >
              <QrCode /> Pix
            </button>

            <button
              type="button"
              className={paymentMethod === "CASH" ? "selected" : ""}
              onClick={() => setPaymentMethod("CASH")}
            >
              <Banknote /> Dinheiro
            </button>

            <button
              type="button"
              className={paymentMethod === "DEBIT" ? "selected" : ""}
              onClick={() => setPaymentMethod("DEBIT")}
            >
              <CreditCard /> Débito
            </button>

            <button
              type="button"
              className={paymentMethod === "CREDIT" ? "selected" : ""}
              onClick={() => setPaymentMethod("CREDIT")}
            >
              <CreditCard /> Crédito
            </button>

            <button
              type="button"
              className={paymentMethod === "TICKET" ? "selected" : ""}
              onClick={() => setPaymentMethod("TICKET")}
            >
              <CreditCard /> Ticket
            </button>

            <button
              type="button"
              className={paymentMethod === "VR_ALIMENTACAO" ? "selected" : ""}
              onClick={() => setPaymentMethod("VR_ALIMENTACAO")}
            >
              <CreditCard /> VR Alimentação
            </button>

            <button
              type="button"
              className={paymentMethod === "VR_REFEICAO" ? "selected" : ""}
              onClick={() => setPaymentMethod("VR_REFEICAO")}
            >
              <CreditCard /> VR Refeição
            </button>

            <button
              type="button"
              className={paymentMethod === "PLUXEE" ? "selected" : ""}
              onClick={() => setPaymentMethod("PLUXEE")}
            >
              <CreditCard /> Pluxee
            </button>
          </div>


          <label className="field full">
            <span>Observação geral</span>
            <textarea name="notes" maxLength={500} />
          </label>
        </section>

        <aside className="order-summary">
          <h2>Resumo</h2>
          {/* MESA4_CHECKOUT_REMOVE_ITEM */}
          {items.map((item) => (
            <div
              className="summary-item checkout-summary-item"
              key={item.key}
            >
              <span className="checkout-summary-copy">
                {item.quantity}x {item.productName}
                <small>
                  {item.options
                    .map(
                      (option) =>
                        option.optionName,
                    )
                    .join(", ")}
                </small>
              </span>

              <div className="checkout-summary-actions">
                <b>
                  {formatMoney(
                    (item.basePriceCents +
                      item.options.reduce(
                        (sum, option) =>
                          sum +
                          option.priceCents *
                            option.quantity,
                        0,
                      )) *
                      item.quantity,
                  )}
                </b>

                <button
                  className="checkout-remove-item"
                  type="button"
                  title="Remover item"
                  aria-label={`Remover ${item.productName} do carrinho`}
                  onClick={() =>
                    removeItem(item.key)
                  }
                >
                  <Trash2 />
                </button>
              </div>
            </div>
          ))}

          {suggestedProducts.length > 0 && (
            <section className="checkout-suggestions">
              <div className="checkout-suggestions-heading">
                <small>Que tal uma bebida?</small>
                <h3>Complete seu pedido</h3>
              </div>

              <div className="checkout-suggestion-list">
                {suggestedProducts.map((product) => (
                  <article
                    className="checkout-suggestion-item"
                    key={product.id}
                  >
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                      />
                    ) : (
                      <div className="checkout-suggestion-placeholder">
                        🥤
                      </div>
                    )}

                    <div className="checkout-suggestion-info">
                      <strong>{product.name}</strong>
                      <span>
                        {formatMoney(product.priceCents)}
                      </span>
                    </div>

                    <button
                      className="secondary"
                      type="button"
                      onClick={() =>
                        addSuggestedProduct(product)
                      }
                    >
                      {product.optionGroups.length > 0
                        ? "Escolher"
                        : "+ Adicionar"}
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )}

          <hr />
          <div>
            <span>Subtotal</span>
            <b>{formatMoney(subtotal)}</b>
          </div>
          <div>
            <span>Entrega</span>
            <b>{formatMoney(deliveryFee)}</b>
          </div>
          <div className="summary-total">
            <span>Total</span>
            <strong>{formatMoney(total)}</strong>
          </div>
          <p className="payment-note">
            {paymentMethod === "PIX"
              ? store.data?.settings.pixPaymentMode === "MANUAL"
                ? "Pix direto para a chave da loja. Depois de pagar, avise pelo acompanhamento e aguarde a conferência."
                : "Pagamento seguro por PIX com confirmação automática. O preço final é recalculado pelo servidor."
              : paymentMethod === "CASH"
                ? "Pagamento em dinheiro na entrega."
                : `Pagamento com ${paymentMethodLabels[paymentMethod]} na entrega, pela maquininha.`}
          </p>
          {!store.isLoading &&
            !isStoreOpen && (
              <p className="store-closed-checkout">
                A loja está fechada agora. Os pedidos
                são liberados automaticamente dentro
                do horário configurado.
              </p>
            )}

          {mutation.error && (
            <p className="error-text">{mutation.error.message}</p>
          )}
          <button
            className="primary"
            disabled={
              !isStoreOpen ||
              mutation.isPending ||
              store.isLoading ||
              (paymentMethod === "PIX" &&
                store.data?.settings.pixEnabled === false) ||
              (fulfillment === "DELIVERY" &&
                dynamicDeliveryEnabled &&
                !deliveryQuote.data)
            }
          >
            {!isStoreOpen
              ? "Loja fechada agora"
              : mutation.isPending
                ? "Enviando pedido..."
              : fulfillment === "DELIVERY" &&
                  dynamicDeliveryEnabled &&
                  !deliveryQuote.data
                ? "Calcule a entrega para continuar"
                : `Finalizar pedido · ${formatMoney(total)}`}
          </button>
        </aside>
      </form>

      {suggestionProduct && (
        <ProductModal
          product={suggestionProduct}
          onClose={() => {
            setSuggestionProduct(null);
            window.setTimeout(
              () => setOpen(false),
              0,
            );
          }}
        />
      )}
    </main>
  );
}
