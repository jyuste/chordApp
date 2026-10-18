import { noteLabel } from './music'
export const SCALE_LABELS: Record<string, string> = {
  major: 'Mayor',
  minor: 'Menor natural',
  dorian: 'Dórica',
  phrygian: 'Frigia',
  lydian: 'Lidia',
  mixolydian: 'Mixolidia',
  locrian: 'Locria',
  'major pentatonic': 'Pentatónica mayor',
  'minor pentatonic': 'Pentatónica menor',
  blues: 'Blues',
  'minor blues': 'Blues menor',
  'harmonic minor': 'Menor armónica',
  'melodic minor': 'Menor melódica',
  chromatic: 'Cromática',
}
export function scaleLabel(name: string, solfege = false): string {
  const [root, ...type] = name.split(' ')
  return `${noteLabel(root || '', solfege)} ${SCALE_LABELS[type.join(' ')] || type.join(' ')}`
}
