import {
  FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { adminApi } from "../lib/api";

type SecurityStatus = {
  enabled: boolean;
  recoveryCodesRemaining: number;
};

type SetupResponse = {
  qrCodeDataUrl: string;
  manualKey: string;
  expiresAt: string;
};

type ConfirmResponse = {
  enabled: boolean;
  recoveryCodes: string[];
};

type UnlockResponse = {
  token: string;
  expiresAt: string;
  expiresInSeconds: number;
};

export function PixSecurityPanel({
  onAuthorization,
}: {
  onAuthorization: (
    token: string,
  ) => void;
}) {
  const client = useQueryClient();
  const [setup, setSetup] =
    useState<SetupResponse | null>(null);
  const [recoveryCodes, setRecoveryCodes] =
    useState<string[]>([]);
  const [authorizedUntil, setAuthorizedUntil] =
    useState<Date | null>(null);
  const expirationTimer =
    useRef<number | null>(null);

  const status = useQuery({
    queryKey: ["pix-security-status"],
    queryFn: () =>
      adminApi<SecurityStatus>(
        "/admin/security/pix-totp/status",
      ),
  });

  const startSetup = useMutation({
    mutationFn: (password: string) =>
      adminApi<SetupResponse>(
        "/admin/security/pix-totp/setup",
        {
          method: "POST",
          body: JSON.stringify({
            password,
          }),
        },
      ),
    onSuccess: (data) => {
      setSetup(data);
      setRecoveryCodes([]);
    },
  });

  const confirmSetup = useMutation({
    mutationFn: (code: string) =>
      adminApi<ConfirmResponse>(
        "/admin/security/pix-totp/confirm",
        {
          method: "POST",
          body: JSON.stringify({
            code,
          }),
        },
      ),
    onSuccess: (data) => {
      setSetup(null);
      setRecoveryCodes(
        data.recoveryCodes,
      );
      void client.invalidateQueries({
        queryKey: [
          "pix-security-status",
        ],
      });
    },
  });

  const unlock = useMutation({
    mutationFn: (input: {
      password: string;
      code: string;
    }) =>
      adminApi<UnlockResponse>(
        "/admin/security/pix/unlock",
        {
          method: "POST",
          body: JSON.stringify(input),
        },
      ),
    onSuccess: (data) => {
      onAuthorization(data.token);
      const expiresAt =
        new Date(data.expiresAt);
      setAuthorizedUntil(expiresAt);

      if (
        expirationTimer.current !==
        null
      ) {
        window.clearTimeout(
          expirationTimer.current,
        );
      }

      expirationTimer.current =
        window.setTimeout(() => {
          onAuthorization("");
          setAuthorizedUntil(null);
        }, Math.max(
          0,
          expiresAt.getTime() -
            Date.now(),
        ));
    },
  });

  useEffect(
    () => () => {
      if (
        expirationTimer.current !==
        null
      ) {
        window.clearTimeout(
          expirationTimer.current,
        );
      }
    },
    [],
  );

  function submitSetup(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    const form =
      new FormData(event.currentTarget);

    startSetup.mutate(
      String(form.get("password")),
    );
  }

  function submitConfirm(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    const form =
      new FormData(event.currentTarget);

    confirmSetup.mutate(
      String(form.get("code")),
    );
  }

  function submitUnlock(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    const form =
      new FormData(event.currentTarget);

    unlock.mutate({
      password: String(
        form.get("password"),
      ),
      code: String(
        form.get("code"),
      ),
    });
  }

  async function copyRecoveryCodes() {
    await navigator.clipboard.writeText(
      recoveryCodes.join("\n"),
    );
  }

  const enabled =
    status.data?.enabled ?? false;

  return (
    <section className="pix-security-panel">
      <div className="pix-security-heading">
        <div>
          <small>
            Segurança financeira
          </small>
          <h2>
            Proteção do PIX
          </h2>
        </div>

        <span
          className={
            enabled
              ? "pix-security-status enabled"
              : "pix-security-status"
          }
        >
          {enabled
            ? "2FA ativo"
            : "2FA não configurado"}
        </span>
      </div>

      {status.isLoading && (
        <p>
          Verificando segurança...
        </p>
      )}

      {!status.isLoading &&
        !enabled &&
        !setup &&
        recoveryCodes.length ===
          0 && (
          <>
            <p>
              Para alterar dados do PIX,
              configure um aplicativo
              Authenticator. A senha
              administrativa continuará
              sendo exigida junto com o
              código de 6 dígitos.
            </p>

            <form
              className="pix-security-form"
              onSubmit={submitSetup}
            >
              <label className="field">
                <span>
                  Confirme sua senha
                </span>
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  minLength={8}
                />
              </label>

              <button
                className="secondary"
                disabled={
                  startSetup.isPending
                }
              >
                {startSetup.isPending
                  ? "Preparando..."
                  : "Configurar Authenticator"}
              </button>
            </form>

            {startSetup.error && (
              <p className="error-text">
                {
                  startSetup.error
                    .message
                }
              </p>
            )}
          </>
        )}

      {setup && (
        <div className="pix-totp-setup">
          <p>
            Escaneie o QR Code com
            Google Authenticator,
            Microsoft Authenticator ou
            outro aplicativo compatível.
          </p>

          <div className="pix-totp-qr">
            <img
              src={setup.qrCodeDataUrl}
              alt="QR Code para configurar o Authenticator"
            />
          </div>

          <div className="pix-totp-manual">
            <small>
              Chave manual
            </small>
            <code>
              {setup.manualKey}
            </code>
          </div>

          <form
            className="pix-security-form"
            onSubmit={submitConfirm}
          >
            <label className="field">
              <span>
                Código de 6 dígitos
              </span>
              <input
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                required
              />
            </label>

            <button
              className="primary"
              disabled={
                confirmSetup.isPending
              }
            >
              {confirmSetup.isPending
                ? "Confirmando..."
                : "Confirmar e ativar 2FA"}
            </button>
          </form>

          {confirmSetup.error && (
            <p className="error-text">
              {
                confirmSetup.error
                  .message
              }
            </p>
          )}
        </div>
      )}

      {recoveryCodes.length > 0 && (
        <div className="pix-recovery-box">
          <strong>
            Salve estes códigos de
            recuperação agora
          </strong>
          <p>
            Cada código funciona uma
            única vez caso você perca
            acesso ao Authenticator.
            Eles não serão mostrados
            novamente.
          </p>

          <div className="pix-recovery-codes">
            {recoveryCodes.map(
              (code) => (
                <code key={code}>
                  {code}
                </code>
              ),
            )}
          </div>

          <button
            className="secondary"
            type="button"
            onClick={() =>
              void copyRecoveryCodes()
            }
          >
            Copiar códigos
          </button>
        </div>
      )}

      {enabled &&
        recoveryCodes.length ===
          0 && (
          <>
            <p>
              Os dados do PIX ficam
              bloqueados. Para editar,
              confirme novamente sua
              senha e informe o código
              atual do Authenticator.
            </p>

            <form
              className="pix-security-form unlock"
              onSubmit={submitUnlock}
            >
              <label className="field">
                <span>
                  Senha administrativa
                </span>
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  minLength={8}
                />
              </label>

              <label className="field">
                <span>
                  Authenticator ou
                  código de recuperação
                </span>
                <input
                  name="code"
                  autoComplete="one-time-code"
                  inputMode="text"
                  autoCapitalize="characters"
                  placeholder="123456 ou código de recuperação"
                  required
                />
              </label>

              <button
                className="secondary"
                disabled={
                  unlock.isPending
                }
              >
                {unlock.isPending
                  ? "Verificando..."
                  : "Desbloquear alteração do PIX"}
              </button>
            </form>

            {unlock.error && (
              <p className="error-text">
                {unlock.error.message}
              </p>
            )}

            {authorizedUntil && (
              <div className="pix-unlocked-message">
                ✓ PIX desbloqueado para
                uma alteração. A
                autorização expira às{" "}
                {authorizedUntil.toLocaleTimeString(
                  "pt-BR",
                  {
                    hour: "2-digit",
                    minute: "2-digit",
                  },
                )}
                .
              </div>
            )}

            <small className="pix-recovery-remaining">
              Códigos de recuperação
              restantes:{" "}
              {status.data
                ?.recoveryCodesRemaining ??
                0}
            </small>
          </>
        )}
    </section>
  );
}
