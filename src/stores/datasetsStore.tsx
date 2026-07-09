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
  loading: boolean
  refresh: () => Promise<void>
  createDataset: (payload: Pick<Dataset, 'name' | 'sourceType' | 'columns' | 'data'>) => Promise<Dataset>
  removeDataset: (id: string) => Promise<void>
}

const DatasetsContext = createContext<DatasetsState | null>(null)

export function DatasetsProvider({ children }: { children: ReactNode }) {
  const [datasets, setDatasets] = useState<DatasetMeta[]>([])
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

  const removeDataset = useCallback(async (id: string) => {
    await datasetsApi.remove(id)
    setDatasets((prev) => prev.filter((d) => d.id !== id))
  }, [])

  return (
    <DatasetsContext.Provider
      value={{
        datasets,
        loading,
        refresh,
        createDataset,
        removeDataset,
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
