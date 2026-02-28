type InputCallback = (inputEl: HTMLElement) => void

let observer: MutationObserver | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
let currentInputEl: HTMLElement | null = null

export function watchForInput(
  findInput: () => HTMLElement | null,
  onInputFound: InputCallback,
  onInputLost: InputCallback | null = null
) {
  const check = () => {
    const el = findInput()
    if (el && el !== currentInputEl) {
      if (currentInputEl && onInputLost) {
        onInputLost(currentInputEl)
      }
      currentInputEl = el
      onInputFound(el)
    } else if (!el && currentInputEl) {
      if (onInputLost) onInputLost(currentInputEl)
      currentInputEl = null
    }
  }

  check()

  observer = new MutationObserver(() => {
    check()
  })
  observer.observe(document.body, { childList: true, subtree: true })

  pollTimer = setInterval(check, 2000)
}

export function stopWatching() {
  if (observer) {
    observer.disconnect()
    observer = null
  }
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  currentInputEl = null
}

export function getCurrentInput(): HTMLElement | null {
  return currentInputEl
}
