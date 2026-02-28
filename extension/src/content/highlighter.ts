import type { PIIMatch, PIIType } from '../types.ts'
import { getTokenForMatch } from '../tokens/manager.ts'

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
}

interface HighlightState {
  inputEl: HTMLElement
  highlightDiv: HTMLDivElement
  badgeDiv: HTMLDivElement
  tooltipDiv: HTMLDivElement
  scrollSyncHandler: (() => void) | null
  resizeObserver: ResizeObserver | null
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

  document.body.appendChild(highlightDiv)
  document.body.appendChild(badgeDiv)
  document.body.appendChild(tooltipDiv)

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

  state = { inputEl, highlightDiv, badgeDiv, tooltipDiv, scrollSyncHandler, resizeObserver }
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

  const { highlightDiv, badgeDiv, inputEl } = state

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

    const token = getTokenForMatch(match)
    mark.dataset.token = token
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

  badgeDiv.style.display = 'flex'
  badgeDiv.style.position = 'absolute'
  badgeDiv.style.top = `${rect.top + scrollY - 12}px`
  badgeDiv.style.right = 'auto'
  badgeDiv.style.left = `${rect.right + scrollX - 36}px`
  badgeDiv.style.zIndex = '2147483646'
  badgeDiv.innerHTML = `<span class="pii-shield-badge-count">${count}</span>`
  badgeDiv.title = `${count} PII item${count > 1 ? 's' : ''} detected`
}

export function showTooltip(x: number, y: number, type: PIIType, token: string, original: string) {
  if (!state) return
  const { tooltipDiv } = state

  const color = TYPE_COLORS[type] || '#6366f1'
  tooltipDiv.innerHTML = `
    <div style="font-size:11px;color:#888;margin-bottom:2px">${type}</div>
    <div style="font-size:12px;color:#333;margin-bottom:4px">"${original}"</div>
    <div style="font-size:12px;font-weight:600;color:${color}">&rarr; ${token}</div>
  `
  tooltipDiv.style.display = 'block'
  tooltipDiv.style.position = 'fixed'
  tooltipDiv.style.left = `${x + 10}px`
  tooltipDiv.style.top = `${y - 60}px`
  tooltipDiv.style.zIndex = '2147483647'
}

export function hideTooltip() {
  if (!state) return
  state.tooltipDiv.style.display = 'none'
}

export function cleanup() {
  if (!state) return
  const { highlightDiv, badgeDiv, tooltipDiv, inputEl, scrollSyncHandler, resizeObserver } = state

  if (scrollSyncHandler) inputEl.removeEventListener('scroll', scrollSyncHandler)
  if (resizeObserver) resizeObserver.disconnect()
  highlightDiv.remove()
  badgeDiv.remove()
  tooltipDiv.remove()

  state = null
}

export function getState(): HighlightState | null {
  return state
}
