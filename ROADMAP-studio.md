# Roadmap — rumo a um "Google Studio"

Levantamento feito em 2026-07-03, atualizado em 2026-07-09 comparando o estado atual do dashjs (app React + core package `dashjs`) contra o que um BI tool tipo Google Looker Studio oferece. Cada item tem contexto do que existe hoje e por que falta.

Nesta atualização (2026-07-09, 2ª passada) o core `dashjs` (repo irmão `/home/fernandes/jspreadsheet/dashjs`) foi conferido direto — não só o app. Ele avançou mais rápido que este doc: drill-down, bookmarks, formatação condicional e style v2 de chart/card já estão `✅` no `ROADMAP.md` dele. Itens abaixo foram corrigidos pra bater com o código real, não com o que estava documentado antes.

Marque com `[x]` os escolhidos para começar.

## Bloqueadores grandes (impedem ser um "Studio" de verdade)

- [x] **Auth / multi-usuário** — feito: tabela `users` (`server/db/init.sql:64-71`), sessão real via `connect-pg-simple` (`server/src/auth.ts:1-20`), `requireAuth` retorna 401 (`auth.ts:36-48`), montado em todas as rotas (`datasets.ts:8`, `dashboards.ts:8`, `members.ts:10`, `connections.ts:10`). Datasets/dashboards/connections filtrados por `tenant_id` de verdade nas queries, não só coluna solta. Roles (`owner`/`editor`/`viewer`) aplicadas via `requireRole` nas escritas.
- [x] **Publish / share de dashboard** — feito: `slug`/`published`/`published_at` em `dashboards`, rotas `/publish` `/unpublish` `/api/public/:slug`, rota `/view/:slug` + `PublicDashboardView.tsx`, opção `readOnly` no core `dashjs`.
- [x] **Refresh agendado de dados** — feito: colunas `connection_id/source_sql/refresh_interval_minutes/next_refresh_at/last_refreshed_at/last_refresh_error` em `datasets`, `refreshScheduler.ts` (poll 60s), rotas `/refresh-schedule` `/refresh-now`, UI em `ImportBigQueryDialog` + `DataPage`.
- [ ] **Conectores limitados** — BigQuery e **Postgres** (ambos completos: test/preview/ingest/refresh agendado, via `queryEngine.ts` dispatch por `type`) e upload de arquivo (CSV/TSV/JSON/XLSX). GA4 segue stub (`ga4Connector.ts:17` lança erro, `GA4_COMING_SOON = true`, UI trava com "Em breve"). Ainda falta MySQL, Google Sheets ou API genérica — nenhum arquivo de conector existe pra eles.

## Editor — falta o que dá "feel" de Studio

- [x] **Cross-filter / click-to-filter** — feito: `ChartConfig.crossFilter` + `DashboardFilter.sourceChartId`, `point.events.click` em 13 tipos de chart, `upsertFilter` compartilhado com toggle, checkbox "Usar como filtro" na aba Setup.
- [x] **Version history** — feito: tabela `dashboard_versions` (`init.sql:113-122`), rotas list/get/create/restore (`dashboards.ts:114-200`), restore é transacional (snapshot do estado atual antes de restaurar, `BEGIN`/`COMMIT`).
- [x] **Member management + viewer mode** — feito: convite/listagem/remoção/troca de role em `members.ts` (com guarda de "último owner"), UI em `MembersPage.tsx`, modo viewer aplicado no editor (`DashboardEditorPage.tsx`: `isViewer`, `readOnly`, `canEdit={!isViewer}`).
- [x] **Templates / galeria de dashboard** — feito: 3 templates fixos (Vendas/Marketing/NPS) + templates customizados por tenant (`dashboard_templates` table, rotas `/api/dashboard-templates`, botão "Salvar como template" no editor, galeria unificada em `DashboardsPage.tsx`).
- [ ] **Temas / brand kit** — ainda binário. Confirmado no core: `dashjs/src/styles/dashjs.css` tem só 18 custom properties, um par `--dashjs-accent`/`--dashjs-accent-hover` (linhas 14-15 light, 49-50 dark), toggle via `[data-dashjs-theme='dark']`. App (`jss_dashjs/src`) não sobrescreve nada disso. Sem paleta customizável ou kit de marca.
- [ ] **Itens de menu ainda não implementados** — `menuModel.ts` no core: Snap to grid (`:161`, `comingSoon: true`), Manage pages (`:189`, `comingSoon: true`), Group/Ungroup (`:204-205`, `comingSoon: true`), copy/duplicate de **dashboard inteiro** (só existe duplicar página `:184` e duplicar card `:147,149` — não achei nada pra copiar o dashboard todo). **Correção**: Align/Distribute **já foram implementados** — não é mais gap. Vivem no painel de propriedades multi-seleção (`DashboardEditor.ts:1705-1743`, handlers `:5148-5156`), não no menu Format (que ainda mostra `comingSoon` ali, mas a função já existe por outro caminho).

## Export

- [ ] **Export real de PDF/imagem** — **parcialmente desatualizado**. O core já tem um fluxo dedicado "Imprimir/Baixar PDF" (`DashboardEditor.ts:7609` `printDashboard()`, menu `Cmd/Ctrl+P`, `menuModel.ts:137`) com modal de seleção de widgets e isolamento de DOM antes do print — não é mais só apertar Ctrl+P cru. Mas o mecanismo por baixo continua sendo `window.print()` do navegador, não geração real de PNG/PDF (sem `jspdf`/`html2canvas`/`puppeteer` em nenhum dos dois repos). Export de PNG por chart individual sumiu de vez: existia via `Highcharts.exportChart()`, mas o commit `ae66194` trocou Highcharts por `@lemonadejs/chart` em todos os tipos — não tem substituto ainda. Relatório agendado por e-mail: **ainda não existe**, e o próprio `dashjs/ROADMAP.md:61-66` marca como "baixa viabilidade pra lib", propondo só um hook `onThresholdCrossed` futuro (também não implementado).

## Charts

- [ ] **Mapa / geo chart** — confirmado ainda não implementado: `FieldType` em `domain.ts:50` inclui `'geo'`, mas nenhum chart type consome esse campo.
- [ ] **Radar chart** — confirmado ainda não implementado (`dashjs/README.md:172`, lista "What's not done yet").

## Dados

- [ ] **Data blending mais robusto** — **nuance nova**: a engine (`blendEngine.ts:9-44`) já suporta arquitetura de 1 fonte-base + N joins em loop (não é mais hard-capped em 2 no motor). Mas a UI do editor só expõe/edita `blend.joins[0]` (`DashboardEditor.ts:3285,3332`) — na prática o usuário só consegue montar um blend de 2 fontes hoje, é limitação de UI e não do modelo de dados. `JoinType` (`domain.ts:537`) continua só `left | inner | cross`, sem right/full-outer. Sem star-schema, sem pipeline de transformação persistente (tipo dbt).

## Itens novos do core que abrem oportunidade (não estavam neste doc)

- [ ] **Bundle de viewer dedicado** (`dashjs.view()`) — hoje o modo público/`readOnly` monta a mesma classe monolítica do editor com o chrome escondido via CSS, não uma árvore tree-shaken separada. Afeta peso de bundle da `PublicDashboardView.tsx`.
- [ ] **Pivot table, comparação período-a-período, anotações de chart, camada semântica (métricas reusáveis), consulta em linguagem natural, colaboração multi-usuário em tempo real** — todos aparecem como itens abertos no `dashjs/ROADMAP.md` (itens #5, #6, #8, #11, #12, #13). Nenhum tem trabalho de app (`jss_dashjs`) associado ainda; ficam pra avaliar depois dos itens acima.

---

## Onde eu focaria primeiro

1. ~~**Publish / share link**~~ — feito em 2026-07-03
2. ~~**Refresh agendado** dos datasets~~ — feito em 2026-07-03
3. ~~**Cross-filtering** entre charts~~ — feito em 2026-07-03
4. ~~**Conector Postgres**~~ — feito em 2026-07-03
5. ~~**Auth / multi-usuário, roles, tenancy**~~ — feito (commits `ae85fd7`…`acbb9d3`)
6. ~~**Version history**~~ — feito
7. ~~**Member management + viewer mode**~~ — feito
8. ~~**Templates / galeria de dashboard**~~ — feito em 2026-07-09

Bloqueador grande caiu (auth). Editor já tem cross-filter, publish, refresh, versionamento, permissões e templates. Onboarding de tenant novo já não cai em tela vazia.

**Próxima prioridade: Temas / brand kit.**

Motivo: mesma categoria "feel" de Studio, agora o item mais crítico que falta pra produto parecer "de marca" — hoje só light/dark binário, um accent color só, confirmado até no CSS do core. Depois, em ordem de impacto percebido: GA4 completo → MySQL/Sheets → export real de PNG/PDF (Highcharts saiu do core, então export por chart precisa de solução nova) → geo/radar chart → UI de blend com mais de 2 fontes (motor já aguenta, só falta expor) → itens de menu (manage pages, snap-to-grid, group/ungroup, copy dashboard).
