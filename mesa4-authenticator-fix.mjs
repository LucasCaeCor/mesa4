#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

function abs(rel) {
  return path.join(ROOT, rel);
}

function read(rel) {
  const p = abs(rel);
  if (!fs.existsSync(p)) {
    throw new Error(`Arquivo não encontrado: ${rel}\nExecute este script na raiz do projeto mesa4.`);
  }
  return fs.readFileSync(p, "utf8");
}

function backup(rel, content) {
  const p = abs(rel);
  const backupPath = `${p}.bak-${stamp}`;
  fs.writeFileSync(backupPath, content, "utf8");
  console.log(`  backup: ${path.relative(ROOT, backupPath)}`);
}

function write(rel, before, after) {
  if (before === after) {
    console.log(`- ${rel}: sem alteração`);
    return;
  }
  backup(rel, before);
  fs.writeFileSync(abs(rel), after, "utf8");
  console.log(`✓ ${rel}`);
}

function replaceOnce(text, needle, replacement, label) {
  const index = text.indexOf(needle);
  if (index < 0) {
    throw new Error(`Não encontrei o ponto de alteração: ${label}`);
  }
  return text.slice(0, index) + replacement + text.slice(index + needle.length);
}

function insertBeforeLastBrace(text, insertion, label) {
  const index = text.lastIndexOf("\n}");
  if (index < 0) {
    throw new Error(`Não encontrei a chave final para: ${label}`);
  }
  return text.slice(0, index) + insertion + text.slice(index);
}

console.log("\nMesa4 — proteção real de ações administrativas com Authenticator\n");

// -----------------------------------------------------------------------------
// 1) Serviço de step-up administrativo
// -----------------------------------------------------------------------------
{
  const rel = "backend/src/modules/security/admin-stepup-security.service.ts";
  const p = abs(rel);
  const existed = fs.existsSync(p);
  const before = existed ? fs.readFileSync(p, "utf8") : "";

  const after = `import type {
  FastifyInstance,
  FastifyRequest,
} from "fastify";
import { HttpError } from "../../lib/http-error.js";

const ADMIN_STEP_UP_SCOPE =
  "ADMIN_SENSITIVE_WRITE";

type AdminStepUpPayload = {
  sub: string;
  scope: string;
  kind: "STEP_UP";
  iat?: number;
  exp?: number;
};

export function createAdminStepUpAuthorization(
  app: FastifyInstance,
  adminId: string,
) {
  const expiresInSeconds = 10 * 60;

  const token = app.jwt.sign(
    {
      sub: adminId,
      scope: ADMIN_STEP_UP_SCOPE,
      kind: "STEP_UP",
    },
    {
      expiresIn: "10m",
    },
  );

  return {
    token,
    expiresAt: new Date(
      Date.now() + expiresInSeconds * 1000,
    ),
    expiresInSeconds,
  };
}

export async function requireAdminStepUpAuthorization(
  app: FastifyInstance,
  request: FastifyRequest,
) {
  // O hook global das rotas sensíveis roda antes do preHandler
  // específico da rota. Por isso validamos também o JWT principal aqui.
  try {
    if (!request.user?.sub) {
      await request.jwtVerify();
    }
  } catch {
    throw new HttpError(
      401,
      "Sessão inválida ou expirada",
      "INVALID_ADMIN_SESSION",
    );
  }

  if (request.user.role !== "ADMIN") {
    throw new HttpError(
      403,
      "Acesso negado",
      "ADMIN_ACCESS_DENIED",
    );
  }

  const raw =
    request.headers["x-admin-authorization"];

  const token = Array.isArray(raw)
    ? raw[0]
    : raw;

  if (!token) {
    throw new HttpError(
      403,
      "Confirme sua senha e o Authenticator para executar esta ação",
      "ADMIN_STEP_UP_REQUIRED",
    );
  }

  try {
    const payload =
      app.jwt.verify<AdminStepUpPayload>(
        token,
      );

    if (
      payload.sub !== request.user.sub ||
      payload.scope !== ADMIN_STEP_UP_SCOPE ||
      payload.kind !== "STEP_UP"
    ) {
      throw new Error(
        "Autorização administrativa inválida",
      );
    }
  } catch {
    throw new HttpError(
      403,
      "A autorização do Authenticator expirou ou é inválida. Desbloqueie novamente",
      "ADMIN_STEP_UP_INVALID",
    );
  }
}
`;

  if (existed && before !== after) {
    backup(rel, before);
  }

  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, after, "utf8");
  console.log(`✓ ${rel}${existed ? " (atualizado)" : " (criado)"}`);
}

// -----------------------------------------------------------------------------
// 2) Rota que emite autorização de 10 min após senha + TOTP
// -----------------------------------------------------------------------------
{
  const rel = "backend/src/routes/pix-security.routes.ts";
  const before = read(rel);
  let after = before;

  if (!after.includes("admin-stepup-security.service.js")) {
    const marker = `import {
  createPixChangeAuthorization,
} from "../modules/security/pix-security.service.js";`;

    const replacement = `${marker}
import {
  createAdminStepUpAuthorization,
} from "../modules/security/admin-stepup-security.service.js";`;

    after = replaceOnce(
      after,
      marker,
      replacement,
      "import do serviço de step-up",
    );
  }

  if (!after.includes('"/admin/security/admin/unlock"')) {
    const route = `
  app.post(
    "/admin/security/admin/unlock",
    {
      preHandler: app.authenticateAdmin,
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "15 minutes",
        },
      },
    },
    async (request) => {
      const input =
        unlockSchema.parse(request.body);

      const admin =
        await getAdminWithPassword(
          request,
          input.password,
        );

      const method =
        await verifySecondFactor(
          admin,
          input.code,
        );

      const authorization =
        createAdminStepUpAuthorization(
          app,
          admin.id,
        );

      await auditSecurity(
        request,
        "ADMIN_SENSITIVE_ACTIONS_UNLOCKED",
        {
          method,
          expiresAt:
            authorization.expiresAt,
        },
      );

      return {
        token: authorization.token,
        expiresAt:
          authorization.expiresAt.toISOString(),
        expiresInSeconds:
          authorization.expiresInSeconds,
      };
    },
  );
`;

    after = insertBeforeLastBrace(
      after,
      route,
      "rota /admin/security/admin/unlock",
    );
  }

  write(rel, before, after);
}

// -----------------------------------------------------------------------------
// 3) Backend: servidor passa a exigir step-up nas rotas sensíveis
// -----------------------------------------------------------------------------
{
  const rel = "backend/src/routes/admin.routes.ts";
  const before = read(rel);
  let after = before;

  if (!after.includes("admin-stepup-security.service.js")) {
    const marker =
      `import { requirePixAuthorizationForSettings } from "../modules/security/pix-security.service.js";`;

    const replacement = `${marker}
import { requireAdminStepUpAuthorization } from "../modules/security/admin-stepup-security.service.js";`;

    after = replaceOnce(
      after,
      marker,
      replacement,
      "import requireAdminStepUpAuthorization",
    );
  }

  if (!after.includes("MESA4_ADMIN_STEP_UP_GUARD_V1")) {
    const marker =
      `export async function adminRoutes(app: FastifyInstance) {`;

    const replacement = `${marker}
  /* MESA4_ADMIN_STEP_UP_GUARD_V1
     Proteção REAL no backend. Mesmo que alguém use DevTools/Postman
     com o JWT de admin, as rotas abaixo exigem um segundo token,
     emitido somente após senha + Authenticator. */
  app.addHook("preHandler", async (request) => {
    const method = request.method.toUpperCase();

    if (
      method !== "POST" &&
      method !== "PUT" &&
      method !== "PATCH" &&
      method !== "DELETE"
    ) {
      return;
    }

    const pathname =
      request.url.split("?")[0];

    const sensitive =
      /^\\/admin\\/orders\\/[^/]+\\/status$/.test(
        pathname,
      ) ||
      pathname.startsWith("/admin/uploads/") ||
      pathname.startsWith("/admin/addons") ||
      pathname.startsWith("/admin/categories") ||
      pathname.startsWith("/admin/products") ||
      pathname.startsWith("/admin/delivery-zones") ||
      pathname.startsWith("/admin/option-groups") ||
      pathname.startsWith("/admin/options") ||
      pathname === "/admin/business-hours";

    if (!sensitive) {
      return;
    }

    await requireAdminStepUpAuthorization(
      app,
      request,
    );
  });
`;

    after = replaceOnce(
      after,
      marker,
      replacement,
      "hook de proteção das rotas administrativas",
    );
  }

  write(rel, before, after);
}

// -----------------------------------------------------------------------------
// 4) Redação de tokens nos logs
// -----------------------------------------------------------------------------
{
  const rel = "backend/src/app.ts";
  const before = read(rel);
  let after = before;

  if (!after.includes('"req.headers.x-admin-authorization"')) {
    const marker = `"req.headers.x-pix-authorization",`;
    const replacement = `${marker}
        "req.headers.x-admin-authorization",
        "req.headers.x-catalog-authorization",`;

    after = replaceOnce(
      after,
      marker,
      replacement,
      "redação dos headers de autorização",
    );
  }

  write(rel, before, after);
}

// -----------------------------------------------------------------------------
// 5) Frontend: adminApi envia automaticamente a autorização temporária
// -----------------------------------------------------------------------------
{
  const rel = "frontend/src/lib/api.ts";
  const before = read(rel);

  if (!before.includes("export function adminApi")) {
    throw new Error(
      `Formato inesperado em ${rel}. Nenhum arquivo restante será alterado.`,
    );
  }

  const after = `const API_URL =
  import.meta.env.VITE_API_URL ?? "http://localhost:3333";

const ADMIN_STEP_UP_TOKEN_KEY =
  "mesa4.admin.stepup.token";
const ADMIN_STEP_UP_EXPIRES_KEY =
  "mesa4.admin.stepup.expiresAt";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown,
  ) {
    super(message);
  }
}

export function setAdminStepUpAuthorization(
  token: string,
  expiresAt: string,
) {
  sessionStorage.setItem(
    ADMIN_STEP_UP_TOKEN_KEY,
    token,
  );
  sessionStorage.setItem(
    ADMIN_STEP_UP_EXPIRES_KEY,
    expiresAt,
  );
}

export function clearAdminStepUpAuthorization() {
  sessionStorage.removeItem(
    ADMIN_STEP_UP_TOKEN_KEY,
  );
  sessionStorage.removeItem(
    ADMIN_STEP_UP_EXPIRES_KEY,
  );
}

function getAdminStepUpAuthorization() {
  const token = sessionStorage.getItem(
    ADMIN_STEP_UP_TOKEN_KEY,
  );
  const expiresAt = sessionStorage.getItem(
    ADMIN_STEP_UP_EXPIRES_KEY,
  );

  if (!token) {
    return null;
  }

  if (
    expiresAt &&
    new Date(expiresAt).getTime() <= Date.now()
  ) {
    clearAdminStepUpAuthorization();
    return null;
  }

  return token;
}

export async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);

  // Só envia Content-Type quando realmente existe um body.
  // FormData configura seu próprio Content-Type automaticamente.
  if (
    init.body !== undefined &&
    init.body !== null &&
    !(init.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set(
      "Content-Type",
      "application/json",
    );
  }

  const response = await fetch(
    \`\${API_URL}\${path}\`,
    {
      ...init,
      headers,
    },
  );

  const data = await response
    .json()
    .catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      data?.message ?? "Erro de comunicação",
      response.status,
      data,
    );
  }

  return data as T;
}

export function adminApi<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = sessionStorage.getItem(
    "mesa4.admin.token",
  );
  const headers = new Headers(init.headers);

  if (token) {
    headers.set(
      "Authorization",
      \`Bearer \${token}\`,
    );
  }

  const method =
    (init.method ?? "GET").toUpperCase();

  if (
    method !== "GET" &&
    method !== "HEAD"
  ) {
    const stepUpToken =
      getAdminStepUpAuthorization();

    if (stepUpToken) {
      headers.set(
        "X-Admin-Authorization",
        stepUpToken,
      );
    }
  }

  return api<T>(path, {
    ...init,
    headers,
  });
}
`;

  write(rel, before, after);
}

// -----------------------------------------------------------------------------
// 6) Painel existente: passa a desbloquear ações administrativas de verdade
// -----------------------------------------------------------------------------
{
  const rel =
    "frontend/src/components/CatalogSecurityPanel.tsx";
  const before = read(rel);
  let after = before;

  if (
    after.includes(
      'import { adminApi } from "../lib/api";',
    )
  ) {
    after = after.replace(
      'import { adminApi } from "../lib/api";',
      `import {
  adminApi,
  clearAdminStepUpAuthorization,
  setAdminStepUpAuthorization,
} from "../lib/api";`,
    );
  }

  after = after.replace(
    '"/admin/security/catalog/unlock"',
    '"/admin/security/admin/unlock"',
  );

  // Torna callback opcional para reutilizar o painel na tela de pedidos.
  after = after.replace(
    `}: {
  onAuthorization: (
    token: string,
  ) => void;
}) {`,
    `}: {
  onAuthorization?: (
    token: string,
  ) => void;
}) {`,
  );

  after = after.replace(
    `      onAuthorization(data.token);
      setExpiresAt(expiration);`,
    `      setAdminStepUpAuthorization(
        data.token,
        data.expiresAt,
      );
      onAuthorization?.(data.token);
      setExpiresAt(expiration);`,
  );

  after = after.replace(
    `          onAuthorization("");
          setExpiresAt(null);`,
    `          clearAdminStepUpAuthorization();
          onAuthorization?.("");
          setExpiresAt(null);`,
  );

  after = after.replace(
    `            Segurança do cardápio`,
    `            Segurança administrativa`,
  );

  after = after.replace(
    `            Alterações financeiras`,
    `            Ações sensíveis`,
  );

  after = after.replace(
    `              Alterações sensíveis
               liberadas`,
    `              Ações sensíveis
               liberadas`,
  );

  after = after.replace(
    `               . O desbloqueio não é salvo
               no navegador.`,
    `               . Válido somente nesta
               sessão do navegador.`,
  );

  after = after.replace(
    `            Criar produtos, salvar
             preços, excluir produtos e
             alterar adicionais com
             preço exige senha +
             Authenticator.`,
    `            Alterar pedidos, criar,
             editar ou excluir itens e
             mudar preços exige senha +
             Authenticator.`,
  );

  write(rel, before, after);
}

// -----------------------------------------------------------------------------
// 7) Exibe o painel também em Pedidos
// -----------------------------------------------------------------------------
{
  const rel =
    "frontend/src/pages/AdminDashboardPage.tsx";
  const before = read(rel);
  let after = before;

  if (
    !after.includes(
      'import { CatalogSecurityPanel } from "../components/CatalogSecurityPanel";',
    )
  ) {
    const marker =
      'import { AdminNav } from "../components/AdminNav";';

    after = replaceOnce(
      after,
      marker,
      `${marker}
import { CatalogSecurityPanel } from "../components/CatalogSecurityPanel";`,
      "import CatalogSecurityPanel no dashboard",
    );
  }

  if (
    !after.includes(
      "MESA4_ADMIN_SECURITY_PANEL_ORDERS_V1",
    )
  ) {
    const marker = `      </header>

      {newOrderAlert.latestOrder && (`;

    const replacement = `      </header>

      {/* MESA4_ADMIN_SECURITY_PANEL_ORDERS_V1 */}
      <CatalogSecurityPanel />

      {newOrderAlert.latestOrder && (`;

    after = replaceOnce(
      after,
      marker,
      replacement,
      "painel de segurança na tela de pedidos",
    );
  }

  write(rel, before, after);
}

// -----------------------------------------------------------------------------
// 8) Logout limpa também a autorização temporária
// -----------------------------------------------------------------------------
{
  const rel =
    "frontend/src/components/AdminNav.tsx";
  const before = read(rel);
  let after = before;

  if (
    !after.includes(
      "clearAdminStepUpAuthorization",
    )
  ) {
    const marker =
      'import { NavLink, useNavigate } from "react-router-dom";';

    after = replaceOnce(
      after,
      marker,
      `${marker}
import { clearAdminStepUpAuthorization } from "../lib/api";`,
      "import clearAdminStepUpAuthorization",
    );

    const oldButton =
      '<button onClick={() => { sessionStorage.removeItem("mesa4.admin.token"); navigate("/admin/login"); }}><LogOut />Sair</button>';

    const newButton =
      '<button onClick={() => { sessionStorage.removeItem("mesa4.admin.token"); clearAdminStepUpAuthorization(); navigate("/admin/login"); }}><LogOut />Sair</button>';

    after = replaceOnce(
      after,
      oldButton,
      newButton,
      "limpeza do step-up no logout",
    );
  }

  write(rel, before, after);
}

console.log(`
Concluído.

O que mudou:
- senha + Authenticator liberam ações sensíveis por 10 minutos;
- PATCH de status dos pedidos é bloqueado no BACKEND sem o segundo fator;
- criar/editar/excluir produtos, categorias, adicionais, opções e zonas é bloqueado no BACKEND;
- upload de imagens e horários de funcionamento também ficam protegidos;
- o token temporário é enviado automaticamente pelo frontend;
- o PIX continua com a proteção específica que já existia;
- tokens sensíveis foram adicionados à lista de redaction dos logs.

Agora rode:

  cd backend
  npm run build

Depois:

  cd ../frontend
  npm run build

Se os dois builds passarem:
  git add .
  git commit -m "security: enforce authenticator on sensitive admin actions"
  git push

Teste obrigatório:
1. entre no admin normalmente;
2. SEM desbloquear o Authenticator, tente alterar o status de um pedido;
   deve retornar 403;
3. desbloqueie com senha + Authenticator;
4. altere o pedido;
   deve funcionar;
5. abra DevTools e remova X-Admin-Authorization de uma requisição;
   o backend deve negar novamente com 403.
`);
