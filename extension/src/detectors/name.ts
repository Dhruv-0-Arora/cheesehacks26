import { ContextualDetector } from './base.ts'
import { FIRST_NAMES } from './data/first-names.ts'
import { LAST_NAMES } from './data/last-names.ts'
import { COMMON_WORDS } from './data/common-words.ts'

const PREFIXES_RAW = [
  'Mister','Miss','Misses','Mrs','Mrs\\.','Ms','Ms\\.','Mr','Mr\\.','Mx','Mx\\.',
  'Doctor','Dr','Dr\\.','Professor','Prof','Prof\\.','Sir','Madam','Dame','Lord','Lady',
  'Monsieur','Madame','Mademoiselle','Mme','Mme\\.','Mlle','Mlle\\.','M','M\\.',
  'Herr','Frau','Doktor',
  'Señor','Señora','Señorita','Don','Doña','Sr','Sr\\.','Sra','Sra\\.',
  'Signore','Signora','Signorina','Signor',
  'Senhor','Senhora',
]
const PREFIXES = PREFIXES_RAW.sort((a, b) => b.length - a.length).join('|')

const GREETINGS = [
  'Hi','Hello','Hey','Dear','Greetings',
  'Hola','Bonjour','Salut','Ciao','Olá',
  'Hallo','Hej','Namaste',
].join('|')

const INTRODUCTIONS = [
  'my name is','i am','this is',
  'je m\'appelle','mon nom est','je suis',
  'ich heiße','mein name ist','ich bin',
  'me llamo','mi nombre es',
  'mi chiamo','il mio nome è',
  'his name is','her name is','their name is','named','called',
  'first name','last name','nickname','surname',
].sort((a, b) => b.length - a.length).join('|')

function toTitleCase(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

function isCommon(word: string): boolean {
  return COMMON_WORDS.has(word.toLowerCase()) || COMMON_WORDS.has(toTitleCase(word))
}

function isKnownFirstName(word: string): boolean {
  return FIRST_NAMES.has(toTitleCase(word))
}

function isKnownLastName(word: string): boolean {
  return LAST_NAMES.has(toTitleCase(word))
}

function isKnownName(word: string): boolean {
  return isKnownFirstName(word) || isKnownLastName(word)
}

export class NameDetector extends ContextualDetector {
  constructor() {
    super()

    // Prefix + capitalized word(s): "Mr. Smith", "Dr. John Doe"
    this.addRule({
      type: 'NAME',
      score: 85,
      pattern: new RegExp(
        `\\b(?!(?:${PREFIXES})\\b)[A-Z][a-zA-Z'-]+(?:\\s+(?!(?:${PREFIXES})\\b)[A-Z][a-zA-Z'-]+)*\\b`,
        'g'
      ),
      contextBefore: new RegExp(`(?:${PREFIXES})\\s+$`, 'i'),
    })

    // Composite names: 2+ capitalized words where at least one is a known name
    this.addRule({
      type: 'NAME',
      score: 80,
      pattern: new RegExp(
        `\\b(?!(?:${GREETINGS}|${INTRODUCTIONS}|${PREFIXES})\\b)[A-Z][a-zA-Z'-]+(?:\\s+(?!(?:${GREETINGS}|${INTRODUCTIONS}|${PREFIXES})\\b)[A-Z][a-zA-Z'-]+)+\\b`,
        'gi'
      ),
      validator: (match) => {
        const words = match.split(/\s+/)
        if (!words.some((w) => isKnownName(w))) return false
        if (words.some((w) => isCommon(w) && !isKnownName(w))) return false
        return true
      },
    })

    // Greeting + name: "Hello John", "Hi Sarah"
    this.addRule({
      type: 'NAME',
      score: 82,
      pattern: /\b[A-Z][a-zA-Z'-]+\b/g,
      contextBefore: new RegExp(`(?:${GREETINGS})\\s+$`, 'i'),
      validator: (match) => {
        if (isCommon(match) && !isKnownName(match)) return false
        return /^[A-Z]/.test(match)
      },
    })

    // Introduction + name: "my name is John"
    this.addRule({
      type: 'NAME',
      score: 82,
      pattern: /\b[A-Z][a-zA-Z'-]+\b/g,
      contextBefore: new RegExp(`(?:${INTRODUCTIONS})\\s+$`, 'i'),
      validator: (match) => {
        if (isCommon(match) && !isKnownName(match)) return false
        return /^[A-Z]/.test(match)
      },
    })

    // Standalone known first names (not common words)
    this.addRule({
      type: 'NAME',
      score: 78,
      pattern: /\b[A-Z][a-zA-Z'-]{1,30}\b/g,
      validator: (word) => {
        if (isCommon(word)) return false
        return isKnownFirstName(word)
      },
    })

    // Standalone known last names (not common words)
    this.addRule({
      type: 'NAME',
      score: 75,
      pattern: /\b[A-Z][a-zA-Z'-]{1,30}\b/g,
      validator: (word) => {
        if (isCommon(word)) return false
        if (isKnownFirstName(word)) return false
        return isKnownLastName(word)
      },
    })

    // Username context: "username: john_doe"
    this.addRule({
      type: 'NAME',
      score: 80,
      pattern: /\b[a-zA-Z0-9._-]{3,30}\b/g,
      contextBefore: /(?:username|login|user|handle|alias)\s*[:=]\s*$/i,
      validator: (val) => val.length > 2,
    })
  }
}
