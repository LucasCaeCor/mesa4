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

function filePath(relative) {
  return resolve(root, relative);
}

function read(relative) {
  if (staged.has(relative)) {
    return staged.get(relative);
  }

  const path = filePath(relative);

  if (!existsSync(path)) {
    throw new Error(
      `Arquivo não encontrado: ${relative}`,
    );
  }

  const content =
    readFileSync(path, "utf8")
      .replace(/\r\n/g, "\n");

  staged.set(relative, content);
  return content;
}

function stage(relative, content) {
  staged.set(relative, content);
}

function changed(
  relative,
  before,
  after,
  description,
) {
  if (before === after) {
    throw new Error(
      `Não consegui aplicar: ${description}\n` +
        `Arquivo: ${relative}\n` +
        "Nenhum arquivo foi gravado.",
    );
  }

  stage(relative, after);
}

// -----------------------------------------------------------------------------
// Novos arquivos
// -----------------------------------------------------------------------------

stage(
  "backend/src/lib/totp.ts",
  "import {\n  createHmac,\n  randomBytes,\n  timingSafeEqual,\n} from \"node:crypto\";\n\nconst BASE32_ALPHABET =\n  \"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567\";\nconst DEFAULT_PERIOD_SECONDS = 30;\nconst DEFAULT_DIGITS = 6;\n\nexport function encodeBase32(\n  buffer: Buffer,\n): string {\n  let bits = 0;\n  let value = 0;\n  let output = \"\";\n\n  for (const byte of buffer) {\n    value = (value << 8) | byte;\n    bits += 8;\n\n    while (bits >= 5) {\n      output +=\n        BASE32_ALPHABET[\n          (value >>> (bits - 5)) & 31\n        ];\n      bits -= 5;\n    }\n  }\n\n  if (bits > 0) {\n    output +=\n      BASE32_ALPHABET[\n        (value << (5 - bits)) & 31\n      ];\n  }\n\n  return output;\n}\n\nexport function decodeBase32(\n  input: string,\n): Buffer {\n  const normalized = input\n    .toUpperCase()\n    .replace(/=+$/g, \"\")\n    .replace(/[\\s-]/g, \"\");\n\n  let bits = 0;\n  let value = 0;\n  const bytes: number[] = [];\n\n  for (const character of normalized) {\n    const index =\n      BASE32_ALPHABET.indexOf(character);\n\n    if (index < 0) {\n      throw new Error(\n        \"Segredo TOTP em Base32 inválido\",\n      );\n    }\n\n    value = (value << 5) | index;\n    bits += 5;\n\n    if (bits >= 8) {\n      bytes.push(\n        (value >>> (bits - 8)) & 255,\n      );\n      bits -= 8;\n    }\n  }\n\n  return Buffer.from(bytes);\n}\n\nfunction hotp(\n  secret: string,\n  counter: number,\n  digits = DEFAULT_DIGITS,\n) {\n  const key = decodeBase32(secret);\n  const counterBuffer = Buffer.alloc(8);\n  counterBuffer.writeBigUInt64BE(\n    BigInt(counter),\n  );\n\n  const digest = createHmac(\n    \"sha1\",\n    key,\n  )\n    .update(counterBuffer)\n    .digest();\n\n  const offset =\n    digest[digest.length - 1] & 0x0f;\n\n  const binary =\n    ((digest[offset] & 0x7f) << 24) |\n    ((digest[offset + 1] & 0xff) << 16) |\n    ((digest[offset + 2] & 0xff) << 8) |\n    (digest[offset + 3] & 0xff);\n\n  return String(\n    binary % 10 ** digits,\n  ).padStart(digits, \"0\");\n}\n\nexport function generateTotpSecret() {\n  return encodeBase32(randomBytes(20));\n}\n\nexport function totpForTime(\n  secret: string,\n  timeMs = Date.now(),\n  digits = DEFAULT_DIGITS,\n  periodSeconds = DEFAULT_PERIOD_SECONDS,\n) {\n  const counter = Math.floor(\n    timeMs / 1000 / periodSeconds,\n  );\n\n  return hotp(secret, counter, digits);\n}\n\nexport function verifyTotp(\n  secret: string,\n  code: string,\n  options: {\n    timeMs?: number;\n    window?: number;\n    periodSeconds?: number;\n  } = {},\n): number | null {\n  const normalizedCode =\n    code.trim().replace(/\\s/g, \"\");\n\n  if (!/^\\d{6}$/.test(normalizedCode)) {\n    return null;\n  }\n\n  const periodSeconds =\n    options.periodSeconds ??\n    DEFAULT_PERIOD_SECONDS;\n  const currentCounter = Math.floor(\n    (options.timeMs ?? Date.now()) /\n      1000 /\n      periodSeconds,\n  );\n  const window = options.window ?? 1;\n\n  for (\n    let offset = -window;\n    offset <= window;\n    offset += 1\n  ) {\n    const counter =\n      currentCounter + offset;\n\n    if (counter < 0) {\n      continue;\n    }\n\n    const expected = hotp(\n      secret,\n      counter,\n    );\n    const expectedBuffer =\n      Buffer.from(expected);\n    const receivedBuffer =\n      Buffer.from(normalizedCode);\n\n    if (\n      expectedBuffer.length ===\n        receivedBuffer.length &&\n      timingSafeEqual(\n        expectedBuffer,\n        receivedBuffer,\n      )\n    ) {\n      return counter;\n    }\n  }\n\n  return null;\n}\n\nexport function buildOtpAuthUri(input: {\n  secret: string;\n  accountName: string;\n  issuer: string;\n}) {\n  const label =\n    `${encodeURIComponent(input.issuer)}:` +\n    encodeURIComponent(input.accountName);\n\n  const query = new URLSearchParams({\n    secret: input.secret,\n    issuer: input.issuer,\n    algorithm: \"SHA1\",\n    digits: String(DEFAULT_DIGITS),\n    period: String(DEFAULT_PERIOD_SECONDS),\n  });\n\n  return `otpauth://totp/${label}?${query.toString()}`;\n}\n",
);
stage(
  "backend/src/lib/secret-box.ts",
  "import {\n  createCipheriv,\n  createDecipheriv,\n  randomBytes,\n} from \"node:crypto\";\nimport { env } from \"../config/env.js\";\n\nfunction getEncryptionKey() {\n  const key = Buffer.from(\n    env.PIX_TOTP_ENCRYPTION_KEY,\n    \"base64\",\n  );\n\n  if (key.length !== 32) {\n    throw new Error(\n      \"PIX_TOTP_ENCRYPTION_KEY precisa conter exatamente 32 bytes em Base64\",\n    );\n  }\n\n  return key;\n}\n\nexport function encryptSecret(\n  value: string,\n) {\n  const iv = randomBytes(12);\n  const cipher = createCipheriv(\n    \"aes-256-gcm\",\n    getEncryptionKey(),\n    iv,\n  );\n\n  const ciphertext = Buffer.concat([\n    cipher.update(\n      value,\n      \"utf8\",\n    ),\n    cipher.final(),\n  ]);\n  const authTag = cipher.getAuthTag();\n\n  return [\n    \"v1\",\n    iv.toString(\"base64url\"),\n    authTag.toString(\"base64url\"),\n    ciphertext.toString(\"base64url\"),\n  ].join(\".\");\n}\n\nexport function decryptSecret(\n  encrypted: string,\n) {\n  const [\n    version,\n    ivEncoded,\n    authTagEncoded,\n    ciphertextEncoded,\n  ] = encrypted.split(\".\");\n\n  if (\n    version !== \"v1\" ||\n    !ivEncoded ||\n    !authTagEncoded ||\n    !ciphertextEncoded\n  ) {\n    throw new Error(\n      \"Formato do segredo criptografado inválido\",\n    );\n  }\n\n  const decipher = createDecipheriv(\n    \"aes-256-gcm\",\n    getEncryptionKey(),\n    Buffer.from(ivEncoded, \"base64url\"),\n  );\n\n  decipher.setAuthTag(\n    Buffer.from(\n      authTagEncoded,\n      \"base64url\",\n    ),\n  );\n\n  const plaintext = Buffer.concat([\n    decipher.update(\n      Buffer.from(\n        ciphertextEncoded,\n        \"base64url\",\n      ),\n    ),\n    decipher.final(),\n  ]);\n\n  return plaintext.toString(\"utf8\");\n}\n",
);
stage(
  "backend/src/modules/security/pix-security.service.ts",
  "import {\n  createHash,\n  randomBytes,\n} from \"node:crypto\";\nimport { prisma } from \"../../lib/prisma.js\";\nimport { HttpError } from \"../../lib/http-error.js\";\n\nconst PIX_FIELDS = [\n  \"pixEnabled\",\n  \"pixPaymentMode\",\n  \"manualPixKeyType\",\n  \"manualPixKey\",\n  \"manualPixReceiverName\",\n  \"manualPixReceiverCity\",\n] as const;\n\ntype SettingsLike =\n  | Record<string, unknown>\n  | null\n  | undefined;\n\nfunction normalizeValue(\n  value: unknown,\n) {\n  if (\n    value === undefined ||\n    value === \"\"\n  ) {\n    return null;\n  }\n\n  return value;\n}\n\nexport function pixSettingsChanged(\n  current: SettingsLike,\n  next: SettingsLike,\n) {\n  if (!next) {\n    return false;\n  }\n\n  return PIX_FIELDS.some((field) => {\n    return (\n      normalizeValue(current?.[field]) !==\n      normalizeValue(next[field])\n    );\n  });\n}\n\nexport function hashPixAuthorizationToken(\n  token: string,\n) {\n  return createHash(\"sha256\")\n    .update(token)\n    .digest(\"hex\");\n}\n\nexport async function createPixChangeAuthorization(\n  adminId: string,\n) {\n  const token = randomBytes(32)\n    .toString(\"base64url\");\n  const tokenHash =\n    hashPixAuthorizationToken(token);\n  const expiresAt = new Date(\n    Date.now() + 5 * 60 * 1000,\n  );\n\n  await prisma.pixChangeAuthorization.create({\n    data: {\n      adminId,\n      tokenHash,\n      expiresAt,\n    },\n  });\n\n  return {\n    token,\n    expiresAt,\n    expiresInSeconds: 5 * 60,\n  };\n}\n\nexport async function requirePixAuthorizationForSettings(\n  input: {\n    adminId: string;\n    token:\n      | string\n      | string[]\n      | undefined;\n    currentSettings: SettingsLike;\n    nextSettings: SettingsLike;\n  },\n) {\n  if (\n    !pixSettingsChanged(\n      input.currentSettings,\n      input.nextSettings,\n    )\n  ) {\n    return;\n  }\n\n  const admin =\n    await prisma.adminUser.findUnique({\n      where: {\n        id: input.adminId,\n      },\n      select: {\n        pixTotpEnabled: true,\n      },\n    });\n\n  if (!admin?.pixTotpEnabled) {\n    throw new HttpError(\n      403,\n      \"Configure a autenticação de dois fatores antes de alterar os dados do Pix\",\n      \"PIX_TOTP_REQUIRED\",\n    );\n  }\n\n  const token = Array.isArray(input.token)\n    ? input.token[0]\n    : input.token;\n\n  if (!token) {\n    throw new HttpError(\n      403,\n      \"Confirme sua senha e o código do Authenticator para alterar o Pix\",\n      \"PIX_AUTHORIZATION_REQUIRED\",\n    );\n  }\n\n  const now = new Date();\n  const tokenHash =\n    hashPixAuthorizationToken(token);\n\n  const consumed =\n    await prisma.pixChangeAuthorization.updateMany({\n      where: {\n        adminId: input.adminId,\n        tokenHash,\n        usedAt: null,\n        expiresAt: {\n          gt: now,\n        },\n      },\n      data: {\n        usedAt: now,\n      },\n    });\n\n  if (consumed.count !== 1) {\n    throw new HttpError(\n      403,\n      \"A autorização para alterar o Pix expirou ou já foi utilizada\",\n      \"PIX_AUTHORIZATION_INVALID\",\n    );\n  }\n}\n",
);
stage(
  "backend/src/routes/pix-security.routes.ts",
  "import type {\n  FastifyInstance,\n  FastifyRequest,\n} from \"fastify\";\nimport bcrypt from \"bcryptjs\";\nimport QRCode from \"qrcode\";\nimport { randomBytes } from \"node:crypto\";\nimport { z } from \"zod\";\nimport { prisma } from \"../lib/prisma.js\";\nimport { HttpError } from \"../lib/http-error.js\";\nimport {\n  decryptSecret,\n  encryptSecret,\n} from \"../lib/secret-box.js\";\nimport {\n  buildOtpAuthUri,\n  generateTotpSecret,\n  verifyTotp,\n} from \"../lib/totp.js\";\nimport {\n  createPixChangeAuthorization,\n} from \"../modules/security/pix-security.service.js\";\n\nconst passwordSchema = z.object({\n  password: z\n    .string()\n    .min(8)\n    .max(200),\n});\n\nconst confirmSchema = z.object({\n  code: z\n    .string()\n    .trim()\n    .regex(/^\\d{6}$/),\n});\n\nconst unlockSchema = z.object({\n  password: z\n    .string()\n    .min(8)\n    .max(200),\n  code: z\n    .string()\n    .trim()\n    .min(6)\n    .max(32),\n});\n\nfunction normalizeRecoveryCode(\n  value: string,\n) {\n  return value\n    .trim()\n    .toUpperCase()\n    .replace(/[^A-F0-9]/g, \"\");\n}\n\nfunction generateRecoveryCodes() {\n  return Array.from(\n    { length: 8 },\n    () => {\n      const raw = randomBytes(8)\n        .toString(\"hex\")\n        .toUpperCase();\n\n      return raw.match(/.{1,4}/g)!.join(\"-\");\n    },\n  );\n}\n\nasync function auditSecurity(\n  request: FastifyRequest,\n  action: string,\n  metadata?: unknown,\n) {\n  await prisma.auditLog.create({\n    data: {\n      adminId: request.user?.sub,\n      action,\n      entity: \"PIX_SECURITY\",\n      metadata: metadata as never,\n      ip: request.ip,\n    },\n  });\n}\n\nasync function getAdminWithPassword(\n  request: FastifyRequest,\n  password: string,\n) {\n  const admin =\n    await prisma.adminUser.findUnique({\n      where: {\n        id: request.user.sub,\n      },\n    });\n\n  if (\n    !admin ||\n    !admin.active ||\n    !(await bcrypt.compare(\n      password,\n      admin.passwordHash,\n    ))\n  ) {\n    throw new HttpError(\n      401,\n      \"Senha administrativa inválida\",\n      \"INVALID_ADMIN_PASSWORD\",\n    );\n  }\n\n  return admin;\n}\n\nasync function verifySecondFactor(\n  admin: Awaited<\n    ReturnType<\n      typeof prisma.adminUser.findUnique\n    >\n  >,\n  code: string,\n) {\n  if (\n    !admin ||\n    !admin.pixTotpEnabled ||\n    !admin.pixTotpSecretEncrypted\n  ) {\n    throw new HttpError(\n      409,\n      \"O Authenticator ainda não foi configurado\",\n      \"PIX_TOTP_NOT_CONFIGURED\",\n    );\n  }\n\n  if (/^\\d{6}$/.test(code.trim())) {\n    const secret = decryptSecret(\n      admin.pixTotpSecretEncrypted,\n    );\n    const matchedCounter = verifyTotp(\n      secret,\n      code,\n      {\n        window: 1,\n      },\n    );\n\n    if (matchedCounter === null) {\n      throw new HttpError(\n        401,\n        \"Código do Authenticator inválido\",\n        \"INVALID_TOTP_CODE\",\n      );\n    }\n\n    if (\n      admin.pixTotpLastUsedCounter !==\n        null &&\n      admin.pixTotpLastUsedCounter !==\n        undefined &&\n      matchedCounter <=\n        admin.pixTotpLastUsedCounter\n    ) {\n      throw new HttpError(\n        401,\n        \"Este código já foi utilizado. Aguarde o próximo código do Authenticator\",\n        \"TOTP_CODE_ALREADY_USED\",\n      );\n    }\n\n    await prisma.adminUser.update({\n      where: {\n        id: admin.id,\n      },\n      data: {\n        pixTotpLastUsedCounter:\n          matchedCounter,\n      },\n    });\n\n    return \"TOTP\" as const;\n  }\n\n  const normalized =\n    normalizeRecoveryCode(code);\n  const hashes = Array.isArray(\n    admin.pixTotpRecoveryCodeHashes,\n  )\n    ? admin.pixTotpRecoveryCodeHashes.filter(\n        (\n          item,\n        ): item is string =>\n          typeof item === \"string\",\n      )\n    : [];\n\n  for (\n    let index = 0;\n    index < hashes.length;\n    index += 1\n  ) {\n    if (\n      await bcrypt.compare(\n        normalized,\n        hashes[index],\n      )\n    ) {\n      const remaining = hashes.filter(\n        (_, currentIndex) =>\n          currentIndex !== index,\n      );\n\n      await prisma.adminUser.update({\n        where: {\n          id: admin.id,\n        },\n        data: {\n          pixTotpRecoveryCodeHashes:\n            remaining,\n        },\n      });\n\n      return \"RECOVERY_CODE\" as const;\n    }\n  }\n\n  throw new HttpError(\n    401,\n    \"Código do Authenticator ou código de recuperação inválido\",\n    \"INVALID_SECOND_FACTOR\",\n  );\n}\n\nexport async function pixSecurityRoutes(\n  app: FastifyInstance,\n) {\n  app.get(\n    \"/admin/security/pix-totp/status\",\n    {\n      preHandler: app.authenticateAdmin,\n    },\n    async (request) => {\n      const admin =\n        await prisma.adminUser.findUnique({\n          where: {\n            id: request.user.sub,\n          },\n          select: {\n            pixTotpEnabled: true,\n            pixTotpRecoveryCodeHashes:\n              true,\n          },\n        });\n\n      return {\n        enabled:\n          admin?.pixTotpEnabled ?? false,\n        recoveryCodesRemaining:\n          Array.isArray(\n            admin?.pixTotpRecoveryCodeHashes,\n          )\n            ? admin\n                .pixTotpRecoveryCodeHashes\n                .length\n            : 0,\n      };\n    },\n  );\n\n  app.post(\n    \"/admin/security/pix-totp/setup\",\n    {\n      preHandler: app.authenticateAdmin,\n      config: {\n        rateLimit: {\n          max: 5,\n          timeWindow: \"15 minutes\",\n        },\n      },\n    },\n    async (request) => {\n      const input =\n        passwordSchema.parse(request.body);\n      const admin =\n        await getAdminWithPassword(\n          request,\n          input.password,\n        );\n\n      if (admin.pixTotpEnabled) {\n        throw new HttpError(\n          409,\n          \"A autenticação do Pix já está configurada\",\n          \"PIX_TOTP_ALREADY_ENABLED\",\n        );\n      }\n\n      const secret =\n        generateTotpSecret();\n      const pendingExpiresAt =\n        new Date(\n          Date.now() + 10 * 60 * 1000,\n        );\n\n      await prisma.adminUser.update({\n        where: {\n          id: admin.id,\n        },\n        data: {\n          pixTotpPendingSecretEncrypted:\n            encryptSecret(secret),\n          pixTotpPendingExpiresAt:\n            pendingExpiresAt,\n        },\n      });\n\n      const issuer = \"Mesa IV Burgers\";\n      const otpauthUri =\n        buildOtpAuthUri({\n          secret,\n          accountName: admin.email,\n          issuer,\n        });\n      const qrCodeDataUrl =\n        await QRCode.toDataURL(\n          otpauthUri,\n          {\n            width: 260,\n            margin: 1,\n            errorCorrectionLevel: \"M\",\n          },\n        );\n\n      await auditSecurity(\n        request,\n        \"PIX_TOTP_SETUP_STARTED\",\n      );\n\n      return {\n        qrCodeDataUrl,\n        manualKey: secret,\n        expiresAt:\n          pendingExpiresAt.toISOString(),\n      };\n    },\n  );\n\n  app.post(\n    \"/admin/security/pix-totp/confirm\",\n    {\n      preHandler: app.authenticateAdmin,\n      config: {\n        rateLimit: {\n          max: 8,\n          timeWindow: \"15 minutes\",\n        },\n      },\n    },\n    async (request) => {\n      const input =\n        confirmSchema.parse(request.body);\n      const admin =\n        await prisma.adminUser.findUnique({\n          where: {\n            id: request.user.sub,\n          },\n        });\n\n      if (\n        !admin ||\n        !admin\n          .pixTotpPendingSecretEncrypted ||\n        !admin.pixTotpPendingExpiresAt ||\n        admin.pixTotpPendingExpiresAt <\n          new Date()\n      ) {\n        throw new HttpError(\n          409,\n          \"A configuração do Authenticator expirou. Inicie novamente\",\n          \"PIX_TOTP_SETUP_EXPIRED\",\n        );\n      }\n\n      const secret = decryptSecret(\n        admin\n          .pixTotpPendingSecretEncrypted,\n      );\n      const matchedCounter =\n        verifyTotp(\n          secret,\n          input.code,\n          {\n            window: 1,\n          },\n        );\n\n      if (matchedCounter === null) {\n        throw new HttpError(\n          401,\n          \"Código do Authenticator inválido\",\n          \"INVALID_TOTP_CODE\",\n        );\n      }\n\n      const recoveryCodes =\n        generateRecoveryCodes();\n      const recoveryHashes =\n        await Promise.all(\n          recoveryCodes.map(\n            (code) =>\n              bcrypt.hash(\n                normalizeRecoveryCode(\n                  code,\n                ),\n                10,\n              ),\n          ),\n        );\n\n      await prisma.adminUser.update({\n        where: {\n          id: admin.id,\n        },\n        data: {\n          pixTotpEnabled: true,\n          pixTotpSecretEncrypted:\n            admin\n              .pixTotpPendingSecretEncrypted,\n          pixTotpPendingSecretEncrypted:\n            null,\n          pixTotpPendingExpiresAt:\n            null,\n          pixTotpLastUsedCounter:\n            matchedCounter,\n          pixTotpRecoveryCodeHashes:\n            recoveryHashes,\n        },\n      });\n\n      await auditSecurity(\n        request,\n        \"PIX_TOTP_ENABLED\",\n        {\n          recoveryCodesGenerated:\n            recoveryCodes.length,\n        },\n      );\n\n      return {\n        enabled: true,\n        recoveryCodes,\n      };\n    },\n  );\n\n  app.post(\n    \"/admin/security/pix/unlock\",\n    {\n      preHandler: app.authenticateAdmin,\n      config: {\n        rateLimit: {\n          max: 5,\n          timeWindow: \"15 minutes\",\n        },\n      },\n    },\n    async (request) => {\n      const input =\n        unlockSchema.parse(request.body);\n      const admin =\n        await getAdminWithPassword(\n          request,\n          input.password,\n        );\n\n      const method =\n        await verifySecondFactor(\n          admin,\n          input.code,\n        );\n\n      const authorization =\n        await createPixChangeAuthorization(\n          admin.id,\n        );\n\n      await auditSecurity(\n        request,\n        \"PIX_SETTINGS_UNLOCKED\",\n        {\n          method,\n          expiresAt:\n            authorization.expiresAt,\n        },\n      );\n\n      return {\n        token: authorization.token,\n        expiresAt:\n          authorization.expiresAt.toISOString(),\n        expiresInSeconds:\n          authorization.expiresInSeconds,\n      };\n    },\n  );\n}\n",
);
stage(
  "frontend/src/components/PixSecurityPanel.tsx",
  "import {\n  FormEvent,\n  useEffect,\n  useRef,\n  useState,\n} from \"react\";\nimport {\n  useMutation,\n  useQuery,\n  useQueryClient,\n} from \"@tanstack/react-query\";\nimport { adminApi } from \"../lib/api\";\n\ntype SecurityStatus = {\n  enabled: boolean;\n  recoveryCodesRemaining: number;\n};\n\ntype SetupResponse = {\n  qrCodeDataUrl: string;\n  manualKey: string;\n  expiresAt: string;\n};\n\ntype ConfirmResponse = {\n  enabled: boolean;\n  recoveryCodes: string[];\n};\n\ntype UnlockResponse = {\n  token: string;\n  expiresAt: string;\n  expiresInSeconds: number;\n};\n\nexport function PixSecurityPanel({\n  onAuthorization,\n}: {\n  onAuthorization: (\n    token: string,\n  ) => void;\n}) {\n  const client = useQueryClient();\n  const [setup, setSetup] =\n    useState<SetupResponse | null>(null);\n  const [recoveryCodes, setRecoveryCodes] =\n    useState<string[]>([]);\n  const [authorizedUntil, setAuthorizedUntil] =\n    useState<Date | null>(null);\n  const expirationTimer =\n    useRef<number | null>(null);\n\n  const status = useQuery({\n    queryKey: [\"pix-security-status\"],\n    queryFn: () =>\n      adminApi<SecurityStatus>(\n        \"/admin/security/pix-totp/status\",\n      ),\n  });\n\n  const startSetup = useMutation({\n    mutationFn: (password: string) =>\n      adminApi<SetupResponse>(\n        \"/admin/security/pix-totp/setup\",\n        {\n          method: \"POST\",\n          body: JSON.stringify({\n            password,\n          }),\n        },\n      ),\n    onSuccess: (data) => {\n      setSetup(data);\n      setRecoveryCodes([]);\n    },\n  });\n\n  const confirmSetup = useMutation({\n    mutationFn: (code: string) =>\n      adminApi<ConfirmResponse>(\n        \"/admin/security/pix-totp/confirm\",\n        {\n          method: \"POST\",\n          body: JSON.stringify({\n            code,\n          }),\n        },\n      ),\n    onSuccess: (data) => {\n      setSetup(null);\n      setRecoveryCodes(\n        data.recoveryCodes,\n      );\n      void client.invalidateQueries({\n        queryKey: [\n          \"pix-security-status\",\n        ],\n      });\n    },\n  });\n\n  const unlock = useMutation({\n    mutationFn: (input: {\n      password: string;\n      code: string;\n    }) =>\n      adminApi<UnlockResponse>(\n        \"/admin/security/pix/unlock\",\n        {\n          method: \"POST\",\n          body: JSON.stringify(input),\n        },\n      ),\n    onSuccess: (data) => {\n      onAuthorization(data.token);\n      const expiresAt =\n        new Date(data.expiresAt);\n      setAuthorizedUntil(expiresAt);\n\n      if (\n        expirationTimer.current !==\n        null\n      ) {\n        window.clearTimeout(\n          expirationTimer.current,\n        );\n      }\n\n      expirationTimer.current =\n        window.setTimeout(() => {\n          onAuthorization(\"\");\n          setAuthorizedUntil(null);\n        }, Math.max(\n          0,\n          expiresAt.getTime() -\n            Date.now(),\n        ));\n    },\n  });\n\n  useEffect(\n    () => () => {\n      if (\n        expirationTimer.current !==\n        null\n      ) {\n        window.clearTimeout(\n          expirationTimer.current,\n        );\n      }\n    },\n    [],\n  );\n\n  function submitSetup(\n    event: FormEvent<HTMLFormElement>,\n  ) {\n    event.preventDefault();\n    const form =\n      new FormData(event.currentTarget);\n\n    startSetup.mutate(\n      String(form.get(\"password\")),\n    );\n  }\n\n  function submitConfirm(\n    event: FormEvent<HTMLFormElement>,\n  ) {\n    event.preventDefault();\n    const form =\n      new FormData(event.currentTarget);\n\n    confirmSetup.mutate(\n      String(form.get(\"code\")),\n    );\n  }\n\n  function submitUnlock(\n    event: FormEvent<HTMLFormElement>,\n  ) {\n    event.preventDefault();\n    const form =\n      new FormData(event.currentTarget);\n\n    unlock.mutate({\n      password: String(\n        form.get(\"password\"),\n      ),\n      code: String(\n        form.get(\"code\"),\n      ),\n    });\n  }\n\n  async function copyRecoveryCodes() {\n    await navigator.clipboard.writeText(\n      recoveryCodes.join(\"\\n\"),\n    );\n  }\n\n  const enabled =\n    status.data?.enabled ?? false;\n\n  return (\n    <section className=\"pix-security-panel\">\n      <div className=\"pix-security-heading\">\n        <div>\n          <small>\n            Segurança financeira\n          </small>\n          <h2>\n            Proteção do PIX\n          </h2>\n        </div>\n\n        <span\n          className={\n            enabled\n              ? \"pix-security-status enabled\"\n              : \"pix-security-status\"\n          }\n        >\n          {enabled\n            ? \"2FA ativo\"\n            : \"2FA não configurado\"}\n        </span>\n      </div>\n\n      {status.isLoading && (\n        <p>\n          Verificando segurança...\n        </p>\n      )}\n\n      {!status.isLoading &&\n        !enabled &&\n        !setup &&\n        recoveryCodes.length ===\n          0 && (\n          <>\n            <p>\n              Para alterar dados do PIX,\n              configure um aplicativo\n              Authenticator. A senha\n              administrativa continuará\n              sendo exigida junto com o\n              código de 6 dígitos.\n            </p>\n\n            <form\n              className=\"pix-security-form\"\n              onSubmit={submitSetup}\n            >\n              <label className=\"field\">\n                <span>\n                  Confirme sua senha\n                </span>\n                <input\n                  name=\"password\"\n                  type=\"password\"\n                  autoComplete=\"current-password\"\n                  required\n                  minLength={8}\n                />\n              </label>\n\n              <button\n                className=\"secondary\"\n                disabled={\n                  startSetup.isPending\n                }\n              >\n                {startSetup.isPending\n                  ? \"Preparando...\"\n                  : \"Configurar Authenticator\"}\n              </button>\n            </form>\n\n            {startSetup.error && (\n              <p className=\"error-text\">\n                {\n                  startSetup.error\n                    .message\n                }\n              </p>\n            )}\n          </>\n        )}\n\n      {setup && (\n        <div className=\"pix-totp-setup\">\n          <p>\n            Escaneie o QR Code com\n            Google Authenticator,\n            Microsoft Authenticator ou\n            outro aplicativo compatível.\n          </p>\n\n          <div className=\"pix-totp-qr\">\n            <img\n              src={setup.qrCodeDataUrl}\n              alt=\"QR Code para configurar o Authenticator\"\n            />\n          </div>\n\n          <div className=\"pix-totp-manual\">\n            <small>\n              Chave manual\n            </small>\n            <code>\n              {setup.manualKey}\n            </code>\n          </div>\n\n          <form\n            className=\"pix-security-form\"\n            onSubmit={submitConfirm}\n          >\n            <label className=\"field\">\n              <span>\n                Código de 6 dígitos\n              </span>\n              <input\n                name=\"code\"\n                inputMode=\"numeric\"\n                autoComplete=\"one-time-code\"\n                pattern=\"\\d{6}\"\n                maxLength={6}\n                required\n              />\n            </label>\n\n            <button\n              className=\"primary\"\n              disabled={\n                confirmSetup.isPending\n              }\n            >\n              {confirmSetup.isPending\n                ? \"Confirmando...\"\n                : \"Confirmar e ativar 2FA\"}\n            </button>\n          </form>\n\n          {confirmSetup.error && (\n            <p className=\"error-text\">\n              {\n                confirmSetup.error\n                  .message\n              }\n            </p>\n          )}\n        </div>\n      )}\n\n      {recoveryCodes.length > 0 && (\n        <div className=\"pix-recovery-box\">\n          <strong>\n            Salve estes códigos de\n            recuperação agora\n          </strong>\n          <p>\n            Cada código funciona uma\n            única vez caso você perca\n            acesso ao Authenticator.\n            Eles não serão mostrados\n            novamente.\n          </p>\n\n          <div className=\"pix-recovery-codes\">\n            {recoveryCodes.map(\n              (code) => (\n                <code key={code}>\n                  {code}\n                </code>\n              ),\n            )}\n          </div>\n\n          <button\n            className=\"secondary\"\n            type=\"button\"\n            onClick={() =>\n              void copyRecoveryCodes()\n            }\n          >\n            Copiar códigos\n          </button>\n        </div>\n      )}\n\n      {enabled &&\n        recoveryCodes.length ===\n          0 && (\n          <>\n            <p>\n              Os dados do PIX ficam\n              bloqueados. Para editar,\n              confirme novamente sua\n              senha e informe o código\n              atual do Authenticator.\n            </p>\n\n            <form\n              className=\"pix-security-form unlock\"\n              onSubmit={submitUnlock}\n            >\n              <label className=\"field\">\n                <span>\n                  Senha administrativa\n                </span>\n                <input\n                  name=\"password\"\n                  type=\"password\"\n                  autoComplete=\"current-password\"\n                  required\n                  minLength={8}\n                />\n              </label>\n\n              <label className=\"field\">\n                <span>\n                  Authenticator ou\n                  código de recuperação\n                </span>\n                <input\n                  name=\"code\"\n                  autoComplete=\"one-time-code\"\n                  inputMode=\"numeric\"\n                  placeholder=\"123456\"\n                  required\n                />\n              </label>\n\n              <button\n                className=\"secondary\"\n                disabled={\n                  unlock.isPending\n                }\n              >\n                {unlock.isPending\n                  ? \"Verificando...\"\n                  : \"Desbloquear alteração do PIX\"}\n              </button>\n            </form>\n\n            {unlock.error && (\n              <p className=\"error-text\">\n                {unlock.error.message}\n              </p>\n            )}\n\n            {authorizedUntil && (\n              <div className=\"pix-unlocked-message\">\n                ✓ PIX desbloqueado para\n                uma alteração. A\n                autorização expira às{\" \"}\n                {authorizedUntil.toLocaleTimeString(\n                  \"pt-BR\",\n                  {\n                    hour: \"2-digit\",\n                    minute: \"2-digit\",\n                  },\n                )}\n                .\n              </div>\n            )}\n\n            <small className=\"pix-recovery-remaining\">\n              Códigos de recuperação\n              restantes:{\" \"}\n              {status.data\n                ?.recoveryCodesRemaining ??\n                0}\n            </small>\n          </>\n        )}\n    </section>\n  );\n}\n",
);

// -----------------------------------------------------------------------------
// Prisma
// -----------------------------------------------------------------------------

{
  const relative =
    "backend/prisma/schema.prisma";
  let content = read(relative);
  const marker =
    "pixTotpEnabled";

  if (!content.includes(marker)) {
    const relationNeedle =
      "  auditLogs    AuditLog[]";

    if (!content.includes(relationNeedle)) {
      throw new Error(
        "Não encontrei AdminUser no schema Prisma. " +
          "Nenhum arquivo foi gravado.",
      );
    }

    content = content.replace(
      relationNeedle,
      `  pixTotpEnabled                 Boolean                  @default(false)
  pixTotpSecretEncrypted         String?
  pixTotpPendingSecretEncrypted  String?
  pixTotpPendingExpiresAt        DateTime?
  pixTotpLastUsedCounter         Int?
  pixTotpRecoveryCodeHashes      Json?
  auditLogs                       AuditLog[]
  pixChangeAuthorizations         PixChangeAuthorization[]`,
    );

    const categoryNeedle =
      "model Category {";

    if (!content.includes(categoryNeedle)) {
      throw new Error(
        "Não encontrei o ponto para adicionar PixChangeAuthorization. " +
          "Nenhum arquivo foi gravado.",
      );
    }

    const authorizationModel = `model PixChangeAuthorization {
  id        String     @id @default(auto()) @map("_id") @db.ObjectId
  adminId   String     @db.ObjectId
  admin     AdminUser  @relation(fields: [adminId], references: [id])
  tokenHash String     @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime   @default(now())

  @@index([adminId, expiresAt])
}

`;

    content = content.replace(
      categoryNeedle,
      authorizationModel +
        categoryNeedle,
    );

    stage(relative, content);
  }
}

// -----------------------------------------------------------------------------
// Environment
// -----------------------------------------------------------------------------

{
  const relative =
    "backend/src/config/env.ts";
  let content = read(relative);

  if (
    !content.includes(
      "PIX_TOTP_ENCRYPTION_KEY",
    )
  ) {
    const needle =
      '  CLOUDINARY_API_SECRET: z.string().optional().default(""),';

    if (!content.includes(needle)) {
      throw new Error(
        "Não encontrei o final das variáveis de ambiente. " +
          "Nenhum arquivo foi gravado.",
      );
    }

    content = content.replace(
      needle,
      `${needle}
  PIX_TOTP_ENCRYPTION_KEY: z.string().min(1).refine(
    (value) => {
      try {
        return Buffer.from(value, "base64").length === 32;
      } catch {
        return false;
      }
    },
    {
      message:
        "PIX_TOTP_ENCRYPTION_KEY deve possuir 32 bytes em Base64",
    },
  ),`,
    );

    stage(relative, content);
  }

  const exampleRelative =
    "backend/.env.example";

  if (existsSync(filePath(exampleRelative))) {
    const example = read(exampleRelative);

    if (
      !example.includes(
        "PIX_TOTP_ENCRYPTION_KEY",
      )
    ) {
      stage(
        exampleRelative,
        `${example.trimEnd()}

# Gere com:
# node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
PIX_TOTP_ENCRYPTION_KEY=
`,
      );
    }
  }
}

// -----------------------------------------------------------------------------
// Registra as novas rotas
// -----------------------------------------------------------------------------

{
  const relative =
    "backend/src/app.ts";
  let content = read(relative);

  if (
    !content.includes(
      "pixSecurityRoutes",
    )
  ) {
    const importNeedle =
      'import { adminRoutes } from "./routes/admin.routes.js";';

    if (!content.includes(importNeedle)) {
      throw new Error(
        "Não encontrei o registro das rotas administrativas. " +
          "Nenhum arquivo foi gravado.",
      );
    }

    content = content.replace(
      importNeedle,
      `${importNeedle}
import { pixSecurityRoutes } from "./routes/pix-security.routes.js";`,
    );

    const registerNeedle =
      "  await app.register(adminRoutes);";

    if (!content.includes(registerNeedle)) {
      throw new Error(
        "Não encontrei app.register(adminRoutes). " +
          "Nenhum arquivo foi gravado.",
      );
    }

    content = content.replace(
      registerNeedle,
      `${registerNeedle}
  await app.register(pixSecurityRoutes);`,
    );

    stage(relative, content);
  }
}

// -----------------------------------------------------------------------------
// Protege alterações financeiras no backend
// -----------------------------------------------------------------------------

{
  const relative =
    "backend/src/routes/admin.routes.ts";
  let content = read(relative);
  const marker =
    "MESA4_PIX_TOTP_SETTINGS_GUARD";

  if (!content.includes(marker)) {
    const importNeedle =
      'import { sendOrderStatusWhatsApp } from "../modules/whatsapp/whatsapp-cloud.service.js";';

    if (!content.includes(importNeedle)) {
      throw new Error(
        "Não encontrei os imports de admin.routes.ts. " +
          "Nenhum arquivo foi gravado.",
      );
    }

    content = content.replace(
      importNeedle,
      `${importNeedle}
import { requirePixAuthorizationForSettings } from "../modules/security/pix-security.service.js";`,
    );

    const routeNeedle =
      `  app.put("/admin/settings", { preHandler: app.authenticateAdmin }, async (request) => {
    const input = settingsSchema.parse(request.body);`;

    if (!content.includes(routeNeedle)) {
      throw new Error(
        "Não encontrei PUT /admin/settings no formato atual. " +
          "Nenhum arquivo foi gravado.",
      );
    }

    content = content.replace(
      routeNeedle,
      `  app.put("/admin/settings", { preHandler: app.authenticateAdmin }, async (request) => {
    const input = settingsSchema.parse(request.body);

    /* ${marker} */
    const currentSettings =
      await prisma.storeSettings.findUnique({
        where: { singletonKey: "default" },
      });

    await requirePixAuthorizationForSettings({
      adminId: request.user.sub,
      token:
        request.headers[
          "x-pix-authorization"
        ],
      currentSettings,
      nextSettings: input,
    });`,
    );

    stage(relative, content);
  }
}

// -----------------------------------------------------------------------------
// Frontend: painel e trava dos campos Pix
// -----------------------------------------------------------------------------

{
  const relative =
    "frontend/src/pages/AdminSettingsPage.tsx";
  let content = read(relative);
  const marker =
    "MESA4_PIX_TOTP_ADMIN_UI";

  if (!content.includes(marker)) {
    const importNeedle =
      'import { AdminNav } from "../components/AdminNav";';

    if (!content.includes(importNeedle)) {
      throw new Error(
        "Não encontrei AdminNav em AdminSettingsPage.tsx. " +
          "Nenhum arquivo foi gravado.",
      );
    }

    content = content.replace(
      importNeedle,
      `${importNeedle}
import { PixSecurityPanel } from "../components/PixSecurityPanel";`,
    );

    const stateNeedle =
      `  const [heroImageUrl, setHeroImageUrl] =
    useState("");`;

    if (!content.includes(stateNeedle)) {
      throw new Error(
        "Não encontrei os estados de imagem nas configurações. " +
          "Nenhum arquivo foi gravado.",
      );
    }

    content = content.replace(
      stateNeedle,
      `${stateNeedle}
  /* ${marker} */
  const [
    pixAuthorization,
    setPixAuthorization,
  ] = useState("");
  const pixUnlocked =
    pixAuthorization.length > 0;`,
    );

    const mutationNeedle =
      `  const saveSettings = useMutation({
    mutationFn: (body: unknown) =>
      adminApi("/admin/settings", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () =>
      client.invalidateQueries({
        queryKey: ["admin-settings"],
      }),
  });`;

    if (!content.includes(mutationNeedle)) {
      throw new Error(
        "Não encontrei saveSettings no formato atual. " +
          "Nenhum arquivo foi gravado.",
      );
    }

    content = content.replace(
      mutationNeedle,
      `  const saveSettings = useMutation({
    mutationFn: (body: unknown) =>
      adminApi("/admin/settings", {
        method: "PUT",
        headers: pixAuthorization
          ? {
              "X-Pix-Authorization":
                pixAuthorization,
            }
          : undefined,
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      setPixAuthorization("");
      return client.invalidateQueries({
        queryKey: ["admin-settings"],
      });
    },
  });`,
    );

    content = content.replace(
      `      pixEnabled:
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
        undefined,`,
      `      pixEnabled: pixUnlocked
        ? form.get("pixEnabled") === "on"
        : settings.data?.pixEnabled ?? false,
      pixPaymentMode: pixUnlocked
        ? pixPaymentMode
        : settings.data?.pixPaymentMode ??
          "MERCADO_PAGO",
      manualPixKeyType: pixUnlocked
        ? form.get("manualPixKeyType") ||
          undefined
        : settings.data?.manualPixKeyType ??
          undefined,
      manualPixKey: pixUnlocked
        ? form.get("manualPixKey") ||
          undefined
        : settings.data?.manualPixKey ??
          undefined,
      manualPixReceiverName: pixUnlocked
        ? form.get(
            "manualPixReceiverName",
          ) || undefined
        : settings.data
            ?.manualPixReceiverName ??
          undefined,
      manualPixReceiverCity: pixUnlocked
        ? form.get(
            "manualPixReceiverCity",
          ) || undefined
        : settings.data
            ?.manualPixReceiverCity ??
          undefined,`,
    );

    const paymentStart =
      `          <section className="payment-mode-section">`;

    if (!content.includes(paymentStart)) {
      throw new Error(
        "Não encontrei a seção Pix no painel. " +
          "Nenhum arquivo foi gravado.",
      );
    }

    content = content.replace(
      paymentStart,
      `          <PixSecurityPanel
            onAuthorization={
              setPixAuthorization
            }
          />

          <fieldset
            className="pix-protected-fieldset"
            disabled={!pixUnlocked}
          >
${paymentStart}`,
    );

    const paymentEndNeedle =
      `          </section>
          <div className="check-row">`;

    if (!content.includes(paymentEndNeedle)) {
      throw new Error(
        "Não encontrei o final da seção Pix. " +
          "Nenhum arquivo foi gravado.",
      );
    }

    content = content.replace(
      paymentEndNeedle,
      `          </section>
          </fieldset>
          <div className="check-row">`,
    );

    const pixEnabledNeedle =
      `                name="pixEnabled"
                type="checkbox"
                defaultChecked={s.pixEnabled}`;

    if (!content.includes(pixEnabledNeedle)) {
      throw new Error(
        "Não encontrei a opção PIX habilitado. " +
          "Nenhum arquivo foi gravado.",
      );
    }

    content = content.replace(
      pixEnabledNeedle,
      `                name="pixEnabled"
                type="checkbox"
                disabled={!pixUnlocked}
                defaultChecked={s.pixEnabled}`,
    );

    stage(relative, content);
  }
}

// -----------------------------------------------------------------------------
// CSS
// -----------------------------------------------------------------------------

{
  const relative =
    "frontend/src/styles.css";
  const content = read(relative);
  const marker =
    "MESA4_PIX_TOTP_SECURITY_V1";

  if (!content.includes(marker)) {
    stage(
      relative,
      `${content.trimEnd()}

${"\n/* MESA4_PIX_TOTP_SECURITY_V1 */\n.pix-security-panel {\n  display: grid;\n  gap: 14px;\n  margin: 22px 0;\n  padding: 18px;\n  border: 1px solid rgba(109, 181, 255, 0.24);\n  border-radius: 16px;\n  background:\n    linear-gradient(\n      145deg,\n      rgba(42, 112, 181, 0.09),\n      rgba(255, 255, 255, 0.02)\n    );\n}\n\n.pix-security-heading {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n}\n\n.pix-security-heading small {\n  color: #9ed0ff;\n  font-weight: 800;\n  letter-spacing: 0.05em;\n  text-transform: uppercase;\n}\n\n.pix-security-heading h2 {\n  margin: 3px 0 0;\n}\n\n.pix-security-status {\n  flex: 0 0 auto;\n  padding: 6px 9px;\n  border: 1px solid rgba(255, 202, 91, 0.25);\n  border-radius: 999px;\n  background: rgba(255, 202, 91, 0.07);\n  color: #ffd678;\n  font-size: 11px;\n  font-weight: 800;\n}\n\n.pix-security-status.enabled {\n  border-color: rgba(83, 228, 124, 0.28);\n  background: rgba(83, 228, 124, 0.08);\n  color: #91efaa;\n}\n\n.pix-security-form {\n  display: grid;\n  grid-template-columns:\n    minmax(0, 1fr)\n    auto;\n  align-items: end;\n  gap: 10px;\n}\n\n.pix-security-form.unlock {\n  grid-template-columns:\n    minmax(0, 1fr)\n    minmax(0, 1fr)\n    auto;\n}\n\n.pix-totp-setup {\n  display: grid;\n  gap: 14px;\n}\n\n.pix-totp-qr {\n  display: grid;\n  width: fit-content;\n  max-width: 100%;\n  place-items: center;\n  padding: 10px;\n  border-radius: 14px;\n  background: #fff;\n}\n\n.pix-totp-qr img {\n  display: block;\n  width: min(260px, 72vw);\n  height: auto;\n}\n\n.pix-totp-manual {\n  display: grid;\n  gap: 5px;\n}\n\n.pix-totp-manual small {\n  color: var(--muted);\n}\n\n.pix-totp-manual code {\n  overflow-wrap: anywhere;\n  padding: 10px 12px;\n  border-radius: 10px;\n  background: #11100e;\n  color: #f7f2e8;\n  font-size: 13px;\n  letter-spacing: 0.05em;\n}\n\n.pix-recovery-box {\n  display: grid;\n  gap: 11px;\n  padding: 15px;\n  border: 1px solid rgba(255, 201, 83, 0.28);\n  border-radius: 13px;\n  background: rgba(255, 201, 83, 0.06);\n}\n\n.pix-recovery-codes {\n  display: grid;\n  grid-template-columns:\n    repeat(2, minmax(0, 1fr));\n  gap: 7px;\n}\n\n.pix-recovery-codes code {\n  padding: 8px;\n  border-radius: 8px;\n  background: #11100e;\n  text-align: center;\n  letter-spacing: 0.05em;\n}\n\n.pix-unlocked-message {\n  padding: 11px 12px;\n  border: 1px solid rgba(83, 228, 124, 0.26);\n  border-radius: 10px;\n  background: rgba(83, 228, 124, 0.07);\n  color: #91efaa;\n  font-weight: 700;\n}\n\n.pix-recovery-remaining {\n  color: var(--muted);\n}\n\n.pix-protected-fieldset {\n  min-width: 0;\n  margin: 0;\n  padding: 0;\n  border: 0;\n}\n\n.pix-protected-fieldset:disabled {\n  opacity: 0.56;\n}\n\n.pix-protected-fieldset:disabled\n  .payment-mode-section {\n  filter: grayscale(0.18);\n}\n\n@media (max-width: 720px) {\n  .pix-security-heading {\n    align-items: flex-start;\n  }\n\n  .pix-security-form,\n  .pix-security-form.unlock {\n    grid-template-columns: 1fr;\n  }\n\n  .pix-security-form button {\n    width: 100%;\n  }\n\n  .pix-recovery-codes {\n    grid-template-columns: 1fr;\n  }\n}\n"}
`,
    );
  }
}

// -----------------------------------------------------------------------------
// Backup antes de gravar
// -----------------------------------------------------------------------------

const backupDirectory = resolve(
  root,
  `backup-totp-pix-${Date.now()}`,
);

mkdirSync(backupDirectory, {
  recursive: true,
});

for (const relative of staged.keys()) {
  const source = filePath(relative);

  if (!existsSync(source)) {
    continue;
  }

  const destination = resolve(
    backupDirectory,
    relative,
  );

  mkdirSync(dirname(destination), {
    recursive: true,
  });

  cpSync(source, destination);
}

for (
  const [relative, content]
  of staged.entries()
) {
  const path = filePath(relative);

  mkdirSync(dirname(path), {
    recursive: true,
  });

  writeFileSync(path, content, "utf8");
  console.log(`✓ ${relative}`);
}

console.log(`
Proteção TOTP do PIX aplicada.

IMPORTANTE:
Antes de iniciar o backend, configure
PIX_TOTP_ENCRYPTION_KEY no .env local e
no Render.

Gere uma chave com:

node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"

Use EXATAMENTE o mesmo valor no ambiente.
Não troque essa chave depois que o TOTP
for configurado.

Depois execute:

  cd backend
  npx prisma format
  npm run prisma:generate
  npm run prisma:push
  npm run build

  cd ../frontend
  npm run build

Backup:
  ${backupDirectory}
`);
