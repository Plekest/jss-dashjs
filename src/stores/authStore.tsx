import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react'
import {
  authApi,
  type AuthUser,
  type AuthTenant,
  type Role,
  type MeResponse,
  type TenantSelectionResponse,
} from '../lib/api'

interface AuthState {
  user: AuthUser | null
  tenant: AuthTenant | null
  role: Role | null
  loading: boolean
  login: (email: string, password: string) => Promise<MeResponse | TenantSelectionResponse>
  logout: () => Promise<void>
  signup: (d: { name: string; email: string; password: string; tenantName: string }) => Promise<void>
  selectTenant: (tenantId: string) => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [tenant, setTenant] = useState<AuthTenant | null>(null)
  const [role, setRole] = useState<Role | null>(null)
  const [loading, setLoading] = useState(true)

  const clear = useCallback(() => {
    setUser(null)
    setTenant(null)
    setRole(null)
  }, [])

  const refresh = useCallback(async () => {
    const me = await authApi.me()
    setUser(me.user)
    setTenant(me.tenant)
    setRole(me.role)
  }, [])

  useEffect(() => {
    refresh()
      .catch(() => clear())
      .finally(() => setLoading(false))
  }, [refresh, clear])

  useEffect(() => {
    function handleUnauthorized() {
      clear()
    }
    window.addEventListener('auth:unauthorized', handleUnauthorized)
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized)
  }, [clear])

  const login = useCallback(async (email: string, password: string) => {
    const result = await authApi.login({ email, password })
    if ('needsTenantSelection' in result) return result
    setUser(result.user)
    setTenant(result.tenant)
    setRole(result.role)
    return result
  }, [])

  const logout = useCallback(async () => {
    await authApi.logout()
    clear()
  }, [clear])

  const signup = useCallback(async (d: { name: string; email: string; password: string; tenantName: string }) => {
    const result = await authApi.signup(d)
    setUser(result.user)
    setTenant(result.tenant)
    setRole(result.role)
  }, [])

  const selectTenant = useCallback(async (tenantId: string) => {
    const result = await authApi.selectTenant(tenantId)
    setTenant(result.tenant)
    setRole(result.role)
    const me = await authApi.me()
    setUser(me.user)
  }, [])

  return (
    <AuthContext.Provider value={{ user, tenant, role, loading, login, logout, signup, selectTenant, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
