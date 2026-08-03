# WhatsApp manual + detalhes do pedido — v3

As versões anteriores pararam antes de alterar arquivos porque tentavam remover
chamadas da API oficial em formatos diferentes do código local.

A versão v3 usa uma estratégia mais segura:

- mantém as rotas antigas para preservar compatibilidade;
- desativa a WhatsApp Cloud API no serviço central;
- remove a opção automática da tela de configurações;
- adiciona o histórico à listagem administrativa;
- instala o painel lateral de detalhes;
- abre `wa.me` com a mensagem pronta;
- não altera o Prisma.

## Aplicar

Extraia na raiz e execute:

```bash
cd ~/Desktop/mesa4
node aplicar-whatsapp-manual-detalhes-v3.mjs
```

Depois:

```bash
cd backend
npm run build

cd ../frontend
npm run build
```

Não execute `prisma:push`.
