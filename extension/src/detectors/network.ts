import { ContextualDetector } from './base.ts'

export class NetworkDetector extends ContextualDetector {
  constructor() {
    super()

    // IPv4
    this.addRule({
      type: 'SECRET',
      score: 90,
      pattern: /\b(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g,
      validator: (match) => {
        if (match === '0.0.0.0' || match === '127.0.0.1' || match === '255.255.255.255') return false
        return true
      },
    })

    // MAC address
    this.addRule({
      type: 'SECRET',
      score: 90,
      pattern: /\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/g,
    })

    // JWT tokens
    this.addRule({
      type: 'SECRET',
      score: 95,
      pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    })

    // API keys (generic long alphanumeric strings with context)
    this.addRule({
      type: 'SECRET',
      score: 90,
      pattern: /\b(?:sk|pk|api|key|token|secret|access|auth)[-_][a-zA-Z0-9]{16,}\b/gi,
    })

    // AWS access keys
    this.addRule({
      type: 'SECRET',
      score: 95,
      pattern: /\b(?:AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}\b/g,
    })

    // Generic secret strings (with context)
    this.addRule({
      type: 'SECRET',
      score: 84,
      pattern: /\b[a-zA-Z0-9/+=]{20,}\b/g,
      dist: 30,
      keywords: ['password', 'secret', 'api_key', 'api key', 'apikey', 'token', 'private_key', 'access_token'],
      validator: (match) => match.length >= 20 && match.length <= 200,
    })

    // Passwords with context
    this.addRule({
      type: 'SECRET',
      score: 84,
      pattern: /\S{4,60}/g,
      dist: 20,
      keywords: ['password', 'passwd', 'pwd', 'pass', 'mot de passe', 'passwort', 'contraseña'],
      validator: (match) => match.length >= 4 && match.length <= 60,
    })

    // UUID
    this.addRule({
      type: 'ID',
      score: 85,
      pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    })
  }
}
