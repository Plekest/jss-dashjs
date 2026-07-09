# Plano de Implementação: Planilha inline em /data

## Visão Geral

Hoje, ao clicar na aba "Planilha" no detalhe de um dataset em `/data`, o app navega pra uma tela cheia separada (`/sheets`). Isso quebra o fluxo — o usuário perde o contexto do dataset selecionado e o layout master-detail de `/data`. Este plano move o editor de planilha pra dentro da própria aba "Planilha" em `DataPage.tsx`, ao lado de "Overview" e "Alertas", e remove a tela/rota `/sheets`.

## Análise do Estado Atual

- `DataPage.tsx:213-230` tem `Tabs` (Overview/Planilha/Alertas). Clicar em "Planilha" (`value === 1`) chama `setActiveDataset(selected.id)` (popula o `activeDataset` global do `datasetsStore`) e `navigate('/sheets')` — não renderiza nada inline.
- `SheetsPage.tsx` é uma tela cheia própria: sidebar com lista de todos os datasets (redundante com a lista que já existe em `/data`), toolbar de salvar (dirty-state local via `pendingData`/`pendingWorksheets`, botão "Salvar"), e `JssMount` (grid jspreadsheet, modo simples ou pro conforme `hasProLicense`). Lê/escreve em `activeDataset`/`activeDatasetId`/`updateDataset` do `datasetsStore` global.
- `App.tsx:55` registra `<Route path="sheets" element={<SheetsPage />} />`. `AppShell.tsx:41-44` não tem link de navegação pra `/sheets` — só é alcançável pela aba Planilha do `DataPage`.
- `datasetsStore.tsx` expõe `activeDataset`/`activeDatasetId`/`setActiveDataset`/`updateDataset`. Confirmado por grep: **só `SheetsPage.tsx` e a chamada de navegação em `DataPage.tsx` usam esses quatro campos** — `DashboardEditorPage.tsx` tem seu próprio `useState` local homônimo (`activeDataset`), não relacionado ao store. `createDataset`/`removeDataset`/`datasets`/`loading`/`refresh` continuam usados em outros lugares (`AddDataSourceWizard.tsx`, `DataPage.tsx`) e ficam.
- `DataPage.tsx` já busca o dataset completo sob demanda em outra aba: `AlertsPanel.tsx` (implementado nesta sessão) recebe só `datasetId` e busca `datasetsApi.get(datasetId)` por conta própria, sem tocar no `activeDataset` global — é o padrão a seguir aqui também, pra não acoplar com o `DashboardEditorPage`.
- `DashboardEditorPage.tsx:70-125` tem o padrão de guarda de alterações não salvas: `isDirtyRef` + `attemptLeave(action)` que roda a ação direto se não tem dirty, ou abre `UnsavedChangesDialog` (`src/components/UnsavedChangesDialog.tsx`) e guarda a ação pendente em `pendingLeaveRef` até o usuário escolher salvar/descartar/cancelar.
- `JssMount.tsx:87-164` monta o jspreadsheet num `useEffect` com deps `[]` — só lê `data`/`columns`/`worksheets` na montagem inicial. Trocar de dataset exige remontar via `key` (é o que `SheetsPage.tsx:226,234` já faz com `key={activeDataset.id}`).
- Achado à parte, fora de escopo: `src/stores/sheetsStore.tsx` (`SheetsProvider`/`useSheetsStore`) não é importado em lugar nenhum do app — código morto de um modelo de dados antigo, desconectado do `Dataset` real. Não mexo nele neste plano.

## Decisões Já Validadas com o Usuário

- Remove a rota `/sheets` e `SheetsPage.tsx` por completo — a aba "Planilha" inline vira o único lugar de editar.
- Trocar de dataset selecionado ou de aba com edições pendentes na planilha **avisa antes de descartar** (dialog, não descarte silencioso).

## Estado Final Desejado

- Em `/data`, selecionar um dataset e clicar na aba "Planilha" mostra o grid de edição (jspreadsheet, modo simples ou pro) na mesma tela, abaixo do `Tabs` Overview/Planilha/Alertas — sem navegação, sem perder a lista de datasets à esquerda.
- Editar uma célula e trocar de dataset na lista, ou trocar de aba, dispara um dialog "Você tem alterações não salvas" com opções Salvar e sair / Descartar e sair / Cancelar — mesmo padrão do `DashboardEditorPage`.
- `/sheets` não existe mais como rota; `SheetsPage.tsx` é deletado; `activeDataset`/`activeDatasetId`/`setActiveDataset`/`updateDataset` somem do `datasetsStore.tsx`.

### Descobertas Chave
- `SheetEditorPanel` (novo) não deve reusar `activeDataset` do `datasetsStore` — busca seu próprio dataset via `datasetsApi.get(datasetId)`, mesmo padrão do `AlertsPanel.tsx`. Isso permite deletar o slice `activeDataset` do store sem quebrar mais nada.
- A troca de dataset/aba é interceptada **antes** de mudar `selectedId`/`tab` — a ação real (mudar estado) fica numa ref (`pendingLeaveRef`) e só roda depois que o usuário confirma salvar ou descartar, exatamente como `DashboardEditorPage.attemptLeave`.
- `SheetEditorPanel` expõe `save()` via `useImperativeHandle`/`forwardRef` — o pai (`DataPage`) chama esse método quando o usuário escolhe "Salvar e sair" no dialog, sem precisar levantar todo o estado de edição pro componente pai.
- Descarte de edição pendente não precisa de método explícito: como a aba "Planilha" já é renderizada condicionalmente (`{tab === 1 && <SheetEditorPanel .../>}`) e o componente ganha `key={selected.id}`, trocar de aba ou de dataset desmonta o `SheetEditorPanel` e joga fora o estado local (`pendingData`/`pendingWorksheets`) — não precisa limpar nada manualmente.

## Fases de Implementação

### Fase 1: Extrair `SheetEditorPanel.tsx`

**Objetivo**: componente de edição de planilha autocontido (sem sidebar, sem navegação), pronto pra ser montado inline em qualquer lugar.

**Mudanças**:

1. `src/components/SheetEditorPanel.tsx` (novo) — extraído da "Main area" de `SheetsPage.tsx:152-242`, adaptado:
   ```tsx
   import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
   import { Box, Button, CircularProgress, Tooltip, Typography } from '@mui/material'
   import SaveIcon from '@mui/icons-material/Save'
   import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
   import { JssMount } from './JssMount'
   import { datasetsApi, type Dataset, type DatasetWorksheet } from '../lib/api'
   import { hasProLicense } from '../lib/license'

   export interface SheetEditorPanelHandle {
     save: () => Promise<void>
   }

   interface Props {
     datasetId: string
     onDirtyChange: (dirty: boolean) => void
   }

   export const SheetEditorPanel = forwardRef<SheetEditorPanelHandle, Props>(function SheetEditorPanel(
     { datasetId, onDirtyChange },
     ref,
   ) {
     const [dataset, setDataset] = useState<Dataset | null>(null)
     const [loading, setLoading] = useState(true)
     const [pendingData, setPendingData] = useState<(string | number)[][] | null>(null)
     const [pendingWorksheets, setPendingWorksheets] = useState<DatasetWorksheet[] | null>(null)
     const [saving, setSaving] = useState(false)
     const [saved, setSaved] = useState(false)

     useEffect(() => {
       setLoading(true)
       datasetsApi.get(datasetId).then((ds) => {
         setDataset(ds)
         setLoading(false)
       })
     }, [datasetId])

     const isDirty = hasProLicense ? pendingWorksheets !== null : pendingData !== null

     function handleDataChange(data: (string | number)[][]) {
       setPendingData(data)
       setSaved(false)
       onDirtyChange(true)
     }

     function handleWorksheetsChange(sheets: DatasetWorksheet[]) {
       setPendingWorksheets(sheets)
       setSaved(false)
       onDirtyChange(true)
     }

     async function handleSave() {
       if (!dataset) return
       setSaving(true)
       try {
         let updated: Dataset
         if (hasProLicense) {
           if (pendingWorksheets === null) return
           const first = pendingWorksheets[0]
           updated = await datasetsApi.update(dataset.id, {
             columns: first?.columns ?? dataset.columns,
             data: first?.data ?? [],
             meta: { worksheets: pendingWorksheets },
           })
           setPendingWorksheets(null)
         } else {
           if (pendingData === null) return
           updated = await datasetsApi.update(dataset.id, {
             columns: dataset.columns,
             data: pendingData,
           })
           setPendingData(null)
         }
         setDataset(updated)
         setSaved(true)
         onDirtyChange(false)
         setTimeout(() => setSaved(false), 2500)
       } finally {
         setSaving(false)
       }
     }

     useImperativeHandle(ref, () => ({ save: handleSave }))

     const displayData = pendingData ?? dataset?.data ?? []

     if (loading || !dataset) {
       return (
         <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
           <CircularProgress size={24} />
         </Box>
       )
     }

     return (
       <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
         <Box
           sx={{
             px: 2, py: 0.75, borderBottom: '1px solid', borderColor: 'divider',
             display: 'flex', alignItems: 'center', gap: 2, bgcolor: 'background.paper', flexShrink: 0,
           }}
         >
           <Box sx={{ flexGrow: 1 }} />
           {isDirty && (
             <Typography variant="caption" sx={{ color: 'warning.main' }}>Alterações não salvas</Typography>
           )}
           {saved && !isDirty && (
             <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'success.main' }}>
               <CheckCircleOutlineIcon sx={{ fontSize: 16 }} />
               <Typography variant="caption">Salvo</Typography>
             </Box>
           )}
           <Tooltip title={!isDirty ? 'Sem alterações pendentes' : ''}>
             <span>
               <Button
                 size="small" variant="contained"
                 startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}
                 onClick={handleSave} disabled={!isDirty || saving}
               >
                 {saving ? 'Salvando…' : 'Salvar'}
               </Button>
             </span>
           </Tooltip>
         </Box>

         <Box sx={{ flexGrow: 1, minHeight: 0, position: 'relative' }}>
           {hasProLicense ? (
             <JssMount
               key={dataset.id}
               worksheets={pendingWorksheets ?? dataset.meta?.worksheets}
               data={dataset.data}
               columns={dataset.columns}
               onWorksheetsChange={handleWorksheetsChange}
             />
           ) : (
             <JssMount
               key={dataset.id}
               data={displayData}
               columns={dataset.columns}
               onDataChange={handleDataChange}
             />
           )}
         </Box>
       </Box>
     )
   })
   ```
   Nota: sem gating por `role`/`canEdit` — replica o comportamento atual de `SheetsPage.tsx`, que também não restringe edição por papel (viewer pode editar e salvar hoje; não é regressão nem escopo deste plano).

**Critérios de Sucesso**:

Automatizados:
- [ ] `npm run typecheck` (raiz) sem erros

Manuais:
- [ ] N/A (componente ainda não está montado em nenhuma tela nesta fase)

---

### Fase 2: Integrar `SheetEditorPanel` em `DataPage.tsx` + guarda de não-salvo

**Objetivo**: aba "Planilha" renderiza inline; trocar de dataset/aba com edição pendente pede confirmação.

**Mudanças**:

1. `src/pages/DataPage.tsx`:
   - Remove `setActiveDataset` do destructure de `useDatasetsStore()` (linha 38) e a chamada `setActiveDataset(selected.id)` + `navigate('/sheets')` no `onChange` das `Tabs` (linhas 215-224).
   - Adiciona imports: `SheetEditorPanel`, `type SheetEditorPanelHandle`, `UnsavedChangesDialog`.
   - Adiciona estado de guarda (mesmo padrão de `DashboardEditorPage.tsx:70-94`):
     ```tsx
     const sheetDirtyRef = useRef(false)
     const sheetEditorRef = useRef<SheetEditorPanelHandle>(null)
     const [leaveDialogOpen, setLeaveDialogOpen] = useState(false)
     const [savingBeforeLeave, setSavingBeforeLeave] = useState(false)
     const pendingLeaveRef = useRef<(() => void) | null>(null)

     function attemptLeaveSheet(action: () => void) {
       if (tab !== 1 || !sheetDirtyRef.current) {
         action()
         return
       }
       pendingLeaveRef.current = action
       setLeaveDialogOpen(true)
     }

     async function handleSaveAndLeaveSheet() {
       setSavingBeforeLeave(true)
       try {
         await sheetEditorRef.current?.save()
         if (sheetDirtyRef.current) return // save falhou — fica na tela
         setLeaveDialogOpen(false)
         pendingLeaveRef.current?.()
         pendingLeaveRef.current = null
       } finally {
         setSavingBeforeLeave(false)
       }
     }

     function handleDiscardAndLeaveSheet() {
       sheetDirtyRef.current = false
       setLeaveDialogOpen(false)
       pendingLeaveRef.current?.()
       pendingLeaveRef.current = null
     }

     function handleCancelLeaveSheet() {
       setLeaveDialogOpen(false)
       pendingLeaveRef.current = null
     }
     ```
   - Troca o `onClick` de cada item da lista de datasets (linha 184) por:
     ```tsx
     onClick={() => attemptLeaveSheet(() => { setSelectedId(ds.id); setTab(0) })}
     ```
   - Troca o `onChange` das `Tabs` por:
     ```tsx
     onChange={(_, value) => attemptLeaveSheet(() => setTab(value))}
     ```
   - Reestrutura o painel de detalhe (linhas 208-331) pra separar header fixo (nome + tabs) do conteúdo que troca por aba, e monta `SheetEditorPanel` só quando `tab === 1`:
     ```tsx
     {selected && (
       <Box sx={{ flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column', bgcolor: 'background.paper' }}>
         <Box sx={{ px: 3, pt: 3, pb: tab === 1 ? 0 : 2, flexShrink: 0 }}>
           <Typography variant="h6" sx={{ mb: 2, fontWeight: 700 }}>{selected.name}</Typography>
           <Tabs value={tab} onChange={(_, value) => attemptLeaveSheet(() => setTab(value))} sx={{ minHeight: 36 }}>
             <Tab label="Overview" sx={{ minHeight: 36 }} />
             <Tab label="Planilha" sx={{ minHeight: 36 }} />
             <Tab label="Alertas" sx={{ minHeight: 36 }} />
           </Tabs>
         </Box>

         {tab === 0 && (
           <Box sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto', px: 3, pb: 3 }}>
             {/* conteúdo atual do Overview, sem alteração */}
           </Box>
         )}

         {tab === 1 && (
           <Box sx={{ flexGrow: 1, minHeight: 0, position: 'relative' }}>
             <SheetEditorPanel
               key={selected.id}
               ref={sheetEditorRef}
               datasetId={selected.id}
               onDirtyChange={(dirty) => { sheetDirtyRef.current = dirty }}
             />
           </Box>
         )}

         {tab === 2 && (
           <Box sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto', px: 3, pb: 3 }}>
             <AlertsPanel datasetId={selected.id} canEdit={canEdit} />
           </Box>
         )}
       </Box>
     )}
     ```
   - Adiciona `<UnsavedChangesDialog open={leaveDialogOpen} saving={savingBeforeLeave} onSave={handleSaveAndLeaveSheet} onDiscard={handleDiscardAndLeaveSheet} onCancel={handleCancelLeaveSheet} />` perto do `<AddDataSourceWizard .../>`.

**Critérios de Sucesso**:

Automatizados:
- [ ] `npm run typecheck` (raiz) sem erros
- [ ] `npm run build` sem erros

Manuais:
- [ ] Selecionar dataset, abrir aba "Planilha", ver o grid renderizado na mesma tela (sem navegar)
- [ ] Editar uma célula, clicar "Salvar", confirmar que persiste (reabrir a aba mostra o valor novo)
- [ ] Editar uma célula sem salvar e clicar em outro dataset na lista → dialog aparece; "Descartar e sair" troca de dataset e perde a edição; "Salvar e sair" salva e troca
- [ ] Editar uma célula sem salvar e clicar na aba "Overview" ou "Alertas" → mesmo dialog
- [ ] Testar em modo simples (sem `hasProLicense`) e em modo pro (com licença), se ambos os modos estiverem disponíveis no ambiente de teste

---

### Fase 3: Remover `/sheets`

**Objetivo**: eliminar a rota e o código agora órfãos.

**Mudanças**:

1. Deleta `src/pages/SheetsPage.tsx`.
2. `src/App.tsx` — remove o import de `SheetsPage` e a linha `<Route path="sheets" element={<SheetsPage />} />` (linha 55).
3. `src/stores/datasetsStore.tsx` — remove do `DatasetsState` e da implementação: `activeDatasetId`, `activeDataset`, `setActiveDataset`, `updateDataset`; remove o `useState` de `activeDatasetId`/`activeDatasetFull` e a limpeza deles dentro de `removeDataset` (o bloco `if (activeDatasetId === id) { setActiveDatasetId(null); setActiveDatasetFull(null) }`); remove do objeto retornado pelo `DatasetsContext.Provider`.

**Critérios de Sucesso**:

Automatizados:
- [ ] `npm run typecheck` (raiz) sem erros
- [ ] `npm run build` sem erros
- [ ] `grep -rn "SheetsPage\|/sheets" src/` não retorna nada

Manuais:
- [ ] Navegar manualmente para `/sheets` na URL não quebra o app (rota inexistente sob `ProtectedRoute`, sem catch-all hoje — confirmar que só renderiza em branco, não crasha)

---

## Notas de Implementação

- `src/stores/sheetsStore.tsx` (`SheetsProvider`/`useSheetsStore`) é código morto pré-existente, não relacionado a este plano — não é tocado aqui.
- Nenhuma mudança de gating por `role`/`canEdit` no editor de planilha: comportamento (viewer pode editar) é idêntico ao que já existia em `SheetsPage.tsx`.
- A guarda de não-salvo cobre troca de dataset e troca de aba dentro de `/data`. Navegar pra fora de `/data` (sidebar Home/Dashboards/Membros) com edição pendente na planilha **não é guardado** neste plano — mesmo comportamento (sem guarda) que `SheetsPage.tsx` já tinha ao navegar pra outra rota.

## Questões em Aberto

Nenhuma.
