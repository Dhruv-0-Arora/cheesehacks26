import { detectSite } from './sites.ts'
import { analyzeText } from '../detectors/engine.ts'
import { createHighlightLayer, renderHighlights, cleanup, showTooltip, hideTooltip, setReplaceCallback } from './highlighter.ts'
import { setCurrentMatches, setupInterceptor, setupResponseUnmasking } from './interceptor.ts'
import { watchForInput } from './observer.ts'
import { loadTokenMap, loadReplacementMap, getFakeReplacement, saveReplacementMap } from '../tokens/manager.ts'
import type { PIIMatch, ExtensionSettings, PIIType } from '../types.ts'

let enabled = true
let enabledTypes: PIIType[] = ['NAME', 'EMAIL', 'PHONE', 'FINANCIAL', 'SSN', 'ID', 'ADDRESS', 'SECRET', 'URL', 'DATE', 'PATH']
let customBlockList: string[] = []
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let currentInputEl: HTMLElement | null = null
let lastProcessedText = ''
let currentMatches: PIIMatch[] = []

const adapter = detectSite()
console.log(`[PII Shield] Loaded on ${adapter.name}`)

function getInputText(el: HTMLElement): string {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    return el.value
  }
  return el.innerText || el.textContent || ''
}

function processInput(el: HTMLElement) {
  if (!enabled) return

  const text = getInputText(el)
  if (text === lastProcessedText) return
  lastProcessedText = text

  if (!text.trim()) {
    renderHighlights('', [])
    setCurrentMatches([])
    return
  }

  const matches = analyzeText(text, enabledTypes, customBlockList)
  currentMatches = matches
  renderHighlights(text, matches)
  setCurrentMatches(matches)

  chrome.runtime?.sendMessage?.({
    action: 'UPDATE_STATS',
    matchCount: matches.length,
    types: matches.map((m: PIIMatch) => m.type),
  })
}

function debouncedProcess(el: HTMLElement) {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => processInput(el), 200)
}

function replaceAll() {
  if (!currentInputEl || currentMatches.length === 0) return

  const text = adapter.getInputText(currentInputEl)
  // Replace end-to-start so indices stay valid
  const sorted = [...currentMatches].sort((a, b) => b.start - a.start)

  let result = text
  for (const match of sorted) {
    const fake = getFakeReplacement(match)
    result = result.slice(0, match.start) + fake + result.slice(match.end)
  }

  // Set lastProcessedText BEFORE dispatching 'input' so debouncedProcess skips re-detection
  lastProcessedText = result
  currentMatches = []
  setCurrentMatches([])
  renderHighlights('', [])

  adapter.setInputText(currentInputEl, result)
  saveReplacementMap()
}

function onInputFound(inputEl: HTMLElement) {
  currentInputEl = inputEl
  setReplaceCallback(replaceAll)
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
  cleanup()
  currentInputEl = null
  lastProcessedText = ''
}

function init() {
  loadTokenMap()
  loadReplacementMap()

  chrome.runtime?.sendMessage?.({ action: 'GET_SETTINGS' }, (res) => {
    if (res?.settings) {
      const s = res.settings as ExtensionSettings
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
    const mark = (e.target as HTMLElement).closest?.('.pii-shield-mark')
    if (mark) hideTooltip()
  })
}

chrome.runtime?.onMessage?.addListener((msg) => {
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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
