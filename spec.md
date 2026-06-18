# Plano de Implementação: jss_dashjs — Analytics Dashboard com JSS + dashjs

## Visão Geral

Criar um novo projeto React em `/home/fernandes/jss_dashjs` que integra **Jspreadsheet (JSS)** e **dashjs** como bibliotecas dentro de um painel estilo Google Analytics. O JSS fica numa seção independente de planilhas; o dashjs monta os dashboards de análise. CSV upload é o fluxo de dados do MVP; Google Analytics (GA4) fica como fase 2 com interface já preparada.

---

## Análise do Estado Atual

### dashjs como lib
- `package.json` já tem `main`/`module`/`types`/`exports` configurados para distribuição (`/home/fernandes/jspreadsheet/dashjs/package.json`)
- `vite.config.ts:10-34` faz build em modo lib (ESM + CJS) com todas as peer deps externalizadas
- API pública limpa: `dashjs(element, options): { destroy }` — framework-agnostic, encaixa em React via `useEffect` + `ref`
- **`dist/` ainda não existe** — é o primeiro passo da implementação: rodar `npm run build` e validar o packaging
- Peer deps obrigatórias: `jspreadsheet`, `jsuites`, `lemonadejs`, `gridstack`, `highcharts`, `lucide`, `tabularjs`

### Jspreadsheet (JSS)
- Mesma família que o dashjs (licença evaluation disponível)
- API imperativa: `jspreadsheet(element, options)` — mesmo padrão de montagem que o dashjs
- Suporta import de CSV nativo (`jspreadsheet.csv`)

### Projeto React — do zero
- Ainda não existe (`/home/fernandes/jss_dashjs/` acabou de ser criado)
- Stack decidida: Vite + React + TypeScript + MUI

---

## Estado Final Desejado

Um painel web rodando em `http://localhost:5173` (ou similar) com:

1. **Shell MUI**: AppBar + Drawer lateral, tema claro/escuro
2. **Seção "Planilhas"** (`/sheets`): lista + editor de planilhas JSS; botão de upload CSV
3. **Seção "Dashboards"** (`/dashboards`): lista de dashboards; abre editor dashjs em tela cheia
4. **Fluxo CSV → Dashboard**: upload de CSV preenche uma planilha JSS e disponibiliza os campos como `dataSource` para o dashjs
5. **Interface GA4 preparada** (fase 2): conector visível mas com `[em breve]`, sem implementação

### Como verificar o estado final:
- `npm run build` no dashjs produz `dist/dashjs.mjs` sem erros
- `npm install` no React resolve `dashjs` via `file:` sem erros de tipo
- Upload de um CSV no painel aparece na planilha JSS e nos campos do dashjs
- Criar um gráfico de barras no dashjs usando colunas do CSV

---

## Descobertas Chave

- `src/index.ts:48-57` — `dashjs(element, opts)` retorna `{ destroy }`. O wrapper React correto é `useEffect(() => { const i = dashjs(ref.current!, opts); return () => i.destroy() }, [])`
- `src/core/types.ts:33-43` — `DashJsDataSource.listFields` + `getChartData` é onde o CSV plugado via JSS vai alimentar os charts
- `vite.config.ts:19-26` — as peer deps são todas externas; o projeto React precisa instalar todas elas no próprio `package.json`
- `src/styles/dashjs.css` precisa ser importado separadamente (`import 'dashjs/styles'`) — está mapeado em `exports["./styles"]`

---

## Fases de Implementação

### Fase 1 — Build + Validação da lib dashjs

**Objetivo**: Confirmar que o dashjs já se comporta como uma lib consumível; gerar o `dist/` que o React vai consumir.

**Mudanças**:

1. `(terminal — no diretório dashjs)` — rodar build da lib
   ```bash
   cd /home/fernandes/jspreadsheet/dashjs
   npm run build
   # Deve produzir: dist/dashjs.mjs, dist/dashjs.cjs, dist/dashjs.css, dist/types/index.d.ts
   ```

2. Validar que os arquivos de saída batem com o `exports` do `package.json`:
   ```
   dist/dashjs.mjs       ← module
   dist/dashjs.cjs       ← main
   dist/dashjs.css       ← ./styles
   dist/types/index.d.ts ← types
   ```

**Critérios de Sucesso**:

Automatizados:
- [x] `ls /home/fernandes/jspreadsheet/dashjs/dist` mostra os 4 artefatos acima
- [x] `npm run typecheck` no dashjs passa sem erros

Manuais:
- [ ] Nenhum erro de rollup/vite no terminal durante o build

---

### Fase 2 — Scaffold do projeto React

**Objetivo**: Criar o projeto Vite + React + TS + MUI com a estrutura de pastas e rotas definidas.

**Mudanças**:

1. `(terminal — em /home/fernandes)` — criar o projeto
   ```bash
   cd /home/fernandes
   npm create vite@latest jss_dashjs -- --template react-ts
   cd jss_dashjs
   ```

2. Instalar dependências do shell:
   ```bash
   npm install @mui/material @mui/icons-material @emotion/react @emotion/styled react-router-dom
   ```

3. Instalar dashjs via `file:` + todas as peer deps:
   ```bash
   npm install \
     dashjs@file:../jspreadsheet/dashjs \
     jspreadsheet@^12 jsuites@^6 lemonadejs@^5 \
     gridstack@^12 highcharts@^12 lucide@^0.460 tabularjs@^1
   ```

4. Instalar JSS (é a mesma `jspreadsheet` que já foi instalada acima — não precisa de pacote extra)

5. Estrutura de pastas a criar em `src/`:
   ```
   src/
   ├── main.tsx
   ├── App.tsx                      ← Router + tema MUI
   ├── theme.ts                     ← MUI createTheme (claro/escuro)
   ├── layout/
   │   └── AppShell.tsx             ← AppBar + Drawer + <Outlet/>
   ├── pages/
   │   ├── SheetsPage.tsx           ← seção Planilhas
   │   ├── DashboardsPage.tsx       ← lista de dashboards
   │   └── DashboardEditorPage.tsx  ← editor dashjs em tela cheia
   └── components/
       ├── JssMount.tsx             ← wrapper imperativo do JSS
       └── DashjsMount.tsx          ← wrapper imperativo do dashjs
   ```

6. `src/App.tsx` — rotas:
   ```tsx
   <Routes>
     <Route path="/" element={<AppShell />}>
       <Route index element={<Navigate to="/sheets" />} />
       <Route path="sheets" element={<SheetsPage />} />
       <Route path="dashboards" element={<DashboardsPage />} />
       <Route path="dashboards/:id" element={<DashboardEditorPage />} />
     </Route>
   </Routes>
   ```

**Critérios de Sucesso**:

Automatizados:
- [x] `npm run dev` sobe sem erros de TypeScript
- [x] `npm run build` compila sem erros

Manuais:
- [ ] Navegar para `/sheets` e `/dashboards` — rotas respondem sem crash
- [ ] Drawer lateral aparece com links para ambas as seções

---

### Fase 3 — Wrapper React para dashjs + JSS

**Objetivo**: Criar os dois componentes imperativo-mount que encapsulam dashjs e JSS dentro de React de forma idiomática.

**Mudanças**:

1. `src/components/DashjsMount.tsx` — monta o dashjs num `div` via `useEffect`:
   ```tsx
   import { useEffect, useRef } from 'react'
   import dashjs from 'dashjs'
   import 'dashjs/styles'
   import type { DashJsOptions } from 'dashjs'

   interface Props {
     options: DashJsOptions
     style?: React.CSSProperties
   }

   export function DashjsMount({ options, style }: Props) {
     const ref = useRef<HTMLDivElement>(null)

     useEffect(() => {
       if (!ref.current) return
       const instance = dashjs(ref.current, options)
       return () => instance.destroy()
     // options é estável (passado pelo pai com useMemo/useCallback)
     }, []) // eslint-disable-line react-hooks/exhaustive-deps

     return <div ref={ref} style={{ width: '100%', height: '100%', ...style }} />
   }
   ```

   > **Por que o array de deps vazio:** dashjs gerencia seu próprio estado internamente; re-montar destruiria o editor. O pai passa um `options` estável com `useMemo` e usa a API imperativa (`instance`) para atualizações subsequentes se necessário.

2. `src/components/JssMount.tsx` — monta o JSS:
   ```tsx
   import { useEffect, useRef, useState } from 'react'
   import jspreadsheet from 'jspreadsheet'
   import 'jsuites/dist/jsuites.css'
   import 'jspreadsheet/dist/jspreadsheet.css'
   import type { JspreadsheetInstance } from 'jspreadsheet'

   interface Props {
     data?: (string | number)[][]
     columns?: { title: string; width?: number }[]
     onDataChange?: (data: (string | number)[][]) => void
   }

   export function JssMount({ data, columns, onDataChange }: Props) {
     const ref = useRef<HTMLDivElement>(null)
     const instanceRef = useRef<JspreadsheetInstance | null>(null)

     useEffect(() => {
       if (!ref.current) return
       instanceRef.current = jspreadsheet(ref.current, {
         data: data ?? [[]],
         columns: columns ?? [],
         onchange: () => {
           if (onDataChange && instanceRef.current) {
             onDataChange(instanceRef.current.getData())
           }
         },
       })
       jspreadsheet.setLicense('evaluation')
       return () => {
         instanceRef.current?.destroy()
       }
     }, []) // eslint-disable-line react-hooks/exhaustive-deps

     return <div ref={ref} style={{ width: '100%', overflow: 'auto' }} />
   }
   ```

**Critérios de Sucesso**:

Automatizados:
- [x] TypeScript compila sem erros nos dois componentes

Manuais:
- [ ] Montar `<DashjsMount options={{}} />` numa página → editor dashjs aparece sem erro no console
- [ ] Montar `<JssMount data={[['a','b'],['1','2']]} />` → planilha aparece editável

---

### Fase 4 — Seção Planilhas (JSS)

**Objetivo**: Página `/sheets` com lista de planilhas, criação nova, upload de CSV e visualização do grid JSS.

**Mudanças**:

1. `src/pages/SheetsPage.tsx` — layout:
   ```
   ┌─────────────────────────────────────────────┐
   │ Planilhas            [+ Nova]  [↑ CSV]       │
   ├──────────────────┬──────────────────────────┤
   │ Lista (sidebar)  │  Grid JSS (JssMount)     │
   │  • Planilha 1    │  ← planilha selecionada  │
   │  • Planilha 2    │                          │
   └──────────────────┴──────────────────────────┘
   ```

2. Estado local (ou `sheetsStore.ts` com `useState` + Context):
   ```ts
   interface Sheet {
     id: string
     name: string
     columns: { title: string }[]
     data: (string | number)[][]
   }
   ```

3. **Upload CSV**: botão abre `<input type="file" accept=".csv" />`. O CSV é parseado com `jspreadsheet.csv` (ou `Papa.parse` via raw JS — instalar `papaparse` se necessário). Os dados parseados alimentam um novo `Sheet`.

4. Os dados da planilha ativa são guardados em estado React (`sheetsStore`). Esse estado é a **fonte da bridge** para o dashjs na fase 5.

**Critérios de Sucesso**:

Automatizados:
- [x] `npm run build` sem erros de tipo

Manuais:
- [ ] Clicar em "CSV" → selecionar um CSV → planilha aparece no grid com as colunas
- [ ] Editar célula na planilha → valor persiste na lista (não volta pra zero)
- [ ] Criar segunda planilha → trocar entre elas na lista

---

### Fase 5 — Seção Dashboards (dashjs) + bridge CSV → charts

**Objetivo**: Página `/dashboards` com lista de dashboards; editor dashjs em tela cheia com o `dataSource` alimentado pela planilha JSS ativa.

**Mudanças**:

1. `src/pages/DashboardsPage.tsx` — lista de dashboards com botão "Novo":
   ```
   ┌────────────────────────────────────┐
   │ Dashboards              [+ Novo]   │
   ├────────────────────────────────────┤
   │  🗂 Dashboard 1           [Abrir] │
   │  🗂 Dashboard 2           [Abrir] │
   └────────────────────────────────────┘
   ```

2. `src/pages/DashboardEditorPage.tsx` — monta `<DashjsMount>` em tela cheia:
   ```tsx
   // Pega a planilha ativa do sheetsStore e monta o dataSource
   const activeSheet = useSheetsStore(s => s.activeSheet)

   const dataSource = useMemo(() => buildDataSource(activeSheet), [activeSheet])

   const options = useMemo(() => ({
     dashboard: loadDashboard(id),
     dataSource,
     onSave: (d) => saveDashboard(id, d),
   }), [dataSource])

   return <DashjsMount options={options} style={{ height: 'calc(100vh - 64px)' }} />
   ```

3. `src/lib/buildDataSource.ts` — converte `Sheet` em `DashJsDataSource`:
   ```ts
   import type { DashJsDataSource, DataField } from 'dashjs'

   export function buildDataSource(sheet: Sheet | null): DashJsDataSource {
     return {
       listFields: (): DataField[] => {
         if (!sheet) return []
         return sheet.columns.map((col, i) => ({
           id: `col_${i}`,
           name: col.title,
           type: guessFieldType(sheet.data, i), // 'string' | 'number'
         }))
       },
       getChartData: (chart) => {
         if (!sheet) return []
         // Agrupar/agregar as linhas da planilha pela dimensão do chart
         return aggregateSheetData(sheet.data, sheet.columns, chart)
       },
     }
   }
   ```

4. Persistência de dashboards em `localStorage` (MVP) — `saveDashboard` / `loadDashboard`:
   ```ts
   const STORAGE_KEY = 'jss_dashboards'
   export function saveDashboard(id: string, d: DashboardFull) {
     const all = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
     localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...all, [id]: d }))
   }
   ```

**Critérios de Sucesso**:

Automatizados:
- [x] `npm run build` sem erros

Manuais:
- [ ] Subir CSV na seção Planilhas → ir para Dashboards → abrir dashboard → painel "Dados" do dashjs mostra os campos do CSV
- [ ] Criar gráfico de barras arrastando um campo → barras aparecem com os valores do CSV
- [ ] Salvar dashboard → recarregar a página → dashboard persiste

---

### Fase 6 — Interface GA4 (stub preparado para fase 2)

**Objetivo**: Adicionar um conector "Google Analytics" visível na UI com estado `[em breve]`, sem implementação real — mas com a interface TypeScript já definida para facilitar a fase 2.

**Mudanças**:

1. `src/connectors/ga4Connector.ts` — interface tipada:
   ```ts
   import type { DashJsDataSource } from 'dashjs'

   export interface GA4ConnectorOptions {
     propertyId: string
     accessToken: string
   }

   // Fase 2: implementar com GA4 Data API via backend proxy (Node/Express)
   export function createGA4DataSource(_opts: GA4ConnectorOptions): DashJsDataSource {
     throw new Error('GA4 connector not implemented yet — coming in Phase 2')
   }
   ```

2. Na `DashboardEditorPage.tsx` — seletor de fonte de dados:
   ```
   [Planilha ativa ▾]  ← dropdown
   ├ Nenhuma
   ├ Planilha 1 (CSV)
   └ Google Analytics ← desabilitado, tooltip "Em breve"
   ```

3. Documentar o plano da fase 2 em comentário JSDoc:
   ```ts
   /**
    * GA4 Phase 2 plan:
    * - Backend: Node/Express em /api/ga4 usando @googleapis/analyticsdata
    * - Auth: service account JSON no servidor (nunca exposto ao browser)
    * - React: GA4ConnectorOptions com propertyId (configurável por dashboard)
    */
   ```

**Critérios de Sucesso**:

Manuais:
- [ ] Dropdown de fonte aparece no editor de dashboard
- [ ] Opção "Google Analytics" aparece com tooltip "Em breve" e não quebra nada ao tentar selecionar

---

## Arquitetura de Estado

```
sheetsStore (Context/useState)
  └── sheets: Sheet[]
  └── activeSheetId: string | null

dashboardsStore (localStorage)
  └── dashboards: Record<id, DashboardFull>

Fluxo:
  CSV upload → sheetsStore.sheets
  SheetsPage → JssMount ← sheetsStore
  DashboardEditorPage → buildDataSource(activeSheet) → DashjsMount options.dataSource
```

---

## Notas de Implementação

- **CSS do JSS**: `jsuites/dist/jsuites.css` e `jspreadsheet/dist/jspreadsheet.css` precisam ser importados no projeto React. O CSS do dashjs vem via `import 'dashjs/styles'` dentro do `DashjsMount`.
- **Licença `evaluation`**: o `dashjs/src/index.ts:19` já chama `jspreadsheet.setLicense('evaluation')` no carregamento. Se o JSS for usado separado no `JssMount`, chamar `jspreadsheet.setLicense('evaluation')` lá também.
- **StrictMode**: o React `<StrictMode>` chama `useEffect` duas vezes em dev. O `useEffect` com cleanup `instance.destroy()` já garante que a segunda montagem destrói a primeira — o dashjs e o JSS suportam isso.
- **Dependência circular de opções**: passar o objeto `options` para `DashjsMount` SEM `useMemo` re-monta o editor a cada render. O pai DEVE usar `useMemo`.
- **Altura do dashjs**: o dashjs precisa de altura explícita no elemento pai (não `auto`). Usar `calc(100vh - 64px)` para descontar o AppBar.

---

## Questões em Aberto

Nenhuma — todas as decisões foram tomadas.

Resumo das decisões:
| Decisão | Escolha |
|---|---|
| Fonte de dados MVP | CSV upload |
| GA4 | Interface preparada, impl. fase 2 |
| Auth GA4 (fase 2) | Mini-servidor Node (definir depois) |
| Papel do JSS | Visualizador + editor; seção separada de dashboards |
| Consumo dashjs | Build dist + `file:` local |
| Shell UI | Vite + React + TS + MUI |
| Persistência dashboards | localStorage (MVP) |
