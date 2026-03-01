import { useState, useMemo } from 'react'
import { analyzeText } from '@extension/detectors/engine'
import { tokenize, clearTokens } from '@extension/tokens/manager'
import { generateFake } from '@extension/tokens/fake-data'
import type { PIIMatch, PIIType } from '@extension/types'

const DEFAULT_ENABLED_TYPES: PIIType[] = [
  'NAME', 'EMAIL', 'PHONE', 'FINANCIAL', 'SSN', 'ID', 'ADDRESS', 'SECRET', 'URL', 'DATE', 'PATH',
]

const TYPE_BORDER: Record<PIIType, string> = {
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
              background: TYPE_BG[p.type] ?? 'rgba(129,161,193,0.14)',
              borderBottomColor: TYPE_BORDER[p.type] ?? '#81a1c1',
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

  const { matches, maskedText, replacedText, hasPII, error, mappings } = useMemo(() => {
    const trimmed = input.trim()
    if (!trimmed)
      return {
        matches: [] as PIIMatch[],
        maskedText: '',
        replacedText: '',
        hasPII: false,
        error: null as string | null,
        mappings: [] as MappingEntry[],
      }
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

      let replaced = ''
      let idx = 0
      for (const match of m) {
        replaced += trimmed.substring(idx, match.start)
        replaced += fakeMap.get(`${match.type}:${match.text}`) ?? match.text
        idx = match.end
      }
      replaced += trimmed.substring(idx)

      return {
        matches: m,
        maskedText: result.maskedText,
        replacedText: replaced,
        hasPII: m.length > 0,
        error: null,
        mappings,
      }
    } catch (e) {
      return {
        matches: [] as PIIMatch[],
        maskedText: '',
        replacedText: '',
        hasPII: false,
        error: e instanceof Error ? e.message : 'Detection failed',
        mappings: [] as MappingEntry[],
      }
    }
  }, [input])

  return (
    <div className="space-y-4 text-left select-text" style={{ pointerEvents: 'auto' }}>
      <div className="relative">
        <label htmlFor="hero-demo-input" className="block text-xs font-mono text-gray-500 uppercase tracking-wider mb-2">
          Type here — PII is detected in real time
        </label>
        <textarea
          id="hero-demo-input"
          className="w-full min-h-[100px] p-4 rounded-lg bg-black/50 border border-[#333] text-gray-200 placeholder-gray-500 font-mono text-sm resize-y focus:border-[var(--accent-color)] focus:ring-1 focus:ring-[var(--accent-color)] outline-none transition-colors relative z-[1] select-text"
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
          <div className="rounded-lg border border-[#333] bg-black/50 p-4">
            <div className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
              <span>Live detection</span>
              {hasPII && (
                <span className="text-red-400 font-semibold">
                  {matches.length} PII item{matches.length !== 1 ? 's' : ''} found
                </span>
              )}
            </div>
            <p className="font-mono text-sm text-gray-300 whitespace-pre-wrap break-words leading-relaxed">
              <HighlightedText text={input.trim()} matches={matches} />
            </p>
          </div>

          {hasPII && (
            <div className="rounded-lg border border-[var(--accent-color)]/30 bg-black/50 p-4">
              <div className="text-xs font-mono text-[var(--accent-color)] uppercase tracking-wider mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-[var(--accent-color)]" />
                  Safe to send
                </div>
                <div className="flex bg-white/5 rounded-md p-0.5 gap-0.5">
                  <button
                    className={`px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wider transition-all ${
                      redactMode === 'labels'
                        ? 'bg-[var(--accent-color)]/20 text-[var(--accent-color)]'
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                    onClick={() => setRedactMode('labels')}
                  >
                    Labels
                  </button>
                  <button
                    className={`px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wider transition-all ${
                      redactMode === 'replaced'
                        ? 'bg-[var(--accent-color)]/20 text-[var(--accent-color)]'
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                    onClick={() => setRedactMode('replaced')}
                  >
                    Replaced
                  </button>
                </div>
              </div>
              <p className="font-mono text-sm text-gray-300 whitespace-pre-wrap break-words leading-relaxed">
                {redactMode === 'labels' ? maskedText : replacedText}
              </p>
            </div>
          )}

          {mappings.length > 0 && (
            <div className="rounded-lg border border-[#333] bg-black/50 p-4">
              <div className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-1">
                Replacement Map
              </div>
              <p className="text-[11px] text-gray-600 mb-3">Same value always maps to the same replacement.</p>
              <div className="space-y-1.5">
                {mappings.map(({ type, original, fake }) => (
                  <div key={`${type}:${original}`} className="flex items-center gap-2 text-xs font-mono">
                    <span
                      className="text-[9px] font-bold uppercase border rounded px-1.5 py-0.5 flex-shrink-0"
                      style={{ color: TYPE_BORDER[type], borderColor: TYPE_BORDER[type], opacity: 0.85 }}
                    >
                      {type}
                    </span>
                    <span className="text-gray-400 truncate flex-1">{original}</span>
                    <span className="text-gray-600 flex-shrink-0">&rarr;</span>
                    <span className="text-gray-200 font-semibold truncate flex-1">{fake}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {error && (
        <p className="text-red-400 text-sm font-mono" role="alert">{error}</p>
      )}

      {!input.trim() && !error && (
        <p className="text-gray-500 text-sm font-mono">
          Type or paste text above. Names, emails, phones, SSNs, API keys, and more will be highlighted and redacted.
        </p>
      )}
    </div>
  )
}
