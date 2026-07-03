# Roadmap — rumo a um "Google Studio"

Levantamento feito em 2026-07-03 comparando o estado atual do dashjs (app React + core package `dashjs`) contra o que um BI tool tipo Google Looker Studio oferece. Cada item tem contexto do que existe hoje e por que falta.

Marque com `[x]` os escolhidos para começar.

## Bloqueadores grandes (impedem ser um "Studio" de verdade)

- [ ] **Auth / multi-usuário** — não existe login, sessão, nem roles. Servidor Express só tem `cors()` + `express.json()`. Qualquer um com acesso à URL lê/escreve tudo, inclusive credenciais de conexões (decriptadas no próprio servidor). Sem tabela `users` no schema.
- [x] **Publish / share de dashboard** — feito: `slug`/`published`/`published_at` em `dashboards`, rotas `/publish` `/unpublish` `/api/public/:slug`, rota `/view/:slug` + `PublicDashboardView.tsx`, opção `readOnly` no core `dashjs`.
- [x] **Refresh agendado de dados** — feito: colunas `connection_id/source_sql/refresh_interval_minutes/next_refresh_at/last_refreshed_at/last_refresh_error` em `datasets`, `refreshScheduler.ts` (poll 60s), rotas `/refresh-schedule` `/refresh-now`, UI em `ImportBigQueryDialog` + `DataPage`.
- [ ] **Conectores limitados** — BigQuery e **Postgres** (ambos completos: test/preview/ingest/refresh agendado, via `queryEngine.ts` dispatch por `type`) e upload de arquivo (CSV/TSV/JSON/XLSX). GA4 é um stub que lança erro (`GA4 connector not implemented yet`). Ainda falta MySQL, Google Sheets ou API genérica.

## Editor — falta o que dá "feel" de Studio

- [x] **Cross-filter / click-to-filter** — feito: `ChartConfig.crossFilter` + `DashboardFilter.sourceChartId`, `point.events.click` em 13 tipos de chart, `upsertFilter` compartilhado com toggle, checkbox "Usar como filtro" na aba Setup.
- [ ] **Templates / galeria de dashboard** — só dá pra criar dashboard em branco, sem ponto de partida.
- [ ] **Temas / brand kit** — só light/dark binário, um accent color só (`--dashjs-accent`). Sem paleta customizável ou kit de marca.
- [ ] **Version history** — item de menu existe mas é `comingSoon`, não implementado.
- [ ] **Outros itens de menu nunca implementados** — copy dashboard, align/distribute, group/ungroup, manage pages, snap-to-grid.

## Export

- [ ] **Export real de PDF/imagem** — hoje é só `window.print()` do navegador. Sem geração de PNG/PDF dedicada, sem relatório agendado por e-mail.

## Charts

- [ ] **Mapa / geo chart** — o campo tipo `geo` já existe no domain model, mas nenhum chart type consome ele.
- [ ] **Radar chart** — não implementado (confirmado no README do core package).

## Dados

- [ ] **Data blending mais robusto** — hoje só junta 2 fontes (left/inner/cross join simples). Sem modelo de dados tipo star-schema, sem pipeline de transformação persistente (tipo dbt).

---

## Onde eu focaria primeiro

Dado que já existe conector BigQuery maduro e editor robusto, a ordem de maior impacto percebido seria:

1. ~~**Publish / share link**~~ — feito em 2026-07-03
2. ~~**Refresh agendado** dos datasets~~ — feito em 2026-07-03
3. ~~**Cross-filtering** entre charts~~ — feito em 2026-07-03

Próximos 3 (nova rodada) — ver `spec.md` para o plano de implementação:

4. ~~**Conector Postgres**~~ — feito em 2026-07-03 (código completo; faltam 2 verificações manuais: refresh-now e regressão BigQuery). MySQL/Sheets/API genérica seguem pendentes.
5. **Templates / galeria de dashboard** — ponto de partida além de dashboard em branco (não iniciado)
6. **Temas / brand kit** — paleta customizável além do accent color único e light/dark binário (não iniciado)

Auth vira crítico só se o plano for sair de uso local/pessoal para multi-usuário — vale perguntar se esse é o objetivo antes de investir nisso.
