import {
  FormEvent,
  useEffect,
  useState,
} from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { AdminNav } from "../components/AdminNav";
import { adminApi } from "../lib/api";
import type { StoreSettings } from "../types";

type Hour = {
  weekday: number;
  enabled: boolean;
  opensAt: string;
  closesAt: string;
};

const weekdayNames = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

export function AdminSettingsPage() {
  const client = useQueryClient();
  const [pixPaymentMode, setPixPaymentMode] =
    useState<"MERCADO_PAGO" | "MANUAL">(
      "MERCADO_PAGO",
    );

  const settings = useQuery({
    queryKey: ["admin-settings"],
    queryFn: () =>
      adminApi<StoreSettings>("/admin/settings"),
  });

  useEffect(() => {
    setPixPaymentMode(
      settings.data?.pixPaymentMode ??
        "MERCADO_PAGO",
    );
  }, [settings.data?.pixPaymentMode]);

  const hours = useQuery({
    queryKey: ["admin-hours"],
    queryFn: () =>
      adminApi<Hour[]>("/admin/business-hours"),
  });

  const saveSettings = useMutation({
    mutationFn: (body: unknown) =>
      adminApi("/admin/settings", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () =>
      client.invalidateQueries({
        queryKey: ["admin-settings"],
      }),
  });

  const saveHours = useMutation({
    mutationFn: (body: unknown) =>
      adminApi("/admin/business-hours", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () =>
      client.invalidateQueries({
        queryKey: ["admin-hours"],
      }),
  });

  function submitSettings(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    saveSettings.mutate({
      storeName: form.get("storeName"),
      description:
        form.get("description") || undefined,
      whatsappNumber: String(
        form.get("whatsappNumber"),
      ).replace(/\D/g, ""),
      instagramUrl:
        form.get("instagramUrl") || "",
      logoUrl: form.get("logoUrl") || "",
      heroImageUrl:
        form.get("heroImageUrl") || "",
      pickupAddress:
        form.get("pickupAddress") || undefined,
      minimumOrderCents: Math.round(
        Number(form.get("minimumOrder")) * 100,
      ),
      deliveryFeeCents: Math.round(
        Number(form.get("deliveryFee")) * 100,
      ),
      dynamicDeliveryEnabled:
        form.get("dynamicDeliveryEnabled") ===
        "on",
      deliveryBaseFeeCents: Math.round(
        Number(form.get("deliveryBaseFee")) *
          100,
      ),
      deliveryIncludedKm: Number(
        form.get("deliveryIncludedKm"),
      ),
      deliveryPricePerKmCents: Math.round(
        Number(
          form.get("deliveryPricePerKm"),
        ) * 100,
      ),
      deliveryMaxDistanceKm: Number(
        form.get("deliveryMaxDistanceKm"),
      ),
      defaultPrepMinutes: Number(
        form.get("prepMinutes"),
      ),
      acceptingOrders:
        form.get("acceptingOrders") === "on",
      pixEnabled:
        form.get("pixEnabled") === "on",
      pixPaymentMode,
      manualPixKeyType:
        form.get("manualPixKeyType") ||
        undefined,
      manualPixKey:
        form.get("manualPixKey") || undefined,
      manualPixReceiverName:
        form.get("manualPixReceiverName") ||
        undefined,
      manualPixReceiverCity:
        form.get("manualPixReceiverCity") ||
        undefined,
      whatsappConfirmation: true,
      whatsappNotificationsEnabled:
        form.get(
          "whatsappNotificationsEnabled",
        ) === "on",
    });
  }

  function submitHours(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = weekdayNames.map(
      (_, weekday) => ({
        weekday,
        enabled:
          form.get(`enabled-${weekday}`) ===
          "on",
        opensAt: form.get(`opens-${weekday}`),
        closesAt: form.get(
          `closes-${weekday}`,
        ),
      }),
    );

    saveHours.mutate(body);
  }

  const s = settings.data;

  return (
    <main className="admin-page">
      <AdminNav />

      <header className="admin-header">
        <div>
          <small>Loja e entrega</small>
          <h1>Configurações</h1>
        </div>
      </header>

      {s && (
        <form
          className="admin-form settings-form"
          onSubmit={submitSettings}
        >
          <h2>Dados da loja</h2>

          <div className="field-grid">
            <label className="field">
              <span>Nome da loja</span>
              <input
                name="storeName"
                defaultValue={s.storeName}
                required
              />
            </label>

            <label className="field">
              <span>WhatsApp com DDI</span>
              <input
                name="whatsappNumber"
                defaultValue={s.whatsappNumber}
                required
              />
            </label>

            <label className="field full">
              <span>Descrição</span>
              <textarea
                name="description"
                defaultValue={s.description}
              />
            </label>

            <label className="field full">
              <span>Endereço de retirada</span>
              <input
                name="pickupAddress"
                defaultValue={s.pickupAddress}
              />
            </label>

            <label className="field">
              <span>Pedido mínimo em R$</span>
              <input
                name="minimumOrder"
                type="number"
                min="0"
                step="0.01"
                defaultValue={
                  s.minimumOrderCents / 100
                }
              />
            </label>

            <label className="field">
              <span>Taxa fixa em R$</span>
              <input
                name="deliveryFee"
                type="number"
                min="0"
                step="0.01"
                defaultValue={
                  (s.deliveryFeeCents ?? 0) /
                  100
                }
                required
              />
              <small className="field-help">
                Usada quando o cálculo por distância
                estiver desligado.
              </small>
            </label>

            <label className="field">
              <span>
                Taxa base dinâmica em R$
              </span>
              <input
                name="deliveryBaseFee"
                type="number"
                min="0"
                step="0.01"
                defaultValue={
                  (s.deliveryBaseFeeCents ?? 0) /
                  100
                }
                required
              />
            </label>

            <label className="field">
              <span>Quilômetros incluídos</span>
              <input
                name="deliveryIncludedKm"
                type="number"
                min="0"
                step="0.1"
                defaultValue={
                  s.deliveryIncludedKm ?? 0
                }
                required
              />
            </label>

            <label className="field">
              <span>
                Valor por km adicional em R$
              </span>
              <input
                name="deliveryPricePerKm"
                type="number"
                min="0"
                step="0.01"
                defaultValue={
                  (s.deliveryPricePerKmCents ??
                    0) / 100
                }
                required
              />
            </label>

            <label className="field">
              <span>Distância máxima em km</span>
              <input
                name="deliveryMaxDistanceKm"
                type="number"
                min="0.1"
                step="0.1"
                defaultValue={
                  s.deliveryMaxDistanceKm ?? 15
                }
                required
              />
            </label>

            <label className="field">
              <span>Preparo em minutos</span>
              <input
                name="prepMinutes"
                type="number"
                defaultValue={
                  s.defaultPrepMinutes
                }
              />
            </label>

            <label className="field full">
              <span>Instagram</span>
              <input
                name="instagramUrl"
                type="url"
                defaultValue={s.instagramUrl}
              />
            </label>

            <label className="field">
              <span>URL da logo</span>
              <input
                name="logoUrl"
                type="url"
                defaultValue={s.logoUrl}
              />
            </label>

            <label className="field">
              <span>URL da capa</span>
              <input
                name="heroImageUrl"
                type="url"
                defaultValue={s.heroImageUrl}
              />
            </label>
          </div>

          <section className="payment-mode-section">
            <h2>Recebimento por Pix</h2>
            <p>
              Escolha se o sistema confirma o
              pagamento automaticamente ou se a loja
              confere no aplicativo bancário.
            </p>

            <div className="payment-mode-grid">
              <label
                className={`payment-mode-card ${
                  pixPaymentMode ===
                  "MERCADO_PAGO"
                    ? "selected"
                    : ""
                }`}
              >
                <input
                  type="radio"
                  name="pixPaymentMode"
                  value="MERCADO_PAGO"
                  checked={
                    pixPaymentMode ===
                    "MERCADO_PAGO"
                  }
                  onChange={() =>
                    setPixPaymentMode(
                      "MERCADO_PAGO",
                    )
                  }
                />
                <span>
                  <strong>Mercado Pago</strong>
                  <small>
                    Gera o Pix e confirma
                    automaticamente pelo webhook.
                  </small>
                </span>
              </label>

              <label
                className={`payment-mode-card ${
                  pixPaymentMode === "MANUAL"
                    ? "selected"
                    : ""
                }`}
              >
                <input
                  type="radio"
                  name="pixPaymentMode"
                  value="MANUAL"
                  checked={
                    pixPaymentMode === "MANUAL"
                  }
                  onChange={() =>
                    setPixPaymentMode("MANUAL")
                  }
                />
                <span>
                  <strong>Pix manual</strong>
                  <small>
                    O dinheiro cai direto na chave da
                    loja e o administrador confirma no
                    painel.
                  </small>
                </span>
              </label>
            </div>

            {pixPaymentMode === "MANUAL" && (
              <div className="field-grid manual-pix-fields">
                <label className="field">
                  <span>Tipo da chave</span>
                  <select
                    name="manualPixKeyType"
                    defaultValue={
                      s.manualPixKeyType ??
                      "RANDOM"
                    }
                    required
                  >
                    <option value="CPF">
                      CPF
                    </option>
                    <option value="CNPJ">
                      CNPJ
                    </option>
                    <option value="EMAIL">
                      E-mail
                    </option>
                    <option value="PHONE">
                      Telefone
                    </option>
                    <option value="RANDOM">
                      Chave aleatória
                    </option>
                  </select>
                </label>

                <label className="field">
                  <span>Chave Pix</span>
                  <input
                    name="manualPixKey"
                    defaultValue={
                      s.manualPixKey ?? ""
                    }
                    required
                  />
                </label>

                <label className="field">
                  <span>Nome do recebedor</span>
                  <input
                    name="manualPixReceiverName"
                    maxLength={25}
                    defaultValue={
                      s.manualPixReceiverName ??
                      ""
                    }
                    required
                  />
                </label>

                <label className="field">
                  <span>Cidade do recebedor</span>
                  <input
                    name="manualPixReceiverCity"
                    maxLength={15}
                    defaultValue={
                      s.manualPixReceiverCity ??
                      ""
                    }
                    required
                  />
                </label>

                <p className="manual-pix-warning">
                  O sistema gera o QR Code com o valor
                  e o identificador do pedido, mas não
                  consulta o banco. Confirme somente
                  depois de verificar o recebimento.
                </p>
              </div>
            )}
          </section>

          <div className="check-row">
            <label>
              <input
                name="dynamicDeliveryEnabled"
                type="checkbox"
                defaultChecked={
                  s.dynamicDeliveryEnabled ?? false
                }
              />{" "}
              Calcular entrega por distância
            </label>

            <label>
              <input
                name="acceptingOrders"
                type="checkbox"
                defaultChecked={
                  s.acceptingOrders
                }
              />{" "}
              Aceitando pedidos
            </label>

            <label>
              <input
                name="pixEnabled"
                type="checkbox"
                defaultChecked={s.pixEnabled}
              />{" "}
              PIX habilitado
            </label>

            <label>
              <input
                name="whatsappNotificationsEnabled"
                type="checkbox"
                defaultChecked={
                  s.whatsappNotificationsEnabled ??
                  false
                }
              />{" "}
              Notificações automáticas pelo
              WhatsApp
            </label>
          </div>

          {saveSettings.error && (
            <p className="error-text">
              {saveSettings.error.message}
            </p>
          )}

          <button
            className="primary"
            disabled={saveSettings.isPending}
          >
            {saveSettings.isPending
              ? "Salvando..."
              : "Salvar configurações"}
          </button>
        </form>
      )}

      <form
        className="admin-form settings-form"
        onSubmit={submitHours}
      >
        <h2>Horários</h2>

        {hours.data?.map((hour) => (
          <div
            className="hour-row"
            key={hour.weekday}
          >
            <label>
              <input
                name={`enabled-${hour.weekday}`}
                type="checkbox"
                defaultChecked={hour.enabled}
              />
              {weekdayNames[hour.weekday]}
            </label>

            <input
              name={`opens-${hour.weekday}`}
              type="time"
              defaultValue={hour.opensAt}
              required
            />

            <span>até</span>

            <input
              name={`closes-${hour.weekday}`}
              type="time"
              defaultValue={hour.closesAt}
              required
            />
          </div>
        ))}

        <button
          className="primary"
          disabled={saveHours.isPending}
        >
          {saveHours.isPending
            ? "Salvando..."
            : "Salvar horários"}
        </button>
      </form>
    </main>
  );
}
