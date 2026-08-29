import {
  FormEvent,
  useState,
} from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { AdminNav } from "../components/AdminNav";
import { adminApi } from "../lib/api";

type AdminUserItem = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  totpEnabled: boolean;
  createdAt: string;
};

type CreateAdminInput = {
  name: string;
  email: string;
  password: string;
  currentPassword: string;
};

export function AdminUsersPage() {
  const client = useQueryClient();
  const [createdMessage, setCreatedMessage] =
    useState("");

  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: () =>
      adminApi<AdminUserItem[]>("/admin/users"),
  });

  const createAdmin = useMutation({
    mutationFn: (input: CreateAdminInput) =>
      adminApi<AdminUserItem>("/admin/users", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (admin) => {
      setCreatedMessage(
        `Conta de ${admin.name} criada. Agora faça login nessa conta e configure o Authenticator em Configurações.`,
      );
      void client.invalidateQueries({
        queryKey: ["admin-users"],
      });
    },
  });

  function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setCreatedMessage("");

    const form =
      new FormData(event.currentTarget);

    createAdmin.mutate({
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      password: String(
        form.get("password") ?? "",
      ),
      currentPassword: String(
        form.get("currentPassword") ?? "",
      ),
    });
  }

  return (
    <main className="admin-page">
      <AdminNav />

      <header className="admin-header">
        <div>
          <small>Segurança</small>
          <h1>Administradores</h1>
          <p>
            Cada administrador possui login,
            senha e Google Authenticator
            independentes.
          </p>
        </div>
      </header>

      <section
        className="admin-orders"
        style={{
          display: "grid",
          gap: 20,
        }}
      >
        <article className="admin-order">
          <div
            className="admin-order-head"
            style={{ alignItems: "center" }}
          >
            <div>
              <small>Nova conta</small>
              <h2>
                <UserPlus
                  size={20}
                  style={{
                    verticalAlign: "middle",
                    marginRight: 8,
                  }}
                />
                Adicionar administrador
              </h2>
              <p>
                A senha atual é exigida para
                confirmar a criação.
              </p>
            </div>
          </div>

          <form
            onSubmit={submit}
            style={{
              display: "grid",
              gap: 14,
              marginTop: 16,
              maxWidth: 560,
            }}
          >
            <label className="field">
              <span>Nome</span>
              <input
                name="name"
                minLength={2}
                maxLength={80}
                required
              />
            </label>

            <label className="field">
              <span>E-mail da nova conta</span>
              <input
                name="email"
                type="email"
                autoCapitalize="none"
                spellCheck={false}
                required
              />
            </label>

            <label className="field">
              <span>
                Senha da nova conta
              </span>
              <input
                name="password"
                type="password"
                minLength={8}
                maxLength={200}
                autoComplete="new-password"
                required
              />
            </label>

            <label className="field">
              <span>
                Sua senha administrativa atual
              </span>
              <input
                name="currentPassword"
                type="password"
                minLength={8}
                maxLength={200}
                autoComplete="current-password"
                required
              />
            </label>

            {createAdmin.error && (
              <p className="error-text">
                {createAdmin.error.message}
              </p>
            )}

            {createdMessage && (
              <div
                style={{
                  padding: 12,
                  borderRadius: 10,
                  border:
                    "1px solid rgba(80, 200, 120, 0.35)",
                }}
              >
                <ShieldCheck
                  size={18}
                  style={{
                    verticalAlign: "middle",
                    marginRight: 7,
                  }}
                />
                {createdMessage}
              </div>
            )}

            <button
              className="primary"
              disabled={createAdmin.isPending}
            >
              <UserPlus />
              {createAdmin.isPending
                ? "Criando..."
                : "Criar conta"}
            </button>
          </form>
        </article>

        <article className="admin-order">
          <div className="admin-order-head">
            <div>
              <small>Contas existentes</small>
              <h2>
                <Users
                  size={20}
                  style={{
                    verticalAlign: "middle",
                    marginRight: 8,
                  }}
                />
                Administradores
              </h2>
            </div>
          </div>

          {users.isLoading && (
            <p>Carregando contas...</p>
          )}

          {users.error && (
            <p className="error-text">
              {users.error.message}
            </p>
          )}

          <div
            style={{
              display: "grid",
              gap: 10,
              marginTop: 14,
            }}
          >
            {users.data?.map((admin) => (
              <div
                key={admin.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent:
                    "space-between",
                  gap: 16,
                  padding: "12px 14px",
                  borderRadius: 12,
                  border:
                    "1px solid rgba(255,255,255,0.1)",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <strong>{admin.name}</strong>
                  <small
                    style={{
                      display: "block",
                      marginTop: 3,
                    }}
                  >
                    {admin.email}
                  </small>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    className={
                      admin.active
                        ? "status-chip confirmed"
                        : "status-chip canceled"
                    }
                  >
                    {admin.active
                      ? "Ativa"
                      : "Inativa"}
                  </span>

                  <span
                    className={
                      admin.totpEnabled
                        ? "status-chip confirmed"
                        : "status-chip pending_payment"
                    }
                  >
                    {admin.totpEnabled
                      ? "Authenticator ativo"
                      : "Authenticator não configurado"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
