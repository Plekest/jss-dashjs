import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

export interface SheetColumn {
  title: string
  width?: number
}

export interface Sheet {
  id: string
  name: string
  columns: SheetColumn[]
  data: (string | number)[][]
}

interface SheetsState {
  sheets: Sheet[]
  activeSheetId: string | null
  activeSheet: Sheet | null
  addSheet: (sheet: Sheet) => void
  updateSheet: (id: string, data: (string | number)[][]) => void
  setActiveSheet: (id: string) => void
  removeSheet: (id: string) => void
}

const SheetsContext = createContext<SheetsState | null>(null)

export function SheetsProvider({ children }: { children: ReactNode }) {
  const [sheets, setSheets] = useState<Sheet[]>([])
  const [activeSheetId, setActiveSheetId] = useState<string | null>(null)

  const activeSheet = sheets.find((s) => s.id === activeSheetId) ?? null

  const addSheet = useCallback((sheet: Sheet) => {
    setSheets((prev) => [...prev, sheet])
    setActiveSheetId(sheet.id)
  }, [])

  const updateSheet = useCallback((id: string, data: (string | number)[][]) => {
    setSheets((prev) => prev.map((s) => (s.id === id ? { ...s, data } : s)))
  }, [])

  const setActiveSheet = useCallback((id: string) => {
    setActiveSheetId(id)
  }, [])

  const removeSheet = useCallback((id: string) => {
    setSheets((prev) => {
      const next = prev.filter((s) => s.id !== id)
      return next
    })
    setActiveSheetId((prev) => (prev === id ? null : prev))
  }, [])

  return (
    <SheetsContext.Provider
      value={{ sheets, activeSheetId, activeSheet, addSheet, updateSheet, setActiveSheet, removeSheet }}
    >
      {children}
    </SheetsContext.Provider>
  )
}

export function useSheetsStore(): SheetsState {
  const ctx = useContext(SheetsContext)
  if (!ctx) throw new Error('useSheetsStore must be used inside SheetsProvider')
  return ctx
}
