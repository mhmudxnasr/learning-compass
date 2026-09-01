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
}

export const THEME_PRESETS: ThemePreset[] = [
  // --- Light & Editorial Palettes ---
  {
    id: 'botanical',
    name: 'Botanical Folio',
    description: 'Deep forest cypress, crisp paper linen, and tender lichen accents.',
    mode: 'light',
    swatches: ['#1b4332', '#f1e9d9', '#d8f3dc', '#2d3b32'],
    ink: '#17231c',
  },
  {
    id: 'terracotta',
    name: 'Warm Terracotta',
    description: 'Artisan terracotta, sun-baked clay, warm peach, and roasted umber.',
    mode: 'light',
    swatches: ['#b84a28', '#faf4ed', '#f9dfd5', '#4d281e'],
    ink: '#291814',
  },
  {
    id: 'indigo',
    name: 'Kyoto Indigo',
    description: 'Traditional Japanese aizome indigo, clean washi paper, and porcelain sky.',
    mode: 'light',
    swatches: ['#1e3a8a', '#f4f6fa', '#dbeafe', '#1e293b'],
    ink: '#0f172a',
  },
  {
    id: 'sepia',
    name: 'Editorial Sepia',
    description: 'Walnut gall ink, warm antiquarian parchment, and golden amber flax.',
    mode: 'light',
    swatches: ['#78350f', '#fcf8f0', '#fde68a', '#3e2415'],
    ink: '#27160d',
  },
  {
    id: 'slate',
    name: 'Nordic Mist',
    description: 'Glacial sea-glass teal, frosted Nordic mist, and deep spruce pine.',
    mode: 'light',
    swatches: ['#0f766e', '#f0fdfa', '#ccfbf1', '#134e4a'],
    ink: '#042f2e',
  },
  {
    id: 'bordeaux',
    name: 'Bordeaux Velvet',
    description: 'Vintage wine crimson, soft rose silk, and antique gilded burgundy.',
    mode: 'light',
    swatches: ['#881337', '#fdf2f4', '#fbcfe8', '#4c0519'],
    ink: '#300510',
  },
  {
    id: 'alpine',
    name: 'Alpine Meadow',
    description: 'Fresh clover green, mountain breeze canvas, and highland moss.',
    mode: 'light',
    swatches: ['#15803d', '#f3faf4', '#bbf7d0', '#14532d'],
    ink: '#0d2818',
  },
  {
    id: 'amber',
    name: 'Solar Amber',
    description: 'Radiant amber flame, golden honey canvas, and roasted burnt sienna.',
    mode: 'light',
    swatches: ['#c2410c', '#fff8ee', '#fed7aa', '#431407'],
    ink: '#280d05',
  },
  {
    id: 'amethyst',
    name: 'Amethyst Silk',
    description: 'Regal wisteria purple, soft lilac mist, and deep imperial violet.',
    mode: 'light',
    swatches: ['#6d28d9', '#fbf8ff', '#ede9fe', '#3b0764'],
    ink: '#22053d',
  },
  {
    id: 'swiss',
    name: 'Swiss Modernist',
    description: 'Architectural Bauhaus signal red, crisp gallery white, and carbon jet.',
    mode: 'light',
    swatches: ['#dc2626', '#f8fafc', '#fee2e2', '#18181b'],
    ink: '#09090b',
  },
  {
    id: 'sandstone',
    name: 'Desert Sandstone',
    description: 'Canyon clay, warm desert dune sands, and sunlit ochre.',
    mode: 'light',
    swatches: ['#9a3412', '#fbf6f0', '#ffedd5', '#451a03'],
    ink: '#291003',
  },
  {
    id: 'cobalt',
    name: 'Pacific Cobalt',
    description: 'Deep ocean cobalt, crisp seafoam spray, and maritime navy.',
    mode: 'light',
    swatches: ['#0284c7', '#f0f9ff', '#bae6fd', '#0c4a6e'],
    ink: '#082f49',
  },

  // --- Dark & High-Focus Palettes ---
  {
    id: 'midnight',
    name: 'Midnight Observatory',
    description: 'Electric celestial azure glowing over deep astronomical navy.',
    mode: 'dark',
    swatches: ['#38bdf8', '#0b1120', '#1e293b', '#94a3b8'],
    ink: '#f8fafc',
  },
  {
    id: 'obsidian',
    name: 'Obsidian & Gold',
    description: 'Molten brushed gold embers on pitch obsidian graphite.',
    mode: 'dark',
    swatches: ['#fbbf24', '#0f0f11', '#26231c', '#d97706'],
    ink: '#fef3c7',
  },
  {
    id: 'emerald',
    name: 'Emerald Sanctuary',
    description: 'Luminous mint phosphor on shadowed boreal cedar.',
    mode: 'dark',
    swatches: ['#34d399', '#091510', '#13281e', '#6ee7b7'],
    ink: '#ecfdf5',
  },
  {
    id: 'crimson',
    name: 'Crimson Eclipse',
    description: 'Vivid ruby fire over midnight volcanic basalt.',
    mode: 'dark',
    swatches: ['#f87171', '#140c0e', '#2b151a', '#fca5a5'],
    ink: '#fff1f2',
  },
  {
    id: 'cyberpunk',
    name: 'Cyber Abyss',
    description: 'Electric violet neon glowing against a pitch midnight void.',
    mode: 'dark',
    swatches: ['#c084fc', '#0d0b14', '#1f1a2e', '#e9d5ff'],
    ink: '#faf5ff',
  },
  {
    id: 'stealth',
    name: 'Titanium Stealth',
    description: 'Hyper-clean monochrome titanium and brushed steel on pure carbon.',
    mode: 'dark',
    swatches: ['#94a3b8', '#090a0f', '#181a20', '#cbd5e1'],
    ink: '#ffffff',
  },
  {
    id: 'dusk',
    name: 'Solar Dusk',
    description: 'Warm sunset amber glow on deeply scorched twilight earth.',
    mode: 'dark',
    swatches: ['#fb923c', '#15100c', '#2c1e14', '#fed7aa'],
    ink: '#fff7ed',
  },
  {
    id: 'arctic',
    name: 'Deep Arctic',
    description: 'Bioluminescent arctic teal on sub-zero oceanic black.',
    mode: 'dark',
    swatches: ['#2dd4bf', '#081416', '#10262b', '#99f6e4'],
    ink: '#f0fdfa',
  },
]

export const DEFAULT_CUSTOM_PALETTE: CustomPalette = {
  brand: '#1b4332',
  shell: '#f1e9d9',
  highlight: '#d8f3dc',
  accent: '#2d3b32',
  ink: '#1b4332',
  map: '#3f6e4e',
}

export type ThemePair = { day: CustomPalette; night: CustomPalette }

export const THEME_VARIANTS: Array<{ name: string; day: CustomPalette; night: CustomPalette }> = [
  {
    name: 'Moss & Paper',
    day: { ...DEFAULT_CUSTOM_PALETTE },
    night: {
      brand: '#8CCB9B',
      shell: '#111A16',
      surface: '#1B2921',
      highlight: '#274936',
      accent: '#D2A96A',
      ink: '#E6F1E8',
      rail: '#0B100D',
      seam: '#34483A',
      due: '#E5B76A',
      danger: '#E77D78',
      map: '#72B887',
    },
  },
  {
    name: 'Indigo Archive',
    day: {
      brand: '#284B63',
      shell: '#F2F5F7',
      surface: '#FFFFFF',
      highlight: '#DCEAF1',
      accent: '#A05A3C',
      ink: '#183243',
      rail: '#1E394B',
      seam: '#C9D7DE',
      due: '#9A651E',
      danger: '#A63D40',
      map: '#3F6E4E',
    },
    night: {
      brand: '#86B9D3',
      shell: '#10171D',
      surface: '#18242C',
      highlight: '#213B49',
      accent: '#D99877',
      ink: '#E6F2F7',
      rail: '#091016',
      seam: '#334650',
      due: '#E1B36B',
      danger: '#F08D8D',
      map: '#72B887',
    },
  },
  {
    name: 'Mulberry Night',
    day: {
      brand: '#713B57',
      shell: '#FAF4F5',
      surface: '#FFFFFF',
      highlight: '#F1DDE5',
      accent: '#8A5A44',
      ink: '#402335',
      rail: '#552B40',
      seam: '#DECBD3',
      due: '#96651D',
      danger: '#A63F4E',
      map: '#3F6E4E',
    },
    night: {
      brand: '#D58AA9',
      shell: '#1A1218',
      surface: '#281C25',
      highlight: '#442B3A',
      accent: '#D6A27E',
      ink: '#F6E8EF',
      rail: '#100B10',
      seam: '#4A3442',
      due: '#E7B86A',
      danger: '#EF8B9D',
      map: '#76B98B',
    },
  },
  {
    name: 'Copper Observatory',
    day: {
      brand: '#8A4B2F',
      shell: '#FBF5EE',
      surface: '#FFFFFF',
      highlight: '#F2DFCB',
      accent: '#34586B',
      ink: '#3A241B',
      rail: '#6A3925',
      seam: '#E1CDC0',
      due: '#976117',
      danger: '#A33F32',
      map: '#3F6E4E',
    },
    night: {
      brand: '#D58A5F',
      shell: '#181311',
      surface: '#28201B',
      highlight: '#453126',
      accent: '#83B3C7',
      ink: '#F5E9DE',
      rail: '#100C0A',
      seam: '#4B3930',
      due: '#E7B76B',
      danger: '#F08C7E',
      map: '#78B88B',
    },
  },
]

export const DEFAULT_THEME_PAIR: ThemePair = { day: DEFAULT_CUSTOM_PALETTE, night: THEME_VARIANTS[0].night }

export function getSavedThemePair(): ThemePair {
  if (typeof localStorage === 'undefined') return DEFAULT_THEME_PAIR
  try {
    const value = JSON.parse(localStorage.getItem('taste-map-theme-pair') || '{}')
    return {
      day: { ...DEFAULT_CUSTOM_PALETTE, ...(value?.day || {}) },
      night: { ...DEFAULT_THEME_PAIR.night, ...(value?.night || {}) },
    }
  } catch {
    return DEFAULT_THEME_PAIR
  }
}

export function saveThemePair(pair: ThemePair) {
  try {
    localStorage.setItem('taste-map-theme-pair', JSON.stringify(pair))
  } catch {}
}

/** Resolve the palette for the currently selected day/night mode on every route. */
export function getActiveCustomPalette(): CustomPalette {
  const mode =
    typeof localStorage !== 'undefined' && localStorage.getItem('taste-map-theme-mode') === 'night' ? 'night' : 'day'
  return getSavedThemePair()[mode]
}

export type FontPreset = {
  id: string
  name: string
  description: string
  ui: string // interface / body stack
  display: string // headings & display stack
  reading: string // long-form & display stack
  mono: string // code & data stack
}

export const FONT_PRESETS: FontPreset[] = [
  {
    id: 'plex',
    name: 'Plex Studio',
    description: 'Crisp humanist sans with a warm serif for reading.',
    ui: '"IBM Plex Sans", "IBM Plex Sans Arabic", system-ui, sans-serif',
    display: '"IBM Plex Serif", "Literata", "Noto Naskh Arabic", Georgia, serif',
    reading: '"IBM Plex Serif", "Literata", "Noto Naskh Arabic", Georgia, serif',
    mono: '"IBM Plex Mono", ui-monospace, monospace',
  },
  {
    id: 'inter',
    name: 'Modern Inter',
    description: 'Clean geometric neutral sans with editorial reading and JetBrains Mono.',
    ui: '"Inter", "Noto Sans Arabic", system-ui, -apple-system, sans-serif',
    display: '"Inter", "Noto Sans Arabic", system-ui, sans-serif',
    reading: '"Literata", Georgia, "Times New Roman", serif',
    mono: '"JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace',
  },
  {
    id: 'editorial',
    name: 'Editorial Literary',
    description: 'Bookish serif throughout for a literary studio.',
    ui: '"Literata", "Noto Naskh Arabic", Georgia, "Times New Roman", serif',
    display: '"Literata", "Noto Naskh Arabic", Georgia, serif',
    reading: '"Literata", "Noto Naskh Arabic", Georgia, serif',
    mono: '"IBM Plex Mono", ui-monospace, monospace',
  },
  {
    id: 'newsreader',
    name: 'Newsreader Academic',
    description: 'Scholarly serif display and reading with crisp humanist interface.',
    ui: '"IBM Plex Sans", "IBM Plex Sans Arabic", system-ui, sans-serif',
    display: '"Newsreader", "Literata", "Noto Naskh Arabic", Georgia, serif',
    reading: '"Newsreader", "Literata", "Noto Naskh Arabic", Georgia, serif',
    mono: '"JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace',
  },
  {
    id: 'jakarta',
    name: 'Plus Jakarta Crisp',
    description: 'Contemporary high-clarity sans with Fraunces accents and Fira Code.',
    ui: '"Plus Jakarta Sans", "Noto Sans Arabic", system-ui, sans-serif',
    display: '"Plus Jakarta Sans", "Noto Sans Arabic", system-ui, sans-serif',
    reading: '"Literata", Georgia, serif',
    mono: '"Fira Code", "IBM Plex Mono", ui-monospace, monospace',
  },
  {
    id: 'system',
    name: 'System Clean',
    description: 'Native platform fonts for a neutral, fast feel.',
    ui: 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Arabic", sans-serif',
    display: '-apple-system, "Segoe UI", Roboto, Georgia, serif',
    reading: 'Georgia, "Times New Roman", serif',
    mono: 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, monospace',
  },
  {
    id: 'terminal',
    name: 'Terminal Mono',
    description: 'Monospace interface for a focused, code-like feel.',
    ui: '"IBM Plex Mono", ui-monospace, "SF Mono", monospace',
    display: '"IBM Plex Serif", "Literata", Georgia, serif',
    reading: '"IBM Plex Serif", "Literata", Georgia, serif',
    mono: '"IBM Plex Mono", ui-monospace, monospace',
  },
]

export const DEFAULT_FONT_ID = 'plex'

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
  mono: '"IBM Plex Mono", ui-monospace, monospace',
}

/** Merge imported or previously saved stacks with safe, renderable defaults. */
export function normalizeCustomFont(input?: Partial<CustomFont> | null): CustomFont {
  return {
    ui: typeof input?.ui === 'string' && input.ui.trim() ? input.ui.trim() : DEFAULT_CUSTOM_FONT.ui,
    display:
      typeof input?.display === 'string' && input.display.trim() ? input.display.trim() : DEFAULT_CUSTOM_FONT.display,
    reading:
      typeof input?.reading === 'string' && input.reading.trim() ? input.reading.trim() : DEFAULT_CUSTOM_FONT.reading,
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
      hex = hex
        .split('')
        .map((c) => c + c)
        .join('')
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
  const toHex = (n: number) =>
    Math.min(255, Math.max(0, Math.round(n)))
      .toString(16)
      .padStart(2, '0')
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
  const minimumContrast = (candidate: RGB) =>
    Math.min(...backgrounds.map((background) => contrastBetween(candidate, background)))
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
  dueLight: { r: 135, g: 70, b: 6 }, // #874606
  dangerLight: { r: 156, g: 46, b: 33 }, // #9c2e21
  mapLight: { r: 40, g: 84, b: 111 }, // #28546f
  dueDark: { r: 224, g: 138, b: 30 }, // #e08a1e
  dangerDark: { r: 229, g: 72, b: 77 }, // #e5484d
  mapDark: { r: 77, g: 163, b: 216 }, // #4da3d8
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
  const surface = parseColor(palette.surface || '') || mixColors(shell, WHITE, isDarkColor(shell) ? 0.08 : 0.96)
  const dark = modeOverride ? modeOverride === 'dark' : isDarkColor(shell)

  // Structural surfaces — elevated planes are always lighter than the shell,
  // but dark shells use much smaller elevation steps.
  const ledger = mixColors(shell, WHITE, dark ? 0.05 : 0.4)
  const canvas = mixColors(shell, WHITE, dark ? 0.1 : 0.75)
  const inspector = mixColors(shell, WHITE, dark ? 0.07 : 0.25)
  // Seams/borders sit opposite the elevation: darker than shell in light, lighter in dark.
  const seam = parseColor(palette.seam || '') || (dark ? mixColors(shell, WHITE, 0.16) : mixColors(shell, BLACK, 0.12))

  // Text — preserve authored intent where possible, then derive readable CSS tokens.
  const parsedInk = palette.ink ? parseColor(palette.ink) : null
  const inkCandidate = parsedInk || (dark ? mixColors(shell, WHITE, 0.86) : mixColors(accent, BLACK, 0.62))
  const textPlanes = [shell, canvas, surface]
  const ink = ensureTextContrast(inkCandidate, textPlanes)
  const secondaryCandidate = dark ? mixColors(ink, shell, 0.4) : mixColors(ink, accent, 0.35)
  const mutedCandidate = mixColors(secondaryCandidate, shell, dark ? 0.42 : 0.35)
  const secondary = ensureTextContrast(secondaryCandidate, textPlanes)
  const muted = ensureTextContrast(mutedCandidate, textPlanes)

  // Rail is the deepest plane, anchored to the brand in light mode, or tinted obsidian in dark mode.
  const rail =
    parseColor(palette.rail || '') ||
    (dark ? mixColors(mixColors(shell, brand, 0.12), BLACK, 0.4) : adjustBrightness(brand, -15))

  // Status colors brighten on dark backgrounds so they remain legible.
  const due = parseColor(palette.due || '') || (dark ? SEMANTIC.dueDark : SEMANTIC.dueLight)
  const danger = parseColor(palette.danger || '') || (dark ? SEMANTIC.dangerDark : SEMANTIC.dangerLight)
  const map = parseColor(palette.map || '') || (dark ? SEMANTIC.mapDark : SEMANTIC.mapLight)

  // Determine active rail button background and text contrast
  const textOn = (background: RGB) =>
    contrastRatio('#ffffff', rgbToHex(background))! >= contrastRatio('#000000', rgbToHex(background))!
      ? '#ffffff'
      : '#000000'
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
    '--studio-focus-ring': `0 0 0 3px ${rgbToHex(canvas)}, 0 0 0 5px ${rgbToHex(brand)}`,
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
  const preset = THEME_PRESETS.find((p) => p.id === themeId) || THEME_PRESETS[0]
  return {
    palette: {
      brand: preset.swatches[0],
      shell: preset.swatches[1],
      highlight: preset.swatches[2],
      accent: preset.swatches[3],
      ink: preset.ink,
    },
    mode: preset.mode,
  }
}

export function applyDisplayPreferences(preferences: Partial<DisplayPreferences>) {
  if (typeof document === 'undefined') return
  const fallback = getSavedDisplayPreferences()
  const next: DisplayPreferences = {
    density:
      preferences.density === 'comfortable' || preferences.density === 'compact' || preferences.density === 'balanced'
        ? preferences.density
        : fallback.density,
    radius:
      preferences.radius === 'sharp' || preferences.radius === 'round' || preferences.radius === 'soft'
        ? preferences.radius
        : fallback.radius,
    fontSize:
      preferences.fontSize === 'small' || preferences.fontSize === 'large' || preferences.fontSize === 'medium'
        ? preferences.fontSize
        : fallback.fontSize,
    reducedMotion: typeof preferences.reducedMotion === 'boolean' ? preferences.reducedMotion : fallback.reducedMotion,
  }
  const root = document.documentElement
  root.dataset.density = next.density
  root.dataset.radius = next.radius
  root.dataset.fontSize = next.fontSize
  root.dataset.reducedMotion = next.reducedMotion ? 'true' : 'false'
  try {
    localStorage.setItem('taste-map-display-preferences', JSON.stringify(next))
  } catch {}
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
      density:
        value?.density === 'comfortable' || value?.density === 'compact' || value?.density === 'balanced'
          ? value.density
          : fallback.density,
      radius:
        value?.radius === 'sharp' || value?.radius === 'round' || value?.radius === 'soft'
          ? value.radius
          : fallback.radius,
      fontSize:
        value?.fontSize === 'small' || value?.fontSize === 'large' || value?.fontSize === 'medium'
          ? value.fontSize
          : fallback.fontSize,
      reducedMotion: typeof value?.reducedMotion === 'boolean' ? value.reducedMotion : fallback.reducedMotion,
    }
  } catch {
    return fallback
  }
}

export function applyTheme(themeId: string, customPalette?: CustomPalette) {
  if (typeof document === 'undefined') return
  const root = document.documentElement

  const { palette, mode } = paletteForTheme(themeId, customPalette)
  const vars = computeThemeVariables(palette, mode)

  const preset = THEME_PRESETS.find((p) => p.id === themeId)
  root.dataset.theme = themeId === 'custom' ? 'custom' : preset ? preset.id : THEME_PRESETS[0].id

  // Always write the full set inline so switching themes never leaves stale values.
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value)
  }
  root.style.colorScheme = mode
  root.dataset.colorMode = mode
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', vars['--studio-shell'])

  try {
    localStorage.setItem('taste-map-theme', themeId)
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
          ink: value?.ink && value.ink !== value?.accent ? value.ink : value?.brand || DEFAULT_CUSTOM_PALETTE.ink,
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
      if (saved && (THEME_PRESETS.some((p) => p.id === saved) || saved === 'custom')) {
        return saved
      }
    } catch {}
  }
  return 'botanical'
}

export function getSavedFontId(): string {
  if (typeof localStorage !== 'undefined') {
    try {
      const saved = localStorage.getItem('taste-map-font')
      if (saved && (FONT_PRESETS.some((f) => f.id === saved) || saved === 'custom')) return saved
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
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'math',
  'emoji',
  '-apple-system',
  'blinkmacsystemfont',
  'segoe ui',
  'sf mono',
  'cascadia mono',
  'menlo',
  'consolas',
  'monaco',
  'arial',
  'helvetica',
  'helvetica neue',
  'georgia',
  'times new roman',
  'courier new',
  'verdana',
  'tahoma',
  'trebuchet ms',
  'impact',
  'comic sans ms',
  'palatino linotype',
  'book antiqua',
  'garamond',
  'dejavu sans',
  'dejavu serif',
  'berkeley mono',
  'dejavu sans mono',
  'liberation sans',
  'liberation serif',
  'liberation mono',
  'cantarell',
  'gill sans',
  'futura',
  'avenir',
  'optima',
  'baskerville',
  'century gothic',
  'lucida grande',
  'lucida console',
])

const LOADED_FONT_FAMILIES = new Set<string>()

function extractFamilies(stack: string): string[] {
  const families: string[] = []
  for (const part of stack.split(',')) {
    const name = part
      .trim()
      .replace(/^['"]+|['"]+$/g, '')
      .trim()
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
    const preset = FONT_PRESETS.find((f) => f.id === fontId) || FONT_PRESETS[0]
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
  loadGoogleFonts([
    ...extractFamilies(ui),
    ...extractFamilies(display),
    ...extractFamilies(reading),
    ...extractFamilies(mono),
  ])
  try {
    localStorage.setItem('taste-map-font', fontId)
    if (fontId === 'custom')
      localStorage.setItem('taste-map-custom-font', JSON.stringify(normalizeCustomFont(customFont)))
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
  root.style.setProperty(
    '--font-scale',
    `calc(${next.baseSize / DEFAULT_TYPOGRAPHY.baseSize} * var(--font-preference-scale, 1) * var(--font-viewport-scale, 1))`,
  )
  root.style.setProperty('--font-body-weight', String(next.bodyWeight))
  root.style.setProperty('--font-heading-weight', String(next.headingWeight))
  root.style.setProperty(
    '--font-medium-weight',
    String(Math.round((next.bodyWeight + next.headingWeight) / 2 / 10) * 10),
  )
  root.style.setProperty('--font-bold-weight', String(Math.min(900, next.headingWeight + 100)))
  root.style.setProperty('--font-line-height', String(next.lineHeight))
  root.style.setProperty('--font-letter-spacing', `${next.letterSpacing}em`)
  root.style.setProperty('--font-display-scale', String(next.displayScale))
  root.style.setProperty('--font-reading-measure', `${next.readingMeasure}ch`)
  try {
    localStorage.setItem('taste-map-typography', JSON.stringify(next))
  } catch {}
  window.dispatchEvent(new Event('typographychange'))
}

export function getSavedTypography(): TypographyPreferences {
  if (typeof localStorage === 'undefined') return DEFAULT_TYPOGRAPHY
  try {
    const value = JSON.parse(localStorage.getItem('taste-map-typography') || '{}')
    return normalizeTypography(value)
  } catch {
    return DEFAULT_TYPOGRAPHY
  }
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
    const payload = (await response.json()) as { resolved?: { appearance?: Record<string, unknown> } }
    const appearance = payload.resolved?.appearance
    if (!appearance) return
    const theme = typeof appearance.theme === 'string' ? appearance.theme : getSavedTheme()
    const storedPair = typeof localStorage !== 'undefined' ? localStorage.getItem('taste-map-theme-pair') : null
    const serverPalette =
      appearance.custom_palette && typeof appearance.custom_palette === 'object'
        ? (appearance.custom_palette as CustomPalette)
        : undefined
    // The Worker is canonical when it has a saved palette. The locally stored
    // day/night pair remains the offline fallback, never a reason to overwrite
    // a newer visual system from another device.
    const palette =
      theme === 'custom' ? serverPalette || (storedPair ? getActiveCustomPalette() : undefined) : undefined
    applyTheme(theme, palette)
    if (typeof appearance.font === 'string') {
      applyFont(
        appearance.font,
        appearance.custom_font && typeof appearance.custom_font === 'object'
          ? normalizeCustomFont(appearance.custom_font as Partial<CustomFont>)
          : undefined,
      )
    }
    if (appearance.typography && typeof appearance.typography === 'object')
      applyTypography(appearance.typography as Partial<TypographyPreferences>)
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
