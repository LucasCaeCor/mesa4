# 🍔 Mesa IV Burgers

Sistema completo de delivery desenvolvido para a **Mesa IV Burgers**, com cardápio digital, carrinho de compras, checkout, pagamento via PIX pelo Mercado Pago, acompanhamento de pedidos e painel administrativo.

O projeto foi desenvolvido com frontend e backend separados, utilizando React, TypeScript, Fastify, Prisma e MongoDB.

---

## 🚀 Funcionalidades

### Área do cliente

* Visualização do cardápio por categorias
* Produtos com descrição, imagem e preço
* Seleção de adicionais e opções
* Controle de quantidade
* Carrinho persistente
* Checkout sem necessidade de cadastro
* Entrega ou retirada no estabelecimento
* Seleção de bairro/região de entrega
* Cálculo automático da taxa de entrega
* Campo de observações do pedido
* Pagamento por PIX
* QR Code e código PIX copia e cola
* Acompanhamento do status do pedido
* Envio do resumo do pedido pelo WhatsApp

### Área administrativa

* Login protegido com JWT
* Dashboard de pedidos
* Visualização de faturamento
* Gerenciamento de pedidos
* Atualização do status do pedido
* Cadastro, edição e exclusão de produtos
* Cadastro e gerenciamento de categorias
* Controle de produtos disponíveis e esgotados
* Cadastro de adicionais e grupos de opções
* Cadastro de bairros e taxas de entrega
* Configuração de pedido mínimo
* Configuração de horários de funcionamento
* Abertura e fechamento da loja
* Configuração das informações do estabelecimento

---

## 🛒 Fluxo de pedido

1. O cliente acessa o cardápio.
2. Escolhe os produtos e adicionais.
3. Adiciona os itens ao carrinho.
4. Informa seus dados e endereço.
5. Seleciona entrega ou retirada.
6. O backend recalcula todos os preços.
7. Um pagamento PIX é criado no Mercado Pago.
8. O cliente recebe o QR Code e o código copia e cola.
9. O Mercado Pago envia uma notificação para o webhook.
10. O pedido é atualizado automaticamente após o pagamento.
11. A administração acompanha e atualiza o andamento do pedido.

---

## 🧰 Tecnologias

### Frontend

* React
* TypeScript
* Vite
* React Router
* Zustand
* TanStack Query
* React Hook Form
* Zod
* Axios/Fetch API
* Lucide React

### Backend

* Node.js
* TypeScript
* Fastify
* Prisma ORM
* MongoDB Atlas
* JWT
* Zod
* Mercado Pago API
* Webhooks
* Bcrypt
* Helmet
* CORS
* Rate Limit

### Hospedagem

* Frontend: Vercel
* Backend: Render
* Banco de dados: MongoDB Atlas
* Pagamentos: Mercado Pago

---

## 📁 Estrutura do projeto

```text
mesa4/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   ├── src/
│   │   ├── config/
│   │   ├── modules/
│   │   ├── plugins/
│   │   ├── routes/
│   │   ├── app.ts
│   │   └── server.ts
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── contexts/
│   │   ├── lib/
│   │   ├── pages/
│   │   ├── stores/
│   │   └── types/
│   ├── .env.example
│   ├── package.json
│   └── vite.config.ts
│
└── README.md
```

---

## ⚙️ Requisitos

Antes de iniciar, tenha instalado:

* Node.js 20 ou superior
* npm
* Git
* Conta no MongoDB Atlas
* Aplicação configurada no Mercado Pago

---

## 💻 Executando localmente

Clone o repositório:

```bash
git clone https://github.com/LucasCaeCor/mesa4.git
cd mesa4
```

---

## 🔧 Configuração do backend

Entre na pasta:

```bash
cd backend
```

Instale as dependências:

```bash
npm install
```

Crie o arquivo de ambiente:

```bash
cp .env.example .env
```

Configure o arquivo `.env`:

```env
NODE_ENV=development
PORT=3333

DATABASE_URL="mongodb+srv://USUARIO:SENHA@CLUSTER.mongodb.net/mesa4"

JWT_SECRET="SUA_CHAVE_JWT"

FRONTEND_URLS="http://localhost:5173"
API_PUBLIC_URL="URL_PUBLICA_DO_BACKEND"

MERCADO_PAGO_ACCESS_TOKEN="SEU_ACCESS_TOKEN"
MERCADO_PAGO_WEBHOOK_SECRET="SEU_SEGREDO_WEBHOOK"

ADMIN_NAME="Administrador"
ADMIN_EMAIL="admin@mesa4.com"
ADMIN_PASSWORD="SUA_SENHA"
```

Gere o Prisma Client:

```bash
npm run prisma:generate
```

Sincronize o banco:

```bash
npm run prisma:push
```

Crie o administrador e os dados iniciais:

```bash
npm run seed
```

Inicie o backend:

```bash
npm run dev
```

O backend estará disponível em:

```text
http://localhost:3333
```

Teste a API:

```text
http://localhost:3333/health
```

---

## 🎨 Configuração do frontend

Abra outro terminal e entre na pasta:

```bash
cd frontend
```

Instale as dependências:

```bash
npm install
```

Crie o arquivo de ambiente:

```bash
cp .env.example .env
```

Configure:

```env
VITE_API_URL=http://localhost:3333
```

Inicie o frontend:

```bash
npm run dev
```

O projeto estará disponível em:

```text
http://localhost:5173
```

---

## 🔐 Área administrativa

Acesse:

```text
http://localhost:5173/admin/login
```

Utilize o e-mail e a senha cadastrados no arquivo `.env` do backend:

```env
ADMIN_EMAIL="admin@mesa4.com"
ADMIN_PASSWORD="SUA_SENHA"
```

Após alterar as credenciais do administrador, execute novamente:

```bash
npm run seed
```

---

## 📜 Scripts do backend

```bash
npm run dev
```

Inicia o servidor em modo de desenvolvimento.

```bash
npm run build
```

Compila o backend TypeScript.

```bash
npm run start
```

Inicia a versão compilada.

```bash
npm run prisma:generate
```

Gera o Prisma Client.

```bash
npm run prisma:push
```

Sincroniza os modelos com o MongoDB.

```bash
npm run seed
```

Cria ou atualiza o administrador e os dados iniciais.

---

## 📜 Scripts do frontend

```bash
npm run dev
```

Inicia o frontend em desenvolvimento.

```bash
npm run build
```

Gera a versão de produção.

```bash
npm run preview
```

Executa localmente a versão compilada.

---

## 🌐 Deploy

### Backend no Render

Configuração recomendada:

```text
Root Directory: backend
```

Build Command:

```bash
npm ci --include=dev && npm run prisma:generate && npm run build
```

Start Command:

```bash
npm run start
```

Health Check:

```text
/health
```

As variáveis privadas devem ser cadastradas em:

```text
Render → Environment
```

Depois do deploy, configure:

```env
API_PUBLIC_URL=https://seu-backend.onrender.com
```

---

### Frontend na Vercel

Ao importar o repositório, configure:

```text
Root Directory: frontend
Framework: Vite
```

Variável de ambiente:

```env
VITE_API_URL=https://seu-backend.onrender.com
```

Depois de alterar uma variável `VITE_`, faça um novo deploy.

---

## 💳 Mercado Pago

O backend cria pagamentos PIX utilizando a API do Mercado Pago.

A URL do webhook deve apontar para:

```text
https://seu-backend.onrender.com/webhooks/mercadopago
```

Configure no painel do Mercado Pago:

```text
Suas integrações
→ Aplicação
→ Webhooks
→ Payments
```

O Access Token e o segredo do webhook devem existir somente no backend.

Nunca coloque credenciais do Mercado Pago no frontend ou no GitHub.

---

## 🔒 Segurança

O projeto implementa:

* Autenticação administrativa com JWT
* Senhas protegidas com hash
* Validação de entrada com Zod
* CORS com lista de domínios permitidos
* Rate limit
* Helmet
* Validação do webhook do Mercado Pago
* Idempotência na criação de pagamentos
* Preços recalculados pelo backend
* Credenciais armazenadas em variáveis de ambiente
* Rotas administrativas protegidas
* Identificador público para acompanhamento do pedido

Mesmo que um usuário altere os valores pelo navegador, o backend recalcula produtos, adicionais, taxas e total antes de criar o pedido.

---

## ⚠️ Variáveis de ambiente

Arquivos `.env` nunca devem ser enviados ao GitHub.

Confirme que o `.gitignore` contém:

```gitignore
node_modules
dist
.env
.env.local
.env.production
*.log
```

Não compartilhe publicamente:

* `DATABASE_URL`
* `JWT_SECRET`
* `MERCADO_PAGO_ACCESS_TOKEN`
* `MERCADO_PAGO_WEBHOOK_SECRET`
* `ADMIN_PASSWORD`

---

## 📌 Status do projeto

O projeto está em desenvolvimento e já possui a estrutura principal do sistema de delivery:

* [x] Cardápio
* [x] Carrinho
* [x] Checkout
* [x] Regiões de entrega
* [x] Pagamento PIX
* [x] Webhook do Mercado Pago
* [x] Painel administrativo
* [x] Gerenciamento de produtos
* [x] Gerenciamento de pedidos
* [x] Configurações da loja
* [x] Deploy do backend
* [x] Deploy do frontend
* [ ] Ajustes finais de identidade visual
* [ ] Cadastro completo do cardápio
* [ ] Testes finais em produção

---

## 👨‍💻 Autor

Desenvolvido por **Lucas Caetano**.

GitHub: [LucasCaeCor](https://github.com/LucasCaeCor)

---

## 📄 Licença

Este projeto foi desenvolvido para uso da Mesa IV Burgers.

O código não deve ser distribuído, vendido ou utilizado comercialmente sem autorização do autor.
