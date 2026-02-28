import type { PIIMatch, PIIType } from '../types.ts'
import { getFakeReplacement } from '../tokens/manager.ts'

let replaceCallback: (() => void) | null = null

export function setReplaceCallback(fn: () => void) {
  replaceCallback = fn
}

const TYPE_COLORS: Record<PIIType, string> = {
  NAME: '#3b82f6',
  EMAIL: '#f59e0b',
  PHONE: '#8b5cf6',
  FINANCIAL: '#ef4444',
  SSN: '#ef4444',
  ID: '#ec4899',
  ADDRESS: '#06b6d4',
  SECRET: '#dc2626',
  URL: '#6366f1',
  DATE: '#14b8a6',
  CUSTOM: '#f97316',
  PATH: '#10b981',
}

const TYPE_BG: Record<PIIType, string> = {
  NAME: 'rgba(59,130,246,0.12)',
  EMAIL: 'rgba(245,158,11,0.12)',
  PHONE: 'rgba(139,92,246,0.12)',
  FINANCIAL: 'rgba(239,68,68,0.15)',
  SSN: 'rgba(239,68,68,0.15)',
  ID: 'rgba(236,72,153,0.12)',
  ADDRESS: 'rgba(6,182,212,0.12)',
  SECRET: 'rgba(220,38,38,0.15)',
  URL: 'rgba(99,102,241,0.12)',
  DATE: 'rgba(20,184,166,0.12)',
  CUSTOM: 'rgba(249,115,22,0.12)',
  PATH: 'rgba(16,185,129,0.12)',
}

interface HighlightState {
  inputEl: HTMLElement
  highlightDiv: HTMLDivElement
  badgeDiv: HTMLDivElement
  tooltipDiv: HTMLDivElement
  warningDiv: HTMLDivElement
  scrollSyncHandler: (() => void) | null
  resizeObserver: ResizeObserver | null
  warningTimer: ReturnType<typeof setTimeout> | null
}

let state: HighlightState | null = null

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

  document.body.appendChild(highlightDiv)
  document.body.appendChild(badgeDiv)
  document.body.appendChild(tooltipDiv)
  document.body.appendChild(warningDiv)

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

  state = { inputEl, highlightDiv, badgeDiv, tooltipDiv, warningDiv, scrollSyncHandler, resizeObserver, warningTimer: null }
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
    mark.style.background = TYPE_BG[match.type] || 'rgba(99,102,241,0.12)'
    mark.style.borderBottom = `2px solid ${TYPE_COLORS[match.type] || '#6366f1'}`
    mark.style.borderRadius = '2px'
    mark.style.color = 'transparent'
    mark.style.position = 'relative'

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

  if (count === 0) {
    badgeDiv.style.display = 'none'
    return
  }

  const rect = getInputRect(inputEl)
  const scrollX = window.scrollX
  const scrollY = window.scrollY

  // Anchor right edge of badge to right edge of textarea
  badgeDiv.style.display = 'flex'
  badgeDiv.style.position = 'absolute'
  badgeDiv.style.top = `${rect.top + scrollY - 30}px`
  badgeDiv.style.left = `${rect.right + scrollX}px`
  badgeDiv.style.zIndex = '2147483646'
  badgeDiv.title = `${count} PII item${count > 1 ? 's' : ''} detected`

  // Count pill — create once, update text
  let countSpan = badgeDiv.querySelector<HTMLSpanElement>('.pii-shield-badge-count')
  if (!countSpan) {
    countSpan = document.createElement('span')
    countSpan.className = 'pii-shield-badge-count'
    badgeDiv.appendChild(countSpan)
  }
  countSpan.textContent = String(count)

  // Replace button — create once, persist across re-renders
  if (!badgeDiv.querySelector('.pii-shield-replace-btn')) {
    const btn = document.createElement('button')
    btn.className = 'pii-shield-replace-btn'
    btn.textContent = 'Replace All'
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      replaceCallback?.()
    })
    badgeDiv.insertBefore(btn, countSpan)
  }
}

export function showTooltip(x: number, y: number, type: PIIType, fakeValue: string, original: string) {
  if (!state) return
  const { tooltipDiv } = state

  const color = TYPE_COLORS[type] || '#6366f1'
  tooltipDiv.innerHTML = `
    <div style="font-size:10px;color:#94a3b8;margin-bottom:3px;text-transform:uppercase;letter-spacing:.06em">${type}</div>
    <div style="font-size:12px;color:#e2e8f0;margin-bottom:6px;font-family:monospace">${escapeHtml(original)}</div>
    <div style="font-size:10px;color:#94a3b8;margin-bottom:2px">Replace with:</div>
    <div style="font-size:12px;font-weight:600;color:${color};font-family:monospace">${escapeHtml(fakeValue)}</div>
  `
  // Position above cursor; clamp so it never goes off-screen
  const TOP_OFFSET = 90
  const SIDE_MARGIN = 10
  const top  = y - TOP_OFFSET < SIDE_MARGIN ? y + 16 : y - TOP_OFFSET
  const left = Math.min(x + 12, window.innerWidth - 280 - SIDE_MARGIN)

  tooltipDiv.style.display = 'block'
  tooltipDiv.style.position = 'fixed'
  tooltipDiv.style.left = `${left}px`
  tooltipDiv.style.top = `${top}px`
  tooltipDiv.style.zIndex = '2147483647'
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function hideTooltip() {
  if (!state) return
  state.tooltipDiv.style.display = 'none'
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

  // Re-trigger animation
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
  const { highlightDiv, badgeDiv, tooltipDiv, warningDiv, inputEl, scrollSyncHandler, resizeObserver, warningTimer } = state

  if (scrollSyncHandler) inputEl.removeEventListener('scroll', scrollSyncHandler)
  if (resizeObserver) resizeObserver.disconnect()
  if (warningTimer) clearTimeout(warningTimer)
  highlightDiv.remove()
  badgeDiv.remove()
  tooltipDiv.remove()
  warningDiv.remove()

  state = null
}

export function getState(): HighlightState | null {
  return state
}
