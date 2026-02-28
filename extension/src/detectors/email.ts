import { ContextualDetector } from './base.ts'

export class EmailDetector extends ContextualDetector {
  constructor() {
    super()
    this.addRule({
      type: 'EMAIL',
      score: 105,
      pattern: /\b[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+\b/gi,
    })
  }
}
