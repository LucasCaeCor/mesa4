# Mesa IV Burgers

Projeto separado em duas aplicações independentes:

```text
mesa4/
├── backend/   # Fastify + TypeScript + Prisma + MongoDB + Mercado Pago
├── frontend/  # React + TypeScript + Vite
├── render.yaml
└── README.md
```

## Segurança da separação

As credenciais e regras críticas ficam somente no backend:

- conexão do MongoDB;
- segredo JWT;
- Access Token e segredo de webhook do Mercado Pago;
- cálculo oficial dos preços;
- validação do pedido e pagamento;
- autenticação e autorização administrativa.

O frontend contém somente código de interface e a URL pública da API. Todo código enviado ao navegador pode ser visualizado pelo usuário, portanto nenhuma chave secreta deve ser colocada em variáveis `VITE_*`.

## 1. Backend

No Git Bash:

```bash
cd backend
npm install
cp .env.example .env
notepad .env
npm run prisma:generate
npm run prisma:push
npm run seed
npm run dev
```

API local:

```text
http://localhost:3333
```

## 2. Frontend

Abra outro Git Bash:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Frontend local:

```text
http://localhost:5173
```

Painel administrativo:

```text
http://localhost:5173/admin/login
```

## Variáveis do backend

Arquivo `backend/.env`:

```env
NODE_ENV=development
PORT=3333
DATABASE_URL="mongodb+srv://USUARIO:SENHA@CLUSTER.mongodb.net/mesa4?retryWrites=true&w=majority"
JWT_SECRET="chave-segura-com-mais-de-32-caracteres"
FRONTEND_URLS="http://localhost:5173"
API_PUBLIC_URL="http://localhost:3333"
MERCADO_PAGO_ACCESS_TOKEN="TEST-..."
MERCADO_PAGO_WEBHOOK_SECRET=""
ADMIN_NAME="Administrador"
ADMIN_EMAIL="admin@mesa4.com"
ADMIN_PASSWORD="troque-esta-senha"
```

## Variável do frontend

Arquivo `frontend/.env`:

```env
VITE_API_URL=http://localhost:3333
```

Essa variável não é secreta. Ela apenas informa ao navegador onde a API está hospedada.

## Deploy

### Render

Use a raiz do repositório e o `render.yaml`, ou configure manualmente:

- Root Directory: `backend`
- Build Command: `npm install && npm run prisma:generate && npm run build`
- Start Command: `npm run start`

### Vercel

- Root Directory: `frontend`
- Framework: Vite
- Build Command: `npm run build`
- Output Directory: `dist`
- Variável: `VITE_API_URL=https://URL-DO-BACKEND.onrender.com`
