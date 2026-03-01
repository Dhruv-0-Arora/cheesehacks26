/**
 * ML-based PII detector that runs a TF.js BiLSTM NER model.
 * Designed to run in the background service worker (CPU backend only).
 *
 * Uses only CPU-compatible TF.js modules to avoid WebGL/DOM dependencies
 * that don't exist in service workers.
 */

import '@tensorflow/tfjs-backend-cpu'
import * as tf from '@tensorflow/tfjs-core'
import { loadLayersModel, LayersModel } from '@tensorflow/tfjs-layers'
import type { PIIMatch, PIIType } from '../types.ts'

const ML_SCORE = 70
const CONFIDENCE_THRESHOLD = 0.55
const MAX_SEQ_LEN = 128

let model: LayersModel | null = null
let vocab: Record<string, number> | null = null
let labels: string[] | null = null
let loadingPromise: Promise<void> | null = null

const BIO_TO_PII_TYPE: Record<string, PIIType> = {
  NAME: 'NAME',
  EMAIL: 'EMAIL',
  PHONE: 'PHONE',
  FINANCIAL: 'FINANCIAL',
  SSN: 'SSN',
  ID: 'ID',
  ADDRESS: 'ADDRESS',
  SECRET: 'SECRET',
}

function getModelBaseUrl(): string {
  return chrome.runtime.getURL('model/')
}

async function loadModel(): Promise<void> {
  if (model && vocab && labels) return
  if (loadingPromise) return loadingPromise

  loadingPromise = (async () => {
    try {
      console.log('[PII Shield ML] Setting CPU backend...')
      await tf.setBackend('cpu')
      await tf.ready()
      console.log('[PII Shield ML] TF.js ready, backend:', tf.getBackend())

      const baseUrl = getModelBaseUrl()
      console.log('[PII Shield ML] Loading model from:', baseUrl)

      const [vocabResp, labelsResp] = await Promise.all([
        fetch(`${baseUrl}vocab.json`),
        fetch(`${baseUrl}labels.json`),
      ])

      if (!vocabResp.ok) throw new Error(`vocab.json: ${vocabResp.status}`)
      if (!labelsResp.ok) throw new Error(`labels.json: ${labelsResp.status}`)

      vocab = await vocabResp.json() as Record<string, number>
      labels = await labelsResp.json() as string[]
      console.log(`[PII Shield ML] Vocab size: ${Object.keys(vocab).length}, Labels: ${labels.length}`)

      model = await loadLayersModel(`${baseUrl}model.json`)
      console.log('[PII Shield ML] Model loaded successfully')
    } catch (err) {
      console.error('[PII Shield ML] Failed to load model:', err)
      model = null
      vocab = null
      labels = null
    } finally {
      loadingPromise = null
    }
  })()

  return loadingPromise
}

interface WordSpan {
  word: string
  start: number
  end: number
}

function tokenizeText(text: string): WordSpan[] {
  const spans: WordSpan[] = []
  const regex = /\S+/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    spans.push({
      word: match[0],
      start: match.index,
      end: match.index + match[0].length,
    })
  }
  return spans
}

function wordsToIds(wordSpans: WordSpan[]): Int32Array {
  const ids = new Int32Array(MAX_SEQ_LEN)
  const unkId = vocab!['<UNK>'] || 1

  for (let i = 0; i < Math.min(wordSpans.length, MAX_SEQ_LEN); i++) {
    const lower = wordSpans[i].word.toLowerCase()
    ids[i] = vocab![lower] ?? unkId
  }
  return ids
}

function decodePredictions(
  probs: Float32Array | number[],
  wordSpans: WordSpan[],
  text: string,
): PIIMatch[] {
  if (!labels) return []

  const numLabels = labels.length
  const seqLen = Math.min(wordSpans.length, MAX_SEQ_LEN)
  const matches: PIIMatch[] = []

  let currentType: PIIType | null = null
  let spanStart = 0
  let spanEnd = 0

  for (let i = 0; i < seqLen; i++) {
    const offset = i * numLabels
    let bestIdx = 0
    let bestProb = 0
    for (let j = 0; j < numLabels; j++) {
      const p = probs[offset + j] as number
      if (p > bestProb) {
        bestProb = p
        bestIdx = j
      }
    }

    const label = labels[bestIdx]

    if (label.startsWith('B-') && bestProb >= CONFIDENCE_THRESHOLD) {
      if (currentType !== null) {
        matches.push({
          text: text.substring(spanStart, spanEnd),
          type: currentType,
          start: spanStart,
          end: spanEnd,
          score: ML_SCORE,
        })
      }
      const bioType = label.substring(2)
      currentType = BIO_TO_PII_TYPE[bioType] || null
      if (currentType) {
        spanStart = wordSpans[i].start
        spanEnd = wordSpans[i].end
      }
    } else if (label.startsWith('I-') && currentType !== null && bestProb >= CONFIDENCE_THRESHOLD) {
      const bioType = label.substring(2)
      if (BIO_TO_PII_TYPE[bioType] === currentType) {
        spanEnd = wordSpans[i].end
      } else {
        matches.push({
          text: text.substring(spanStart, spanEnd),
          type: currentType,
          start: spanStart,
          end: spanEnd,
          score: ML_SCORE,
        })
        currentType = null
      }
    } else {
      if (currentType !== null) {
        matches.push({
          text: text.substring(spanStart, spanEnd),
          type: currentType,
          start: spanStart,
          end: spanEnd,
          score: ML_SCORE,
        })
        currentType = null
      }
    }
  }

  if (currentType !== null) {
    matches.push({
      text: text.substring(spanStart, spanEnd),
      type: currentType,
      start: spanStart,
      end: spanEnd,
      score: ML_SCORE,
    })
  }

  return matches
}

export async function mlAnalyzeText(text: string): Promise<PIIMatch[]> {
  if (!text || text.trim().length === 0) return []

  await loadModel()
  if (!model || !vocab || !labels) {
    console.warn('[PII Shield ML] Model not available, skipping ML analysis')
    return []
  }

  const wordSpans = tokenizeText(text)
  if (wordSpans.length === 0) return []

  const ids = wordsToIds(wordSpans)
  const inputTensor = tf.tensor2d([Array.from(ids)], [1, MAX_SEQ_LEN], 'int32')

  try {
    const output = model.predict(inputTensor) as tf.Tensor
    const probs = await output.data() as Float32Array
    output.dispose()
    const results = decodePredictions(probs, wordSpans, text)
    console.log(`[PII Shield ML] Analyzed "${text.substring(0, 50)}..." → ${results.length} matches`, results)
    return results
  } finally {
    inputTensor.dispose()
  }
}

export function isModelLoaded(): boolean {
  return model !== null
}

export async function ensureModelLoaded(): Promise<boolean> {
  await loadModel()
  return model !== null
}
