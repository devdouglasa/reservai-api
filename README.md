# Reservai API

Backend NestJS com autenticação, gestão por proprietário, PostgreSQL/TypeORM e Socket.IO.

## Sobre
O Resevai é um aplicativo de reservas em React Native / Expo 58 e NestJS 12, com PostgreSQL, aprovação por proprietário e atualizações por Socket.IO; interface em português brasileiro.

## Executar localmente
Requisitos: Node.js compatível com os projetos (validado com Node 26), npm e Docker Desktop em execução. Os dois projetos mantêm seus próprios package-lock.json.

## API e banco
No PowerShell, em reservai-api:

```powershell
npm ci
Copy-Item .env.example .env # Apenas se ainda não houver .env; não sobrescreva suas credenciais.
```

Edite `.env`: escolha `POSTGRES_PASSWORD`, use a mesma senha em `DATABASE_URL` (codificada para URL quando necessário) e gere um `JWT_SECRET` aleatório com pelo menos 32 caracteres. Uma forma de gerar um segredo é `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.

```powershell
docker compose up -d
npm run db:migrate
npm run start:dev
```

API: `http://localhost:3000/api/v1`. Documentação interativa: `http://localhost:3000/api/docs`.

O banco tem volume persistente e a porta fica restrita ao localhost. Migrations são explícitas; `synchronize` está desativado. Observe só é habilitado quando ambas as credenciais existentes estão configuradas.

### Provisionar proprietário e dados demonstrativos

O cadastro público cria somente clientes. Em outro terminal, em `reservai-api`:

```powershell
$securePassword = Read-Host 'Senha do proprietário (8 a 128 caracteres)' -AsSecureString
$env:OWNER_PASSWORD = [System.Net.NetworkCredential]::new('', $securePassword).Password
npm run owner:create -- proprietario@example.com 'Nome do proprietário'
Remove-Item Env:OWNER_PASSWORD
npm run db:seed -- proprietario@example.com
```

O comando não modifica uma conta já existente. O seed é opcional e idempotente por nome/proprietário; inclui quadra, salão e consultório com funcionamento das 08h às 20h. Não existem senhas padrão no código.


Comandos principais: `npm run db:migrate`, `npm run start:dev`, `npm test`, `npm run test:e2e`, `npm run lint`, `npm run build`.

Swagger em `/api/docs`; endpoints em `/api/v1`. Arquivo `.env.example` documenta a configuração sem incluir credenciais reais.
