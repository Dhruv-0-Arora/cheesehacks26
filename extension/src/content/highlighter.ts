import type { PIIMatch, PIIType, TokenMap } from '../types.ts'
import { getTokenForMatch, getFakeReplacement } from '../tokens/manager.ts'
import { generateFake } from '../tokens/fake-data.ts'

let replaceCallback: ((mode: 'labels' | 'replaced') => void) | null = null
let activeReplaceMode: 'labels' | 'replaced' | null = null

export function setReplaceCallback(fn: (mode: 'labels' | 'replaced') => void) {
  replaceCallback = fn
}

export function resetActiveMode() {
  activeReplaceMode = null
  if (state) {
    const btns = state.badgeDiv.querySelectorAll('.pii-shield-mode-btn')
    btns.forEach(btn => btn.classList.remove('active'))
  }
}

export function clearHighlightsOnly() {
  if (!state) return
  state.highlightDiv.textContent = ''
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

const TYPE_BG: Record<PIIType, string> = {
  NAME: 'rgba(94,129,172,0.14)',
  EMAIL: 'rgba(235,203,139,0.14)',
  PHONE: 'rgba(180,142,173,0.14)',
  FINANCIAL: 'rgba(191,97,106,0.16)',
  SSN: 'rgba(191,97,106,0.16)',
  ID: 'rgba(208,135,112,0.14)',
  ADDRESS: 'rgba(143,188,187,0.14)',
  SECRET: 'rgba(191,97,106,0.18)',
  URL: 'rgba(129,161,193,0.14)',
  DATE: 'rgba(163,190,140,0.14)',
  CUSTOM: 'rgba(208,135,112,0.14)',
  PATH: 'rgba(16,185,129,0.12)',
}

const TYPE_BG_VISIBLE: Record<PIIType, string> = {
  NAME: 'rgba(94,129,172,0.25)',
  EMAIL: 'rgba(235,203,139,0.25)',
  PHONE: 'rgba(180,142,173,0.25)',
  FINANCIAL: 'rgba(191,97,106,0.28)',
  SSN: 'rgba(191,97,106,0.28)',
  ID: 'rgba(208,135,112,0.25)',
  ADDRESS: 'rgba(143,188,187,0.25)',
  SECRET: 'rgba(191,97,106,0.3)',
  URL: 'rgba(129,161,193,0.25)',
  DATE: 'rgba(163,190,140,0.25)',
  CUSTOM: 'rgba(208,135,112,0.25)',
  PATH: 'rgba(16,185,129,0.22)',
}

interface HighlightState {
  inputEl: HTMLElement
  highlightDiv: HTMLDivElement
  badgeDiv: HTMLDivElement
  tooltipDiv: HTMLDivElement
  warningDiv: HTMLDivElement
  inspectPanelDiv: HTMLDivElement
  scrollSyncHandler: (() => void) | null
  resizeObserver: ResizeObserver | null
  warningTimer: ReturnType<typeof setTimeout> | null
}

let state: HighlightState | null = null
let tooltipHideTimer: ReturnType<typeof setTimeout> | null = null
let onReplaceCallback: ((token: string, original: string, type: PIIType) => void) | null = null
let panelOpen = false
let panelRedactMode: 'labels' | 'replaced' = 'labels'
let lastPanelData: { text: string; matches: PIIMatch[]; tokenMap: TokenMap; replacementMap: Record<string, string> } | null = null

export function setOnReplace(cb: (token: string, original: string, type: PIIType) => void) {
  onReplaceCallback = cb
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function copyStyles(source: HTMLElement, target: HTMLDivElement) {
  const computed = window.getComputedStyle(source)
  const props = [
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing',
    'lineHeight', 'textTransform', 'wordSpacing', 'textIndent',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'boxSizing', 'whiteSpace', 'wordWrap', 'overflowWrap', 'wordBreak',
    'textAlign', 'direction',
  ]
  for (const prop of props) {
    ;(target.style as unknown as Record<string, string>)[prop] = computed.getPropertyValue(
      prop.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())
    )
  }
  target.style.overflow = 'hidden'
  target.style.whiteSpace = 'pre-wrap'
  target.style.wordWrap = 'break-word'
}

function getInputRect(el: HTMLElement): DOMRect {
  return el.getBoundingClientRect()
}

export function createHighlightLayer(inputEl: HTMLElement): HighlightState {
  cleanup()

  const highlightDiv = document.createElement('div')
  highlightDiv.className = 'pii-shield-highlight-layer'
  highlightDiv.setAttribute('aria-hidden', 'true')

  const badgeDiv = document.createElement('div')
  badgeDiv.className = 'pii-shield-badge'
  badgeDiv.style.display = 'none'

  const tooltipDiv = document.createElement('div')
  tooltipDiv.className = 'pii-shield-tooltip'
  tooltipDiv.style.display = 'none'

  const warningDiv = document.createElement('div')
  warningDiv.className = 'pii-shield-warning'
  warningDiv.style.display = 'none'
  warningDiv.textContent = '⚠ Remove sensitive info before sending'

  const inspectPanelDiv = document.createElement('div')
  inspectPanelDiv.className = 'pii-shield-inspect-panel'
  inspectPanelDiv.style.display = 'none'

  tooltipDiv.addEventListener('mouseenter', () => {
    if (tooltipHideTimer) {
      clearTimeout(tooltipHideTimer)
      tooltipHideTimer = null
    }
  })
  tooltipDiv.addEventListener('mouseleave', () => {
    scheduleHideTooltip()
  })

  document.body.appendChild(highlightDiv)
  document.body.appendChild(badgeDiv)
  document.body.appendChild(tooltipDiv)
  document.body.appendChild(warningDiv)
  document.body.appendChild(inspectPanelDiv)

  positionHighlightLayer(inputEl, highlightDiv)
  copyStyles(inputEl, highlightDiv)

  const scrollSyncHandler = () => {
    highlightDiv.scrollTop = (inputEl as HTMLTextAreaElement).scrollTop ?? 0
    highlightDiv.scrollLeft = (inputEl as HTMLTextAreaElement).scrollLeft ?? 0
  }
  inputEl.addEventListener('scroll', scrollSyncHandler)

  const resizeObserver = new ResizeObserver(() => {
    positionHighlightLayer(inputEl, highlightDiv)
    copyStyles(inputEl, highlightDiv)
  })
  resizeObserver.observe(inputEl)

  state = { inputEl, highlightDiv, badgeDiv, tooltipDiv, warningDiv, inspectPanelDiv, scrollSyncHandler, resizeObserver, warningTimer: null }
  panelOpen = false
  panelRedactMode = 'labels'
  lastPanelData = null
  activeReplaceMode = null
  return state
}

function positionHighlightLayer(inputEl: HTMLElement, highlightDiv: HTMLDivElement) {
  const rect = getInputRect(inputEl)
  const scrollX = window.scrollX
  const scrollY = window.scrollY

  highlightDiv.style.position = 'absolute'
  highlightDiv.style.top = `${rect.top + scrollY}px`
  highlightDiv.style.left = `${rect.left + scrollX}px`
  highlightDiv.style.width = `${rect.width}px`
  highlightDiv.style.height = `${rect.height}px`
  highlightDiv.style.zIndex = '2147483640'
  highlightDiv.style.pointerEvents = 'none'
  highlightDiv.style.background = 'transparent'
}

export function renderHighlights(text: string, matches: PIIMatch[]) {
  if (!state) return

  const { highlightDiv, inputEl } = state

  positionHighlightLayer(inputEl, highlightDiv)

  const frag = document.createDocumentFragment()
  let currentIndex = 0

  for (const match of matches) {
    if (match.start > currentIndex) {
      const textNode = document.createTextNode(text.substring(currentIndex, match.start))
      frag.appendChild(textNode)
    }

    const mark = document.createElement('mark')
    mark.className = `pii-shield-mark pii-shield-mark-${match.type.toLowerCase()}`
    mark.style.background = TYPE_BG[match.type] || 'rgba(129,161,193,0.14)'
    mark.style.borderBottom = `2px solid ${TYPE_COLORS[match.type] || '#81a1c1'}`
    mark.style.borderRadius = '2px'
    mark.style.color = 'transparent'
    mark.style.position = 'relative'

    const token = getTokenForMatch(match)
    mark.dataset.token = token
    mark.dataset.fakeValue = getFakeReplacement(match)
    mark.dataset.type = match.type
    mark.dataset.original = match.text

    mark.textContent = match.text
    frag.appendChild(mark)

    currentIndex = match.end
  }

  if (currentIndex < text.length) {
    frag.appendChild(document.createTextNode(text.substring(currentIndex)))
  }

  highlightDiv.textContent = ''
  highlightDiv.appendChild(frag)

  highlightDiv.scrollTop = (inputEl as HTMLTextAreaElement).scrollTop ?? 0
  highlightDiv.scrollLeft = (inputEl as HTMLTextAreaElement).scrollLeft ?? 0

  updateBadge(matches.length)
}

function updateBadge(count: number) {
  if (!state) return
  const { badgeDiv, inputEl } = state

  if (count === 0 && activeReplaceMode === null) {
    badgeDiv.style.display = 'none'
    return
  }

  const rect = getInputRect(inputEl)
  const scrollX = window.scrollX
  const scrollY = window.scrollY

  badgeDiv.style.display = 'flex'
  badgeDiv.style.position = 'absolute'
  badgeDiv.style.top = `${rect.top + scrollY - 30}px`
  badgeDiv.style.left = `${rect.right + scrollX}px`
  badgeDiv.style.zIndex = '2147483646'
  badgeDiv.title = `${count} PII item${count > 1 ? 's' : ''} detected`

  let countSpan = badgeDiv.querySelector<HTMLSpanElement>('.pii-shield-badge-count')
  if (!countSpan) {
    countSpan = document.createElement('span')
    countSpan.className = 'pii-shield-badge-count'
    badgeDiv.appendChild(countSpan)
  }
  countSpan.textContent = String(count)

  if (!badgeDiv.querySelector('.pii-shield-mode-toggle')) {
    const toggleGroup = document.createElement('div')
    toggleGroup.className = 'pii-shield-mode-toggle'

    const labelsBtn = document.createElement('button')
    labelsBtn.className = `pii-shield-mode-btn${activeReplaceMode === 'labels' ? ' active' : ''}`
    labelsBtn.dataset.mode = 'labels'
    labelsBtn.textContent = 'Labels'

    const replacedBtn = document.createElement('button')
    replacedBtn.className = `pii-shield-mode-btn${activeReplaceMode === 'replaced' ? ' active' : ''}`
    replacedBtn.dataset.mode = 'replaced'
    replacedBtn.textContent = 'Replaced'

    labelsBtn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      activeReplaceMode = 'labels'
      toggleGroup.querySelectorAll('.pii-shield-mode-btn').forEach(b => b.classList.remove('active'))
      labelsBtn.classList.add('active')
      replaceCallback?.('labels')
    })

    replacedBtn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      activeReplaceMode = 'replaced'
      toggleGroup.querySelectorAll('.pii-shield-mode-btn').forEach(b => b.classList.remove('active'))
      replacedBtn.classList.add('active')
      replaceCallback?.('replaced')
    })

    toggleGroup.appendChild(labelsBtn)
    toggleGroup.appendChild(replacedBtn)
    badgeDiv.insertBefore(toggleGroup, countSpan)
  }

  if (!badgeDiv.querySelector('.pii-shield-inspect-btn')) {
    const inspectBtn = document.createElement('button')
    inspectBtn.className = 'pii-shield-inspect-btn'
    inspectBtn.innerHTML = '&#128269; Inspect'
    inspectBtn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      toggleInspectPanel()
    })
    badgeDiv.appendChild(inspectBtn)
  }
}

// --- Inspect Panel ---

export function toggleInspectPanel() {
  if (!state) return
  panelOpen = !panelOpen
  if (panelOpen && lastPanelData) {
    renderInspectPanelContent()
    positionInspectPanel()
    state.inspectPanelDiv.style.display = 'block'
  } else {
    state.inspectPanelDiv.style.display = 'none'
  }
}

export function hideInspectPanel() {
  if (!state) return
  panelOpen = false
  state.inspectPanelDiv.style.display = 'none'
}

function positionInspectPanel() {
  if (!state) return
  const { inspectPanelDiv, inputEl } = state
  const rect = getInputRect(inputEl)
  const panelW = 400
  const panelMaxH = 480
  const margin = 12

  let left = rect.right + margin
  if (left + panelW > window.innerWidth) {
    left = rect.left - panelW - margin
  }
  if (left < margin) left = margin

  let top = rect.top
  if (top + panelMaxH > window.innerHeight) {
    top = Math.max(margin, window.innerHeight - panelMaxH - margin)
  }

  inspectPanelDiv.style.left = `${left}px`
  inspectPanelDiv.style.top = `${top}px`
}

export function updateInspectPanelData(text: string, matches: PIIMatch[], tokenMap: TokenMap, replacementMap: Record<string, string>) {
  lastPanelData = { text, matches, tokenMap, replacementMap }
  if (panelOpen && state) {
    renderInspectPanelContent()
  }
}

function buildHighlightedText(text: string, matches: PIIMatch[]): HTMLElement {
  const container = document.createElement('div')
  container.className = 'pii-panel-highlighted'
  let idx = 0
  for (const m of matches) {
    if (m.start > idx) {
      container.appendChild(document.createTextNode(text.substring(idx, m.start)))
    }
    const mark = document.createElement('mark')
    mark.className = 'pii-panel-mark'
    mark.style.background = TYPE_BG_VISIBLE[m.type] || 'rgba(129,161,193,0.25)'
    mark.style.borderBottom = `2px solid ${TYPE_COLORS[m.type] || '#81a1c1'}`
    mark.textContent = m.text
    mark.title = m.type
    container.appendChild(mark)
    idx = m.end
  }
  if (idx < text.length) {
    container.appendChild(document.createTextNode(text.substring(idx)))
  }
  return container
}

function buildRedactedText(text: string, matches: PIIMatch[], tokenMap: TokenMap, mode: 'labels' | 'replaced'): string {
  let result = ''
  let idx = 0
  for (const m of matches) {
    result += text.substring(idx, m.start)
    if (mode === 'labels') {
      const token = Object.entries(tokenMap).find(([, v]) => v === m.text)?.[0]
      result += token ?? `[${m.type.toLowerCase()}]`
    } else {
      result += generateFake(m.text, m.type)
    }
    idx = m.end
  }
  result += text.substring(idx)
  return result
}

function renderInspectPanelContent() {
  if (!state || !lastPanelData) return
  const { inspectPanelDiv } = state
  const { text, matches, tokenMap, replacementMap } = lastPanelData

  inspectPanelDiv.innerHTML = ''

  // Header
  const header = document.createElement('div')
  header.className = 'pii-panel-header'

  const title = document.createElement('div')
  title.className = 'pii-panel-title'
  title.innerHTML = `<span class="pii-panel-title-dot"></span> ${matches.length} PII item${matches.length !== 1 ? 's' : ''} detected`
  header.appendChild(title)

  const closeBtn = document.createElement('button')
  closeBtn.className = 'pii-panel-close'
  closeBtn.innerHTML = '&times;'
  closeBtn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    hideInspectPanel()
  })
  header.appendChild(closeBtn)
  inspectPanelDiv.appendChild(header)

  if (matches.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'pii-panel-empty'
    empty.textContent = 'No PII detected in the current input.'
    inspectPanelDiv.appendChild(empty)
    return
  }

  // Highlighted text
  const detectSection = document.createElement('div')
  detectSection.className = 'pii-panel-section'
  const detectTitle = document.createElement('div')
  detectTitle.className = 'pii-panel-section-title'
  detectTitle.textContent = 'Detected PII'
  detectSection.appendChild(detectTitle)
  detectSection.appendChild(buildHighlightedText(text, matches))
  inspectPanelDiv.appendChild(detectSection)

  // Redacted output with toggle
  const redactSection = document.createElement('div')
  redactSection.className = 'pii-panel-section'

  const redactHeader = document.createElement('div')
  redactHeader.style.display = 'flex'
  redactHeader.style.alignItems = 'center'
  redactHeader.style.justifyContent = 'space-between'
  redactHeader.style.marginBottom = '10px'

  const redactTitle = document.createElement('div')
  redactTitle.className = 'pii-panel-section-title'
  redactTitle.style.marginBottom = '0'
  redactTitle.textContent = 'Safe to Send'
  redactHeader.appendChild(redactTitle)

  const toggleGroup = document.createElement('div')
  toggleGroup.className = 'pii-panel-toggle-group'

  const labelsBtn = document.createElement('button')
  labelsBtn.className = `pii-panel-toggle-btn ${panelRedactMode === 'labels' ? 'active' : ''}`
  labelsBtn.textContent = 'Labels'

  const replacedBtn = document.createElement('button')
  replacedBtn.className = `pii-panel-toggle-btn ${panelRedactMode === 'replaced' ? 'active' : ''}`
  replacedBtn.textContent = 'Replaced'

  labelsBtn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    panelRedactMode = 'labels'
    renderInspectPanelContent()
  })
  replacedBtn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    panelRedactMode = 'replaced'
    renderInspectPanelContent()
  })

  toggleGroup.appendChild(labelsBtn)
  toggleGroup.appendChild(replacedBtn)
  redactHeader.appendChild(toggleGroup)
  redactSection.appendChild(redactHeader)

  const redactedDiv = document.createElement('div')
  redactedDiv.className = 'pii-panel-redacted'
  redactedDiv.textContent = buildRedactedText(text, matches, tokenMap, panelRedactMode)
  redactSection.appendChild(redactedDiv)
  inspectPanelDiv.appendChild(redactSection)

  // Replacement map
  const replEntries = Object.entries(replacementMap)
  if (replEntries.length > 0) {
    const mapSection = document.createElement('div')
    mapSection.className = 'pii-panel-section'
    const mapTitle = document.createElement('div')
    mapTitle.className = 'pii-panel-section-title'
    mapTitle.textContent = 'Replacement Map'
    mapSection.appendChild(mapTitle)
    const mapHint = document.createElement('div')
    mapHint.className = 'pii-panel-section-hint'
    mapHint.textContent = 'Same value always maps to the same replacement.'
    mapSection.appendChild(mapHint)

    for (const [key, fake] of replEntries) {
      const colon = key.indexOf(':')
      const type = key.slice(0, colon) as PIIType
      const original = key.slice(colon + 1)

      const row = document.createElement('div')
      row.className = 'pii-panel-mapping-row'

      const badge = document.createElement('span')
      badge.className = 'pii-panel-type-badge'
      badge.style.color = TYPE_COLORS[type] ?? '#81a1c1'
      badge.style.borderColor = TYPE_COLORS[type] ?? '#81a1c1'
      badge.textContent = type

      const orig = document.createElement('span')
      orig.className = 'pii-panel-original'
      orig.textContent = original

      const arrow = document.createElement('span')
      arrow.className = 'pii-panel-arrow'
      arrow.innerHTML = '&rarr;'

      const fakeSpan = document.createElement('span')
      fakeSpan.className = 'pii-panel-fake'
      fakeSpan.textContent = fake

      row.appendChild(badge)
      row.appendChild(orig)
      row.appendChild(arrow)
      row.appendChild(fakeSpan)
      mapSection.appendChild(row)
    }
    inspectPanelDiv.appendChild(mapSection)
  }

  // Token mappings
  const tokenEntries = Object.entries(tokenMap)
  if (tokenEntries.length > 0) {
    const tokSection = document.createElement('div')
    tokSection.className = 'pii-panel-section'
    const tokTitle = document.createElement('div')
    tokTitle.className = 'pii-panel-section-title'
    tokTitle.textContent = 'Token Mappings'
    tokSection.appendChild(tokTitle)

    for (const [token, original] of tokenEntries) {
      const row = document.createElement('div')
      row.className = 'pii-panel-token-row'

      const key = document.createElement('code')
      key.className = 'pii-panel-token-key'
      key.textContent = token

      const arrow = document.createElement('span')
      arrow.className = 'pii-panel-arrow'
      arrow.innerHTML = '&rarr;'

      const val = document.createElement('span')
      val.className = 'pii-panel-token-value'
      val.textContent = original

      row.appendChild(key)
      row.appendChild(arrow)
      row.appendChild(val)
      tokSection.appendChild(row)
    }
    inspectPanelDiv.appendChild(tokSection)
  }
}

// --- Tooltip ---

export function showTooltip(x: number, y: number, type: PIIType, token: string, original: string) {
  if (!state) return
  const { tooltipDiv } = state

  if (tooltipHideTimer) {
    clearTimeout(tooltipHideTimer)
    tooltipHideTimer = null
  }

  const color = TYPE_COLORS[type] || '#81a1c1'
  tooltipDiv.innerHTML = `
    <div class="pii-shield-tooltip-type">${type}</div>
    <div class="pii-shield-tooltip-original">"${escapeHtml(original)}"</div>
    <div class="pii-shield-tooltip-token" style="color:${color}">&rarr; ${escapeHtml(token)}</div>
    <button class="pii-shield-tooltip-replace" data-token="${escapeAttr(token)}" data-original="${escapeAttr(original)}" data-type="${escapeAttr(type)}">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 12.5V14h1.5l8.8-8.8-1.5-1.5L2 12.5zM14.7 4.1c.2-.2.2-.5 0-.7l-.8-.8c-.2-.2-.5-.2-.7 0l-.7.7 1.5 1.5.7-.7z" fill="currentColor"/></svg>
      Replace now
    </button>
  `
  const TOP_OFFSET = 90
  const SIDE_MARGIN = 10
  const TOOLTIP_HEIGHT = 120
  let top = y - TOP_OFFSET < SIDE_MARGIN ? y + 16 : y - TOP_OFFSET
  const left = Math.min(x + 12, window.innerWidth - 280 - SIDE_MARGIN)
  if (top + TOOLTIP_HEIGHT > window.innerHeight) top = window.innerHeight - TOOLTIP_HEIGHT - SIDE_MARGIN

  tooltipDiv.style.display = 'block'
  tooltipDiv.style.position = 'fixed'
  tooltipDiv.style.left = `${left}px`
  tooltipDiv.style.top = `${top}px`
  tooltipDiv.style.zIndex = '2147483647'
  tooltipDiv.style.pointerEvents = 'auto'

  const replaceBtn = tooltipDiv.querySelector('.pii-shield-tooltip-replace') as HTMLButtonElement | null
  if (replaceBtn) {
    replaceBtn.onclick = (e) => {
      e.stopPropagation()
      e.preventDefault()
      const t = replaceBtn.dataset.token || ''
      const o = replaceBtn.dataset.original || ''
      const tp = (replaceBtn.dataset.type || 'NAME') as PIIType
      if (onReplaceCallback) {
        onReplaceCallback(t, o, tp)
      }
      hideTooltip()
    }
  }
}

function scheduleHideTooltip() {
  if (tooltipHideTimer) clearTimeout(tooltipHideTimer)
  tooltipHideTimer = setTimeout(() => {
    hideTooltip()
  }, 300)
}

export function hideTooltip() {
  if (!state) return
  state.tooltipDiv.style.display = 'none'
  if (tooltipHideTimer) {
    clearTimeout(tooltipHideTimer)
    tooltipHideTimer = null
  }
}

export function scheduleHide() {
  scheduleHideTooltip()
}

export function showBlockWarning() {
  if (!state) return
  const { warningDiv, inputEl } = state

  if (state.warningTimer) clearTimeout(state.warningTimer)

  const rect = getInputRect(inputEl)
  const scrollX = window.scrollX
  const scrollY = window.scrollY

  warningDiv.style.display = 'block'
  warningDiv.style.top = `${rect.bottom + scrollY + 6}px`
  warningDiv.style.left = `${rect.left + scrollX}px`

  warningDiv.style.animation = 'none'
  void warningDiv.offsetWidth
  warningDiv.style.animation = ''

  state.warningTimer = setTimeout(() => {
    if (state) state.warningDiv.style.display = 'none'
  }, 3000)
}

export function hideBlockWarning() {
  if (!state) return
  if (state.warningTimer) {
    clearTimeout(state.warningTimer)
    state.warningTimer = null
  }
  state.warningDiv.style.display = 'none'
}

export function cleanup() {
  if (!state) return
  const { highlightDiv, badgeDiv, tooltipDiv, warningDiv, inspectPanelDiv, inputEl, scrollSyncHandler, resizeObserver, warningTimer } = state

  if (scrollSyncHandler) inputEl.removeEventListener('scroll', scrollSyncHandler)
  if (resizeObserver) resizeObserver.disconnect()
  if (warningTimer) clearTimeout(warningTimer)
  highlightDiv.remove()
  badgeDiv.remove()
  tooltipDiv.remove()
  warningDiv.remove()
  inspectPanelDiv.remove()

  state = null
  panelOpen = false
  lastPanelData = null
  activeReplaceMode = null
}

export function getState(): HighlightState | null {
  return state
}
