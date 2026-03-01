import { useState, useMemo } from 'react'
import { analyzeText } from '@extension/detectors/engine'
import { tokenize, clearTokens } from '@extension/tokens/manager'
import { generateFake } from '@extension/tokens/fake-data'
import type { PIIMatch, PIIType } from '@extension/types'

const DEFAULT_ENABLED_TYPES: PIIType[] = [
  'NAME', 'EMAIL', 'PHONE', 'FINANCIAL', 'SSN', 'ID', 'ADDRESS', 'SECRET', 'URL', 'DATE', 'PATH',
]

const TYPE_BORDER: Record<PIIType, string> = {
  NAME: '#5E81AC',
  EMAIL: '#EBCB8B',
  PHONE: '#B48EAD',
  FINANCIAL: '#BF616A',
  SSN: '#BF616A',
  ID: '#D08770',
  ADDRESS: '#8FBCBB',
  SECRET: '#BF616A',
  URL: '#81A1C1',
  DATE: '#A3BE8C',
  CUSTOM: '#D08770',
  PATH: '#A3BE8C',
}

const TYPE_BG: Record<PIIType, string> = {
  NAME: 'rgba(94,129,172,0.22)',
  EMAIL: 'rgba(235,203,139,0.22)',
  PHONE: 'rgba(180,142,173,0.22)',
  FINANCIAL: 'rgba(191,97,106,0.22)',
  SSN: 'rgba(191,97,106,0.22)',
  ID: 'rgba(208,135,112,0.22)',
  ADDRESS: 'rgba(143,188,187,0.22)',
  SECRET: 'rgba(191,97,106,0.25)',
  URL: 'rgba(129,161,193,0.22)',
  DATE: 'rgba(163,190,140,0.22)',
  CUSTOM: 'rgba(208,135,112,0.22)',
  PATH: 'rgba(163,190,140,0.20)',
}

const PLACEHOLDER = 'Try typing: "Hi John, email me at john@example.com or call 555-123-4567. My SSN is 123-45-6789."'

function HighlightedText({ text, matches }: { text: string; matches: PIIMatch[] }) {
  if (!text) return null
  if (matches.length === 0) return <>{text}</>

  const parts: (string | { type: PIIType; text: string })[] = []
  let last = 0
  for (const m of matches) {
    if (m.start > last) parts.push(text.slice(last, m.start))
    parts.push({ type: m.type, text: m.text })
    last = m.end
  }
  if (last < text.length) parts.push(text.slice(last))

  return (
    <>
      {parts.map((p, i) =>
        typeof p === 'string' ? (
          <span key={i}>{p}</span>
        ) : (
          <mark
            key={i}
            className="rounded px-0.5 border-b-2"
            style={{
              background: TYPE_BG[p.type] ?? 'rgba(129,161,193,0.22)',
              borderBottomColor: TYPE_BORDER[p.type] ?? '#81A1C1',
              color: 'inherit',
            }}
            title={p.type}
          >
            {p.text}
          </mark>
        ),
      )}
    </>
  )
}

interface MappingEntry {
  type: PIIType
  original: string
  fake: string
}

export default function HeroDemo() {
  const [input, setInput] = useState('')
  const [redactMode, setRedactMode] = useState<'labels' | 'replaced'>('labels')

  const { matches, maskedText, maskedMatches, replacedText, replacedMatches, hasPII, error, mappings } = useMemo(() => {
    const trimmed = input.trim()
    const empty = {
      matches: [] as PIIMatch[],
      maskedText: '',
      maskedMatches: [] as PIIMatch[],
      replacedText: '',
      replacedMatches: [] as PIIMatch[],
      hasPII: false,
      error: null as string | null,
      mappings: [] as MappingEntry[],
    }
    if (!trimmed) return empty
    try {
      clearTokens()
      const m = analyzeText(trimmed, DEFAULT_ENABLED_TYPES, [])
      const result = tokenize(m, trimmed)

      const seen = new Set<string>()
      const mappings: MappingEntry[] = []
      const fakeMap = new Map<string, string>()
      for (const match of m) {
        const k = `${match.type}:${match.text}`
        if (seen.has(k)) continue
        seen.add(k)
        const fake = generateFake(match.text, match.type)
        fakeMap.set(k, fake)
        mappings.push({ type: match.type, original: match.text, fake })
      }

      const tokenMap = result.tokenMap
      const maskedMatches: PIIMatch[] = []
      let mIdx = 0
      let mPos = 0
      for (const match of m) {
        const before = trimmed.substring(mIdx, match.start)
        mPos += before.length
        const tokenKey = Object.entries(tokenMap).find(([, v]) => v === match.text)?.[0] ?? match.text
        const newStart = mPos
        mPos += tokenKey.length
        maskedMatches.push({ text: tokenKey, type: match.type, start: newStart, end: mPos, score: match.score })
        mIdx = match.end
      }

      let replaced = ''
      const replacedMatches: PIIMatch[] = []
      let rIdx = 0
      for (const match of m) {
        replaced += trimmed.substring(rIdx, match.start)
        const fake = fakeMap.get(`${match.type}:${match.text}`) ?? match.text
        const newStart = replaced.length
        replaced += fake
        replacedMatches.push({ text: fake, type: match.type, start: newStart, end: replaced.length, score: match.score })
        rIdx = match.end
      }
      replaced += trimmed.substring(rIdx)

      return {
        matches: m,
        maskedText: result.maskedText,
        maskedMatches,
        replacedText: replaced,
        replacedMatches,
        hasPII: m.length > 0,
        error: null,
        mappings,
      }
    } catch (e) {
      return { ...empty, error: e instanceof Error ? e.message : 'Detection failed' }
    }
  }, [input])

  return (
    <div className="space-y-4 text-left select-text" style={{ pointerEvents: 'auto' }}>
      <div className="relative">
        <label htmlFor="hero-demo-input" className="block text-xs font-mono text-[#81A1C1] uppercase tracking-wider mb-2">
          Type here — PII is detected in real time
        </label>
        <textarea
          id="hero-demo-input"
          className="w-full min-h-[100px] p-4 rounded-lg bg-[#2E3440] border border-[#434C5E] text-[#ECEFF4] placeholder-[#4C566A] font-mono text-sm resize-y focus:border-[#88C0D0] focus:ring-1 focus:ring-[#88C0D0] outline-none transition-colors relative z-[1] select-text"
          placeholder={PLACEHOLDER}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          spellCheck={false}
          rows={3}
          aria-label="Type or paste text to see PII detection"
        />
      </div>

      {input.trim() && (
        <>
          <div className="rounded-lg border border-[#434C5E] bg-[#2E3440] p-4">
            <div className="text-xs font-mono text-[#81A1C1] uppercase tracking-wider mb-2 flex items-center gap-2">
              <span>Live detection</span>
              {hasPII && (
                <span className="text-[#BF616A] font-semibold">
                  {matches.length} PII item{matches.length !== 1 ? 's' : ''} found
                </span>
              )}
            </div>
            <p className="font-mono text-sm text-[#D8DEE9] whitespace-pre-wrap break-words leading-relaxed">
              <HighlightedText text={input.trim()} matches={matches} />
            </p>
          </div>

          {hasPII && (
            <div className="rounded-lg border border-[#88C0D0]/30 bg-[#2E3440] p-4">
              <div className="text-xs font-mono text-[#88C0D0] uppercase tracking-wider mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-[#88C0D0]" />
                  Safe to send
                </div>
                <div className="flex bg-[#3B4252] rounded-md p-0.5 gap-0.5">
                  <button
                    className={`px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wider transition-all ${
                      redactMode === 'labels'
                        ? 'bg-[#88C0D0]/20 text-[#88C0D0]'
                        : 'text-[#4C566A] hover:text-[#D8DEE9]'
                    }`}
                    onClick={() => setRedactMode('labels')}
                  >
                    Labels
                  </button>
                  <button
                    className={`px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wider transition-all ${
                      redactMode === 'replaced'
                        ? 'bg-[#88C0D0]/20 text-[#88C0D0]'
                        : 'text-[#4C566A] hover:text-[#D8DEE9]'
                    }`}
                    onClick={() => setRedactMode('replaced')}
                  >
                    Replaced
                  </button>
                </div>
              </div>
              <p className="font-mono text-sm text-[#D8DEE9] whitespace-pre-wrap break-words leading-relaxed">
                <HighlightedText
                  text={redactMode === 'labels' ? maskedText : replacedText}
                  matches={redactMode === 'labels' ? maskedMatches : replacedMatches}
                />
              </p>
            </div>
          )}

          {mappings.length > 0 && (
            <div className="rounded-lg border border-[#434C5E] bg-[#2E3440] p-4">
              <div className="text-xs font-mono text-[#81A1C1] uppercase tracking-wider mb-1">
                Replacement Map
              </div>
              <p className="text-[11px] text-[#4C566A] mb-3">Same value always maps to the same replacement.</p>
              <div className="space-y-1.5">
                {mappings.map(({ type, original, fake }) => (
                  <div key={`${type}:${original}`} className="flex items-center gap-2 text-xs font-mono">
                    <span
                      className="text-[9px] font-bold uppercase border rounded px-1.5 py-0.5 flex-shrink-0"
                      style={{ color: TYPE_BORDER[type], borderColor: TYPE_BORDER[type], opacity: 0.85 }}
                    >
                      {type}
                    </span>
                    <span className="text-[#D8DEE9] truncate flex-1 opacity-75">{original}</span>
                    <span className="text-[#4C566A] flex-shrink-0">&rarr;</span>
                    <span className="text-[#ECEFF4] font-semibold truncate flex-1">{fake}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {error && (
        <p className="text-[#BF616A] text-sm font-mono" role="alert">{error}</p>
      )}

      {!input.trim() && !error && (
        <p className="text-[#4C566A] text-sm font-mono">
          Type or paste text above. Names, emails, phones, SSNs, API keys, and more will be highlighted and redacted.
        </p>
      )}
    </div>
  )
}
