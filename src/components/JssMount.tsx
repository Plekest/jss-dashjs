import { useEffect, useRef } from 'react'
import { useTheme } from '@mui/material/styles'
import jspreadsheet from 'jspreadsheet'
import 'jsuites/dist/jsuites.css'
import 'jspreadsheet/dist/jspreadsheet.css'
import { useColorMode } from '../theme/colorMode'
import { hasProLicense } from '../lib/license'
import type { DatasetWorksheet } from '../lib/api'

interface Column {
  title: string
  width?: number
}

interface Props {
  // Simple mode (no licence) — single grid, byte-for-byte the pre-Fase-4 behaviour.
  data?: (string | number)[][]
  columns?: Column[]
  onDataChange?: (data: (string | number)[][]) => void
  // Pro mode (licensed) — multi-tab, formulas in cells, full toolbar.
  worksheets?: DatasetWorksheet[]
  onWorksheetsChange?: (worksheets: DatasetWorksheet[]) => void
}

/** Builds the initial tab list for pro mode: uses the saved `worksheets`
 *  (with raw formulas) when present, otherwise falls back to a single tab
 *  from `data`/`columns` — the case of a dataset never opened in pro mode. */
function initialProWorksheets(
  worksheets: DatasetWorksheet[] | undefined,
  data: (string | number)[][] | undefined,
  columns: Column[] | undefined,
): DatasetWorksheet[] {
  if (worksheets && worksheets.length > 0) return worksheets
  return [
    {
      name: 'Sheet1',
      columns: columns ?? [],
      data: data && data.length > 0
        ? data
        : [new Array(Math.max(columns?.length ?? 1, 1)).fill('')],
    },
  ]
}

function toJssWorksheet(w: DatasetWorksheet): jspreadsheet.Worksheet {
  const data = w.formulas && w.formulas.length > 0 ? w.formulas : w.data
  return {
    worksheetName: w.name,
    data: data.length > 0 ? data : [new Array(Math.max(w.columns.length, 1)).fill('')],
    columns: w.columns.map((c) => ({ title: c.title, width: 120 })),
    minDimensions: [w.columns.length || 5, 5],
    columnSorting: true,
    search: true,
    filters: true,
    allowComments: true,
    allowInsertRow: true,
    allowManualInsertRow: true,
    allowInsertColumn: true,
    allowManualInsertColumn: true,
  }
}

/** Reads every tab back from the live instances — calculated values (for
 *  dashboards) and raw formulas (so the tab can reopen with them intact). */
function extractWorksheets(instances: jspreadsheet.worksheetInstance[]): DatasetWorksheet[] {
  return instances.map((ws) => {
    const config = ws.getConfig() as jspreadsheet.Worksheet
    return {
      name: config.worksheetName ?? 'Sheet1',
      columns: (config.columns ?? []).map((c) => ({ title: c.title ?? '' })),
      data: ws.getData(false, true) as (string | number)[][],
      formulas: ws.getData(false, false) as (string | number)[][],
    }
  })
}

export function JssMount({ data, columns, onDataChange, worksheets, onWorksheetsChange }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const worksheetsRef = useRef<ReturnType<typeof jspreadsheet> | null>(null)
  const onDataChangeRef = useRef(onDataChange)
  onDataChangeRef.current = onDataChange
  const onWorksheetsChangeRef = useRef(onWorksheetsChange)
  onWorksheetsChangeRef.current = onWorksheetsChange
  const { mode } = useColorMode()
  const theme = useTheme()

  useEffect(() => {
    const el = mountRef.current
    if (!el) return

    // The mount div is position:absolute inset:0, so its clientWidth/Height
    // are guaranteed pixel values of the available space.
    const w = el.clientWidth
    const h = el.clientHeight

    if (!hasProLicense) {
      // Simple mode — unchanged from before Fase 4: single grid, no toolbar,
      // no tabs, no formulas in cells.
      worksheetsRef.current = jspreadsheet(el, {
        tableOverflow: true,
        tableHeight: h > 0 ? `${h}px` : '500px',
        tableWidth:  w > 0 ? `${w}px` : '100%',
        worksheets: [
          {
            data: data && data.length > 0
              ? data
              : [new Array(Math.max(columns?.length ?? 1, 1)).fill('')],
            columns: columns?.map((c) => ({ title: c.title, width: c.width ?? 120 })) ?? [],
            minDimensions: [columns?.length ?? 5, 5],
            columnSorting: true,
          },
        ],
        onchange: () => {
          const ws = worksheetsRef.current?.[0]
          if (ws && onDataChangeRef.current) {
            onDataChangeRef.current(ws.getData() as (string | number)[][])
          }
        },
      })
    } else {
      // Pro mode — full editor: toolbar, formula bar, tabs, filters, search.
      // formula extension itself is registered once at bootstrap (see
      // lib/license.ts); here we only need to opt the grid into the UI.
      const notifyChange = () => {
        const instances = worksheetsRef.current
        if (instances && onWorksheetsChangeRef.current) {
          onWorksheetsChangeRef.current(extractWorksheets(instances))
        }
      }

      worksheetsRef.current = jspreadsheet(el, {
        tableOverflow: true,
        tableHeight: h > 0 ? `${h}px` : '500px',
        tableWidth:  w > 0 ? `${w}px` : '100%',
        toolbar: true,
        tabs: true,
        bar: true,
        worksheets: initialProWorksheets(worksheets, data, columns).map(toJssWorksheet),
        onafterchanges: notifyChange,
        oncreateworksheet: notifyChange,
        ondeleteworksheet: notifyChange,
        onrenameworksheet: notifyChange,
        onmoveworksheet: notifyChange,
      })

      // `search: true` enables the feature but the input box renders open by
      // default — hide it up front so the toolbar's magnifier icon starts in
      // sync (click = show, matching its own toggle expectation).
      worksheetsRef.current?.forEach((ws) => ws.hideSearch())
    }

    // Keep the viewport in sync when the panel is resized.
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      worksheetsRef.current?.forEach((ws) => ws.setViewport(Math.floor(width), Math.floor(height)))
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      jspreadsheet.destroy(el)
      worksheetsRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // position:absolute + inset:0 gives reliable pixel dimensions regardless of
  // how the parent computes its height via flexbox. The dark-mode class lives
  // on this wrapper (not the mount div) because jspreadsheet mutates the
  // mount div's classList imperatively (adds "jss_container"); if React also
  // owned that div's className, toggling the theme would wipe those classes.
  return (
    <div
      className={mode === 'dark' ? 'lm-dark-mode' : undefined}
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: mode === 'dark' ? theme.palette.background.default : undefined,
      }}
    >
      <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />
    </div>
  )
}
