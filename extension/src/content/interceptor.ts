import type { SiteAdapter, PIIMatch, TokenMap } from '../types.ts'
import { tokenize, detokenize, getTokenMap, saveTokenMap } from '../tokens/manager.ts'

let lastMatches: PIIMatch[] = []
let interceptActive = false

export function setCurrentMatches(matches: PIIMatch[]) {
  lastMatches = matches
}

export function setupInterceptor(adapter: SiteAdapter) {
  if (interceptActive) return
  interceptActive = true

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      const inputEl = adapter.getInputElement()
      if (!inputEl || lastMatches.length === 0) return
      if (document.activeElement !== inputEl && !inputEl.contains(document.activeElement)) return

      const text = adapter.getInputText(inputEl)
      if (!text.trim()) return

      e.preventDefault()
      e.stopPropagation()

      const { maskedText } = tokenize(lastMatches, text)
      adapter.setInputText(inputEl, maskedText)
      saveTokenMap()

      lastMatches = []

      setTimeout(() => {
        const sendBtn = adapter.getSendButton()
        if (sendBtn) {
          sendBtn.click()
        } else {
          inputEl.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true,
          }))
        }
      }, 50)
    }
  }, true)

  const sendBtn = adapter.getSendButton()
  if (sendBtn) {
    sendBtn.addEventListener('click', (e) => {
      if (lastMatches.length === 0) return

      const inputEl = adapter.getInputElement()
      if (!inputEl) return

      const text = adapter.getInputText(inputEl)
      if (!text.trim()) return

      e.preventDefault()
      e.stopPropagation()

      const { maskedText } = tokenize(lastMatches, text)
      adapter.setInputText(inputEl, maskedText)
      saveTokenMap()

      lastMatches = []

      setTimeout(() => {
        sendBtn.click()
      }, 50)
    }, true)
  }
}

export function setupResponseUnmasking(adapter: SiteAdapter) {
  const observer = new MutationObserver(() => {
    const container = adapter.getResponseContainer()
    if (!container) return

    const tokenMap = getTokenMap()
    if (Object.keys(tokenMap).length === 0) return

    const text = container.innerText || ''
    if (!/\[[a-z]+_\d+\]/.test(text)) return

    unmaskResponseElement(container, tokenMap)
  })

  observer.observe(document.body, { childList: true, subtree: true, characterData: true })
}

function unmaskResponseElement(container: HTMLElement, tokenMap: TokenMap) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null)
  const textNodes: Text[] = []

  let node: Text | null
  while ((node = walker.nextNode() as Text | null)) {
    if (/\[[a-z]+_\d+\]/.test(node.textContent || '')) {
      textNodes.push(node)
    }
  }

  for (const textNode of textNodes) {
    const original = textNode.textContent || ''
    const unmasked = detokenize(original)
    if (unmasked !== original) {
      const span = document.createElement('span')
      span.className = 'pii-shield-unmasked'
      span.title = 'Unmasked by PII Shield'
      span.textContent = unmasked
      textNode.parentNode?.replaceChild(span, textNode)
    }
  }
}
