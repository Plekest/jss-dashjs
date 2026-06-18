import { useEffect, useRef } from 'react'
import jspreadsheet from 'jspreadsheet'
import 'jsuites/dist/jsuites.css'
import 'jspreadsheet/dist/jspreadsheet.css'

interface Column {
  title: string
  width?: number
}

interface Props {
  data?: (string | number)[][]
  columns?: Column[]
  onDataChange?: (data: (string | number)[][]) => void
}

export function JssMount({ data, columns, onDataChange }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const worksheetsRef = useRef<ReturnType<typeof jspreadsheet> | null>(null)
  const onDataChangeRef = useRef(onDataChange)
  onDataChangeRef.current = onDataChange

  useEffect(() => {
    const el = mountRef.current
    if (!el) return

    // The mount div is position:absolute inset:0, so its clientWidth/Height
    // are guaranteed pixel values of the available space.
    const w = el.clientWidth
    const h = el.clientHeight

    jspreadsheet.setLicense('evaluation')

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

    // Keep the viewport in sync when the panel is resized.
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      worksheetsRef.current?.[0]?.setViewport(Math.floor(width), Math.floor(height))
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      jspreadsheet.destroy(el)
      worksheetsRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // position:absolute + inset:0 gives reliable pixel dimensions regardless of
  // how the parent computes its height via flexbox.
  return (
    <div
      ref={mountRef}
      style={{ position: 'absolute', inset: 0 }}
    />
  )
}
