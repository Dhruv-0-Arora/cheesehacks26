import { useState, useEffect } from 'react'
import type { ExtensionSettings, TokenMap, PIIType } from '../types.ts'

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

function App() {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS)
  const [tokenMap, setTokenMap] = useState<TokenMap>({})
  const [replacementMap, setReplacementMap] = useState<Record<string, string>>({})
  const [customTerm, setCustomTerm] = useState('')

  useEffect(() => {
    chrome.runtime?.sendMessage({ action: 'GET_SETTINGS' }, (res) => {
      if (res?.settings) setSettings(res.settings)
    })
    chrome.runtime?.sendMessage({ action: 'GET_TOKEN_MAP' }, (res) => {
      if (res?.tokenMap) setTokenMap(res.tokenMap)
    })
    chrome.runtime?.sendMessage({ action: 'GET_REPLACEMENT_MAP' }, (res) => {
      if (res?.replacementMap) setReplacementMap(res.replacementMap)
    })
  }, [])

  const updateSettings = (patch: Partial<ExtensionSettings>) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    chrome.runtime?.sendMessage({ action: 'UPDATE_SETTINGS', settings: patch })
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

  const tokenEntries = Object.entries(tokenMap)
  const typeCounts: Record<string, number> = {}
  for (const [token] of tokenEntries) {
    const type = token.replace(/^\[/, '').replace(/_\d+\]$/, '')
    typeCounts[type] = (typeCounts[type] || 0) + 1
  }

  const replacementEntries = Object.entries(replacementMap).map(([key, fake]) => {
    const colon = key.indexOf(':')
    return { type: key.slice(0, colon), original: key.slice(colon + 1), fake }
  })

  return (
    <div className="popup-container">
      <header className="popup-header">
        <div className="logo-row">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <rect width="24" height="24" rx="6" fill="#6366f1" />
            <path d="M12 6C9.79 6 8 7.79 8 10c0 1.48.81 2.77 2 3.46V15a1 1 0 001 1h2a1 1 0 001-1v-1.54c1.19-.69 2-1.98 2-3.46 0-2.21-1.79-4-4-4z" fill="white" />
            <rect x="10" y="17" width="4" height="1.5" rx=".75" fill="white" />
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

      {tokenEntries.length > 0 && (
        <section className="section">
          <h2>Session Summary</h2>
          <div className="stats-grid">
            {Object.entries(typeCounts).map(([type, count]) => (
              <div key={type} className="stat-chip">
                <span className="stat-count">{count}</span>
                <span className="stat-label">{type.toLowerCase()}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {replacementEntries.length > 0 && (
        <section className="section">
          <h2>Replacement Map</h2>
          <p style={{ fontSize: '11px', color: '#888', marginBottom: '8px' }}>
            Same original value always maps to the same replacement.
          </p>
          <div className="token-list">
            {replacementEntries.map(({ type, original, fake }) => (
              <div key={`${type}:${original}`} className="token-row">
                <span className="token-key" style={{ color: '#999', fontSize: '10px', flexShrink: 0 }}>{type}</span>
                <span className="token-value" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{original}</span>
                <span className="token-arrow">&rarr;</span>
                <span className="token-value" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{fake}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {tokenEntries.length > 0 && (
        <section className="section">
          <h2>Token Mappings</h2>
          <div className="token-list">
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
    </div>
  )
}

export default App
