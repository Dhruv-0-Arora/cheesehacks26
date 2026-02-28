import { ContextualDetector } from './base.ts'

export class PhoneDetector extends ContextualDetector {
  constructor() {
    super()

    // International format: +1-555-123-4567, +44 20 7946 0958
    this.addRule({
      type: 'PHONE',
      score: 85,
      pattern: /\+\d{1,3}[\s.-]?\(?\d{1,4}\)?[\s.-]?\d{1,4}[\s.-]?\d{1,9}/g,
      validator: (match) => {
        const digits = match.replace(/\D/g, '')
        return digits.length >= 7 && digits.length <= 15
      },
    })

    // US format: (555) 123-4567, 555-123-4567
    this.addRule({
      type: 'PHONE',
      score: 85,
      pattern: /\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g,
    })

    // Context-dependent: "phone: 5551234567"
    this.addRule({
      type: 'PHONE',
      score: 85,
      pattern: /\b\d{7,15}\b/g,
      dist: 30,
      keywords: ['phone', 'tel', 'mobile', 'cell', 'fax', 'call', 'contact', 'number'],
      validator: (match) => {
        const digits = match.replace(/\D/g, '')
        return digits.length >= 7 && digits.length <= 15
      },
    })
  }
}
