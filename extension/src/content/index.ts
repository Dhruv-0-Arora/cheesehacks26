import { detectSite } from './sites.ts'
import { analyzeText } from '../detectors/engine.ts'
import { createHighlightLayer, renderHighlights, cleanup, showTooltip, hideTooltip, scheduleHide, setOnReplace, setReplaceCallback, updateInspectPanelData, hideInspectPanel, resetActiveMode, clearHighlightsOnly } from './highlighter.ts'
import { setCurrentMatches, setupInterceptor, setupResponseUnmasking } from './interceptor.ts'
import { watchForInput, stopWatching } from './observer.ts'
import { loadTokenMap, loadReplacementMap, getFakeReplacement, saveReplacementMap, saveTokenMap, getTokenMap, getReplacementMap, getTokenForMatch } from '../tokens/manager.ts'
import type { PIIMatch, ExtensionSettings, PIIType } from '../types.ts'

let enabled = true
let enabledTypes: PIIType[] = ['NAME', 'EMAIL', 'PHONE', 'FINANCIAL', 'SSN', 'ID', 'ADDRESS', 'SECRET', 'URL', 'DATE', 'PATH']
let customBlockList: string[] = []
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let currentInputEl: HTMLElement | null = null
let lastProcessedText = ''
let currentMatches: PIIMatch[] = []
let dead = false
let storedOriginalText: string | null = null
let storedMatches: PIIMatch[] = []

const adapter = detectSite()

function isContextValid(): boolean {
  try {
    return !!(typeof chrome !== 'undefined' && chrome.runtime?.id)
  } catch {
    return false
  }
}

function safeSendMessage(msg: Record<string, unknown>, cb?: (res: unknown) => void) {
  if (!isContextValid()) return
  try {
    chrome.runtime.sendMessage(msg, (res) => {
      if (chrome.runtime.lastError) { /* context died between check and call */ }
      else if (cb) cb(res)
    })
  } catch {
    gracefulShutdown()
  }
}

function gracefulShutdown() {
  if (dead) return
  dead = true
  console.log('[PII Shield] Extension context invalidated -- shutting down gracefully')
  cleanup()
  stopWatching()
  if (debounceTimer) clearTimeout(debounceTimer)
  currentInputEl = null
}

function getInputText(el: HTMLElement): string {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    return el.value
  }
  return el.innerText || el.textContent || ''
}

function setInputText(el: HTMLElement, text: string) {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value'
    )?.set || Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    )?.set
    if (setter) setter.call(el, text)
    else el.value = text
    el.dispatchEvent(new Event('input', { bubbles: true }))
  } else {
    el.innerText = text
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
}

function replaceMatch(token: string, original: string, _type: PIIType) {
  if (!currentInputEl || dead) return
  const text = getInputText(currentInputEl)
  const idx = text.indexOf(original)
  if (idx === -1) return

  const newText = text.substring(0, idx) + token + text.substring(idx + original.length)
  setInputText(currentInputEl, newText)
  saveTokenMap()
  lastProcessedText = ''
  processInput(currentInputEl)
}

function processInput(el: HTMLElement) {
  if (!enabled || dead) return

  const text = getInputText(el)
  if (text === lastProcessedText) return
  lastProcessedText = text

  if (storedOriginalText !== null) {
    storedOriginalText = null
    storedMatches = []
    resetActiveMode()
  }

  if (!text.trim()) {
    renderHighlights('', [])
    setCurrentMatches([])
    currentMatches = []
    updateInspectPanelData('', [], {}, {})
    return
  }

  const matches = analyzeText(text, enabledTypes, customBlockList)
  currentMatches = matches
  renderHighlights(text, matches)
  setCurrentMatches(matches)
  updateInspectPanelData(text, matches, getTokenMap(), getReplacementMap())

  safeSendMessage({
    action: 'UPDATE_STATS',
    matchCount: matches.length,
    types: matches.map((m: PIIMatch) => m.type),
  })
}

function debouncedProcess(el: HTMLElement) {
  if (dead) return
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => processInput(el), 200)
}

function handleModeSwitch(mode: 'labels' | 'replaced') {
  if (!currentInputEl) return

  if (storedOriginalText === null) {
    storedOriginalText = getInputText(currentInputEl)
    storedMatches = [...currentMatches]
  }

  if (storedMatches.length === 0) return

  const sorted = [...storedMatches].sort((a, b) => b.start - a.start)
  let result = storedOriginalText
  for (const match of sorted) {
    if (mode === 'labels') {
      result = result.slice(0, match.start) + getTokenForMatch(match) + result.slice(match.end)
    } else {
      result = result.slice(0, match.start) + getFakeReplacement(match) + result.slice(match.end)
    }
  }

  clearHighlightsOnly()
  lastProcessedText = result
  adapter.setInputText(currentInputEl, result)
  saveTokenMap()
  saveReplacementMap()
}

function onInputFound(inputEl: HTMLElement) {
  if (dead) return
  currentInputEl = inputEl
  setReplaceCallback(handleModeSwitch)
  createHighlightLayer(inputEl)

  inputEl.addEventListener('input', () => debouncedProcess(inputEl))
  inputEl.addEventListener('keyup', () => debouncedProcess(inputEl))
  inputEl.addEventListener('paste', () => {
    setTimeout(() => processInput(inputEl), 50)
  })
  inputEl.addEventListener('focus', () => debouncedProcess(inputEl))

  processInput(inputEl)
}

function onInputLost(_el: HTMLElement) {
  hideInspectPanel()
  cleanup()
  currentInputEl = null
  lastProcessedText = ''
  currentMatches = []
  storedOriginalText = null
  storedMatches = []
}

function init() {
  if (!isContextValid()) return

  loadTokenMap()
  loadReplacementMap()

  setOnReplace(replaceMatch)

  safeSendMessage({ action: 'GET_SETTINGS' }, (res) => {
    const r = res as { settings?: ExtensionSettings } | undefined
    if (r?.settings) {
      const s = r.settings
      enabled = s.enabled
      enabledTypes = s.enabledTypes
      customBlockList = s.customBlockList || []
    }
  })

  watchForInput(
    () => adapter.getInputElement(),
    onInputFound,
    onInputLost
  )

  setupInterceptor(adapter)
  setupResponseUnmasking(adapter)

  document.addEventListener('mouseover', (e) => {
    if (dead) return
    const mark = (e.target as HTMLElement).closest?.('.pii-shield-mark') as HTMLElement | null
    if (mark?.dataset.fakeValue && mark.dataset.type && mark.dataset.original) {
      showTooltip(
        e.clientX,
        e.clientY,
        mark.dataset.type as PIIType,
        mark.dataset.fakeValue,
        mark.dataset.original
      )
    }
  })

  document.addEventListener('mouseout', (e) => {
    if (dead) return
    const mark = (e.target as HTMLElement).closest?.('.pii-shield-mark')
    if (mark) {
      scheduleHide()
    }
  })

  // Click a highlighted mark → replace just that one occurrence
  document.addEventListener('click', (e) => {
    const mark = (e.target as HTMLElement).closest?.('.pii-shield-mark') as HTMLElement | null
    if (!mark || !currentInputEl) return

    const { type, fakeValue, original } = mark.dataset
    if (!type || !fakeValue || !original) return

    const matchIdx = currentMatches.findIndex(
      (m) => m.text === original && m.type === (type as PIIType)
    )
    if (matchIdx === -1) return

    const match = currentMatches[matchIdx]
    const text = adapter.getInputText(currentInputEl)
    const newText = text.slice(0, match.start) + fakeValue + text.slice(match.end)

    // Remove from currentMatches immediately so the block-check clears
    currentMatches = currentMatches.filter((_, i) => i !== matchIdx)
    setCurrentMatches(currentMatches)

    hideTooltip()
    // Let the normal input → debounce → processInput cycle re-detect remaining items
    adapter.setInputText(currentInputEl, newText)
  }, true)
}

try {
  chrome.runtime?.onMessage?.addListener((msg) => {
    if (dead) return
    if (msg.action === 'SETTINGS_UPDATED') {
      const s = msg.settings as ExtensionSettings
      enabled = s.enabled
      enabledTypes = s.enabledTypes
      customBlockList = s.customBlockList || []
      if (currentInputEl) {
        lastProcessedText = ''
        processInput(currentInputEl)
      }
    }
  })
} catch {
  // context already invalid at load time
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
