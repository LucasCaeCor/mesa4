#!/usr/bin/env node
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import {
  dirname,
  resolve,
} from "node:path";

const root = process.cwd();
const staged = new Map();

function absolute(relative) {
  return resolve(root, relative);
}
function read(relative) {
  if (staged.has(relative)) {
    return staged.get(relative);
  }
  const file = absolute(relative);
  if (!existsSync(file)) {
    throw new Error(
      `Arquivo não encontrado: ${relative}`,
    );
  }
  const content =
    readFileSync(file, "utf8")
      .replace(/\r\n/g, "\n");
  staged.set(relative, content);
  return content;
}
function stage(relative, content) {
  staged.set(relative, content);
}
function fail(message) {
  throw new Error(
    `${message} Nenhum arquivo foi gravado.`,
  );
}

stage(
  "backend/src/modules/security/catalog-security.service.ts",
  "import type {\n  FastifyInstance,\n  FastifyRequest,\n} from \"fastify\";\nimport { HttpError } from \"../../lib/http-error.js\";\n\nconst CATALOG_SCOPE =\n  \"CATALOG_SENSITIVE_WRITE\";\n\ntype CatalogAuthorizationPayload = {\n  sub: string;\n  scope: string;\n  kind: \"STEP_UP\";\n  iat?: number;\n  exp?: number;\n};\n\nexport function createCatalogAuthorization(\n  app: FastifyInstance,\n  adminId: string,\n) {\n  const expiresInSeconds = 10 * 60;\n\n  const token = app.jwt.sign(\n    {\n      sub: adminId,\n      scope: CATALOG_SCOPE,\n      kind: \"STEP_UP\",\n    },\n    {\n      expiresIn: \"10m\",\n    },\n  );\n\n  return {\n    token,\n    expiresAt: new Date(\n      Date.now() +\n        expiresInSeconds * 1000,\n    ),\n    expiresInSeconds,\n  };\n}\n\nexport function requireCatalogAuthorization(\n  app: FastifyInstance,\n  request: FastifyRequest,\n) {\n  const raw =\n    request.headers[\n      \"x-catalog-authorization\"\n    ];\n\n  const token = Array.isArray(raw)\n    ? raw[0]\n    : raw;\n\n  if (!token) {\n    throw new HttpError(\n      403,\n      \"Confirme sua senha e o Authenticator para alterar preços ou itens sensíveis do cardápio\",\n      \"CATALOG_AUTHORIZATION_REQUIRED\",\n    );\n  }\n\n  try {\n    const payload =\n      app.jwt.verify<CatalogAuthorizationPayload>(\n        token,\n      );\n\n    if (\n      payload.sub !== request.user.sub ||\n      payload.scope !== CATALOG_SCOPE ||\n      payload.kind !== \"STEP_UP\"\n    ) {\n      throw new Error(\n        \"Escopo de autorização inválido\",\n      );\n    }\n  } catch {\n    throw new HttpError(\n      403,\n      \"A autorização do cardápio expirou ou é inválida\",\n      \"CATALOG_AUTHORIZATION_INVALID\",\n    );\n  }\n}\n",
);
stage(
  "backend/src/routes/catalog-security.routes.ts",
  "import type {\n  FastifyInstance,\n  FastifyRequest,\n} from \"fastify\";\nimport bcrypt from \"bcryptjs\";\nimport { z } from \"zod\";\nimport { prisma } from \"../lib/prisma.js\";\nimport { HttpError } from \"../lib/http-error.js\";\nimport { decryptSecret } from \"../lib/secret-box.js\";\nimport { verifyTotp } from \"../lib/totp.js\";\nimport {\n  createCatalogAuthorization,\n} from \"../modules/security/catalog-security.service.js\";\n\nconst unlockSchema = z.object({\n  password: z\n    .string()\n    .min(8)\n    .max(200),\n  code: z\n    .string()\n    .trim()\n    .min(6)\n    .max(32),\n});\n\nfunction normalizeRecoveryCode(\n  value: string,\n) {\n  return value\n    .trim()\n    .toUpperCase()\n    .replace(/[^A-F0-9]/g, \"\");\n}\n\nasync function audit(\n  request: FastifyRequest,\n  action: string,\n  metadata?: unknown,\n) {\n  await prisma.auditLog.create({\n    data: {\n      adminId: request.user.sub,\n      action,\n      entity: \"CATALOG_SECURITY\",\n      metadata: metadata as never,\n      ip: request.ip,\n    },\n  });\n}\n\nasync function verifyCredentials(\n  request: FastifyRequest,\n  password: string,\n  code: string,\n) {\n  const admin =\n    await prisma.adminUser.findUnique({\n      where: {\n        id: request.user.sub,\n      },\n    });\n\n  if (\n    !admin ||\n    !admin.active ||\n    !(await bcrypt.compare(\n      password,\n      admin.passwordHash,\n    ))\n  ) {\n    throw new HttpError(\n      401,\n      \"Senha administrativa inválida\",\n      \"INVALID_ADMIN_PASSWORD\",\n    );\n  }\n\n  if (\n    !admin.pixTotpEnabled ||\n    !admin.pixTotpSecretEncrypted\n  ) {\n    throw new HttpError(\n      409,\n      \"Configure o Authenticator em Configurações antes de liberar alterações sensíveis do cardápio\",\n      \"CATALOG_TOTP_NOT_CONFIGURED\",\n    );\n  }\n\n  if (/^\\d{6}$/.test(code.trim())) {\n    const secret = decryptSecret(\n      admin.pixTotpSecretEncrypted,\n    );\n\n    const matchedCounter = verifyTotp(\n      secret,\n      code,\n      {\n        window: 1,\n      },\n    );\n\n    if (matchedCounter === null) {\n      throw new HttpError(\n        401,\n        \"Código do Authenticator inválido\",\n        \"INVALID_TOTP_CODE\",\n      );\n    }\n\n    if (\n      admin.pixTotpLastUsedCounter !==\n        null &&\n      admin.pixTotpLastUsedCounter !==\n        undefined &&\n      matchedCounter <=\n        admin.pixTotpLastUsedCounter\n    ) {\n      throw new HttpError(\n        401,\n        \"Este código já foi utilizado. Aguarde o próximo código do Authenticator\",\n        \"TOTP_CODE_ALREADY_USED\",\n      );\n    }\n\n    await prisma.adminUser.update({\n      where: {\n        id: admin.id,\n      },\n      data: {\n        pixTotpLastUsedCounter:\n          matchedCounter,\n      },\n    });\n\n    return {\n      admin,\n      method: \"TOTP\",\n    } as const;\n  }\n\n  const normalized =\n    normalizeRecoveryCode(code);\n\n  const hashes = Array.isArray(\n    admin.pixTotpRecoveryCodeHashes,\n  )\n    ? admin.pixTotpRecoveryCodeHashes.filter(\n        (\n          item,\n        ): item is string =>\n          typeof item === \"string\",\n      )\n    : [];\n\n  for (\n    let index = 0;\n    index < hashes.length;\n    index += 1\n  ) {\n    if (\n      await bcrypt.compare(\n        normalized,\n        hashes[index],\n      )\n    ) {\n      const remaining = hashes.filter(\n        (_, currentIndex) =>\n          currentIndex !== index,\n      );\n\n      await prisma.adminUser.update({\n        where: {\n          id: admin.id,\n        },\n        data: {\n          pixTotpRecoveryCodeHashes:\n            remaining,\n        },\n      });\n\n      return {\n        admin,\n        method: \"RECOVERY_CODE\",\n      } as const;\n    }\n  }\n\n  throw new HttpError(\n    401,\n    \"Código do Authenticator ou código de recuperação inválido\",\n    \"INVALID_SECOND_FACTOR\",\n  );\n}\n\nexport async function catalogSecurityRoutes(\n  app: FastifyInstance,\n) {\n  app.post(\n    \"/admin/security/catalog/unlock\",\n    {\n      preHandler: app.authenticateAdmin,\n      config: {\n        rateLimit: {\n          max: 5,\n          timeWindow: \"15 minutes\",\n        },\n      },\n    },\n    async (request) => {\n      const input =\n        unlockSchema.parse(request.body);\n\n      const result =\n        await verifyCredentials(\n          request,\n          input.password,\n          input.code,\n        );\n\n      const authorization =\n        createCatalogAuthorization(\n          app,\n          result.admin.id,\n        );\n\n      await audit(\n        request,\n        \"CATALOG_UNLOCKED\",\n        {\n          method: result.method,\n          expiresAt:\n            authorization.expiresAt,\n        },\n      );\n\n      return {\n        token: authorization.token,\n        expiresAt:\n          authorization.expiresAt.toISOString(),\n        expiresInSeconds:\n          authorization.expiresInSeconds,\n      };\n    },\n  );\n}\n",
);
stage(
  "frontend/src/components/CatalogSecurityPanel.tsx",
  "import {\n  FormEvent,\n  useEffect,\n  useRef,\n  useState,\n} from \"react\";\nimport { useMutation } from \"@tanstack/react-query\";\nimport { ShieldCheck } from \"lucide-react\";\nimport { adminApi } from \"../lib/api\";\n\ntype UnlockResponse = {\n  token: string;\n  expiresAt: string;\n  expiresInSeconds: number;\n};\n\nexport function CatalogSecurityPanel({\n  onAuthorization,\n}: {\n  onAuthorization: (\n    token: string,\n  ) => void;\n}) {\n  const [expiresAt, setExpiresAt] =\n    useState<Date | null>(null);\n  const timer =\n    useRef<number | null>(null);\n\n  const unlock = useMutation({\n    mutationFn: (input: {\n      password: string;\n      code: string;\n    }) =>\n      adminApi<UnlockResponse>(\n        \"/admin/security/catalog/unlock\",\n        {\n          method: \"POST\",\n          body: JSON.stringify(input),\n        },\n      ),\n    onSuccess: (data) => {\n      const expiration =\n        new Date(data.expiresAt);\n\n      onAuthorization(data.token);\n      setExpiresAt(expiration);\n\n      if (timer.current !== null) {\n        window.clearTimeout(\n          timer.current,\n        );\n      }\n\n      timer.current =\n        window.setTimeout(() => {\n          onAuthorization(\"\");\n          setExpiresAt(null);\n        }, Math.max(\n          0,\n          expiration.getTime() -\n            Date.now(),\n        ));\n    },\n  });\n\n  useEffect(\n    () => () => {\n      if (timer.current !== null) {\n        window.clearTimeout(\n          timer.current,\n        );\n      }\n    },\n    [],\n  );\n\n  function submit(\n    event: FormEvent<HTMLFormElement>,\n  ) {\n    event.preventDefault();\n\n    const form =\n      new FormData(event.currentTarget);\n\n    unlock.mutate({\n      password: String(\n        form.get(\"password\"),\n      ),\n      code: String(\n        form.get(\"code\"),\n      ),\n    });\n  }\n\n  const unlocked =\n    expiresAt !== null &&\n    expiresAt.getTime() > Date.now();\n\n  return (\n    <section className=\"catalog-security-panel\">\n      <div className=\"catalog-security-title\">\n        <div>\n          <small>\n            Segurança do cardápio\n          </small>\n          <h2>\n            Alterações financeiras\n          </h2>\n        </div>\n\n        <span\n          className={\n            unlocked\n              ? \"catalog-lock-status unlocked\"\n              : \"catalog-lock-status\"\n          }\n        >\n          {unlocked\n            ? \"Desbloqueado\"\n            : \"Protegido\"}\n        </span>\n      </div>\n\n      {unlocked ? (\n        <div className=\"catalog-unlocked\">\n          <ShieldCheck />\n          <div>\n            <strong>\n              Alterações sensíveis\n              liberadas\n            </strong>\n            <small>\n              Até{\" \"}\n              {expiresAt?.toLocaleTimeString(\n                \"pt-BR\",\n                {\n                  hour: \"2-digit\",\n                  minute: \"2-digit\",\n                },\n              )}\n              . O desbloqueio não é salvo\n              no navegador.\n            </small>\n          </div>\n        </div>\n      ) : (\n        <>\n          <p>\n            Criar produtos, salvar\n            preços, excluir produtos e\n            alterar adicionais com\n            preço exige senha +\n            Authenticator.\n          </p>\n\n          <form\n            className=\"catalog-unlock-form\"\n            onSubmit={submit}\n          >\n            <label className=\"field\">\n              <span>\n                Senha administrativa\n              </span>\n              <input\n                name=\"password\"\n                type=\"password\"\n                autoComplete=\"current-password\"\n                minLength={8}\n                required\n              />\n            </label>\n\n            <label className=\"field\">\n              <span>\n                Authenticator\n              </span>\n              <input\n                name=\"code\"\n                inputMode=\"text\"\n                autoComplete=\"one-time-code\"\n                autoCapitalize=\"characters\"\n                placeholder=\"123456\"\n                required\n              />\n            </label>\n\n            <button\n              className=\"secondary\"\n              disabled={unlock.isPending}\n            >\n              <ShieldCheck />\n              {unlock.isPending\n                ? \"Verificando...\"\n                : \"Desbloquear por 10 min\"}\n            </button>\n          </form>\n\n          {unlock.error && (\n            <p className=\"error-text\">\n              {unlock.error.message}\n            </p>\n          )}\n        </>\n      )}\n    </section>\n  );\n}\n",
);

// app.ts ---------------------------------------------------------------------
{
  const relative = "backend/src/app.ts";
  let content = read(relative);

  if (
    !content.includes(
      "catalogSecurityRoutes",
    )
  ) {
    const importNeedle =
      'import { pixSecurityRoutes } from "./routes/pix-security.routes.js";';

    if (!content.includes(importNeedle)) {
      fail(
        "Não encontrei pixSecurityRoutes em app.ts.",
      );
    }

    content = content.replace(
      importNeedle,
      `${importNeedle}
import { catalogSecurityRoutes } from "./routes/catalog-security.routes.js";`,
    );

    const registerNeedle =
      "  await app.register(pixSecurityRoutes);";

    if (!content.includes(registerNeedle)) {
      fail(
        "Não encontrei o registro de pixSecurityRoutes.",
      );
    }

    content = content.replace(
      registerNeedle,
      `${registerNeedle}
  await app.register(catalogSecurityRoutes);`,
    );
  }

  if (
    !content.includes(
      "req.headers.x-catalog-authorization",
    )
  ) {
    const redactNeedle =
      '"req.headers.x-pix-authorization",';

    if (content.includes(redactNeedle)) {
      content = content.replace(
        redactNeedle,
        `${redactNeedle}
        "req.headers.x-catalog-authorization",`,
      );
    }
  }

  stage(relative, content);
}

// CORS -----------------------------------------------------------------------
{
  const relative =
    "backend/src/plugins/security.ts";
  let content = read(relative);

  if (
    !content.includes(
      '"X-Catalog-Authorization"',
    )
  ) {
    const headerPattern =
      /("X-Pix-Authorization",\s*\n)(\s*)\],/;

    if (
      headerPattern.test(content)
    ) {
      content = content.replace(
        headerPattern,
        `$1$2"X-Catalog-Authorization",
$2],`,
      );
    } else {
      const idempotencyPattern =
        /("X-Idempotency-Key",\s*\n)(\s*)\],/;

      if (
        !idempotencyPattern.test(
          content,
        )
      ) {
        fail(
          "Não encontrei allowedHeaders em security.ts.",
        );
      }

      content = content.replace(
        idempotencyPattern,
        `$1$2"X-Catalog-Authorization",
$2],`,
      );
    }
  }

  stage(relative, content);
}

// admin.routes.ts ------------------------------------------------------------
{
  const relative =
    "backend/src/routes/admin.routes.ts";
  let content = read(relative);
  const marker =
    "MESA4_CATALOG_TOTP_PROTECTION_V1";

  if (!content.includes(marker)) {
    const importNeedle =
      'import { requirePixAuthorizationForSettings } from "../modules/security/pix-security.service.js";';

    if (!content.includes(importNeedle)) {
      fail(
        "Não encontrei o import da segurança PIX em admin.routes.ts.",
      );
    }

    content = content.replace(
      importNeedle,
      `${importNeedle}
import { requireCatalogAuthorization } from "../modules/security/catalog-security.service.js";`,
    );

    // Login: reduz 8 para 5 tentativas a cada 15 min.
    content = content.replace(
      /app\.post\("\/admin\/auth\/login", \{ config: \{ rateLimit: \{ max: 8, timeWindow: "15 minutes" \} \} \}/,
      'app.post("/admin/auth/login", { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } }',
    );

    const replacements = [
      [
        `  app.post("/admin/products", { preHandler: app.authenticateAdmin }, async (request, reply) => {
    const input = productSchema.parse(request.body);`,
        `  app.post("/admin/products", { preHandler: app.authenticateAdmin }, async (request, reply) => {
    const input = productSchema.parse(request.body);
    /* ${marker} */
    requireCatalogAuthorization(app, request);`,
      ],
      [
        `  app.patch("/admin/products/:id", { preHandler: app.authenticateAdmin }, async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = productSchema.partial().parse(request.body);`,
        `  app.patch("/admin/products/:id", { preHandler: app.authenticateAdmin }, async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = productSchema.partial().parse(request.body);
    if (input.priceCents !== undefined) {
      requireCatalogAuthorization(app, request);
    }`,
      ],
      [
        `  app.delete("/admin/products/:id", { preHandler: app.authenticateAdmin }, async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);`,
        `  app.delete("/admin/products/:id", { preHandler: app.authenticateAdmin }, async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    requireCatalogAuthorization(app, request);`,
      ],
      [
        `  app.post(
    "/admin/addons",
    { preHandler: app.authenticateAdmin },
    async (request, reply) => {
      const input = addonSchema.parse(request.body);`,
        `  app.post(
    "/admin/addons",
    { preHandler: app.authenticateAdmin },
    async (request, reply) => {
      const input = addonSchema.parse(request.body);
      requireCatalogAuthorization(app, request);`,
      ],
      [
        `      const input =
        addonSchema.partial().parse(request.body);`,
        `      const input =
        addonSchema.partial().parse(request.body);
      if (input.priceCents !== undefined) {
        requireCatalogAuthorization(app, request);
      }`,
      ],
      [
        `      const { id } = z
        .object({ id: z.string() })
        .parse(request.params);

      await prisma.productOption.deleteMany({
        where: { addonLibraryId: id },
      });`,
        `      const { id } = z
        .object({ id: z.string() })
        .parse(request.params);

      requireCatalogAuthorization(app, request);

      await prisma.productOption.deleteMany({
        where: { addonLibraryId: id },
      });`,
      ],
      [
        `  app.post("/admin/option-groups/:groupId/options", { preHandler: app.authenticateAdmin }, async (request, reply) => {
    const { groupId } = z.object({ groupId: z.string() }).parse(request.params);
    const input = optionSchema.parse(request.body);`,
        `  app.post("/admin/option-groups/:groupId/options", { preHandler: app.authenticateAdmin }, async (request, reply) => {
    const { groupId } = z.object({ groupId: z.string() }).parse(request.params);
    const input = optionSchema.parse(request.body);
    requireCatalogAuthorization(app, request);`,
      ],
      [
        `  app.patch("/admin/options/:id", { preHandler: app.authenticateAdmin }, async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = optionSchema.partial().parse(request.body);`,
        `  app.patch("/admin/options/:id", { preHandler: app.authenticateAdmin }, async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = optionSchema.partial().parse(request.body);
    if (input.priceCents !== undefined) {
      requireCatalogAuthorization(app, request);
    }`,
      ],
      [
        `  app.delete("/admin/options/:id", { preHandler: app.authenticateAdmin }, async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);`,
        `  app.delete("/admin/options/:id", { preHandler: app.authenticateAdmin }, async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    requireCatalogAuthorization(app, request);`,
      ],
    ];

    for (
      const [needle, replacement]
      of replacements
    ) {
      if (!content.includes(needle)) {
        fail(
          "A estrutura de uma rota sensível do cardápio está diferente do esperado.",
        );
      }
      content = content.replace(
        needle,
        replacement,
      );
    }

    stage(relative, content);
  }
}

// AdminMenuPage.tsx ----------------------------------------------------------
{
  const relative =
    "frontend/src/pages/AdminMenuPage.tsx";
  let content = read(relative);
  const marker =
    "MESA4_CATALOG_TOTP_PROTECTION_V1";

  if (!content.includes(marker)) {
    const importNeedle =
      'import { AdminNav } from "../components/AdminNav";';

    if (!content.includes(importNeedle)) {
      fail(
        "Não encontrei AdminNav em AdminMenuPage.tsx.",
      );
    }

    content = content.replace(
      importNeedle,
      `${importNeedle}
import { CatalogSecurityPanel } from "../components/CatalogSecurityPanel";`,
    );

    const functionNeedle =
      "export function AdminMenuPage() {\n  const client = useQueryClient();";

    if (!content.includes(functionNeedle)) {
      fail(
        "Não encontrei o início de AdminMenuPage.",
      );
    }

    content = content.replace(
      functionNeedle,
      `export function AdminMenuPage() {
  const client = useQueryClient();
  /* ${marker} */
  const [
    catalogAuthorization,
    setCatalogAuthorization,
  ] = useState("");

  const catalogHeaders =
    catalogAuthorization
      ? {
          "X-Catalog-Authorization":
            catalogAuthorization,
        }
      : undefined;

  function needsCatalogHeader(
    path: string,
    body?: unknown,
  ) {
    const data =
      typeof body === "object" &&
      body !== null
        ? body as Record<string, unknown>
        : {};

    if (
      /^\\/admin\\/products\\/[^/]+$/.test(path) &&
      "priceCents" in data
    ) {
      return true;
    }

    if (
      /^\\/admin\\/addons\\/[^/]+$/.test(path) &&
      "priceCents" in data
    ) {
      return true;
    }

    if (
      /^\\/admin\\/options\\/[^/]+$/.test(path) &&
      "priceCents" in data
    ) {
      return true;
    }

    return false;
  }`,
    );

    // createAddon
    content = content.replace(
      `      adminApi("/admin/addons", {
        method: "POST",
        body: JSON.stringify(body),
      }),`,
      `      adminApi("/admin/addons", {
        method: "POST",
        headers: catalogHeaders,
        body: JSON.stringify(body),
      }),`,
    );

    // patch generic
    content = content.replace(
      `      adminApi(path, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),`,
      `      adminApi(path, {
        method: "PATCH",
        headers:
          needsCatalogHeader(
            path,
            body,
          )
            ? catalogHeaders
            : undefined,
        body: JSON.stringify(body),
      }),`,
    );

    // remove generic
    content = content.replace(
      `      adminApi(path, {
        method: "DELETE",
      }),`,
      `      adminApi(path, {
        method: "DELETE",
        headers:
          /^\\/admin\\/(products|addons|options)\\/[^/]+$/.test(
            path,
          )
            ? catalogHeaders
            : undefined,
      }),`,
    );

    // create generic options
    content = content.replace(
      `      adminApi(path, {
        method: "POST",
        body: JSON.stringify(body),
      }),`,
      `      adminApi(path, {
        method: "POST",
        headers:
          /\\/options$/.test(path)
            ? catalogHeaders
            : undefined,
        body: JSON.stringify(body),
      }),`,
    );

    // create product
    content = content.replace(
      `        {
          method: "POST",
          body: JSON.stringify(product),
        },`,
      `        {
          method: "POST",
          headers: catalogHeaders,
          body: JSON.stringify(product),
        },`,
    );

    // edit product
    content = content.replace(
      `      await adminApi(\`/admin/products/\${id}\`, {
        method: "PATCH",
        body: JSON.stringify(product),
      });`,
      `      await adminApi(\`/admin/products/\${id}\`, {
        method: "PATCH",
        headers: catalogHeaders,
        body: JSON.stringify(product),
      });`,
    );

    const headerNeedle =
      `      </header>

      <section className="addon-library-section">`;

    if (!content.includes(headerNeedle)) {
      fail(
        "Não encontrei a posição para o painel de segurança no Cardápio.",
      );
    }

    content = content.replace(
      headerNeedle,
      `      </header>

      <CatalogSecurityPanel
        onAuthorization={
          setCatalogAuthorization
        }
      />

      <section className="addon-library-section">`,
    );

    stage(relative, content);
  }
}

// CSS ------------------------------------------------------------------------
{
  const relative =
    "frontend/src/styles.css";
  const content = read(relative);

  if (
    !content.includes(
      "MESA4_CATALOG_TOTP_PROTECTION_V1",
    )
  ) {
    stage(
      relative,
      `${content.trimEnd()}

${"\n/* MESA4_CATALOG_TOTP_PROTECTION_V1 */\n.catalog-security-panel {\n  display: grid;\n  gap: 13px;\n  margin: 0 0 22px;\n  padding: 17px;\n  border: 1px solid rgba(109, 181, 255, 0.24);\n  border-radius: 15px;\n  background:\n    linear-gradient(\n      145deg,\n      rgba(56, 128, 201, 0.09),\n      rgba(255, 255, 255, 0.02)\n    );\n}\n\n.catalog-security-title {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n}\n\n.catalog-security-title small {\n  color: #9ed0ff;\n  font-weight: 800;\n  letter-spacing: 0.04em;\n  text-transform: uppercase;\n}\n\n.catalog-security-title h2 {\n  margin: 3px 0 0;\n}\n\n.catalog-lock-status {\n  flex: 0 0 auto;\n  padding: 6px 9px;\n  border: 1px solid rgba(255, 202, 91, 0.28);\n  border-radius: 999px;\n  background: rgba(255, 202, 91, 0.07);\n  color: #ffd678;\n  font-size: 11px;\n  font-weight: 800;\n}\n\n.catalog-lock-status.unlocked {\n  border-color: rgba(83, 228, 124, 0.28);\n  background: rgba(83, 228, 124, 0.08);\n  color: #91efaa;\n}\n\n.catalog-unlock-form {\n  display: grid;\n  grid-template-columns:\n    minmax(0, 1fr)\n    minmax(0, 1fr)\n    auto;\n  align-items: end;\n  gap: 10px;\n}\n\n.catalog-unlocked {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  padding: 11px 12px;\n  border: 1px solid rgba(83, 228, 124, 0.24);\n  border-radius: 11px;\n  background: rgba(83, 228, 124, 0.07);\n  color: #91efaa;\n}\n\n.catalog-unlocked svg {\n  flex: 0 0 auto;\n}\n\n.catalog-unlocked div {\n  display: grid;\n  gap: 2px;\n}\n\n.catalog-unlocked small {\n  color: #b9d9c1;\n}\n\n@media (max-width: 760px) {\n  .catalog-unlock-form {\n    grid-template-columns: 1fr;\n  }\n\n  .catalog-unlock-form button {\n    width: 100%;\n  }\n\n  .catalog-security-title {\n    align-items: flex-start;\n  }\n}\n"}
`,
    );
  }
}

// Backup + write -------------------------------------------------------------
const backupDirectory = absolute(
  `backup-protecao-cardapio-${Date.now()}`,
);

mkdirSync(
  backupDirectory,
  { recursive: true },
);

for (const relative of staged.keys()) {
  const source = absolute(relative);
  if (!existsSync(source)) continue;

  const destination = resolve(
    backupDirectory,
    relative,
  );

  mkdirSync(
    dirname(destination),
    { recursive: true },
  );
  cpSync(source, destination);
}

for (
  const [relative, content]
  of staged.entries()
) {
  const file = absolute(relative);
  mkdirSync(
    dirname(file),
    { recursive: true },
  );
  writeFileSync(
    file,
    content,
    "utf8",
  );
  console.log(`✓ ${relative}`);
}

console.log(`
Proteção TOTP do cardápio aplicada.

Protegido no BACKEND:
  - criar produto;
  - salvar edição com preço;
  - excluir produto;
  - criar adicional;
  - editar preço de adicional;
  - excluir adicional;
  - criar opção com preço;
  - editar preço de opção;
  - excluir opção.

O desbloqueio dura 10 minutos e fica
somente em memória no navegador.

Também reduzimos o login administrativo
para 5 tentativas por 15 minutos.

Agora:

  cd backend
  npm run build

  cd ../frontend
  npm run build

Não precisa executar Prisma.
`);
