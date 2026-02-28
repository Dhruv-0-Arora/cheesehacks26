import { ContextualDetector } from './base.ts'

export class AddressDetector extends ContextualDetector {
  constructor() {
    super()

    // US postal/zip codes
    this.addRule({
      type: 'ADDRESS',
      score: 60,
      pattern: /\b\d{5}(?:-\d{4})?\b/g,
      dist: 40,
      keywords: ['zip', 'postal', 'code', 'address', 'city', 'state'],
    })

    // UK postcodes
    this.addRule({
      type: 'ADDRESS',
      score: 65,
      pattern: /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/gi,
    })

    // Canadian postal codes
    this.addRule({
      type: 'ADDRESS',
      score: 65,
      pattern: /\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/gi,
    })

    // GPS coordinates
    this.addRule({
      type: 'ADDRESS',
      score: 87,
      pattern: /-?\d{1,3}\.\d{4,},\s*-?\d{1,3}\.\d{4,}/g,
      validator: (match) => {
        const parts = match.split(',').map((p) => parseFloat(p.trim()))
        if (parts.length !== 2) return false
        const [lat, lon] = parts
        return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
      },
    })

    // US street addresses
    this.addRule({
      type: 'ADDRESS',
      score: 85,
      pattern: /\b\d{1,6}\s+[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*\s+(?:Street|St|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Road|Rd|Lane|Ln|Way|Court|Ct|Place|Pl|Circle|Cir)\b\.?/gi,
    })
  }
}
