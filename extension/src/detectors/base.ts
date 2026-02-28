import type { PIIMatch, DetectionRule, PIIType } from '../types.ts'

export class ContextualDetector {
  protected rules: DetectionRule[] = []

  addRule(rule: DetectionRule) {
    this.rules.push(rule)
  }

  protected checkLooseContext(
    text: string,
    index: number,
    matchLen: number,
    rule: DetectionRule
  ): boolean {
    if (!rule.keywords || rule.keywords.length === 0) return true

    const dist = rule.dist || 50
    const start = Math.max(0, index - dist)
    const beforeText = text.substring(start, index).toLowerCase()

    return rule.keywords.some((kw) => {
      const kwIdx = beforeText.lastIndexOf(kw)
      if (kwIdx === -1) return false

      if (kwIdx > 0) {
        const charBefore = beforeText[kwIdx - 1]
        if (/[a-z0-9]/.test(charBefore)) return false
      }

      const gap = beforeText.substring(kwIdx + kw.length)
      if (gap.length > 0 && /[a-z0-9]/.test(gap[0])) return false
      if (/[\r\n]|\. /.test(gap)) return false
      if (gap.length > dist) return false

      return true
    })
  }

  scan(text: string): PIIMatch[] {
    if (!text) return []
    const matches: PIIMatch[] = []
    const ranges: { start: number; end: number }[] = []

    const isOverlapping = (start: number, end: number) =>
      ranges.some((r) => start < r.end && end > r.start)

    for (const rule of this.rules) {
      rule.pattern.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = rule.pattern.exec(text)) !== null) {
        const mText = match[0]
        const start = match.index
        const end = start + mText.length

        if (isOverlapping(start, end)) continue

        if (rule.validator && !rule.validator(mText, { index: start, text })) continue

        if (rule.contextBefore) {
          const before = text.substring(0, start)
          if (!rule.contextBefore.test(before)) continue
        }

        if (rule.contextAfter) {
          const after = text.substring(end)
          if (!rule.contextAfter.test(after)) continue
        }

        if (rule.dist && rule.keywords) {
          if (!this.checkLooseContext(text, start, mText.length, rule)) continue
        }

        matches.push({
          text: mText,
          type: rule.type,
          start,
          end,
          score: rule.score,
        })
        ranges.push({ start, end })
      }
    }

    return matches.sort((a, b) => a.start - b.start)
  }
}

export function getScoreForType(type: PIIType): number {
  const scores: Record<string, number> = {
    CUSTOM: 130,
    FINANCIAL: 115,
    EMAIL: 105,
    URL: 105,
    SSN: 100,
    ID: 95,
    SECRET: 90,
    ADDRESS: 85,
    DATE: 86,
    PHONE: 85,
    NAME: 80,
  }
  return scores[type] ?? 30
}
