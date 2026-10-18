import { Note } from 'tonal'
import { chordInfo, positionNotes } from './music'
import type { InstrumentContext, ProgressionStep } from './types'

export interface DetectedPitch {
  note: string
  cents: number
  frequency: number
  confidence: number
}
/** YIN difference estimator. A long window also resolves the low B string (30.87 Hz). */
export function estimatePitch(samples: Float32Array, sampleRate: number): DetectedPitch | null {
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || samples.length < 512) return null
  const factor = sampleRate > 24000 ? 2 : 1
  const rate = sampleRate / factor
  const data = new Float32Array(Math.floor(samples.length / factor))
  let mean = 0
  for (let i = 0; i < data.length; i++) {
    let sum = 0
    for (let j = 0; j < factor; j++) sum += samples[i * factor + j] ?? 0
    data[i] = sum / factor
    mean += data[i]!
  }
  mean /= data.length
  let energy = 0
  for (let i = 0; i < data.length; i++) {
    data[i] = data[i]! - mean
    energy += data[i]! ** 2
  }
  if (Math.sqrt(energy / data.length) < 0.008) return null
  const maxLag = Math.min(Math.floor(rate / 27), Math.floor(data.length / 2) - 1)
  const minLag = Math.max(2, Math.floor(rate / 1600))
  const window = Math.min(2048, data.length - maxLag)
  const diff = new Float32Array(maxLag + 1)
  const normalized = new Float32Array(maxLag + 1)
  let cumulative = 0
  normalized[0] = 1
  for (let tau = 1; tau <= maxLag; tau++) {
    let sum = 0
    for (let i = 0; i < window; i++) {
      const delta = data[i]! - data[i + tau]!
      sum += delta * delta
    }
    diff[tau] = sum
    cumulative += sum
    normalized[tau] = cumulative ? (sum * tau) / cumulative : 1
  }
  let lag = -1
  for (let tau = minLag; tau < maxLag; tau++) {
    if (normalized[tau]! < 0.12) {
      while (tau + 1 <= maxLag && normalized[tau + 1]! < normalized[tau]!) tau++
      lag = tau
      break
    }
  }
  if (lag < 0) return null
  const confidence = 1 - normalized[lag]!
  if (confidence < 0.85) return null
  const a = normalized[lag - 1]!
  const b = normalized[lag]!
  const c = normalized[lag + 1] ?? b
  const divisor = 2 * (2 * b - a - c)
  const refined = lag + (divisor ? (c - a) / divisor : 0)
  const frequency = rate / refined
  if (!Number.isFinite(frequency) || frequency < 27 || frequency > 1600) return null
  const midi = 69 + 12 * Math.log2(frequency / 440)
  const rounded = Math.round(midi)
  return {
    note: Note.fromMidi(rounded),
    cents: Math.round((midi - rounded) * 100),
    frequency,
    confidence,
  }
}

let context: AudioContext | undefined
let generation = 0
const voices = new Set<OscillatorNode>()
const pending = new Set<() => void>()
async function audioContext() {
  if (!globalThis.AudioContext)
    throw new Error(
      'Este navegador no admite audio. Prueba con una versión reciente de Chrome, Safari o Firefox.',
    )
  context ??= new AudioContext()
  if (context.state === 'suspended') await context.resume()
  return context
}
export function stopAudio(): void {
  generation++
  for (const finish of pending) finish()
  pending.clear()
  for (const oscillator of voices) {
    try {
      oscillator.stop()
    } catch {
      /* Already ended. */
    }
    oscillator.disconnect()
  }
  voices.clear()
}
function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      pending.delete(done)
      resolve()
    }
    const timer = setTimeout(done, milliseconds)
    pending.add(done)
  })
}
function sound(
  ctx: AudioContext,
  notes: string[],
  at: number,
  duration: number,
  arpeggio: boolean,
) {
  notes.forEach((note, index) => {
    const frequency = Note.freq(note)
    if (!frequency || frequency < 20 || frequency > 16000) return
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    const start = at + (arpeggio ? index * 0.11 : 0)
    const length = Math.max(0.12, duration)
    oscillator.type = 'triangle'
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(0.22 / Math.sqrt(Math.max(1, notes.length)), start + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.001, start + length)
    oscillator.connect(gain)
    gain.connect(ctx.destination)
    voices.add(oscillator)
    oscillator.onended = () => {
      voices.delete(oscillator)
      oscillator.disconnect()
      gain.disconnect()
    }
    oscillator.start(start)
    oscillator.stop(start + length + 0.02)
  })
}
export async function playNotes(notes: string[], arpeggio = false): Promise<void> {
  stopAudio()
  const token = generation
  const ctx = await audioContext()
  if (token !== generation) return
  if (!notes.length || notes.some((note) => !Note.freq(note)))
    throw new Error('No hay notas válidas para reproducir.')
  sound(ctx, notes, ctx.currentTime + 0.02, 1.15, arpeggio)
  await wait(1200 + (arpeggio ? notes.length * 110 : 0))
}
export function progressionNotes(step: ProgressionStep, context?: InstrumentContext): string[] {
  if (
    context &&
    step.voicing &&
    step.voicing.length === context.tuning.notes.length &&
    step.voicing.every(
      (f) => f === null || (Number.isInteger(f) && f >= 0 && f <= context.frets - context.capo),
    )
  ) {
    const notes = positionNotes(context.tuning, step.voicing, context.capo)
    if (notes.length) return notes
  }
  const chord = chordInfo(step.chord)
  if (!chord.notes.length)
    throw new Error(`No se puede reproducir el acorde «${step.chord}». Revisa su nombre.`)
  const octave = context?.instrument.startsWith('bass') ? 2 : 3
  let previous = -1
  const notes = chord.notes.map((note) => {
    let midi = Note.midi(`${note}${octave}`)!
    while (midi <= previous) midi += 12
    previous = midi
    return Note.fromMidi(midi)
  })
  const bass = step.chord.match(/\/([A-G](?:#{1,2}|b{1,2})?)$/)?.[1]
  if (bass) {
    const midi = Note.midi(`${bass}${octave - 1}`)
    if (midi !== null) notes.unshift(Note.fromMidi(midi))
  }
  return notes
}
export async function playProgression(
  steps: ProgressionStep[],
  tempo: number,
  loop: boolean,
  onStep?: (index: number) => void,
  context?: InstrumentContext,
): Promise<void> {
  stopAudio()
  const token = generation
  if (!steps.length) return
  if (
    !Number.isFinite(tempo) ||
    tempo < 30 ||
    tempo > 300 ||
    steps.some((s) => !Number.isFinite(s.beats) || s.beats < 0.25 || s.beats > 16)
  )
    throw new Error('La progresión necesita un tempo de 30 a 300 y duraciones válidas.')
  const chords = steps.map((step) => progressionNotes(step, context))
  const ctx = await audioContext()
  do {
    for (let index = 0; index < steps.length; index++) {
      if (token !== generation) return
      onStep?.(index)
      if (token !== generation) return
      const duration = (60 / tempo) * steps[index]!.beats
      sound(ctx, chords[index]!, ctx.currentTime + 0.01, duration * 0.9, false)
      await wait(duration * 1000)
    }
  } while (loop && token === generation)
}

let microphoneStop: (() => void) | undefined
let microphoneGeneration = 0
export function stopPitchDetection(): void {
  microphoneGeneration++
  microphoneStop?.()
}
export async function startPitchDetection(
  onPitch: (pitch: DetectedPitch | null) => void,
): Promise<() => void> {
  stopPitchDetection()
  const token = microphoneGeneration
  if (!globalThis.AudioContext)
    throw new Error(
      'Este navegador no admite audio. Usa una versión actualizada para abrir el afinador.',
    )
  if (!navigator.mediaDevices?.getUserMedia)
    throw new Error('El micrófono requiere una conexión segura (HTTPS) y un navegador compatible.')
  // Resume inside the initiating user gesture, before awaiting the permission prompt.
  const ctx = new AudioContext()
  const activation = ctx.resume()
  let stream: MediaStream | undefined
  let source: MediaStreamAudioSourceNode | undefined
  let node: AudioWorkletNode | undefined
  let stopped = false
  const stop = () => {
    if (stopped) return
    stopped = true
    stream?.getTracks().forEach((t) => t.stop())
    source?.disconnect()
    if (node) {
      node.port.onmessage = null
      node.disconnect()
    }
    void ctx.close()
    if (microphoneStop === stop) microphoneStop = undefined
  }
  microphoneStop = stop
  try {
    await activation
    if (stopped || token !== microphoneGeneration) return stop
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    })
  } catch {
    stop()
    if (token !== microphoneGeneration) return stop
    throw new Error(
      'No se pudo acceder al micrófono. Permite su uso en el navegador y comprueba que esté conectado.',
    )
  }
  if (stopped || token !== microphoneGeneration) {
    stream.getTracks().forEach((t) => t.stop())
    stop()
    return stop
  }
  const worklet = `class PitchCapture extends AudioWorkletProcessor {
    constructor() { super(); this.buffer = new Float32Array(8192); this.position = 0; this.count = 0; }
    process(inputs) { const channel = inputs[0]?.[0]; if (channel) { for (let i=0;i<channel.length;i++) { this.buffer[this.position] = channel[i]; this.position=(this.position+1)%8192; this.count++; }
      if (this.count>=4096) { this.count=0; const frame=new Float32Array(8192); for(let i=0;i<8192;i++) frame[i]=this.buffer[(this.position+i)%8192]; this.port.postMessage(frame,[frame.buffer]); }
    } return true; }
  } registerProcessor('pitch-capture', PitchCapture);`
  const url = URL.createObjectURL(new Blob([worklet], { type: 'application/javascript' }))
  try {
    if (!ctx.audioWorklet) throw new Error('El navegador no dispone de AudioWorklet')
    await ctx.audioWorklet.addModule(url)
    if (stopped || token !== microphoneGeneration) return stop
    source = ctx.createMediaStreamSource(stream)
    node = new AudioWorkletNode(ctx, 'pitch-capture')
    node.port.onmessage = (event) => {
      if (!stopped) onPitch(estimatePitch(event.data as Float32Array, ctx.sampleRate))
    }
    // The capture processor emits silence; connecting it keeps processing active without monitoring the mic.
    source.connect(node)
    node.connect(ctx.destination)
    return stop
  } catch {
    stop()
    if (token !== microphoneGeneration) return stop
    throw new Error(
      'No se pudo iniciar el afinador. Prueba con un navegador actualizado y vuelve a permitir el micrófono.',
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}
