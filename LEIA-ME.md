# Biblioteca de adicionais + upload Cloudinary

## O que entra

- biblioteca global de adicionais;
- cadastro único de nome e preço;
- seleção dos adicionais na criação e edição de cada produto;
- sincronização automática de nome, preço, posição e disponibilidade;
- grupo “Adicionais” compatível com o carrinho e com os pedidos atuais;
- upload de imagem pelo celular ou computador;
- prévia da foto;
- rota de upload autenticada;
- limite de 5 MB;
- chave secreta do Cloudinary somente no backend.

## Aplicar

Salve o estado atual:

```bash
cd ~/Desktop/mesa4
git add .
git commit -m "chore: salvar antes de adicionais e cloudinary"
```

Extraia o ZIP na raiz e execute:

```bash
node aplicar-adicionais-cloudinary.mjs
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

## Configurar o Cloudinary

No `backend/.env` local e no Render:

```env
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

Esses dados aparecem no painel do Cloudinary em API Keys.

Não coloque `CLOUDINARY_API_SECRET` no frontend, na Vercel ou no GitHub.

## Testar

1. Entre em `/admin/cardapio`.
2. Cadastre Bacon, Queijo extra e Ovo na biblioteca.
3. Crie ou edite um lanche.
4. Marque os adicionais desejados.
5. Escolha uma foto da galeria.
6. Salve.
7. Abra o cardápio como cliente e confira o grupo “Adicionais”.

## GitHub

```bash
cd ~/Desktop/mesa4
git add .
git commit -m "feat: adicionar biblioteca de adicionais e upload cloudinary"
git push origin main
```
