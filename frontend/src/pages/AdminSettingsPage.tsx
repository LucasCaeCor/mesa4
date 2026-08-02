import { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  const settings = useQuery({
    queryKey: ["admin-settings"],
    queryFn: () => adminApi<StoreSettings>("/admin/settings"),
  });
  const hours = useQuery({
    queryKey: ["admin-hours"],
    queryFn: () => adminApi<Hour[]>("/admin/business-hours"),
  });

  const saveSettings = useMutation({
    mutationFn: (body: unknown) =>
      adminApi("/admin/settings", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["admin-settings"] }),
  });

  const saveHours = useMutation({
    mutationFn: (body: unknown) =>
      adminApi("/admin/business-hours", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["admin-hours"] }),
  });

  function submitSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    saveSettings.mutate({
      storeName: form.get("storeName"),
      description: form.get("description") || undefined,
      whatsappNumber: String(form.get("whatsappNumber")).replace(/\D/g, ""),
      instagramUrl: form.get("instagramUrl") || "",
      logoUrl: form.get("logoUrl") || "",
      heroImageUrl: form.get("heroImageUrl") || "",
      pickupAddress: form.get("pickupAddress") || undefined,
      minimumOrderCents: Math.round(Number(form.get("minimumOrder")) * 100),
      deliveryFeeCents: Math.round(Number(form.get("deliveryFee")) * 100),
      defaultPrepMinutes: Number(form.get("prepMinutes")),
      acceptingOrders: form.get("acceptingOrders") === "on",
      pixEnabled: form.get("pixEnabled") === "on",
      whatsappConfirmation: true,
    });
  }

  function submitHours(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = weekdayNames.map((_, weekday) => ({
      weekday,
      enabled: form.get(`enabled-${weekday}`) === "on",
      opensAt: form.get(`opens-${weekday}`),
      closesAt: form.get(`closes-${weekday}`),
    }));
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
        <form className="admin-form settings-form" onSubmit={submitSettings}>
          <h2>Dados da loja</h2>
          <div className="field-grid">
            <label className="field">
              <span>Nome da loja</span>
              <input name="storeName" defaultValue={s.storeName} required />
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
              <textarea name="description" defaultValue={s.description} />
            </label>
            <label className="field full">
              <span>Endereço de retirada</span>
              <input name="pickupAddress" defaultValue={s.pickupAddress} />
            </label>
            <label className="field">
              <span>Pedido mínimo em R$</span>
              <input
                name="minimumOrder"
                type="number"
                min="0"
                step="0.01"
                defaultValue={s.minimumOrderCents / 100}
              />
            </label>
            <label className="field">
              <span>Taxa padrão de entrega em R$</span>
              <input
                name="deliveryFee"
                type="number"
                min="0"
                step="0.01"
                defaultValue={(s.deliveryFeeCents ?? 0) / 100}
                required
              />
              <small className="field-help">
                Essa taxa será aplicada a todos os pedidos de entrega.
              </small>
            </label>
            <label className="field">
              <span>Preparo em minutos</span>
              <input
                name="prepMinutes"
                type="number"
                defaultValue={s.defaultPrepMinutes}
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
              <input name="logoUrl" type="url" defaultValue={s.logoUrl} />
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
          <div className="check-row">
            <label>
              <input
                name="acceptingOrders"
                type="checkbox"
                defaultChecked={s.acceptingOrders}
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
          </div>
          {saveSettings.error && (
            <p className="error-text">{saveSettings.error.message}</p>
          )}
          <button className="primary" disabled={saveSettings.isPending}>
            {saveSettings.isPending ? "Salvando..." : "Salvar configurações"}
          </button>
        </form>
      )}

      <form className="admin-form settings-form" onSubmit={submitHours}>
        <h2>Horários</h2>
        {hours.data?.map((hour) => (
          <div className="hour-row" key={hour.weekday}>
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
        <button className="primary" disabled={saveHours.isPending}>
          {saveHours.isPending ? "Salvando..." : "Salvar horários"}
        </button>
      </form>
    </main>
  );
}
