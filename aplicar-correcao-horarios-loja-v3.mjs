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
const relative =
  "backend/src/modules/orders/order.service.ts";
const file = resolve(root, relative);

if (!existsSync(file)) {
  throw new Error(
    `Arquivo não encontrado: ${relative}`,
  );
}

let content = readFileSync(file, "utf8")
  .replace(/\r\n/g, "\n");

const marker =
  "MESA4_STORE_SETTINGS_NULL_GUARD";

if (content.includes(marker)) {
  console.log(
    "A validação das configurações já está aplicada.",
  );
  process.exit(0);
}

const availabilityNeedle =
  `  const availability =
    evaluateStoreAvailability(
      settings,
      hours,
    );`;

if (!content.includes(availabilityNeedle)) {
  throw new Error(
    "Não encontrei a verificação de disponibilidade " +
      "em order.service.ts. Nenhum arquivo foi alterado.",
  );
}

const nullGuard =
  `  /* ${marker} */
  if (!settings) {
    throw new HttpError(
      503,
      "As configurações da loja não foram encontradas",
      "STORE_SETTINGS_NOT_FOUND",
    );
  }

${availabilityNeedle}`;

content = content.replace(
  availabilityNeedle,
  nullGuard,
);

const backupDirectory = resolve(
  root,
  `backup-horarios-null-${Date.now()}`,
);
const backupFile = resolve(
  backupDirectory,
  relative,
);

mkdirSync(dirname(backupFile), {
  recursive: true,
});
cpSync(file, backupFile);

writeFileSync(file, content, "utf8");

console.log(`✓ ${relative}`);
console.log(`
Correção de nulabilidade aplicada.

Backup criado em:
  ${backupDirectory}

Agora execute:

  cd backend
  npm run build

Depois:

  cd ../frontend
  npm run build

Não é necessário executar Prisma.
`);
