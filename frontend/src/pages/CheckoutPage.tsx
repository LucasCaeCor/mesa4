import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Banknote,
  CreditCard,
  QrCode,
  Trash2,
} from "lucide-react";
import { FormEvent, useMemo, useRef, useState, useEffect } from "react";
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
  | "DEBIT_ELO"
  | "DEBIT_VISA"
  | "DEBIT_MASTERCARD"
  | "CREDIT_ELO"
  | "CREDIT_VISA"
  | "CREDIT_MASTERCARD"
  | "CREDIT_HIPER"
  | "CREDIT_HIPERCARD"
  | "CREDIT_AMEX"
  | "TICKET_ALIMENTACAO"
  | "TICKET_REFEICAO"
  | "VR_ALIMENTACAO"
  | "VR_REFEICAO"
  | "PLUXEE_ALIMENTACAO"
  | "PLUXEE_REFEICAO";

const paymentMethodLabels: Record<PaymentMethod, string> = {
  PIX: "Pix",
  CASH: "Dinheiro",
  DEBIT_ELO: "Débito · Elo",
  DEBIT_VISA: "Débito · Visa",
  DEBIT_MASTERCARD: "Débito · Mastercard",
  CREDIT_ELO: "Crédito · Elo",
  CREDIT_VISA: "Crédito · Visa",
  CREDIT_MASTERCARD: "Crédito · Mastercard",
  CREDIT_HIPER: "Crédito · Hiper",
  CREDIT_HIPERCARD: "Crédito · Hipercard",
  CREDIT_AMEX: "Crédito · American Express",
  TICKET_ALIMENTACAO: "Ticket Alimentação",
  TICKET_REFEICAO: "Ticket Refeição",
  VR_ALIMENTACAO: "VR Alimentação",
  VR_REFEICAO: "VR Refeição",
  PLUXEE_ALIMENTACAO: "Pluxee Alimentação",
  PLUXEE_REFEICAO: "Pluxee Refeição",
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
  const [needsChange, setNeedsChange] =
    useState(false);
  const [cashChangeFor, setCashChangeFor] =
    useState("");
  const [postalCode, setPostalCode] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [stateCode, setStateCode] = useState("");

  /* MESA4_PROGRESSIVE_ADDRESS_V30 */
  const [
    manualAddressOpen,
    setManualAddressOpen,
  ] = useState(false);

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
      setManualAddressOpen(false);
      window.setTimeout(() => numberInput.current?.focus(), 0);
    },
  });


  /* MESA4_AUTO_CEP_V30 */
  useEffect(() => {
    const digits =
      postalCode.replace(/\D/g, "");

    if (digits.length !== 8) {
      return;
    }

    const timer =
      window.setTimeout(() => {
        cepLookup.mutate(digits);
      }, 400);

    return () => {
      window.clearTimeout(timer);
    };
  }, [postalCode]);

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


  /* MESA4_AUTO_DELIVERY_V29_1 */
  useEffect(() => {
    if (
      fulfillment !== "DELIVERY" ||
      !dynamicDeliveryEnabled ||
      !canCalculateDelivery
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      deliveryQuote.mutate();
    }, 650);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    fulfillment,
    dynamicDeliveryEnabled,
    canCalculateDelivery,
    postalCode,
    street,
    number,
    neighborhood,
    city,
    stateCode,
  ]);



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
      cashChangeForCents:
        paymentMethod === "CASH" &&
        needsChange &&
        cashChangeFor
          ? Math.round(
              Number(
                cashChangeFor.replace(",", "."),
              ) * 100,
            )
          : undefined,
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
              <div className="cep-auto-block">
                <label className="field full">
                  <span>CEP</span>
                  <input
                    name="postalCode"
                    value={postalCode}
                    onChange={(event) => {
                      /* MESA4_CLEAR_ADDRESS_ON_CEP_V30 */
                      deliveryQuote.reset();
                      setPostalCode(
                        event.target.value,
                      );
                      setStreet("");
                      setNeighborhood("");
                      setCity("");
                      setStateCode("");
                      setManualAddressOpen(
                        false,
                      );
                    }}
                    inputMode="numeric"
                    maxLength={9}
                    placeholder="00000-000"
                    required
                  />
                </label>

                <div className="cep-auto-feedback">
                  {cepLookup.isPending && (
                    <span>
                      Buscando endereço...
                    </span>
                  )}

                  {!cepLookup.isPending &&
                    postalCode.replace(/\D/g, "")
                      .length === 8 &&
                    street &&
                    city &&
                    stateCode && (
                      <span className="address-found">
                        ✓ Endereço encontrado
                      </span>
                    )}
                </div>
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
                {manualAddressOpen && (
                  <>
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
                  </>
                )}
                <label className="field full">
                  <span>Referência</span>
                  <input name="reference" />
                </label>
              </div>

              <div
                className="address-progressive-summary"
                data-address-summary-v30="true"
              >
                {!manualAddressOpen &&
                  street &&
                  neighborhood &&
                  city &&
                  stateCode && (
                    <div className="address-confirmed-card">
                      <div>
                        <strong>
                          ✓ Endereço localizado
                        </strong>
                        <span>
                          {street}
                          {number
                            ? `, ${number}`
                            : ""}
                        </span>
                        <small>
                          {neighborhood} · {city}/{stateCode}
                        </small>
                      </div>
                    </div>
                  )}

                {(cepLookup.error ||
                  manualAddressOpen) && (
                  <div className="address-manual-help">
                    {cepLookup.error && (
                      <p className="error-text">
                        {cepLookup.error.message}
                      </p>
                    )}

                    {!manualAddressOpen && (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() =>
                          setManualAddressOpen(
                            true,
                          )
                        }
                      >
                        Preencher endereço manualmente
                      </button>
                    )}

                    {manualAddressOpen && (
                      <small>
                        Preencha também Cidade e Estado
                        para calcular a entrega.
                      </small>
                    )}
                  </div>
                )}

                {!cepLookup.error &&
                  !manualAddressOpen &&
                  postalCode.replace(/\D/g, "")
                    .length === 8 &&
                  !cepLookup.isPending &&
                  !city && (
                    <button
                      type="button"
                      className="address-manual-link"
                      onClick={() =>
                        setManualAddressOpen(
                          true,
                        )
                      }
                    >
                      CEP não trouxe o endereço?
                      Preencher manualmente
                    </button>
                  )}
              </div>

              {dynamicDeliveryEnabled && (
                <div className="delivery-quote-box">
                  {!canCalculateDelivery &&
                    !deliveryQuote.data && (
                      <div className="delivery-auto-status">
                        <span className="delivery-auto-dot" />
                        <span>
                          Preencha o endereço para calcular a entrega.
                        </span>
                      </div>
                    )}

                  {canCalculateDelivery &&
                    deliveryQuote.isPending && (
                      <div className="delivery-auto-status calculating">
                        <span className="delivery-auto-spinner" />
                        <span>
                          Calculando entrega automaticamente...
                        </span>
                      </div>
                    )}

                  

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

          <div
            style={{
              display: "grid",
              gap: 12,
            }}
          >
            <div
              className="fulfillment payment-methods"
              style={{ margin: 0 }}
            >
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
            </div>

            {paymentMethod === "CASH" && (
              <div
                style={{
                  display: "grid",
                  gap: 10,
                  padding: 14,
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,.12)",
                  background: "rgba(255,255,255,.035)",
                }}
              >
                <strong>Vai precisar de troco?</strong>

                <div
                  className="fulfillment payment-methods"
                  style={{ margin: 0 }}
                >
                  <button
                    type="button"
                    className={!needsChange ? "selected" : ""}
                    onClick={() => {
                      setNeedsChange(false);
                      setCashChangeFor("");
                    }}
                  >
                    Não
                  </button>

                  <button
                    type="button"
                    className={needsChange ? "selected" : ""}
                    onClick={() => setNeedsChange(true)}
                  >
                    Sim
                  </button>
                </div>

                {needsChange && (
                  <label className="field">
                    <span>Troco para quanto?</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={total / 100}
                      step="0.01"
                      placeholder="Ex.: 100,00"
                      value={cashChangeFor}
                      onChange={(event) =>
                        setCashChangeFor(event.target.value)
                      }
                      required
                    />
                  </label>
                )}
              </div>
            )}

            <details
              style={{
                border: "1px solid rgba(255,255,255,.12)",
                borderRadius: 14,
                background: "rgba(255,255,255,.03)",
                overflow: "hidden",
              }}
            >
              <summary
                style={{
                  cursor: "pointer",
                  listStyle: "none",
                  padding: "14px 16px",
                  fontWeight: 700,
                }}
              >
                💳 Débito
                <small
                  style={{
                    display: "block",
                    fontWeight: 400,
                    opacity: .7,
                    marginTop: 4,
                  }}
                >
                  Elo, Visa e Mastercard
                </small>
              </summary>

              <div
                className="fulfillment payment-methods"
                style={{
                  margin: 0,
                  padding: "0 14px 14px",
                }}
              >
                <button
                  type="button"
                  className={paymentMethod === "DEBIT_ELO" ? "selected" : ""}
                  onClick={() => setPaymentMethod("DEBIT_ELO")}
                >
                  Elo
                </button>

                <button
                  type="button"
                  className={paymentMethod === "DEBIT_VISA" ? "selected" : ""}
                  onClick={() => setPaymentMethod("DEBIT_VISA")}
                >
                  Visa
                </button>

                <button
                  type="button"
                  className={paymentMethod === "DEBIT_MASTERCARD" ? "selected" : ""}
                  onClick={() => setPaymentMethod("DEBIT_MASTERCARD")}
                >
                  Mastercard
                </button>
              </div>
            </details>

            <details
              style={{
                border: "1px solid rgba(255,255,255,.12)",
                borderRadius: 14,
                background: "rgba(255,255,255,.03)",
                overflow: "hidden",
              }}
            >
              <summary
                style={{
                  cursor: "pointer",
                  listStyle: "none",
                  padding: "14px 16px",
                  fontWeight: 700,
                }}
              >
                💳 Crédito
                <small
                  style={{
                    display: "block",
                    fontWeight: 400,
                    opacity: .7,
                    marginTop: 4,
                  }}
                >
                  Elo, Visa, Mastercard, Hiper, Hipercard e American Express
                </small>
              </summary>

              <div
                className="fulfillment payment-methods"
                style={{
                  margin: 0,
                  padding: "0 14px 14px",
                }}
              >
                {[
                  ["CREDIT_ELO", "Elo"],
                  ["CREDIT_VISA", "Visa"],
                  ["CREDIT_MASTERCARD", "Mastercard"],
                  ["CREDIT_HIPER", "Hiper"],
                  ["CREDIT_HIPERCARD", "Hipercard"],
                  ["CREDIT_AMEX", "American Express"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={paymentMethod === value ? "selected" : ""}
                    onClick={() =>
                      setPaymentMethod(value as PaymentMethod)
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </details>

            <details
              style={{
                border: "1px solid rgba(255,255,255,.12)",
                borderRadius: 14,
                background: "rgba(255,255,255,.03)",
                overflow: "hidden",
              }}
            >
              <summary
                style={{
                  cursor: "pointer",
                  listStyle: "none",
                  padding: "14px 16px",
                  fontWeight: 700,
                }}
              >
                🍽️ Benefícios
                <small
                  style={{
                    display: "block",
                    fontWeight: 400,
                    opacity: .7,
                    marginTop: 4,
                  }}
                >
                  Ticket, VR e Pluxee
                </small>
              </summary>

              <div
                style={{
                  display: "grid",
                  gap: 14,
                  padding: "0 14px 14px",
                }}
              >
                <div>
                  <strong>Ticket</strong>
                  <div
                    className="fulfillment payment-methods"
                    style={{ marginTop: 8 }}
                  >
                    <button
                      type="button"
                      className={paymentMethod === "TICKET_ALIMENTACAO" ? "selected" : ""}
                      onClick={() => setPaymentMethod("TICKET_ALIMENTACAO")}
                    >
                      Alimentação
                    </button>

                    <button
                      type="button"
                      className={paymentMethod === "TICKET_REFEICAO" ? "selected" : ""}
                      onClick={() => setPaymentMethod("TICKET_REFEICAO")}
                    >
                      Refeição
                    </button>
                  </div>
                </div>

                <div>
                  <strong>VR</strong>
                  <div
                    className="fulfillment payment-methods"
                    style={{ marginTop: 8 }}
                  >
                    <button
                      type="button"
                      className={paymentMethod === "VR_ALIMENTACAO" ? "selected" : ""}
                      onClick={() => setPaymentMethod("VR_ALIMENTACAO")}
                    >
                      Alimentação
                    </button>

                    <button
                      type="button"
                      className={paymentMethod === "VR_REFEICAO" ? "selected" : ""}
                      onClick={() => setPaymentMethod("VR_REFEICAO")}
                    >
                      Refeição
                    </button>
                  </div>
                </div>

                <div>
                  <strong>Pluxee</strong>
                  <div
                    className="fulfillment payment-methods"
                    style={{ marginTop: 8 }}
                  >
                    <button
                      type="button"
                      className={paymentMethod === "PLUXEE_ALIMENTACAO" ? "selected" : ""}
                      onClick={() => setPaymentMethod("PLUXEE_ALIMENTACAO")}
                    >
                      Alimentação
                    </button>

                    <button
                      type="button"
                      className={paymentMethod === "PLUXEE_REFEICAO" ? "selected" : ""}
                      onClick={() => setPaymentMethod("PLUXEE_REFEICAO")}
                    >
                      Refeição
                    </button>
                  </div>
                </div>
              </div>
            </details>
          </div>

          <p className="payment-note">
            {paymentMethod === "PIX"
              ? store.data?.settings.pixPaymentMode === "MANUAL"
                ? "Pix direto para a chave da loja."
                : "Pagamento por Pix com confirmação automática."
              : paymentMethod === "CASH"
                ? needsChange && cashChangeFor
                  ? `Dinheiro na entrega · troco para R$ ${Number(
                      cashChangeFor,
                    ).toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`
                  : "Pagamento em dinheiro na entrega."
                : `${paymentMethodLabels[paymentMethod]} na entrega.`}
          </p>




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
                ? canCalculateDelivery
                  ? "Calculando entrega..."
                  : "Preencha o endereço para continuar"
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
