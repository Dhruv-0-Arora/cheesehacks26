import type { PIIMatch, PIIType, TokenMap, TokenizeResult } from '../types.ts'

const TYPE_TOKEN_PREFIX: Record<PIIType, string> = {
  NAME: 'name',
  EMAIL: 'email',
  PHONE: 'phone',
  FINANCIAL: 'financial',
  SSN: 'ssn',
  ID: 'id',
  ADDRESS: 'address',
  SECRET: 'secret',
  URL: 'url',
  DATE: 'date',
  CUSTOM: 'custom',
}

const counters: Record<string, number> = {}
let tokenMap: TokenMap = {}

export function getTokenMap(): TokenMap {
  return { ...tokenMap }
}

export function setTokenMap(map: TokenMap) {
  tokenMap = { ...map }
}

export function clearTokens() {
  Object.keys(counters).forEach((k) => delete counters[k])
  tokenMap = {}
}

function findExistingToken(text: string): string | null {
  for (const [token, original] of Object.entries(tokenMap)) {
    if (original === text) return token
  }
  return null
}

function createToken(type: PIIType): string {
  const prefix = TYPE_TOKEN_PREFIX[type] || type.toLowerCase()
  if (!counters[prefix]) counters[prefix] = 0
  counters[prefix]++
  return `[${prefix}_${counters[prefix]}]`
}

export function tokenize(matches: PIIMatch[], text: string): TokenizeResult {
  let maskedText = ''
  let currentIndex = 0

  for (const match of matches) {
    maskedText += text.substring(currentIndex, match.start)

    let token = findExistingToken(match.text)
    if (!token) {
      token = createToken(match.type)
      tokenMap[token] = match.text
    }

    maskedText += token
    currentIndex = match.end
  }

  maskedText += text.substring(currentIndex)

  return { maskedText, tokenMap: getTokenMap() }
}

export function detokenize(maskedText: string): string {
  return maskedText.replace(
    /\[[a-z]+_\d+\]/g,
    (token) => tokenMap[token] || token
  )
}

export function getTokenForMatch(match: PIIMatch): string {
  const existing = findExistingToken(match.text)
  if (existing) return existing
  const token = createToken(match.type)
  tokenMap[token] = match.text
  return token
}

export async function loadTokenMap(): Promise<TokenMap> {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      chrome.storage.session.get('tokenMap', (result) => {
        if (result.tokenMap) {
          tokenMap = result.tokenMap as TokenMap
        }
        resolve(getTokenMap())
      })
    } else {
      resolve(getTokenMap())
    }
  })
}

export async function saveTokenMap(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      chrome.storage.session.set({ tokenMap }, () => resolve())
    } else {
      resolve()
    }
  })
}
