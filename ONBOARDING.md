# Atualizando para a versão com autenticação (multi-tenant)

Este projeto ganhou autenticação, multi-tenant e papéis de usuário (owner/editor/viewer). Se você já rodava o app antes dessa feature e já tem dados salvos localmente (datasets, dashboards, conexões), siga este roteiro **na ordem** para atualizar sem perder nada.

Claude: execute os passos abaixo em sequência. Pare e pergunte ao usuário sempre que o passo pedir explicitamente (não invente valores). Não rode nenhum comando destrutivo (`docker compose down -v`, `git reset --hard`, etc.) neste processo — o objetivo é preservar 100% dos dados existentes.

## Passo 1 — Diagnóstico do ambiente atual

Rode e reporte o resultado antes de continuar:

```bash
docker compose ps
```

- Se os containers `db` e `api` **não existirem ainda** (primeira vez rodando o projeto): pule direto para o Passo 5 (não há dado legado para migrar, `init.sql` cria tudo sozinho no primeiro `docker compose up`).
- Se o container `db` já existe e está rodando: continue no Passo 2 (há dado legado a preservar).

## Passo 2 — Atualizar o código

```bash
git pull
```

Se houver conflitos ou mudanças locais não commitadas, pare e avise o usuário antes de prosseguir — não descarte nada automaticamente.

## Passo 3 — Instalar as dependências novas

```bash
npm install
cd server && npm install && cd ..
```

## Passo 4 — Aplicar o schema novo no banco existente (sem apagar nada)

Primeiro verifique se o schema novo já foi aplicado:

```bash
docker compose exec -T db psql -U jss -d jss_dashjs -c "SELECT to_regclass('public.tenants');"
```

- Se retornar `tenants` (não-nulo): o schema já está atualizado, pule para o Passo 5.
- Se retornar `(1 row)` com valor vazio/`null`: rode o comando abaixo. Todo o SQL em `server/db/init.sql` usa `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`, então é seguro reaplicar o arquivo inteiro contra o banco que já existe — nada é apagado ou sobrescrito, só são adicionadas as tabelas/colunas que faltam:

```bash
docker compose exec -T db psql -U jss -d jss_dashjs < server/db/init.sql
```

## Passo 5 — Variáveis de ambiente

Garanta que o arquivo `.env` na raiz do projeto (ao lado do `docker-compose.yml`) tem estas linhas (adicione se não existirem):

```
SESSION_SECRET=<gere uma string aleatória, ex: rode `openssl rand -hex 32`>
APP_URL=http://localhost:5173
```

`RESEND_API_KEY` e `EMAIL_FROM` são opcionais — sem eles, convite de membro e "esqueci minha senha" simplesmente não enviam e-mail de verdade (mas o app não quebra). Não pergunte ao usuário por essas duas a menos que ele peça explicitamente para configurar envio de e-mail.

## Passo 6 — Subir a API atualizada

```bash
docker compose up -d --build api
```

Confirme que subiu com `docker compose ps` (container `api` deve estar `Up`) e teste:

```bash
curl -s http://localhost:3002/api/health
```

Deve responder `{"ok":true}`.

## Passo 7 — Criar a conta do usuário (⚠️ pergunte, não invente)

Este é o passo que vincula a conta nova aos dados que já existiam. **Pare aqui e pergunte ao usuário, em uma única mensagem:**

1. Nome dele
2. E-mail que quer usar para login
3. Senha que quer usar
4. Nome da empresa/time (pode ser qualquer nome — vira o "tenant" dele)

Não prossiga com valores de exemplo ou placeholder — esses dados viram a conta real de login dele.

Com as respostas, crie a conta via API:

```bash
curl -s -X POST http://localhost:3002/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"<nome>","email":"<email>","password":"<senha>","tenantName":"<empresa>"}'
```

**Importante:** isso só adota os dados antigos automaticamente se for o **primeiro** signup feito neste banco (o sistema checa se a tabela `tenants` está vazia antes de criar). Se este comando retornar erro `"email already registered"` ou se o usuário já tiver testado outro signup antes neste banco, pare e avise — não tente forçar um segundo signup achando que vai herdar os dados, ele não vai.

## Passo 8 — Confirmar que os dados antigos foram herdados

Rode:

```bash
docker compose exec -T db psql -U jss -d jss_dashjs -c "SELECT count(*) FROM datasets WHERE tenant_id IS NULL;"
docker compose exec -T db psql -U jss -d jss_dashjs -c "SELECT count(*) FROM dashboards WHERE tenant_id IS NULL;"
```

Ambos devem retornar `0` — significa que todo dataset/dashboard que já existia agora pertence ao tenant recém-criado.

## Passo 9 — Reportar ao usuário

Informe:
- A conta foi criada com o e-mail que ele passou.
- Ele já pode logar em `http://localhost:5173/login` (ou a URL onde o frontend roda) com o e-mail e senha que definiu.
- Todos os dashboards/datasets/conexões que ele já tinha devem aparecer normalmente após o login.
- Se quiser convidar outras pessoas para o time, isso fica em **Membros** (rail lateral) depois de logado — mas convite por e-mail só funciona de verdade se `RESEND_API_KEY` for configurada depois.
