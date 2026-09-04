import { authFetch } from './auth.ts'

export type CustomPalette = {
  brand: string
  shell: string
  highlight: string
  accent: string
  ink?: string
  surface?: string
  rail?: string
  seam?: string
  due?: string
  danger?: string
  map?: string
}

export type DisplayPreferences = {
  density: 'comfortable' | 'balanced' | 'compact'
  radius: 'sharp' | 'soft' | 'round'
  fontSize: 'small' | 'medium' | 'large'
  reducedMotion: boolean
}

export type ThemeMode = 'light' | 'dark'

export type ThemePreset = {
  id: string
  name: string
  description: string
  mode: ThemeMode
  swatches: [string, string, string, string] // [brand, shell, highlight, accent]
  ink?: string
  surface?: string
  rail?: string
  seam?: string
  due?: string
  danger?: string
  map?: string
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'continuum',
    name: 'Attio Coral',
    description: 'Attio-inspired warm editorial planes, crisp black type, and a confident coral working signal.',
    mode: 'light',
    swatches: ['#e55a42', '#fcfaf6', '#f8d8d0', '#665f58'],
    ink: '#171513',
    surface: '#fefdfb',
    rail: '#171513',
    seam: '#e1d5ca',
    due: '#8a5b12',
    danger: '#a8373f',
    map: '#24757a'
  },
  {
    id: 'carbon',
    name: 'Raycast Aubergine',
    description: 'Raycast-inspired aubergine depth, coral actions, and softly luminous command surfaces.',
    mode: 'dark',
    swatches: ['#ff6363', '#160d19', '#3c1c36', '#f0a8c0'],
    ink: '#fff5fa',
    surface: '#241528',
    rail: '#0f0811',
    seam: '#47243e',
    due: '#f4b15e',
    danger: '#ff6b7d',
    map: '#8bc4ff'
  },
  {
    id: 'deep-focus',
    name: 'Superhuman Navy',
    description: 'Superhuman-inspired midnight navy, electric sky actions, and compressed high-velocity hierarchy.',
    mode: 'dark',
    swatches: ['#4ec5ff', '#06131c', '#12364a', '#86afc4'],
    ink: '#effbff',
    surface: '#0d2230',
    rail: '#030a0f',
    seam: '#204255',
    due: '#f0b55f',
    danger: '#ff7474',
    map: '#54d6c0'
  },
  {
    id: 'ember',
    name: 'Reader Sepia',
    description: 'Readwise Reader-inspired parchment, burnt-orange actions, and low-fatigue long-form contrast.',
    mode: 'light',
    swatches: ['#d65a1f', '#f2e6d3', '#f7d3b2', '#6c4a32'],
    ink: '#2b2118',
    surface: '#fff9f0',
    rail: '#2f241c',
    seam: '#d5c3ad',
    due: '#8c5c12',
    danger: '#a63d43',
    map: '#34737b'
  },
  {
    id: 'porcelain',
    name: 'Notion Paper',
    description: 'Notion-inspired paper white, near-black hierarchy, and deliberately neutral working planes.',
    mode: 'light',
    swatches: ['#2f3437', '#f7f7f5', '#ececea', '#6b6f72'],
    ink: '#1f2021',
    surface: '#ffffff',
    rail: '#ededea',
    seam: '#d9d9d6',
    due: '#8a641c',
    danger: '#a23d45',
    map: '#3c6e91'
  },
  {
    id: 'warm-paper',
    name: 'Craft Cream',
    description: 'Craft-inspired cream canvas, warm coral emphasis, and generous journal-like surfaces.',
    mode: 'light',
    swatches: ['#d4533d', '#faf6f0', '#f8ddd4', '#74483c'],
    ink: '#2d2421',
    surface: '#ffffff',
    rail: '#f0e7de',
    seam: '#e1d5ca',
    due: '#956116',
    danger: '#ad3b47',
    map: '#337977'
  },
  {
    id: 'mineral',
    name: 'Arc Lavender',
    description: 'Arc-inspired lavender chrome, saturated violet focus, and friendly spatial softness.',
    mode: 'light',
    swatches: ['#6b57e5', '#eeeaf8', '#d8ccf6', '#70546f'],
    ink: '#261e32',
    surface: '#fbf9ff',
    rail: '#2e2244',
    seam: '#cfc5df',
    due: '#8b611a',
    danger: '#a94258',
    map: '#24788a'
  },
  {
    id: 'ink-pearl',
    name: 'Are.na Index',
    description: 'Are.na-inspired gallery white, cobalt links, and blunt archival indexing with no ornament.',
    mode: 'light',
    swatches: ['#1a50d6', '#f1f1ec', '#dde5fa', '#252525'],
    ink: '#151515',
    surface: '#ffffff',
    rail: '#ffffff',
    seam: '#cfcfc9',
    due: '#856015',
    danger: '#a43d46',
    map: '#1b6a66'
  }
]

export function paletteFromThemePreset(preset: ThemePreset): CustomPalette {
  return {
    brand: preset.swatches[0],
    shell: preset.swatches[1],
    highlight: preset.swatches[2],
    accent: preset.swatches[3],
    ink: preset.ink,
    surface: preset.surface,
    rail: preset.rail,
    seam: preset.seam,
    due: preset.due,
    danger: preset.danger,
    map: preset.map,
  }
}

export const DEFAULT_CUSTOM_PALETTE: CustomPalette = {
  brand: '#e55a42',
  shell: '#fcfaf6',
  surface: '#fefdfb',
  highlight: '#f8d8d0',
  accent: '#665f58',
  ink: '#171513',
  rail: '#171513',
  seam: '#e1d5ca',
  due: '#8a5b12',
  danger: '#a8373f',
  map: '#24757a'
}

export type ThemePair = { day: CustomPalette; night: CustomPalette }

export const THEME_VARIANTS: Array<{ name: string; day: CustomPalette; night: CustomPalette }> = [
  { name: 'Studio Wave', day: { brand: '#E55A42', shell: '#FCFAF6', surface: '#FEFDFB', highlight: '#F8D8D0', accent: '#665F58', ink: '#171513', rail: '#171513', seam: '#E1D5CA', due: '#8A5B12', danger: '#A8373F', map: '#24757A' }, night: { brand: '#FF735E', shell: '#151311', surface: '#211E1A', highlight: '#3D2924', accent: '#D7CCC3', ink: '#FFF9F3', rail: '#0B0A09', seam: '#3B342E', due: '#E6AD55', danger: '#F0787E', map: '#63BEC0' } },
  { name: 'Reader', day: { brand: '#D65A1F', shell: '#F2E6D3', surface: '#FFF9F0', highlight: '#F7D3B2', accent: '#6C4A32', ink: '#2B2118', rail: '#2F241C', seam: '#D5C3AD', due: '#8C5C12', danger: '#A63D43', map: '#34737B' }, night: { brand: '#F29B62', shell: '#17110D', surface: '#251B15', highlight: '#3B281D', accent: '#D8BDA7', ink: '#FFF7EF', rail: '#0D0907', seam: '#463429', due: '#E5B35D', danger: '#EE7B7F', map: '#70C0C2' } },
  { name: 'Arc', day: { brand: '#6B57E5', shell: '#EEEAF8', surface: '#FBF9FF', highlight: '#D8CCF6', accent: '#70546F', ink: '#261E32', rail: '#2E2244', seam: '#CFC5DF', due: '#8B611A', danger: '#A94258', map: '#24788A' }, night: { brand: '#A993FF', shell: '#15101F', surface: '#221A30', highlight: '#35264D', accent: '#D5C5DC', ink: '#FAF6FF', rail: '#0C0812', seam: '#44345A', due: '#DFB15E', danger: '#F07E91', map: '#66C8D2' } },
]

export const DEFAULT_THEME_PAIR: ThemePair = { day: DEFAULT_CUSTOM_PALETTE, night: THEME_VARIANTS[0].night }

export function getSavedThemePair(): ThemePair {
  if (typeof localStorage === 'undefined') return DEFAULT_THEME_PAIR
  try {
    const value = JSON.parse(localStorage.getItem('taste-map-theme-pair') || '{}')
    return { day: { ...DEFAULT_CUSTOM_PALETTE, ...(value?.day || {}) }, night: { ...DEFAULT_THEME_PAIR.night, ...(value?.night || {}) } }
  } catch { return DEFAULT_THEME_PAIR }
}

export function saveThemePair(pair: ThemePair) {
  try { localStorage.setItem('taste-map-theme-pair', JSON.stringify(pair)) } catch {}
}

/** Resolve the palette for the currently selected day/night mode on every route. */
export function getActiveCustomPalette(): CustomPalette {
  const mode = typeof localStorage !== 'undefined' && localStorage.getItem('taste-map-theme-mode') === 'night' ? 'night' : 'day'
  return getSavedThemePair()[mode]
}

export type FontPreset = {
  id: string
  name: string
  description: string
  ui: string      // interface / body stack
  display: string // headings & display stack
  reading: string // long-form & display stack
  mono: string    // code & data stack
}

export const FONT_PRESETS: FontPreset[] = [
  {
    id: 'studio',
    name: 'Studio Sans',
    description: 'A smooth contemporary interface with first-class Arabic support.',
    ui: '"Manrope", "Noto Sans Arabic", system-ui, -apple-system, sans-serif',
    display: '"Manrope", "Noto Sans Arabic", system-ui, sans-serif',
    reading: '"Manrope", "Noto Sans Arabic", system-ui, sans-serif',
    mono: '"JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace'
  },
  {
    id: 'plex',
    name: 'Plex Studio',
    description: 'Crisp humanist sans with a warm serif for reading.',
    ui: '"IBM Plex Sans", "IBM Plex Sans Arabic", system-ui, sans-serif',
    display: '"IBM Plex Serif", "Literata", "Noto Naskh Arabic", Georgia, serif',
    reading: '"IBM Plex Serif", "Literata", "Noto Naskh Arabic", Georgia, serif',
    mono: '"IBM Plex Mono", ui-monospace, monospace'
  },
  {
    id: 'inter',
    name: 'Modern Inter',
    description: 'Clean geometric neutral sans with editorial reading and JetBrains Mono.',
    ui: '"Inter", "Noto Sans Arabic", system-ui, -apple-system, sans-serif',
    display: '"Inter", "Noto Sans Arabic", system-ui, sans-serif',
    reading: '"Literata", Georgia, "Times New Roman", serif',
    mono: '"JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace'
  },
  {
    id: 'editorial',
    name: 'Editorial Literary',
    description: 'Bookish serif throughout for a literary studio.',
    ui: '"Literata", "Noto Naskh Arabic", Georgia, "Times New Roman", serif',
    display: '"Literata", "Noto Naskh Arabic", Georgia, serif',
    reading: '"Literata", "Noto Naskh Arabic", Georgia, serif',
    mono: '"IBM Plex Mono", ui-monospace, monospace'
  },
  {
    id: 'newsreader',
    name: 'Newsreader Academic',
    description: 'Scholarly serif display and reading with crisp humanist interface.',
    ui: '"IBM Plex Sans", "IBM Plex Sans Arabic", system-ui, sans-serif',
    display: '"Newsreader", "Literata", "Noto Naskh Arabic", Georgia, serif',
    reading: '"Newsreader", "Literata", "Noto Naskh Arabic", Georgia, serif',
    mono: '"JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace'
  },
  {
    id: 'jakarta',
    name: 'Plus Jakarta Crisp',
    description: 'Contemporary high-clarity sans with Fraunces accents and Fira Code.',
    ui: '"Plus Jakarta Sans", "Noto Sans Arabic", system-ui, sans-serif',
    display: '"Plus Jakarta Sans", "Noto Sans Arabic", system-ui, sans-serif',
    reading: '"Literata", Georgia, serif',
    mono: '"Fira Code", "IBM Plex Mono", ui-monospace, monospace'
  },
  {
    id: 'system',
    name: 'System Clean',
    description: 'Native platform fonts for a neutral, fast feel.',
    ui: 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Arabic", sans-serif',
    display: '-apple-system, "Segoe UI", Roboto, Georgia, serif',
    reading: 'Georgia, "Times New Roman", serif',
    mono: 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, monospace'
  },
  {
    id: 'terminal',
    name: 'Terminal Mono',
    description: 'Monospace interface for a focused, code-like feel.',
    ui: '"IBM Plex Mono", ui-monospace, "SF Mono", monospace',
    display: '"IBM Plex Serif", "Literata", Georgia, serif',
    reading: '"IBM Plex Serif", "Literata", Georgia, serif',
    mono: '"IBM Plex Mono", ui-monospace, monospace'
  }
]

export const DEFAULT_FONT_ID = 'studio'

export type CustomFont = {
  ui: string
  display: string
  reading: string
  mono: string
}

export const DEFAULT_CUSTOM_FONT: CustomFont = {
  ui: '"IBM Plex Sans", "Noto Sans Arabic", "IBM Plex Sans Arabic", system-ui, sans-serif',
  display: '"IBM Plex Serif", "Literata", "Noto Naskh Arabic", Georgia, serif',
  reading: '"IBM Plex Serif", "Literata", "Noto Naskh Arabic", Georgia, serif',
  mono: '"IBM Plex Mono", ui-monospace, monospace'
}

/** Merge imported or previously saved stacks with safe, renderable defaults. */
export function normalizeCustomFont(input?: Partial<CustomFont> | null): CustomFont {
  return {
    ui: typeof input?.ui === 'string' && input.ui.trim() ? input.ui.trim() : DEFAULT_CUSTOM_FONT.ui,
    display: typeof input?.display === 'string' && input.display.trim() ? input.display.trim() : DEFAULT_CUSTOM_FONT.display,
    reading: typeof input?.reading === 'string' && input.reading.trim() ? input.reading.trim() : DEFAULT_CUSTOM_FONT.reading,
    mono: typeof input?.mono === 'string' && input.mono.trim() ? input.mono.trim() : DEFAULT_CUSTOM_FONT.mono,
  }
}

export type TypographyPreferences = {
  baseSize: number
  bodyWeight: number
  headingWeight: number
  lineHeight: number
  letterSpacing: number
  displayScale: number
  readingMeasure: number
}

export const DEFAULT_TYPOGRAPHY: TypographyPreferences = {
  baseSize: 16,
  bodyWeight: 400,
  headingWeight: 600,
  lineHeight: 1.55,
  letterSpacing: 0,
  displayScale: 1,
  readingMeasure: 68,
}

export type VisualPreset = {
  id: string
  name: string
  description: string
  inspiration: string
  theme: string
  font: string
  typography: TypographyPreferences
  display: Pick<DisplayPreferences, 'density' | 'radius' | 'fontSize'>
}

/**
 * Complete art directions rather than palette shortcuts. Each preset binds
 * color, semantic font roles, reading rhythm, information density, and shape.
 */
export const VISUAL_PRESETS: VisualPreset[] = [
  {
    id: 'continuum',
    name: 'Continuum',
    description: 'Warm editorial canvas, decisive coral actions, and generous new-wave product rhythm.',
    inspiration: 'Inspired by Attio',
    theme: 'continuum',
    font: 'studio',
    typography: { ...DEFAULT_TYPOGRAPHY, baseSize: 17, bodyWeight: 400, headingWeight: 650, lineHeight: 1.62, letterSpacing: -0.008, displayScale: 1.05, readingMeasure: 70 },
    display: { density: 'comfortable', radius: 'round', fontSize: 'medium' },
  },
  {
    id: 'raycast-command',
    name: 'Raycast Command',
    description: 'Aubergine chrome, coral commands, and rounded launcher-like surfaces.',
    inspiration: 'Inspired by Raycast',
    theme: 'carbon',
    font: 'jakarta',
    typography: { ...DEFAULT_TYPOGRAPHY, baseSize: 16, bodyWeight: 400, headingWeight: 700, lineHeight: 1.6, displayScale: 1.03, readingMeasure: 66 },
    display: { density: 'comfortable', radius: 'round', fontSize: 'medium' },
  },
  {
    id: 'superhuman-focus',
    name: 'Superhuman Focus',
    description: 'Midnight navy, electric sky signals, and compressed rows built for rapid scanning.',
    inspiration: 'Inspired by Superhuman',
    theme: 'deep-focus',
    font: 'inter',
    typography: { ...DEFAULT_TYPOGRAPHY, baseSize: 15, bodyWeight: 400, headingWeight: 600, lineHeight: 1.48, letterSpacing: -0.01, readingMeasure: 62 },
    display: { density: 'compact', radius: 'sharp', fontSize: 'small' },
  },
  {
    id: 'reader-study',
    name: 'Reader Study',
    description: 'Parchment planes, burnt-orange actions, and a literary rhythm for deep reading.',
    inspiration: 'Inspired by Readwise Reader',
    theme: 'ember',
    font: 'editorial',
    typography: { ...DEFAULT_TYPOGRAPHY, baseSize: 18, bodyWeight: 400, headingWeight: 600, lineHeight: 1.78, displayScale: 1.12, readingMeasure: 61 },
    display: { density: 'comfortable', radius: 'soft', fontSize: 'large' },
  },
  {
    id: 'notion-minimal',
    name: 'Notion Minimal',
    description: 'Paper white, near-black type, and neutral blocks that keep content dominant.',
    inspiration: 'Inspired by Notion',
    theme: 'porcelain',
    font: 'system',
    typography: { ...DEFAULT_TYPOGRAPHY, baseSize: 16, bodyWeight: 400, headingWeight: 600, lineHeight: 1.56, readingMeasure: 68 },
    display: { density: 'balanced', radius: 'sharp', fontSize: 'medium' },
  },
  {
    id: 'craft-journal',
    name: 'Craft Journal',
    description: 'Cream canvas, coral emphasis, and generous editorial surfaces for reflective work.',
    inspiration: 'Inspired by Craft',
    theme: 'warm-paper',
    font: 'newsreader',
    typography: { ...DEFAULT_TYPOGRAPHY, baseSize: 17, bodyWeight: 400, headingWeight: 600, lineHeight: 1.7, displayScale: 1.1, readingMeasure: 64 },
    display: { density: 'comfortable', radius: 'round', fontSize: 'large' },
  },
  {
    id: 'arc-space',
    name: 'Arc Space',
    description: 'Lavender chrome, saturated violet focus, and soft spatial grouping.',
    inspiration: 'Inspired by Arc',
    theme: 'mineral',
    font: 'plex',
    typography: { ...DEFAULT_TYPOGRAPHY, baseSize: 16, bodyWeight: 400, headingWeight: 600, lineHeight: 1.62, displayScale: 1.04, readingMeasure: 72 },
    display: { density: 'balanced', radius: 'round', fontSize: 'medium' },
  },
  {
    id: 'arena-index',
    name: 'Are.na Index',
    description: 'Gallery white, cobalt links, and terse mono indexing with almost no decoration.',
    inspiration: 'Inspired by Are.na',
    theme: 'ink-pearl',
    font: 'terminal',
    typography: { ...DEFAULT_TYPOGRAPHY, baseSize: 15, bodyWeight: 400, headingWeight: 600, lineHeight: 1.45, letterSpacing: -0.01, readingMeasure: 60 },
    display: { density: 'compact', radius: 'sharp', fontSize: 'small' },
  },
]

export const TYPOGRAPHY_LIMITS: Record<keyof TypographyPreferences, { min: number; max: number }> = {
  baseSize: { min: 12, max: 24 },
  bodyWeight: { min: 300, max: 800 },
  headingWeight: { min: 400, max: 900 },
  lineHeight: { min: 1.15, max: 2.3 },
  letterSpacing: { min: -0.04, max: 0.1 },
  displayScale: { min: 0.8, max: 1.5 },
  readingMeasure: { min: 45, max: 90 },
}

type RGB = { r: number; g: number; b: number }

export function parseColor(input: string): RGB | null {
  if (!input) return null
  const str = input.trim()

  // Match hex: #RGB, #RGBA, #RRGGBB, #RRGGBBAA
  const hexMatch = str.match(/^#?([0-9a-fA-F]{3,8})$/)
  if (hexMatch) {
    let hex = hexMatch[1]
    if (hex.length === 3 || hex.length === 4) {
      hex = hex.split('').map(c => c + c).join('')
    }
    if (hex.length >= 6) {
      const r = parseInt(hex.slice(0, 2), 16)
      const g = parseInt(hex.slice(2, 4), 16)
      const b = parseInt(hex.slice(4, 6), 16)
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return { r, g, b }
    }
  }

  // Match rgb / rgba: rgb(29, 69, 51) or rgba(29, 69, 51, 0.8)
  const rgbMatch = str.match(/^rgba?\(\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9]+)/i)
  if (rgbMatch) {
    const r = Math.min(255, Math.max(0, parseInt(rgbMatch[1], 10)))
    const g = Math.min(255, Math.max(0, parseInt(rgbMatch[2], 10)))
    const b = Math.min(255, Math.max(0, parseInt(rgbMatch[3], 10)))
    return { r, g, b }
  }

  return null
}

export function rgbToHex({ r, g, b }: RGB): string {
  const toHex = (n: number) => Math.min(255, Math.max(0, Math.round(n))).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

export function normalizeColor(input: string, fallback = '#000000'): string {
  const parsed = parseColor(input)
  return parsed ? rgbToHex(parsed) : fallback
}

export function contrastRatio(foreground: string, background: string): number | null {
  const fg = parseColor(foreground)
  const bg = parseColor(background)
  if (!fg || !bg) return null
  const lighter = Math.max(relativeLuminance(fg), relativeLuminance(bg))
  const darker = Math.min(relativeLuminance(fg), relativeLuminance(bg))
  return (lighter + 0.05) / (darker + 0.05)
}

export function mixColors(c1: RGB, c2: RGB, weight: number): RGB {
  const w = Math.min(1, Math.max(0, weight))
  return {
    r: Math.round(c1.r * (1 - w) + c2.r * w),
    g: Math.round(c1.g * (1 - w) + c2.g * w),
    b: Math.round(c1.b * (1 - w) + c2.b * w),
  }
}

export function adjustBrightness(color: RGB, percent: number): RGB {
  const p = percent / 100
  if (p > 0) {
    return mixColors(color, { r: 255, g: 255, b: 255 }, p)
  } else {
    return mixColors(color, { r: 0, g: 0, b: 0 }, Math.abs(p))
  }
}

function relativeLuminance(c: RGB): number {
  const f = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b)
}

function isDarkColor(c: RGB): boolean {
  return relativeLuminance(c) < 0.35
}

function contrastBetween(foreground: RGB, background: RGB): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background))
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background))
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Preserve the authored text color when it is already readable, otherwise
 * move it only as far as necessary toward the light or dark accessible ink.
 * Both canvas and surface are checked because the same semantic text tokens
 * are used on each plane.
 */
function ensureTextContrast(color: RGB, backgrounds: RGB[], minimum = 4.5): RGB {
  const minimumContrast = (candidate: RGB) => Math.min(...backgrounds.map(background => contrastBetween(candidate, background)))
  if (minimumContrast(color) >= minimum) return color

  const anchor = minimumContrast(WHITE) >= minimumContrast(CONTRAST_BLACK) ? WHITE : CONTRAST_BLACK
  for (let step = 1; step <= 100; step += 1) {
    const candidate = mixColors(color, anchor, step / 100)
    if (minimumContrast(candidate) >= minimum) return candidate
  }

  // Pathological palettes can place surface and canvas at opposite extremes,
  // where no shared text color can satisfy AA. Return the safest available ink.
  return anchor
}

/**
 * Extracts any recognized color codes (Hex or RGB) from arbitrary text input.
 */
export function extractColorsFromText(text: string): string[] {
  if (!text) return []
  const found: string[] = []

  // Find all hex codes
  const hexes = text.match(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g) || []
  for (const h of hexes) found.push(normalizeColor(h))

  // Find all rgb codes
  const rgbs = text.match(/rgb\(\s*[0-9]+\s*,\s*[0-9]+\s*,\s*[0-9]+\s*\)/gi) || []
  for (const r of rgbs) found.push(normalizeColor(r))

  return found
}

const WHITE: RGB = { r: 255, g: 255, b: 255 }
const BLACK: RGB = { r: 16, g: 14, b: 13 }
const CONTRAST_BLACK: RGB = { r: 0, g: 0, b: 0 }

// Semantic functional colors (overdue / danger / map) stay recognizable in both modes.
const SEMANTIC = {
  dueLight: { r: 135, g: 70, b: 6 },     // #874606
  dangerLight: { r: 156, g: 46, b: 33 }, // #9c2e21
  mapLight: { r: 40, g: 84, b: 111 },    // #28546f
  dueDark: { r: 224, g: 138, b: 30 },    // #e08a1e
  dangerDark: { r: 229, g: 72, b: 77 },  // #e5484d
  mapDark: { r: 77, g: 163, b: 216 }     // #4da3d8
}

/**
 * Derives the complete, harmonious set of site CSS variables from a base
 * palette. Every color used across the studio (surfaces, text, borders,
 * badges, status colors) is derived here, so changing the base shades shifts
 * the entire site — light or dark.
 */
export function computeThemeVariables(palette: CustomPalette, modeOverride?: ThemeMode): Record<string, string> {
  const brand = parseColor(palette.brand) || { r: 29, g: 69, b: 51 }
  const shell = parseColor(palette.shell) || { r: 247, g: 234, b: 224 }
  const highlight = parseColor(palette.highlight) || { r: 249, g: 210, b: 186 }
  const accent = parseColor(palette.accent) || { r: 94, g: 49, b: 34 }
  const dark = modeOverride ? modeOverride === 'dark' : isDarkColor(shell)
  const authoredSurface = parseColor(palette.surface || '')
  const surface = authoredSurface || mixColors(shell, WHITE, dark ? 0.08 : 0.96)

  // Structural surfaces — elevated planes are always lighter than the shell,
  // but dark shells use much smaller elevation steps.
  const ledger = dark ? mixColors(shell, surface, 0.25) : mixColors(shell, WHITE, 0.40)
  const canvas = dark ? mixColors(shell, surface, 0.60) : mixColors(shell, WHITE, 0.75)
  const inspector = dark ? mixColors(shell, surface, 0.78) : mixColors(shell, WHITE, 0.25)
  // Seams/borders sit opposite the elevation: darker than shell in light, lighter in dark.
  const seam = parseColor(palette.seam || '') || (dark ? mixColors(shell, WHITE, 0.16) : mixColors(shell, BLACK, 0.12))

  // Text — preserve authored intent where possible, then derive readable CSS tokens.
  const parsedInk = palette.ink ? parseColor(palette.ink) : null
  const inkCandidate = parsedInk || (dark ? mixColors(shell, WHITE, 0.86) : mixColors(accent, BLACK, 0.62))
  const textPlanes = [shell, canvas, surface]
  const ink = ensureTextContrast(inkCandidate, textPlanes)
  const secondaryCandidate = dark ? mixColors(ink, shell, 0.40) : mixColors(ink, accent, 0.35)
  const mutedCandidate = mixColors(secondaryCandidate, shell, dark ? 0.42 : 0.35)
  const secondary = ensureTextContrast(secondaryCandidate, textPlanes)
  const muted = ensureTextContrast(mutedCandidate, textPlanes)

  // Rail is the deepest plane, anchored to the brand in light mode, or tinted obsidian in dark mode.
  const rail = parseColor(palette.rail || '') || (dark ? mixColors(mixColors(shell, brand, 0.12), BLACK, 0.40) : adjustBrightness(brand, -15))

  // Status colors brighten on dark backgrounds so they remain legible.
  const due = parseColor(palette.due || '') || (dark ? SEMANTIC.dueDark : SEMANTIC.dueLight)
  const danger = parseColor(palette.danger || '') || (dark ? SEMANTIC.dangerDark : SEMANTIC.dangerLight)
  const map = parseColor(palette.map || '') || (dark ? SEMANTIC.mapDark : SEMANTIC.mapLight)

  // Determine active rail button background and text contrast
  const textOn = (background: RGB) => contrastRatio('#ffffff', rgbToHex(background))! >= contrastRatio('#000000', rgbToHex(background))! ? '#ffffff' : '#000000'
  const railActiveInk = textOn(brand)
  const actionInk = textOn(brand)
  const mapInk = textOn(map)
  const dangerInk = textOn(danger)
  const dueInk = textOn(due)
  const railInk = textOn(rail)
  const railInkHover = textOn(rail)
  const railBorder = dark ? rgbToHex(seam) : 'rgba(255, 255, 255, 0.08)'
  const controlSurface = mixColors(canvas, surface, 0.5)

  return {
    '--studio-rail': rgbToHex(rail),
    '--studio-rail-ink': railInk,
    '--studio-rail-ink-hover': railInkHover,
    '--studio-rail-border': railBorder,
    '--studio-rail-active-bg': rgbToHex(brand),
    '--studio-rail-active-ink': railActiveInk,
    '--studio-action-ink': actionInk,
    '--studio-map-ink': mapInk,
    '--studio-danger-ink': dangerInk,
    '--studio-due-ink': dueInk,
    '--studio-shell': rgbToHex(shell),
    '--studio-ledger': rgbToHex(ledger),
    '--studio-surface': rgbToHex(surface),
    '--studio-card': rgbToHex(surface),
    '--studio-canvas': rgbToHex(canvas),
    '--studio-control-surface': rgbToHex(controlSurface),
    '--studio-surface-hover': rgbToHex(mixColors(surface, brand, 0.06)),
    '--studio-active-surface': rgbToHex(mixColors(surface, brand, 0.12)),
    '--studio-inspector': rgbToHex(inspector),
    '--studio-ink': rgbToHex(ink),
    '--studio-secondary': rgbToHex(secondary),
    '--studio-muted': rgbToHex(muted),
    '--studio-seam': rgbToHex(seam),
    '--studio-cypress': rgbToHex(brand),
    '--studio-lichen': rgbToHex(highlight),
    '--studio-focus': rgbToHex(brand),
    '--studio-due': rgbToHex(due),
    '--studio-danger': rgbToHex(danger),
    '--studio-map': rgbToHex(map),
    '--studio-sage': rgbToHex(brand),
    '--studio-ochre': rgbToHex(due),
    '--studio-focus-ring': `0 0 0 3px ${rgbToHex(canvas)}, 0 0 0 5px ${rgbToHex(brand)}`
  }
}

export type ThemeContrastCheck = {
  id: string
  label: string
  foreground: string
  background: string
  ratio: number | null
  minimum: number
  passes: boolean
}

const THEME_CONTRAST_PAIRS = [
  ['ink-shell', 'Ink / shell', '--studio-ink', '--studio-shell'],
  ['ink-surface', 'Ink / surface', '--studio-ink', '--studio-surface'],
  ['secondary-shell', 'Quiet text / shell', '--studio-secondary', '--studio-shell'],
  ['secondary-surface', 'Quiet text / surface', '--studio-secondary', '--studio-surface'],
  ['rail', 'Rail text / rail', '--studio-rail-ink', '--studio-rail'],
  ['rail-active', 'Active rail / brand', '--studio-rail-active-ink', '--studio-rail-active-bg'],
  ['action', 'Action text / brand', '--studio-action-ink', '--studio-cypress'],
  ['map', 'Map text / map', '--studio-map-ink', '--studio-map'],
  ['due', 'Due text / due', '--studio-due-ink', '--studio-due'],
  ['danger', 'Danger text / danger', '--studio-danger-ink', '--studio-danger'],
] as const

/** Audit the actual foreground/background tokens emitted for a theme. */
export function auditThemeContrast(palette: CustomPalette, modeOverride?: ThemeMode): ThemeContrastCheck[] {
  const variables = computeThemeVariables(palette, modeOverride)
  return THEME_CONTRAST_PAIRS.map(([id, label, foregroundToken, backgroundToken]) => {
    const foreground = variables[foregroundToken]
    const background = variables[backgroundToken]
    const ratio = contrastRatio(foreground, background)
    const minimum = 4.5
    return { id, label, foreground, background, ratio, minimum, passes: ratio !== null && ratio >= minimum }
  })
}

function paletteForTheme(themeId: string, customPalette?: CustomPalette): { palette: CustomPalette; mode: ThemeMode } {
  if (themeId === 'custom') {
    const source = customPalette || getSavedCustomPalette()
    const palette: CustomPalette = {
      ...DEFAULT_CUSTOM_PALETTE,
      ...source,
      ink: source.ink && source.ink !== source.accent ? source.ink : source.brand,
      map: source.map || DEFAULT_CUSTOM_PALETTE.map,
    }
    const shell = parseColor(palette.shell) || { r: 247, g: 234, b: 224 }
    return { palette, mode: isDarkColor(shell) ? 'dark' : 'light' }
  }
  const preset = THEME_PRESETS.find(p => p.id === themeId) || THEME_PRESETS[0]
  return {
    palette: paletteFromThemePreset(preset),
    mode: preset.mode
  }
}

export function applyDisplayPreferences(preferences: Partial<DisplayPreferences>) {
  if (typeof document === 'undefined') return
  const fallback = getSavedDisplayPreferences()
  const next: DisplayPreferences = {
    density: preferences.density === 'comfortable' || preferences.density === 'compact' || preferences.density === 'balanced' ? preferences.density : fallback.density,
    radius: preferences.radius === 'sharp' || preferences.radius === 'round' || preferences.radius === 'soft' ? preferences.radius : fallback.radius,
    fontSize: preferences.fontSize === 'small' || preferences.fontSize === 'large' || preferences.fontSize === 'medium' ? preferences.fontSize : fallback.fontSize,
    reducedMotion: typeof preferences.reducedMotion === 'boolean' ? preferences.reducedMotion : fallback.reducedMotion,
  }
  const root = document.documentElement
  root.dataset.density = next.density
  root.dataset.radius = next.radius
  root.dataset.fontSize = next.fontSize
  root.dataset.reducedMotion = next.reducedMotion ? 'true' : 'false'
  try { localStorage.setItem('taste-map-display-preferences', JSON.stringify(next)) } catch {}
  window.dispatchEvent(new CustomEvent('displaypreferenceschange', { detail: next }))
}

export function getSavedDisplayPreferences(): DisplayPreferences {
  const fallback: DisplayPreferences = { density: 'balanced', radius: 'soft', fontSize: 'medium', reducedMotion: false }
  if (typeof localStorage === 'undefined') return fallback
  try {
    const raw = localStorage.getItem('taste-map-display-preferences')
    if (!raw) return fallback
    const value = JSON.parse(raw)
    return {
      density: value?.density === 'comfortable' || value?.density === 'compact' || value?.density === 'balanced' ? value.density : fallback.density,
      radius: value?.radius === 'sharp' || value?.radius === 'round' || value?.radius === 'soft' ? value.radius : fallback.radius,
      fontSize: value?.fontSize === 'small' || value?.fontSize === 'large' || value?.fontSize === 'medium' ? value.fontSize : fallback.fontSize,
      reducedMotion: typeof value?.reducedMotion === 'boolean' ? value.reducedMotion : fallback.reducedMotion,
    }
  } catch { return fallback }
}

export function applyTheme(themeId: string, customPalette?: CustomPalette) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const resolvedThemeId = themeId === 'botanical' ? 'continuum' : themeId

  const { palette, mode } = paletteForTheme(resolvedThemeId, customPalette)
  const vars = computeThemeVariables(palette, mode)

  const preset = THEME_PRESETS.find(p => p.id === resolvedThemeId)
  root.dataset.theme = resolvedThemeId === 'custom' ? 'custom' : (preset ? preset.id : THEME_PRESETS[0].id)

  // Always write the full set inline so switching themes never leaves stale values.
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value)
  }
  root.style.colorScheme = mode
  root.dataset.colorMode = mode
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', vars['--studio-shell'])

  try {
    localStorage.setItem('taste-map-theme', root.dataset.theme)
    if (customPalette) {
      localStorage.setItem('taste-map-custom-palette', JSON.stringify(customPalette))
    }
  } catch {}

  window.dispatchEvent(new Event('themechange'))
}

export function getSavedCustomPalette(): CustomPalette {
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem('taste-map-custom-palette')
      if (raw) {
        const value = JSON.parse(raw)
        return {
          ...DEFAULT_CUSTOM_PALETTE,
          ...(value || {}),
          // Ink follows the brand family unless the user explicitly chose a different ink.
          ink: value?.ink && value.ink !== value?.accent ? value.ink : (value?.brand || DEFAULT_CUSTOM_PALETTE.ink),
          map: value?.map || DEFAULT_CUSTOM_PALETTE.map,
        }
      }
    } catch {}
  }
  return DEFAULT_CUSTOM_PALETTE
}

export function getSavedTheme(): string {
  if (typeof localStorage !== 'undefined') {
    try {
      const saved = localStorage.getItem('taste-map-theme')
      if (saved === 'botanical') return 'continuum'
      if (saved && (THEME_PRESETS.some(p => p.id === saved) || saved === 'custom')) {
        return saved
      }
    } catch {}
  }
  return 'continuum'
}

export function getSavedFontId(): string {
  if (typeof localStorage !== 'undefined') {
    try {
      const saved = localStorage.getItem('taste-map-font')
      if (saved && (FONT_PRESETS.some(f => f.id === saved) || saved === 'custom')) return saved
    } catch {}
  }
  return DEFAULT_FONT_ID
}

export function getSavedCustomFont(): CustomFont {
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem('taste-map-custom-font')
      if (raw) return normalizeCustomFont(JSON.parse(raw))
    } catch {}
  }
  return normalizeCustomFont()
}

// Generic keywords and system-only faces that are NOT available on Google Fonts.
const SYSTEM_FONTS = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui',
  'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'math', 'emoji',
  '-apple-system', 'blinkmacsystemfont', 'segoe ui', 'sf mono', 'cascadia mono',
  'menlo', 'consolas', 'monaco', 'arial', 'helvetica', 'helvetica neue',
  'georgia', 'times new roman', 'courier new', 'verdana', 'tahoma',
  'trebuchet ms', 'impact', 'comic sans ms', 'palatino linotype',
  'book antiqua', 'garamond', 'dejavu sans', 'dejavu serif', 'berkeley mono',
  'dejavu sans mono', 'liberation sans', 'liberation serif',
  'liberation mono', 'cantarell', 'gill sans', 'futura', 'avenir',
  'optima', 'baskerville', 'century gothic', 'lucida grande', 'lucida console'
])

const LOADED_FONT_FAMILIES = new Set<string>()

function extractFamilies(stack: string): string[] {
  const families: string[] = []
  for (const part of stack.split(',')) {
    const name = part.trim().replace(/^['"]+|['"]+$/g, '').trim()
    if (!name || SYSTEM_FONTS.has(name.toLowerCase())) continue
    families.push(name)
  }
  return families
}

function loadGoogleFonts(families: string[]) {
  const pending: string[] = []
  for (const family of families) {
    const key = family.toLowerCase()
    if (LOADED_FONT_FAMILIES.has(key)) continue
    LOADED_FONT_FAMILIES.add(key)
    pending.push(family)
  }
  if (!pending.length) return
  const query = pending
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;500;600;700`)
    .join('&')
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?${query}&display=swap`
  document.head.appendChild(link)
}

export function applyFont(fontId: string, customFont?: CustomFont) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  let ui: string
  let reading: string
  let mono: string
  let display: string
  if (fontId === 'custom') {
    const cf = normalizeCustomFont(customFont || getSavedCustomFont())
    ui = cf.ui
    display = cf.display || cf.reading
    reading = cf.reading
    mono = cf.mono
  } else {
    const preset = FONT_PRESETS.find(f => f.id === fontId) || FONT_PRESETS[0]
    ui = preset.ui
    display = preset.display || preset.reading
    reading = preset.reading
    mono = preset.mono
  }
  root.style.setProperty('--font-ui', ui)
  root.style.setProperty('--font-body', ui)
  root.style.setProperty('--font-display', display)
  root.style.setProperty('--font-editorial', display)
  root.style.setProperty('--font-reading', reading)
  root.style.setProperty('--font-mono', mono)
  loadGoogleFonts([...extractFamilies(ui), ...extractFamilies(display), ...extractFamilies(reading), ...extractFamilies(mono)])
  try {
    localStorage.setItem('taste-map-font', fontId)
    if (fontId === 'custom') localStorage.setItem('taste-map-custom-font', JSON.stringify(normalizeCustomFont(customFont)))
  } catch {}
  window.dispatchEvent(new Event('fontchange'))
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback
}

export function normalizeTypography(
  preferences: Partial<TypographyPreferences>,
  fallback: TypographyPreferences = DEFAULT_TYPOGRAPHY,
): TypographyPreferences {
  return Object.fromEntries(
    (Object.keys(DEFAULT_TYPOGRAPHY) as Array<keyof TypographyPreferences>).map((key) => {
      const { min, max } = TYPOGRAPHY_LIMITS[key]
      return [key, clampNumber(preferences[key], min, max, fallback[key])]
    }),
  ) as TypographyPreferences
}

export function applyTypography(preferences: Partial<TypographyPreferences>) {
  if (typeof document === 'undefined') return
  const next = normalizeTypography(preferences, getSavedTypography())
  const root = document.documentElement
  root.style.setProperty('--font-base-size', `${next.baseSize}px`)
  root.style.setProperty('--font-scale', `calc(${next.baseSize / DEFAULT_TYPOGRAPHY.baseSize} * var(--font-preference-scale, 1) * var(--font-viewport-scale, 1))`)
  root.style.setProperty('--font-body-weight', String(next.bodyWeight))
  root.style.setProperty('--font-heading-weight', String(next.headingWeight))
  root.style.setProperty('--font-medium-weight', String(Math.round((next.bodyWeight + next.headingWeight) / 2 / 10) * 10))
  root.style.setProperty('--font-bold-weight', String(Math.min(900, next.headingWeight + 100)))
  root.style.setProperty('--font-line-height', String(next.lineHeight))
  root.style.setProperty('--font-letter-spacing', `${next.letterSpacing}em`)
  root.style.setProperty('--font-display-scale', String(next.displayScale))
  root.style.setProperty('--font-reading-measure', `${next.readingMeasure}ch`)
  try { localStorage.setItem('taste-map-typography', JSON.stringify(next)) } catch {}
  window.dispatchEvent(new Event('typographychange'))
}

export function getSavedTypography(): TypographyPreferences {
  if (typeof localStorage === 'undefined') return DEFAULT_TYPOGRAPHY
  try {
    const value = JSON.parse(localStorage.getItem('taste-map-typography') || '{}')
    return normalizeTypography(value)
  } catch { return DEFAULT_TYPOGRAPHY }
}

export function initTheme() {
  if (typeof document === 'undefined') return
  const theme = getSavedTheme()
  const customPalette = theme === 'custom' ? getActiveCustomPalette() : undefined
  applyTheme(theme, customPalette)
  applyFont(getSavedFontId())
  applyTypography(getSavedTypography())
  applyDisplayPreferences(getSavedDisplayPreferences())
}

/** Rehydrate the server-owned visual system before a non-Settings route renders. */
export async function hydrateThemeFromServer() {
  if (typeof document === 'undefined' || typeof fetch === 'undefined') return
  try {
    const response = await authFetch('/settings')
    if (!response.ok) return
    const payload = await response.json() as { resolved?: { appearance?: Record<string, unknown> } }
    const appearance = payload.resolved?.appearance
    if (!appearance) return
    const theme = typeof appearance.theme === 'string' ? appearance.theme : getSavedTheme()
    const storedPair = typeof localStorage !== 'undefined' ? localStorage.getItem('taste-map-theme-pair') : null
    const serverPalette = appearance.custom_palette && typeof appearance.custom_palette === 'object' ? appearance.custom_palette as CustomPalette : undefined
    // The Worker is canonical when it has a saved palette. The locally stored
    // day/night pair remains the offline fallback, never a reason to overwrite
    // a newer visual system from another device.
    const palette = theme === 'custom' ? (serverPalette || (storedPair ? getActiveCustomPalette() : undefined)) : undefined
    applyTheme(theme, palette)
    if (typeof appearance.font === 'string') {
      applyFont(appearance.font, appearance.custom_font && typeof appearance.custom_font === 'object' ? normalizeCustomFont(appearance.custom_font as Partial<CustomFont>) : undefined)
    }
    if (appearance.typography && typeof appearance.typography === 'object') applyTypography(appearance.typography as Partial<TypographyPreferences>)
    applyDisplayPreferences({
      density: appearance.density as DisplayPreferences['density'],
      radius: appearance.radius as DisplayPreferences['radius'],
      fontSize: appearance.font_size as DisplayPreferences['fontSize'],
      reducedMotion: appearance.reduced_motion as boolean,
    })
  } catch {
    // Local startup values remain the deterministic offline fallback.
  }
}
