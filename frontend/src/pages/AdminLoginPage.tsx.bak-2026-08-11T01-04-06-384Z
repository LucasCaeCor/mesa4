import {
  FormEvent,
  useState,
} from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

type LoginResult = {
  token: string;
  admin: {
    name: string;
  };
};

type LoginInput = {
  email: string;
  password: string;
  rememberEmail: boolean;
};

const ADMIN_EMAIL_KEY =
  "mesa4.admin.email";

export function AdminLoginPage() {
  const navigate = useNavigate();
  const [rememberEmail, setRememberEmail] =
    useState(
      () =>
        localStorage.getItem(
          ADMIN_EMAIL_KEY,
        ) !== null,
    );
  const [initialEmail] = useState(
    () =>
      localStorage.getItem(
        ADMIN_EMAIL_KEY,
      ) ?? "",
  );

  const mutation = useMutation({
    mutationFn: (
      input: LoginInput,
    ) =>
      api<LoginResult>(
        "/admin/auth/login",
        {
          method: "POST",
          body: JSON.stringify({
            email: input.email,
            password: input.password,
          }),
        },
      ),
    onSuccess(
      data,
      variables,
    ) {
      sessionStorage.setItem(
        "mesa4.admin.token",
        data.token,
      );

      if (variables.rememberEmail) {
        localStorage.setItem(
          ADMIN_EMAIL_KEY,
          variables.email,
        );
      } else {
        localStorage.removeItem(
          ADMIN_EMAIL_KEY,
        );
      }

      navigate("/admin");
    },
  });

  function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const form =
      new FormData(event.currentTarget);

    mutation.mutate({
      email: String(
        form.get("email") ?? "",
      ),
      password: String(
        form.get("password") ?? "",
      ),
      rememberEmail,
    });
  }

  return (
    <main className="admin-login">
      <form
        onSubmit={submit}
        autoComplete="on"
      >
        <div className="admin-logo">
          M4
        </div>

        <small>
          Área administrativa
        </small>

        <h1>Mesa IV</h1>

        <label className="field">
          <span>E-mail</span>
          <input
            name="email"
            type="email"
            defaultValue={initialEmail}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        </label>

        <label className="field">
          <span>Senha</span>
          <input
            name="password"
            type="password"
            minLength={8}
            autoComplete="current-password"
            required
          />
        </label>

        <label className="admin-remember-login">
          <input
            type="checkbox"
            checked={rememberEmail}
            onChange={(event) =>
              setRememberEmail(
                event.target.checked,
              )
            }
          />
          <span>
            Lembrar e-mail neste
            dispositivo
          </span>
        </label>

        <small className="admin-password-manager-help">
          O navegador pode salvar e
          preencher sua senha. A senha
          não é armazenada pelo Mesa IV.
        </small>

        {mutation.error && (
          <p className="error-text">
            {mutation.error.message}
          </p>
        )}

        <button
          className="primary"
          disabled={mutation.isPending}
        >
          {mutation.isPending
            ? "Entrando..."
            : "Entrar"}
        </button>
      </form>
    </main>
  );
}
