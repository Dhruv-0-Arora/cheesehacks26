import type { ExtensionSettings, TokenMap } from './types.ts'

export interface PIIShieldApi {
  getSettings(cb: (res: { settings?: ExtensionSettings }) => void): void
  getTokenMap(cb: (res: { tokenMap?: TokenMap }) => void): void
  getReplacementMap(cb: (res: { replacementMap?: Record<string, string> }) => void): void
  updateSettings(patch: Partial<ExtensionSettings>, cb?: (res: { settings?: ExtensionSettings }) => void): void
}

/** Access chrome APIs in a way that type-checks in both extension and web (no global chrome type required). */
function getChrome(): { runtime?: { id?: string; sendMessage: (p: object, cb: (r: unknown) => void) => void } } | undefined {
  return typeof globalThis !== 'undefined'
    ? (globalThis as unknown as { chrome?: { runtime?: { id?: string; sendMessage: (p: object, cb: (r: unknown) => void) => void } } }).chrome
    : undefined
}

function sendMessage<T>(payload: object, callback: (res: T) => void): void {
  const chrome = getChrome()
  if (chrome?.runtime?.id) {
    chrome.runtime.sendMessage(payload, (res: unknown) => {
      callback((res ?? {}) as T)
    })
  } else {
    callback({} as T)
  }
}

export const extensionApi: PIIShieldApi = {
  getSettings(cb) {
    sendMessage<{ settings?: ExtensionSettings }>({ action: 'GET_SETTINGS' }, cb)
  },
  getTokenMap(cb) {
    sendMessage<{ tokenMap?: TokenMap }>({ action: 'GET_TOKEN_MAP' }, cb)
  },
  getReplacementMap(cb) {
    sendMessage<{ replacementMap?: Record<string, string> }>({ action: 'GET_REPLACEMENT_MAP' }, cb)
  },
  updateSettings(patch, cb) {
    sendMessage<{ settings?: ExtensionSettings }>(
      { action: 'UPDATE_SETTINGS', settings: patch },
      (res) => cb?.(res)
    )
  },
}
