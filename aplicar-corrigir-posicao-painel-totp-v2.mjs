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
  "frontend/src/pages/AdminSettingsPage.tsx";
const file = resolve(root, relative);

if (!existsSync(file)) {
  throw new Error(
    `Arquivo não encontrado: ${relative}`,
  );
}

let content = readFileSync(
  file,
  "utf8",
).replace(/\r\n/g, "\n");

const marker =
  "MESA4_PIX_TOTP_PANEL_OUTSIDE_FORM_V2";

if (content.includes(marker)) {
  console.log(
    "O painel TOTP já está fora do formulário principal.",
  );
  process.exit(0);
}

if (
  !content.includes(
    'import { PixSecurityPanel } from "../components/PixSecurityPanel";',
  )
) {
  throw new Error(
    "PixSecurityPanel ainda não está importado. " +
      "A instalação TOTP parece incompleta.",
  );
}

if (
  !content.includes(
    '"X-Pix-Authorization"',
  )
) {
  throw new Error(
    "O saveSettings ainda não possui X-Pix-Authorization. " +
      "Não vou alterar o arquivo automaticamente.",
  );
}

const panelPattern =
  /\n\s*<PixSecurityPanel\s*\n\s*onAuthorization=\{\s*\n\s*setPixAuthorization\s*\n\s*\}\s*\n\s*\/>\s*\n/;

const panelMatch = content.match(
  panelPattern,
);

if (!panelMatch) {
  throw new Error(
    "Não encontrei o bloco atual de PixSecurityPanel. " +
      "Nenhum arquivo foi alterado.",
  );
}

// Remove o painel da posição atual,
// que está dentro do <form> principal.
content = content.replace(
  panelPattern,
  "\n",
);

const headerNeedle =
  `      </header>

      {s && (`;

if (!content.includes(headerNeedle)) {
  throw new Error(
    "Não encontrei o final do cabeçalho de Configurações. " +
      "Nenhum arquivo foi alterado.",
  );
}

// Insere o painel antes do formulário
// principal, evitando <form> dentro de <form>.
content = content.replace(
  headerNeedle,
  `      </header>

      {/* ${marker} */}
      <PixSecurityPanel
        onAuthorization={
          setPixAuthorization
        }
      />

      {s && (`,
);

// Segurança extra: o painel precisa vir
// antes da abertura do formulário principal.
const panelIndex =
  content.indexOf(
    "<PixSecurityPanel",
  );
const settingsFormIndex =
  content.indexOf(
    'className="admin-form settings-form"',
  );

if (
  panelIndex < 0 ||
  settingsFormIndex < 0 ||
  panelIndex > settingsFormIndex
) {
  throw new Error(
    "A validação final falhou: o painel não ficou " +
      "antes do formulário principal. Nenhum arquivo foi alterado.",
  );
}

const backupDirectory = resolve(
  root,
  `backup-posicao-totp-${Date.now()}`,
);
const backupFile = resolve(
  backupDirectory,
  relative,
);

mkdirSync(
  dirname(backupFile),
  {
    recursive: true,
  },
);

cpSync(
  file,
  backupFile,
);

writeFileSync(
  file,
  content,
  "utf8",
);

console.log(`✓ ${relative}`);
console.log(`
Painel TOTP movido para fora do formulário principal.

Backup:
  ${backupDirectory}

Agora execute:

  cd frontend
  npm run build

Não precisa rodar Prisma nem backend novamente.
`);
