import { createContext, useContext, type ReactNode } from 'react'
import type { PIIShieldApi } from './api.ts'

const PIIShieldApiContext = createContext<PIIShieldApi | null>(null)

export function ApiProvider({
  api,
  children,
}: {
  api: PIIShieldApi
  children: ReactNode
}) {
  return (
    <PIIShieldApiContext.Provider value={api}>
      {children}
    </PIIShieldApiContext.Provider>
  )
}

export function useApi(): PIIShieldApi {
  const api = useContext(PIIShieldApiContext)
  if (!api) {
    throw new Error('useApi must be used within ApiProvider')
  }
  return api
}
