import { ContextualDetector } from './base.ts'

function luhnCheck(num: string): boolean {
  const digits = num.replace(/\D/g, '')
  let sum = 0
  let alternate = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10)
    if (alternate) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    alternate = !alternate
  }
  return sum % 10 === 0
}

export class FinancialDetector extends ContextualDetector {
  constructor() {
    super()

    // Credit card numbers (13-19 digits with optional separators)
    this.addRule({
      type: 'FINANCIAL',
      score: 110,
      pattern: /\b(?:4\d{3}|5[1-5]\d{2}|3[47]\d{2}|6(?:011|5\d{2}))[\s.-]?\d{4}[\s.-]?\d{4}[\s.-]?\d{1,7}\b/g,
      validator: (match) => {
        const digits = match.replace(/\D/g, '')
        return digits.length >= 13 && digits.length <= 19 && luhnCheck(digits)
      },
    })

    // IBAN (international bank account number)
    this.addRule({
      type: 'FINANCIAL',
      score: 115,
      pattern: /\b[A-Z]{2}\d{2}[\s]?[\dA-Z]{4}[\s]?(?:[\dA-Z]{4}[\s]?){1,7}[\dA-Z]{1,4}\b/g,
      validator: (match) => {
        const clean = match.replace(/\s/g, '')
        return clean.length >= 15 && clean.length <= 34 && /^[A-Z]{2}\d{2}/.test(clean)
      },
    })

    // CVV (3-4 digits with context)
    this.addRule({
      type: 'FINANCIAL',
      score: 100,
      pattern: /\b\d{3,4}\b/g,
      dist: 20,
      keywords: ['cvv', 'cvc', 'cvv2', 'security code', 'card verification'],
    })

    // BIC/SWIFT code
    this.addRule({
      type: 'FINANCIAL',
      score: 90,
      pattern: /\b[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/g,
      dist: 30,
      keywords: ['bic', 'swift', 'bank'],
      validator: (match) => match.length >= 8 && match.length <= 11,
    })

    // Crypto wallet addresses (Bitcoin, Ethereum)
    this.addRule({
      type: 'FINANCIAL',
      score: 95,
      pattern: /\b(?:0x[a-fA-F0-9]{40}|(?:bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62})\b/g,
    })
  }
}
