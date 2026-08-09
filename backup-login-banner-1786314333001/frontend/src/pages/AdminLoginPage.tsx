import { FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

type LoginResult = { token: string; admin: { name: string } };
export function AdminLoginPage() {
  const navigate = useNavigate();
  const mutation = useMutation({ mutationFn: (data: unknown) => api<LoginResult>("/admin/auth/login", { method: "POST", body: JSON.stringify(data) }), onSuccess(data) { sessionStorage.setItem("mesa4.admin.token", data.token); navigate("/admin"); } });
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); mutation.mutate({ email: form.get("email"), password: form.get("password") }); }
  return <main className="admin-login"><form onSubmit={submit}><div className="admin-logo">M4</div><small>Área administrativa</small><h1>Mesa IV</h1><label className="field"><span>E-mail</span><input name="email" type="email" required /></label><label className="field"><span>Senha</span><input name="password" type="password" minLength={8} required /></label>{mutation.error && <p className="error-text">{mutation.error.message}</p>}<button className="primary" disabled={mutation.isPending}>{mutation.isPending ? "Entrando..." : "Entrar"}</button></form></main>;
}
