# Plano de Implementação: Dark Mode + Busca Global (Command Palette)

## Visão Geral

Adicionar dois recursos de UI ao jss_dashjs:

1. **Dark mode** — alternância manual claro/escuro persistida em `localStorage`, cobrindo tanto a casca MUI (sidebar, cards, páginas, diálogos) quanto os gráficos renderizados pelo dashjs.
2. **Busca global** — um *command palette* (Ctrl/Cmd+K) que pesquisa dashboards, datasets e conexões por nome + metadados e navega direto para o item.

Ambos respeitam a direção visual "Studio" já estabelecida (paleta clay/sage, tipografia Space Grotesk/Inter, rail de 64px).

## Análise do Estado Atual

- **Tema único e estático.** `src/theme.ts` exporta um `createTheme({ mode: 'light', ... })` com cores hardcoded (`#FAF9F7`, `#FFFFFF`, `#211F1C`, `#E7E3DC`). Os `components` overrides (`theme.ts:35-61`) hardcodam cores claras (AppBar `#FFFFFF`, Drawer `#FAF9F7`), então precisam virar theme-aware para o dark funcionar. `App.tsx:14` injeta esse `theme` fixo; não existe contexto nem toggle.
- **Gráficos suportam dark nativamente.** A doc `../jspreadsheet/dashjs/docs/theming.md:31-63` mostra que o dashjs aceita `theme: 'dark'` na factory e permite alternar em runtime com `element.setAttribute('data-dashjs-theme', 'dark')` — sem remontar. Modais do dashjs anexados ao `body` copiam esse atributo automaticamente.
- **`DashjsMount` monta uma vez** (`src/components/DashjsMount.tsx:18-24`, deps vazias) com options via `ref`. Ideal para setar o atributo de tema em um `useEffect` separado reagindo ao mode.
- **Cor hardcoded no editor.** `src/pages/DashboardEditorPage.tsx:147` usa `borderBottom: '1px solid rgba(0,0,0,0.08)'`, que fica invisível/errado no dark — trocar por `divider`.
- **Três fontes de busca, todas com `id` + `name`:** `datasetsApi.list()`, `dashboardsApi.list()`, `connectionsApi.list()` (`src/lib/api.ts`). `ConnectionMeta.config` já traz `projectId`/`clientEmail` (metadados indexáveis sem fetch extra).
- **Navegação difere por tipo.** Dashboards têm rota própria (`/dashboards/:id`). Datasets e conexões são selecionados via **estado local** (`selectedId` em `DataPage.tsx:34` e `ConnectionsPage.tsx:37`), sem refletir na URL — hoje não há como linkar direto para um item selecionado. A busca precisa de um mecanismo de pré-seleção.

## Estado Final Desejado

- Um botão de sol/lua no AppBar alterna o tema; a escolha persiste entre reloads. Sidebar, cards, diálogos, páginas e os gráficos dashjs ficam todos coerentemente escuros ou claros.
- `Ctrl/Cmd+K` (ou clique na lupa do AppBar) abre um palette central. Digitar filtra dashboards/datasets/conexões por nome e metadados; setas + Enter navegam; selecionar leva à página certa com o item já aberto.
- Verificação: `npm run typecheck` e `npm run build` passam; toggle e palette funcionam manualmente nos 4 fluxos.

### Descobertas Chave:
- Tema dark do dashjs via atributo em runtime: `theming.md:53-63`.
- Overrides de componentes precisam ser theme-aware: `theme.ts:35-61`.
- `DashjsMount` monta uma vez; setar atributo por `useEffect` separado: `DashjsMount.tsx:18-26`.
- Seleção de dataset/conexão é estado local, não URL: `DataPage.tsx:34`, `ConnectionsPage.tsx:37`.
- Metadados de conexão já vêm na listagem: `api.ts:35-42`.

---

## Fases de Implementação

### Fase 1: Infraestrutura de tema (dark/light na casca MUI)

**Objetivo**: Permitir alternar entre tema claro e escuro, com persistência, aplicando a paleta Studio nas duas variantes.

**Mudanças**:

1. `src/theme.ts` — substituir o `theme` exportado por uma factory `createAppTheme(mode: 'light' | 'dark')`. Extrair os tokens em dois conjuntos e tornar os overrides theme-aware (usando os valores do `palette` em vez de hex fixo).
   ```ts
   import { createTheme, type PaletteMode } from '@mui/material/styles'

   const displayFont = '"Space Grotesk", "Inter", "Segoe UI", sans-serif'

   const tokens = {
     light: {
       primary: '#BD5B3D', secondary: '#6B8A6E',
       bg: '#FAF9F7', paper: '#FFFFFF',
       text: '#211F1C', divider: '#E7E3DC',
     },
     dark: {
       // Studio em dark: warm dark, não cinza puro
       primary: '#D0765A', secondary: '#89A88C', // levemente clareados p/ contraste AA
       bg: '#1B1A18', paper: '#232120',
       text: '#ECE8E1', divider: '#38342E',
     },
   } as const

   export function createAppTheme(mode: PaletteMode) {
     const t = tokens[mode]
     return createTheme({
       palette: {
         mode,
         primary: { main: t.primary },
         secondary: { main: t.secondary },
         background: { default: t.bg, paper: t.paper },
         text: { primary: t.text },
         divider: t.divider,
       },
       typography: { /* inalterado */ },
       shape: { borderRadius: 12 },
       components: {
         MuiAppBar: { styleOverrides: { root: {
           backgroundColor: t.paper, color: t.text,
           boxShadow: 'none', borderBottom: `1px solid ${t.divider}`,
         } } },
         MuiDrawer: { styleOverrides: { paper: {
           borderRight: `1px solid ${t.divider}`, backgroundColor: t.bg,
         } } },
         MuiCard: { styleOverrides: { root: {
           boxShadow: mode === 'light'
             ? '0 1px 2px rgba(0,0,0,0.04), 0 8px 20px -12px rgba(0,0,0,0.08)'
             : '0 1px 2px rgba(0,0,0,0.4), 0 8px 20px -12px rgba(0,0,0,0.6)',
         } } },
       },
     })
   }
   ```

2. `src/theme/colorMode.tsx` *(novo)* — contexto + hook de color mode com persistência.
   ```ts
   const STORAGE_KEY = 'jss-color-mode'
   // Provider: useState inicializado de localStorage (default 'light'),
   // toggle() alterna e grava, expõe { mode, toggle } via contexto.
   // useColorMode() lê o contexto.
   ```

3. `src/App.tsx` — envolver com o `ColorModeProvider`; derivar o tema com `useMemo(() => createAppTheme(mode), [mode])` e passar ao `ThemeProvider`. `CssBaseline` já aplica `background.default` no `body`.

4. `src/layout/AppShell.tsx` — adicionar `IconButton` à direita do `Toolbar` (usar `Box flexGrow:1` como espaçador) com `Brightness7Icon`/`Brightness4Icon` chamando `toggle()`, com `Tooltip`.

**Critérios de Sucesso**:

Automatizados:
- [x] `npm run typecheck` passa
- [x] `npm run build` passa

Manuais:
- [x] Toggle no AppBar alterna toda a casca (sidebar, páginas, cards, diálogos) entre claro e escuro
- [x] A escolha persiste após reload (localStorage `jss-color-mode`)
- [x] Nenhum resíduo de cor clara hardcoded aparece no dark (AppBar/Drawer corretos)

---

### Fase 2: Dark mode nos gráficos (dashjs)

**Objetivo**: Propagar o color mode aos dashboards renderizados pelo dashjs e eliminar cores hardcoded no editor.

**Mudanças**:

1. `src/components/DashjsMount.tsx` — aceitar `colorMode?: 'light' | 'dark'` (default do contexto). Incluir `theme: colorMode` nas options iniciais e adicionar um `useEffect([colorMode])` que aplica/remove o atributo no container montado:
   ```ts
   useEffect(() => {
     const el = ref.current
     if (!el) return
     if (colorMode === 'dark') el.setAttribute('data-dashjs-theme', 'dark')
     else el.removeAttribute('data-dashjs-theme')
   }, [colorMode])
   ```
   Isso alterna o tema do chart em runtime sem remontar (conforme `theming.md:53-63`).

2. `src/components/DashjsMount.tsx` — consumir `useColorMode()` internamente se `colorMode` não for passado, para todo mount herdar o tema global automaticamente.

3. `src/pages/DashboardEditorPage.tsx:147` — trocar `borderBottom: '1px solid rgba(0,0,0,0.08)'` por `borderBottom: 1, borderColor: 'divider'`. Auditar o resto do arquivo por outros hex/rgba fixos e trocá-los por tokens do tema.

**Critérios de Sucesso**:

Automatizados:
- [x] `npm run typecheck` passa
- [x] `npm run build` passa

Manuais:
- [x] Abrir um dashboard e alternar o tema: os gráficos passam a fundo escuro e texto claro sem recarregar
- [ ] Modais/overlays do dashjs também respeitam o tema escuro (não testado manualmente — nenhum modal foi aberto durante a verificação automatizada)
- [x] A toolbar do editor não tem bordas invisíveis/erradas no dark

---

### Fase 3: Command palette (busca global)

**Objetivo**: Um modal de busca acionado por Ctrl/Cmd+K que indexa as 3 fontes por nome + metadados e navega para o item.

**Mudanças**:

1. `src/components/CommandPalette.tsx` *(novo)* — `Dialog` MUI (aberto via prop), `TextField` com autofocus, lista de resultados agrupada por tipo (Dashboards / Datasets / Conexões) com ícone por grupo (`DashboardIcon`/`StorageIcon`/`CableIcon`). Navegação por teclado: ↑/↓ move o destaque, Enter seleciona, Esc fecha.
   - **Índice**: ao abrir, buscar em paralelo `dashboardsApi.list()`, `datasetsApi.list()`, `connectionsApi.list()`. Para cada item, montar uma string de busca:
     - dashboard: `name`
     - dataset: `name` + `sourceType`
     - conexão: `name` + `type` + `config.projectId` + `config.clientEmail`
   - **Match**: substring case-insensitive sobre a string indexada; ordenar por (a) match no início do nome, (b) match no nome, (c) match em metadado.
   - **Navegação** ao selecionar:
     - dashboard → `navigate('/dashboards/' + id)`
     - dataset → `navigate('/data?select=' + id)`
     - conexão → `navigate('/connections?select=' + id)`
     - fechar o palette após navegar.

2. `src/layout/AppShell.tsx` — renderizar `<CommandPalette open={...} onClose={...} />` (dentro do Router, disponível em todas as rotas). Adicionar:
   - listener global de `keydown` (`useEffect`) para `(e.metaKey || e.ctrlKey) && e.key === 'k'` → `e.preventDefault()` e abrir; ignorar quando o foco já está num input do próprio palette.
   - um `IconButton` com `SearchIcon` no AppBar (ao lado do toggle de tema) que também abre, com dica visual "⌘K".

**Critérios de Sucesso**:

Automatizados:
- [x] `npm run typecheck` passa
- [x] `npm run build` passa

Manuais:
- [x] Ctrl/Cmd+K abre o palette de qualquer página; Esc fecha
- [x] Digitar filtra as 3 categorias; buscar por `projectId` de uma conexão a encontra
- [x] ↑/↓ + Enter navegam e selecionam sem usar o mouse
- [x] Selecionar um dashboard abre `/dashboards/:id`
- [x] O palette respeita o dark mode

---

### Fase 4: Pré-seleção via URL em Data e Conexões

**Objetivo**: Fazer os resultados de dataset/conexão abrirem o item correto já selecionado (hoje a seleção é só estado local).

**Mudanças**:

1. `src/pages/DataPage.tsx` — importar `useSearchParams`; num `useEffect`, se houver `?select=<id>` e o id existir em `datasets`, chamar `setSelectedId(id)` (respeitando o fallback existente em `DataPage.tsx:41`). Opcional: limpar o param após aplicar.

2. `src/pages/ConnectionsPage.tsx` — mesmo padrão com `?select=<id>` → `setSelectedId(id)` (integrar com o efeito de default em `ConnectionsPage.tsx:44-47`).

3. *(Verificação)* Confirmar que `DashboardsPage`/rota `:id` não precisa de mudança (já navega por rota).

**Critérios de Sucesso**:

Automatizados:
- [x] `npm run typecheck` passa
- [x] `npm run build` passa

Manuais:
- [x] Buscar um dataset no palette abre `/data` com ele selecionado no master-detail
- [x] Buscar uma conexão abre `/connections` com ela selecionada
- [x] Navegar para um id inexistente cai no fallback (primeiro item) sem quebrar

---

## Notas de Implementação

- **Ordem sugerida**: Fase 1 → 2 (tema completo primeiro) e Fase 3 → 4 (busca depois). Fases 1–2 e 3–4 são independentes entre si.
- **Contraste no dark**: os acentos clay/sage foram levemente clareados no dark (`#D0765A`/`#89A88C`) para manter legibilidade sobre fundo escuro; ajustar se destoar da identidade Studio.
- **Sem novas dependências**: tudo usa MUI + react-router-dom já presentes. Ícones (`Brightness4/7`, `Search`) vêm de `@mui/icons-material`, já instalado.
- **Persistência**: chave localStorage `jss-color-mode`; default `'light'` conforme a decisão de UX.
- **FOUC do tema**: como o default é claro e o mode é lido de localStorage no primeiro render do Provider, não há flash relevante; se o default virar "seguir SO" no futuro, reconsiderar leitura síncrona antes do mount.

## Questões em Aberto

Nenhuma — decisões de design confirmadas: toggle manual persistido, dark cobrindo casca + gráficos, invocação por command palette (Ctrl/Cmd+K), busca por nome + metadados disponíveis na listagem (colunas de dataset ficam como extensão futura, exigiria fetch por dataset).
