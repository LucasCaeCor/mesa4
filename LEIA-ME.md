# Pix duplo compatível com o bot de WhatsApp

Esta versão é específica para o projeto no qual o bot de WhatsApp já foi aplicado.

Ela mantém:

- consentimento no checkout;
- notificações automáticas por status;
- botão de reenvio do WhatsApp;
- registro de notificações;
- cálculo de entrega por distância.

E adiciona:

- escolha entre Mercado Pago e Pix manual;
- QR Code Pix direto para a chave da loja;
- botão “Já fiz o PIX” para o cliente;
- confirmação manual no painel;
- faturamento apenas depois da confirmação;
- chave Pix removida da resposta pública `/store`.

## Aplicar

Na raiz do projeto:

```bash
cd ~/Desktop/mesa4
node aplicar-pix-duplo-whatsapp-v3.mjs
```

Depois:

```bash
cd backend
npm install
npm run prisma:generate
npm run prisma:push
npm run build

cd ../frontend
npm run build
```

## Configurar

Depois do deploy:

```text
https://www.mesaiv.online/admin/configuracoes
```

Escolha:

- Mercado Pago; ou
- Pix manual.

No Pix manual, informe o tipo da chave, a chave, o nome do recebedor e a cidade.

## Segurança

O clique do cliente em “Já fiz o PIX” apenas informa o pagamento. O administrador deve conferir o aplicativo bancário antes de clicar em “Confirmar Pix manual”.
