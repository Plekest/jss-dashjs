import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react'
import { datasetsApi, type Dataset, type DatasetMeta } from '../lib/api'

interface DatasetsState {
  datasets: DatasetMeta[]
  activeDatasetId: string | null
  activeDataset: Dataset | null
  loading: boolean
  refresh: () => Promise<void>
  createDataset: (payload: Pick<Dataset, 'name' | 'sourceType' | 'columns' | 'data'>) => Promise<Dataset>
  updateDataset: (id: string, patch: Partial<Pick<Dataset, 'name' | 'columns' | 'data' | 'meta'>>) => Promise<Dataset>
  removeDataset: (id: string) => Promise<void>
  setActiveDataset: (id: string | null) => Promise<void>
}

const DatasetsContext = createContext<DatasetsState | null>(null)

export function DatasetsProvider({ children }: { children: ReactNode }) {
  const [datasets, setDatasets] = useState<DatasetMeta[]>([])
  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(null)
  const [activeDataset, setActiveDatasetFull] = useState<Dataset | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const list = await datasetsApi.list()
      setDatasets(list)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const createDataset = useCallback(
    async (payload: Pick<Dataset, 'name' | 'sourceType' | 'columns' | 'data'>) => {
      const created = await datasetsApi.create(payload)
      await refresh()
      return created
    },
    [refresh],
  )

  const updateDataset = useCallback(
    async (id: string, patch: Partial<Pick<Dataset, 'name' | 'columns' | 'data' | 'meta'>>) => {
      const updated = await datasetsApi.update(id, patch)
      await refresh()
      // Keep activeDataset in sync
      if (activeDatasetId === id) {
        setActiveDatasetFull(updated)
      }
      return updated
    },
    [refresh, activeDatasetId],
  )

  const removeDataset = useCallback(
    async (id: string) => {
      await datasetsApi.remove(id)
      setDatasets((prev) => prev.filter((d) => d.id !== id))
      if (activeDatasetId === id) {
        setActiveDatasetId(null)
        setActiveDatasetFull(null)
      }
    },
    [activeDatasetId],
  )

  const setActiveDataset = useCallback(async (id: string | null) => {
    setActiveDatasetId(id)
    if (!id) {
      setActiveDatasetFull(null)
      return
    }
    const full = await datasetsApi.get(id)
    setActiveDatasetFull(full)
  }, [])

  return (
    <DatasetsContext.Provider
      value={{
        datasets,
        activeDatasetId,
        activeDataset,
        loading,
        refresh,
        createDataset,
        updateDataset,
        removeDataset,
        setActiveDataset,
      }}
    >
      {children}
    </DatasetsContext.Provider>
  )
}

export function useDatasetsStore(): DatasetsState {
  const ctx = useContext(DatasetsContext)
  if (!ctx) throw new Error('useDatasetsStore must be used inside DatasetsProvider')
  return ctx
}
