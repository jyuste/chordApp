import { describe, expect, it } from 'vitest'
import { estimatePitch } from '../src/lib/audio'
function tone(frequency: number, rate = 48000, cents = 0) {
  return Float32Array.from(
    { length: 8192 },
    (_, index) => 0.4 * Math.sin((2 * Math.PI * frequency * 2 ** (cents / 1200) * index) / rate),
  )
}
describe('detector monofónico', () => {
  it.each([
    [30.8677, 'B0'],
    [41.2034, 'E1'],
    [82.4069, 'E2'],
    [110, 'A2'],
    [440, 'A4'],
  ])('detecta %s Hz como %s', (frequency, note) => {
    const result = estimatePitch(tone(frequency as number), 48000)
    expect(result?.note).toBe(note)
    expect(Math.abs(result?.cents ?? 100)).toBeLessThan(3)
    expect(result?.confidence).toBeGreaterThan(0.95)
  })
  it('mide la desviación y soporta 44,1 kHz', () => {
    const result = estimatePitch(tone(110, 44100, 23), 44100)
    expect(result?.note).toBe('A2')
    expect(result?.cents).toBeCloseTo(23, 0)
  })
  it('rechaza silencio, ruido y ventanas insuficientes', () => {
    expect(estimatePitch(new Float32Array(8192), 48000)).toBeNull()
    let seed = 1234
    const noise = Float32Array.from({ length: 8192 }, () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 2 ** 32 - 0.5
    })
    expect(estimatePitch(noise, 48000)).toBeNull()
    expect(estimatePitch(new Float32Array(128), 48000)).toBeNull()
  })
  it('detecta una cuerda con armónicos', () => {
    const samples = Float32Array.from(
      { length: 8192 },
      (_, i) =>
        0.2 * Math.sin((2 * Math.PI * 82.4069 * i) / 48000) +
        0.3 * Math.sin((2 * Math.PI * 164.8138 * i) / 48000),
    )
    expect(estimatePitch(samples, 48000)?.note).toBe('E2')
  })
})

import { progressionNotes, startPitchDetection, stopPitchDetection } from '../src/lib/audio'
import { vi } from 'vitest'
const guitarContext = {
  instrument: 'guitar' as const,
  tuning: {
    id: 'guitar-standard',
    name: 'Estándar',
    instrument: 'guitar' as const,
    notes: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'],
  },
  capo: 2,
  frets: 22,
  leftHanded: false,
}
it('reproduce posiciones guardadas con afinación y cejilla', () => {
  expect(
    progressionNotes(
      { id: 's', chord: 'C', beats: 4, voicing: [0, null, null, null, null, 0] },
      guitarContext,
    ),
  ).toEqual(['F#2', 'F#4'])
})
it('ordena voces ascendentes y respeta un bajo invertido', () => {
  expect(progressionNotes({ id: 's', chord: 'B', beats: 4 })).toEqual(['B3', 'Eb4', 'Gb4'])
  expect(progressionNotes({ id: 's', chord: 'C/E', beats: 4 })[0]).toBe('E2')
})
it('cancela una petición de micrófono pendiente y libera la pista al conceder permiso', async () => {
  let grant: ((stream: MediaStream) => void) | undefined
  const trackStop = vi.fn()
  const close = vi.fn(async () => {})
  const getUserMedia = vi.fn(
    () =>
      new Promise<MediaStream>((resolve) => {
        grant = resolve
      }),
  )
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
  vi.stubGlobal(
    'AudioContext',
    class {
      resume = async () => {}
      close = close
    },
  )
  try {
    const pending = startPitchDetection(() => {})
    await Promise.resolve()
    expect(getUserMedia).toHaveBeenCalledOnce()
    stopPitchDetection()
    grant!({ getTracks: () => [{ stop: trackStop }] } as unknown as MediaStream)
    const stop = await pending
    stop()
    expect(trackStop).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
  } finally {
    vi.unstubAllGlobals()
  }
})
it('distingue la barra de un acorde 6/9 de la inversión final', () => {
  const base = progressionNotes({ id: 's', chord: 'C6/9', beats: 4 })
  expect(base[0]).toBe('C3')
  expect(progressionNotes({ id: 's', chord: 'C6/9/E', beats: 4 })[0]).toBe('E2')
})
