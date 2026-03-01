import { useState, useEffect, useCallback } from 'react'
import type { ExtensionSettings, TokenMap, PIIType } from '../types.ts'
import { useApi } from '../context.tsx'

const DEFAULT_SETTINGS: ExtensionSettings = {
  enabled: true,
  enabledTypes: ['NAME', 'EMAIL', 'PHONE', 'FINANCIAL', 'SSN', 'ID', 'ADDRESS', 'SECRET', 'URL', 'DATE', 'PATH'],
  customBlockList: [],
}

const PII_TYPE_LABELS: Record<PIIType, string> = {
  NAME: 'Names',
  EMAIL: 'Emails',
  PHONE: 'Phone Numbers',
  FINANCIAL: 'Financial (CC, IBAN)',
  SSN: 'SSN',
  ID: 'IDs / Passports',
  ADDRESS: 'Addresses',
  SECRET: 'Secrets (API Keys)',
  URL: 'URLs',
  DATE: 'Dates',
  CUSTOM: 'Custom Terms',
  PATH: 'File Paths',
}

const TYPE_COLORS: Record<PIIType, string> = {
  NAME: '#5e81ac',
  EMAIL: '#ebcb8b',
  PHONE: '#b48ead',
  FINANCIAL: '#bf616a',
  SSN: '#bf616a',
  ID: '#d08770',
  ADDRESS: '#8fbcbb',
  SECRET: '#bf616a',
  URL: '#81a1c1',
  DATE: '#a3be8c',
  CUSTOM: '#d08770',
  PATH: '#10b981',
}

function App() {
  const api = useApi()
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS)
  const [sessionTokenMap, setSessionTokenMap] = useState<TokenMap>({})
  const [sessionReplacementMap, setSessionReplacementMap] = useState<Record<string, string>>({})
  const [customTerm, setCustomTerm] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)

  const refreshSession = useCallback(() => {
    api.getTokenMap((res) => {
      if (res?.tokenMap) setSessionTokenMap(res.tokenMap)
    })
    api.getReplacementMap((res) => {
      if (res?.replacementMap) setSessionReplacementMap(res.replacementMap)
    })
  }, [api])

  useEffect(() => {
    api.getSettings((res) => {
      if (res?.settings) setSettings(res.settings)
    })
    refreshSession()
    const interval = setInterval(refreshSession, 2000)
    return () => clearInterval(interval)
  }, [api, refreshSession])

  const updateSettings = (patch: Partial<ExtensionSettings>) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    api.updateSettings(patch)
  }

  const toggleType = (type: PIIType) => {
    const types = settings.enabledTypes.includes(type)
      ? settings.enabledTypes.filter((t) => t !== type)
      : [...settings.enabledTypes, type]
    updateSettings({ enabledTypes: types })
  }

  const addCustomTerm = () => {
    const term = customTerm.trim()
    if (!term || settings.customBlockList.includes(term)) return
    updateSettings({ customBlockList: [...settings.customBlockList, term] })
    setCustomTerm('')
  }

  const removeCustomTerm = (term: string) => {
    updateSettings({ customBlockList: settings.customBlockList.filter((t) => t !== term) })
  }

  const tokenEntries = Object.entries(sessionTokenMap)
  const replacementEntries = Object.entries(sessionReplacementMap).map(([key, fake]) => {
    const colon = key.indexOf(':')
    return { type: key.slice(0, colon) as PIIType, original: key.slice(colon + 1), fake }
  })

  const typeCounts: Record<string, number> = {}
  for (const [token] of tokenEntries) {
    const type = token.replace(/^\[/, '').replace(/_\d+\]$/, '')
    typeCounts[type] = (typeCounts[type] || 0) + 1
  }
  const totalDetected = tokenEntries.length

  return (
    <div className="popup-container">
      <header className="popup-header">
        <div className="logo-row">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <defs>
              <linearGradient id="logoGrad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#bf616a" />
                <stop offset="50%" stopColor="#d08770" />
                <stop offset="100%" stopColor="#ebcb8b" />
              </linearGradient>
            </defs>
            <rect width="24" height="24" rx="7" fill="url(#logoGrad)" />
            <path d="M12 6C9.79 6 8 7.79 8 10c0 1.48.81 2.77 2 3.46V15a1 1 0 001 1h2a1 1 0 001-1v-1.54c1.19-.69 2-1.98 2-3.46 0-2.21-1.79-4-4-4z" fill="#eceff4" />
            <rect x="10" y="17" width="4" height="1.5" rx=".75" fill="rgba(236,239,244,0.7)" />
          </svg>
          <h1>PII Shield</h1>
        </div>
        <label className="toggle-row">
          <span>{settings.enabled ? 'Active' : 'Disabled'}</span>
          <div className={`toggle ${settings.enabled ? 'on' : ''}`} onClick={() => updateSettings({ enabled: !settings.enabled })}>
            <div className="toggle-knob" />
          </div>
        </label>
      </header>

      {/* Status bar */}
      <div className="status-bar">
        <div className={`status-dot ${settings.enabled ? 'active' : ''}`} />
        <span className="status-text">
          {totalDetected > 0
            ? `${totalDetected} item${totalDetected !== 1 ? 's' : ''} detected this session`
            : 'No PII detected yet — start typing on any page'}
        </span>
      </div>

      {/* Summary chips */}
      {totalDetected > 0 && (
        <div className="stats-grid">
          {Object.entries(typeCounts).map(([type, count]) => (
            <div key={type} className="stat-chip">
              <span className="stat-dot" style={{ background: TYPE_COLORS[type as PIIType] ?? '#81a1c1' }} />
              <span className="stat-count">{count}</span>
              <span className="stat-label">{type.toLowerCase()}</span>
            </div>
          ))}
        </div>
      )}

      {/* Replacement Map */}
      {replacementEntries.length > 0 && (
        <section className="section">
          <h2>Replacement Map</h2>
          <p className="section-hint">Each PII value is consistently mapped to the same fake replacement.</p>
          <div className="mapping-list">
            {replacementEntries.map(({ type, original, fake }) => (
              <div key={`${type}:${original}`} className="mapping-row">
                <span className="mapping-type" style={{ color: TYPE_COLORS[type] ?? '#81a1c1', borderColor: TYPE_COLORS[type] ?? '#81a1c1' }}>{type}</span>
                <span className="mapping-original">{original}</span>
                <span className="mapping-arrow">&rarr;</span>
                <span className="mapping-fake">{fake}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Token Mappings */}
      {tokenEntries.length > 0 && (
        <section className="section">
          <h2>Token Mappings</h2>
          <p className="section-hint">Labels used in the redacted text.</p>
          <div className="mapping-list">
            {tokenEntries.map(([token, original]) => (
              <div key={token} className="token-row">
                <code className="token-key">{token}</code>
                <span className="token-arrow">&rarr;</span>
                <span className="token-value">{original}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Collapsible Settings */}
      <button className="settings-toggle" onClick={() => setSettingsOpen(!settingsOpen)}>
        <span className="settings-toggle-icon">{settingsOpen ? '▾' : '▸'}</span>
        <span>Settings</span>
      </button>

      {settingsOpen && (
        <>
          <section className="section">
            <h2>Detection Types</h2>
            <div className="type-grid">
              {(Object.entries(PII_TYPE_LABELS) as [PIIType, string][])
                .filter(([t]) => t !== 'CUSTOM')
                .map(([type, label]) => (
                  <label key={type} className="type-check">
                    <input
                      type="checkbox"
                      checked={settings.enabledTypes.includes(type)}
                      onChange={() => toggleType(type)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
            </div>
          </section>

          <section className="section">
            <h2>Custom Block List</h2>
            <div className="custom-input-row">
              <input
                type="text"
                placeholder="Add term to always mask..."
                value={customTerm}
                onChange={(e) => setCustomTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addCustomTerm()}
              />
              <button onClick={addCustomTerm}>Add</button>
            </div>
            {settings.customBlockList.length > 0 && (
              <div className="custom-list">
                {settings.customBlockList.map((term) => (
                  <div key={term} className="custom-chip">
                    <span>{term}</span>
                    <button className="chip-remove" onClick={() => removeCustomTerm(term)}>&times;</button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

export default App
