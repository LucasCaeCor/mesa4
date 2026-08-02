import { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminNav } from "../components/AdminNav";
import { adminApi } from "../lib/api";
import { formatMoney } from "../lib/format";
import type { DeliveryZone, StoreSettings } from "../types";

type Hour = { weekday: number; enabled: boolean; opensAt: string; closesAt: string };
const weekdayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export function AdminSettingsPage() {
  const client = useQueryClient();
  const settings = useQuery({ queryKey: ["admin-settings"], queryFn: () => adminApi<StoreSettings>("/admin/settings") });
  const zones = useQuery({ queryKey: ["admin-zones"], queryFn: () => adminApi<DeliveryZone[]>("/admin/delivery-zones") });
  const hours = useQuery({ queryKey: ["admin-hours"], queryFn: () => adminApi<Hour[]>("/admin/business-hours") });
  const saveSettings = useMutation({ mutationFn: (body: unknown) => adminApi("/admin/settings", { method: "PUT", body: JSON.stringify(body) }), onSuccess: () => client.invalidateQueries({ queryKey: ["admin-settings"] }) });
  const createZone = useMutation({ mutationFn: (body: unknown) => adminApi("/admin/delivery-zones", { method: "POST", body: JSON.stringify(body) }), onSuccess: () => client.invalidateQueries({ queryKey: ["admin-zones"] }) });
  const removeZone = useMutation({ mutationFn: (id: string) => adminApi(`/admin/delivery-zones/${id}`, { method: "DELETE" }), onSuccess: () => client.invalidateQueries({ queryKey: ["admin-zones"] }) });
  const saveHours = useMutation({ mutationFn: (body: unknown) => adminApi("/admin/business-hours", { method: "PUT", body: JSON.stringify(body) }), onSuccess: () => client.invalidateQueries({ queryKey: ["admin-hours"] }) });

  function submitSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    saveSettings.mutate({ storeName: form.get("storeName"), description: form.get("description") || undefined, whatsappNumber: String(form.get("whatsappNumber")).replace(/\D/g, ""), instagramUrl: form.get("instagramUrl") || "", logoUrl: form.get("logoUrl") || "", heroImageUrl: form.get("heroImageUrl") || "", pickupAddress: form.get("pickupAddress") || undefined, minimumOrderCents: Math.round(Number(form.get("minimumOrder")) * 100), defaultPrepMinutes: Number(form.get("prepMinutes")), acceptingOrders: form.get("acceptingOrders") === "on", pixEnabled: form.get("pixEnabled") === "on", whatsappConfirmation: true });
  }
  function submitZone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    createZone.mutate({ name: form.get("name"), feeCents: Math.round(Number(form.get("fee")) * 100), minimumOrderCents: Math.round(Number(form.get("minimum")) * 100), estimatedMinutes: Number(form.get("minutes")) || undefined, active: true, position: 0 }); event.currentTarget.reset();
  }
  function submitHours(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const body = weekdayNames.map((_, weekday) => ({ weekday, enabled: form.get(`enabled-${weekday}`) === "on", opensAt: form.get(`opens-${weekday}`), closesAt: form.get(`closes-${weekday}`) })); saveHours.mutate(body);
  }
  const s = settings.data;
  return <main className="admin-page"><AdminNav /><header className="admin-header"><div><small>Loja e entrega</small><h1>Configurações</h1></div></header>
    {s && <form className="admin-form settings-form" onSubmit={submitSettings}><h2>Dados da loja</h2><div className="field-grid"><label className="field"><span>Nome da loja</span><input name="storeName" defaultValue={s.storeName} required /></label><label className="field"><span>WhatsApp com DDI</span><input name="whatsappNumber" defaultValue={s.whatsappNumber} required /></label><label className="field full"><span>Descrição</span><textarea name="description" defaultValue={s.description} /></label><label className="field full"><span>Endereço de retirada</span><input name="pickupAddress" defaultValue={s.pickupAddress} /></label><label className="field"><span>Pedido mínimo em R$</span><input name="minimumOrder" type="number" step="0.01" defaultValue={s.minimumOrderCents / 100} /></label><label className="field"><span>Preparo em minutos</span><input name="prepMinutes" type="number" defaultValue={s.defaultPrepMinutes} /></label><label className="field full"><span>Instagram</span><input name="instagramUrl" type="url" defaultValue={s.instagramUrl} /></label><label className="field"><span>URL da logo</span><input name="logoUrl" type="url" defaultValue={s.logoUrl} /></label><label className="field"><span>URL da capa</span><input name="heroImageUrl" type="url" defaultValue={s.heroImageUrl} /></label></div><div className="check-row"><label><input name="acceptingOrders" type="checkbox" defaultChecked={s.acceptingOrders} /> Aceitando pedidos</label><label><input name="pixEnabled" type="checkbox" defaultChecked={s.pixEnabled} /> PIX habilitado</label></div><button className="primary">Salvar configurações</button></form>}
    <section className="admin-form-grid"><form className="admin-form" onSubmit={submitZone}><h2>Nova região de entrega</h2><label className="field"><span>Nome / bairro</span><input name="name" required /></label><div className="field-grid"><label className="field"><span>Taxa em R$</span><input name="fee" type="number" min="0" step="0.01" required /></label><label className="field"><span>Pedido mínimo</span><input name="minimum" type="number" min="0" step="0.01" defaultValue="0" /></label></div><label className="field"><span>Tempo estimado em minutos</span><input name="minutes" type="number" min="1" /></label><button className="primary">Adicionar região</button></form><div className="admin-form"><h2>Regiões cadastradas</h2>{zones.data?.map((zone) => <div className="zone-row" key={zone.id}><span><strong>{zone.name}</strong><small>{formatMoney(zone.feeCents)}</small></span><button onClick={() => confirm("Excluir região?") && removeZone.mutate(zone.id)}>Excluir</button></div>)}</div></section>
    <form className="admin-form settings-form" onSubmit={submitHours}><h2>Horários</h2>{hours.data?.map((hour) => <div className="hour-row" key={hour.weekday}><label><input name={`enabled-${hour.weekday}`} type="checkbox" defaultChecked={hour.enabled} />{weekdayNames[hour.weekday]}</label><input name={`opens-${hour.weekday}`} type="time" defaultValue={hour.opensAt} required /><span>até</span><input name={`closes-${hour.weekday}`} type="time" defaultValue={hour.closesAt} required /></div>)}<button className="primary">Salvar horários</button></form>
  </main>;
}
