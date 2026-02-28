import { ContextualDetector } from './base.ts'

export class LogDetector extends ContextualDetector {
  constructor() {
    super()

    // URLs with query parameters — flag the full URL+query string
    this.addRule({
      type: 'URL',
      score: 92,
      pattern: /https?:\/\/[^\s"'<>]*\?[^\s"'<>]+=+[^\s"'<>]*/g,
      validator: (match) => match.includes('='),
    })

    // Long hex IDs — MongoDB ObjectIDs (24), MD5 (32), SHA1/Git (40)
    this.addRule({
      type: 'ID',
      score: 82,
      pattern: /\b[0-9a-f]{24,40}\b/gi,
      validator: (match) => {
        const lower = match.toLowerCase()
        const hexCount = (lower.match(/[0-9a-f]/g) ?? []).length
        return hexCount / lower.length >= 0.9
      },
    })

    // Long numeric IDs — transaction IDs, user IDs, order numbers (10–18 digits)
    // Context-gated to avoid swallowing phone numbers already caught by PhoneDetector
    this.addRule({
      type: 'ID',
      score: 76,
      pattern: /\b\d{10,18}\b/g,
      dist: 50,
      keywords: ['id', 'user_id', 'userid', 'account', 'order', 'txn', 'transaction',
                 'request', 'trace', 'span', 'session', 'ref', 'record', 'row'],
    })

    // Unix / macOS / Linux file paths
    this.addRule({
      type: 'PATH',
      score: 87,
      pattern: /\/(?:[\w.-]+\/)+[\w.-]+/g,
      validator: (match, ctx) => {
        const parts = match.split('/').filter(Boolean)
        if (parts.length < 2) return false

        // Exclude paths that are part of a URL (preceded by a hostname)
        if (ctx) {
          const before = ctx.text.substring(Math.max(0, ctx.index - 30), ctx.index)
          if (/https?:\/\/[^\s/]*$/.test(before)) return false
        }

        // Require a known root dir OR a file extension to reduce false positives
        const knownRoots = new Set([
          'var', 'etc', 'usr', 'home', 'tmp', 'opt', 'srv', 'root',
          'lib', 'bin', 'sbin', 'proc', 'sys', 'dev', 'run', 'mnt',
          'media', 'app', 'apps', 'data', 'logs', 'log', 'storage',
          'volumes', 'private', 'Users',
        ])
        const hasKnownRoot = knownRoots.has(parts[0])
        const hasExtension = /\.\w{1,6}$/.test(match)
        return hasKnownRoot || hasExtension
      },
    })

    // Windows file paths — e.g. C:\Users\John\Documents\file.log
    this.addRule({
      type: 'PATH',
      score: 90,
      pattern: /[A-Za-z]:\\(?:[\w\s.-]+\\)*[\w\s.-]+/g,
      validator: (match) => match.length >= 6,
    })
  }
}
