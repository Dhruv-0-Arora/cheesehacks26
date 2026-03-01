import type { ExtensionSettings, TokenMap } from './types.ts'
import type { PIIShieldApi } from './api.ts'

const STORAGE_KEY = 'pii-shield-demo-settings'

const DEFAULT_SETTINGS: ExtensionSettings = {
  enabled: true,
  enabledTypes: ['NAME', 'EMAIL', 'PHONE', 'FINANCIAL', 'SSN', 'ID', 'ADDRESS', 'SECRET', 'URL', 'DATE', 'PATH'],
  customBlockList: [],
}

function loadSettings(): ExtensionSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ExtensionSettings>
      return { ...DEFAULT_SETTINGS, ...parsed }
    }
  } catch (_) {}
  return { ...DEFAULT_SETTINGS }
}

function saveSettings(settings: ExtensionSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch (_) {}
}

// Demo token map and replacement map so the UI has something to show
const DEMO_TOKEN_MAP: TokenMap = {
  '[NAME_1]': 'Jane Smith',
  '[EMAIL_1]': 'jane@example.com',
  '[PHONE_1]': '(555) 123-4567',
  '[SECRET_1]': 'sk-proj-8B9s8f7d6g5h4j3k2l1',
}

const DEMO_REPLACEMENT_MAP: Record<string, string> = {
  'NAME:Jane Smith': 'Alex Rivera',
  'EMAIL:jane@example.com': 'alex.r@demo.io',
  'PHONE:(555) 123-4567': '(555) 987-6543',
  'SECRET:sk-proj-8B9s8f7d6g5h4j3k2l1': '[REDACTED]',
}

let inMemorySettings = loadSettings()

export const demoApi: PIIShieldApi = {
  getSettings(cb) {
    inMemorySettings = loadSettings()
    cb({ settings: inMemorySettings })
  },
  getTokenMap(cb) {
    cb({ tokenMap: { ...DEMO_TOKEN_MAP } })
  },
  getReplacementMap(cb) {
    cb({ replacementMap: { ...DEMO_REPLACEMENT_MAP } })
  },
  updateSettings(patch, cb) {
    inMemorySettings = { ...inMemorySettings, ...patch }
    saveSettings(inMemorySettings)
    cb?.({ settings: inMemorySettings })
  },
}
