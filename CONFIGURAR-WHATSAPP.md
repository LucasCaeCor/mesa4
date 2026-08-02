# Configuração do bot de status pelo WhatsApp

A atualização adiciona:

- consentimento no checkout;
- envio automático ao mudar o status;
- envio automático quando o Mercado Pago confirma o PIX;
- prevenção de mensagem automática duplicada;
- botão de reenvio manual no painel;
- registro dos envios no MongoDB;
- falha do WhatsApp sem bloquear a atualização do pedido.

## 1. Aplicar

Extraia este ZIP na raiz do projeto e execute:

```bash
cd ~/Desktop/mesa4
node aplicar-whatsapp-bot.mjs
```

Depois:

```bash
cd backend
npm run prisma:generate
npm run prisma:push
npm run build

cd ../frontend
npm run build
```

## 2. Criar o template na Meta

No WhatsApp Manager, crie um modelo:

- Nome: `pedido_status`
- Categoria: `Utility`
- Idioma: Português (Brasil)

Corpo:

```text
Olá, {{1}}! O status do seu pedido {{2}} foi atualizado para:

*{{3}}*

Mesa IV Burgers 🍔
```

Amostras:

```text
{{1}} Lucas
{{2}} MESA-1234
{{3}} Pedido em preparo 🍔
```

A ordem e a quantidade das variáveis precisam ser exatamente as mesmas.

## 3. Variáveis locais

No `backend/.env`:

```env
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_TEMPLATE_NAME=pedido_status
WHATSAPP_TEMPLATE_LANGUAGE=pt_BR
WHATSAPP_GRAPH_API_VERSION=v25.0
```

## 4. Variáveis no Render

Em `Render → mesa4 → Environment`, adicione as mesmas variáveis.

O Access Token deve ter permissão para enviar mensagens pelo WhatsApp Business
e deve permanecer somente no backend.

## 5. Ativar no painel

Acesse:

```text
https://www.mesaiv.online/admin/configuracoes
```

Marque:

```text
Notificações automáticas pelo WhatsApp
```

## 6. Teste

Crie um pedido usando um telefone que tenha autorizado receber a mensagem.

No painel:

1. altere o pedido para `Confirmado`;
2. confira o WhatsApp do cliente;
3. use `Reenviar status no WhatsApp` para testar o envio manual.

O painel mostrará `Aceita pela Meta` quando a API aceitar a mensagem. Esta
primeira versão não registra ainda os eventos posteriores de entregue e lida.
