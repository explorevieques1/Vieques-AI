/**
 * Vieques Cards — card face generator (docs/CARD_UI_SPEC.md S-11).
 *
 * Every card is drawn ONCE onto a 630 × 880 canvas (trading-card 63:88) and
 * exported as a PNG blob URL. That one image feeds HoloCard `image` /
 * `backImage`, TiltedCard `imageSrc`, the pin art crop and Share.
 *
 * Canvas, not SVG-in-<img>: an SVG drawn through <img> can't load web fonts,
 * so Instrument Serif would silently fall back to Times. Here every face waits
 * for its fonts (document.fonts.load + .ready) before drawing.
 *
 * Colours are read off the document at draw time from the theme's custom
 * properties (--rarity-*, --card, --primary, …) — no raw colours here (T-1).
 * Results are cached per card + serial; a card's face never changes once you
 * hold that serial.
 */
import { createElement, type ComponentType } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { Award, Landmark, Moon, Mountain, Tag, TreePalm, Waves, type LucideProps } from 'lucide-react'

import { RARITY, type Rarity } from './rarity'

// --- Layout (S-11) -----------------------------------------------------------

export const CARD_FACE_W = 630
export const CARD_FACE_H = 880
const RADIUS = 44
const RIM = 12
const ART = { x: 36, y: 84, w: 558, h: 470, r: 20 }
const PAD_X = 36

const SERIF = '"Instrument Serif"'
const SANS = '"Geist Variable"'
const MONO = '"Geist Mono Variable"'

// --- Inputs ------------------------------------------------------------------

export type CardFrontInput = {
  slug: string
  name: string
  lore: string | null
  rarity: Rarity
  /** null while a locate riddle hides it → "?" */
  region: string | null
  serialNo: number | null
  maxClaims: number | null
  tags: string[]
  /** Card art URL (engraving); drawn as a sea/navy duotone. */
  image: string | null
}

export type CardBackInput = {
  slug: string
  rarity: Rarity
  serialNo: number | null
  /** [lng, lat] of the find spot; omitted from the drawing when off-island. */
  center: [number, number] | null
  /** ISO timestamp the card was collected. */
  claimedAt: string | null
  /** Names of the badges this card counts toward (caller supplies them). */
  badges: string[]
}

// --- Cache -------------------------------------------------------------------

const cache = new Map<string, Promise<string>>()

function cached(key: string, draw: () => Promise<string>): Promise<string> {
  const hit = cache.get(key)
  if (hit) return hit
  const p = draw().catch((e) => {
    cache.delete(key) // a failed draw (e.g. art 404) may succeed next time
    throw e
  })
  cache.set(key, p)
  return p
}

/** Drop every generated face and free its blob (sign-out, memory pressure). */
export function clearCardFaces(): void {
  for (const p of cache.values()) p.then((url) => URL.revokeObjectURL(url)).catch(() => {})
  cache.clear()
}

/** The face of a card you've revealed or own. */
export function cardFrontUrl(card: CardFrontInput): Promise<string> {
  return cached(`front:${card.slug}#${card.serialNo ?? '-'}`, () => drawFront(card))
}

/** The back: island outline + find-spot dot, date, badges (S-7 flip). */
export function cardBackUrl(card: CardBackInput): Promise<string> {
  return cached(`back:${card.slug}#${card.serialNo ?? '-'}`, () => drawBack(card))
}

/** The one shared "not yet found" back, for every undiscovered card. */
export function unfoundBackUrl(): Promise<string> {
  return cached('unfound', drawUnfound)
}

/**
 * Stand-in sticker for an achievement that has no badge art yet (badge
 * artwork is still open): a die-cut disc in the teal→sky CTA colours with a
 * lucide Award glyph, after Card UI Mapping p.8. One per app, so it's cached
 * once. Transparent outside the disc so StickerPeel can cut its outline.
 */
export const BADGE_STICKER_SIZE = 360

export function badgeStickerUrl(): Promise<string> {
  return cached('badge-sticker', drawBadgeSticker)
}

// --- Fonts -------------------------------------------------------------------

/**
 * document.fonts.ready alone is not enough: it only waits for fonts something
 * has already asked for, and fontsource splits faces by unicode-range. So ask
 * for each face with the actual text, then wait.
 */
async function ensureFonts(text: string): Promise<void> {
  const sample = `${text} ABCabc0123#/·?`
  await Promise.all(
    [`64px ${SERIF}`, `24px ${SANS}`, `22px ${MONO}`, `500 26px ${MONO}`].map((f) =>
      document.fonts.load(f, sample).catch(() => []),
    ),
  )
  await document.fonts.ready
}

// --- Colours -----------------------------------------------------------------

type Palette = {
  rarity: Record<Rarity, string>
  card: string
  navy: string
  sea: string
  sky: string
  fg: string
  muted: string
}

function palette(): Palette {
  const cs = getComputedStyle(document.documentElement)
  const v = (name: string) => cs.getPropertyValue(name).trim()
  return {
    rarity: {
      common: v(RARITY.common.cssVar),
      basic: v(RARITY.basic.cssVar),
      rare: v(RARITY.rare.cssVar),
      legendary: v(RARITY.legendary.cssVar),
    },
    card: v('--card'),
    navy: v('--background'),
    sea: v('--primary'),
    sky: v('--accent-sky'),
    fg: v('--foreground'),
    muted: v('--muted-foreground'),
  }
}

/** Any CSS colour → [r, g, b], via a 1px canvas (for the duotone pixel pass). */
function toRgb(color: string): [number, number, number] {
  const c = document.createElement('canvas')
  c.width = c.height = 1
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) return [0, 0, 0]
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return [r, g, b]
}

// --- Canvas helpers ----------------------------------------------------------

function newCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas')
  canvas.width = CARD_FACE_W
  canvas.height = CARD_FACE_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('cardFace: no 2d context')
  return [canvas, ctx]
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/** Rarity rim (12px) around the card body. */
function frame(ctx: CanvasRenderingContext2D, rim: string, body: string) {
  roundRect(ctx, 0, 0, CARD_FACE_W, CARD_FACE_H, RADIUS)
  ctx.fillStyle = rim
  ctx.fill()
  roundRect(ctx, RIM, RIM, CARD_FACE_W - RIM * 2, CARD_FACE_H - RIM * 2, RADIUS - RIM)
  ctx.fillStyle = body
  ctx.fill()
}

function setFont(ctx: CanvasRenderingContext2D, font: string, tracking = '0px') {
  ctx.font = font
  ctx.letterSpacing = tracking
}

/** Trim to `maxW` with an ellipsis. */
function fit(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1)
  return `${t.trimEnd()}…`
}

/** Header row: Geist Mono 22px uppercase, left + right (S-11). */
function header(ctx: CanvasRenderingContext2D, left: string, right: string, color: string) {
  setFont(ctx, `500 22px ${MONO}`, '3px')
  ctx.fillStyle = color
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  const half = (CARD_FACE_W - PAD_X * 2) / 2 - 12
  ctx.fillText(fit(ctx, left.toUpperCase(), half), PAD_X + 6, 62)
  ctx.textAlign = 'right'
  ctx.fillText(fit(ctx, right.toUpperCase(), half), CARD_FACE_W - PAD_X - 6, 62)
  ctx.textAlign = 'left'
}

/** Clip to the art window and run `draw` inside it. */
function inArtWindow(ctx: CanvasRenderingContext2D, draw: () => void) {
  ctx.save()
  roundRect(ctx, ART.x, ART.y, ART.w, ART.h, ART.r)
  ctx.clip()
  draw()
  ctx.restore()
}

/** Engraving-style hatch, for cards whose art isn't drawn yet. */
function hatch(ctx: CanvasRenderingContext2D, p: Palette) {
  ctx.fillStyle = p.navy
  ctx.fillRect(ART.x, ART.y, ART.w, ART.h)
  ctx.strokeStyle = p.sea
  ctx.globalAlpha = 0.14
  ctx.lineWidth = 2
  for (let d = -ART.h; d < ART.w; d += 14) {
    ctx.beginPath()
    ctx.moveTo(ART.x + d, ART.y + ART.h)
    ctx.lineTo(ART.x + d + ART.h, ART.y)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous' // or toBlob() throws on a tainted canvas
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`cardFace: image failed ${src}`))
    img.src = src
  })
}

/** Cover-fit the art, then map its luminance onto navy → sea (duotone). */
function duotone(ctx: CanvasRenderingContext2D, img: HTMLImageElement, p: Palette) {
  const s = Math.max(ART.w / img.naturalWidth, ART.h / img.naturalHeight)
  const w = img.naturalWidth * s
  const h = img.naturalHeight * s
  ctx.drawImage(img, ART.x + (ART.w - w) / 2, ART.y + (ART.h - h) / 2, w, h)
  const data = ctx.getImageData(ART.x, ART.y, ART.w, ART.h)
  const [r0, g0, b0] = toRgb(p.navy)
  const [r1, g1, b1] = toRgb(p.sea)
  const px = data.data
  for (let i = 0; i < px.length; i += 4) {
    const l = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255
    px[i] = r0 + (r1 - r0) * l
    px[i + 1] = g0 + (g1 - g0) * l
    px[i + 2] = b0 + (b1 - b0) * l
  }
  ctx.putImageData(data, ART.x, ART.y)
}

function toBlobUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(URL.createObjectURL(b)) : reject(new Error('cardFace: toBlob failed'))), 'image/png')
  })
}

// --- Tag glyphs (lucide, drawn as SVG images) --------------------------------

/** Card tag → lucide glyph. Unlisted tags get the generic Tag glyph. */
const TAG_ICONS: Record<string, ComponentType<LucideProps>> = {
  heights: Mountain,
  beach: Waves,
  history: Landmark,
  night: Moon,
  nature: TreePalm,
}

/** Render a lucide icon to an <img> without react-dom/server. */
function lucideImage(Icon: ComponentType<LucideProps>, color: string, size: number): Promise<HTMLImageElement> {
  const host = document.createElement('div')
  const root = createRoot(host)
  flushSync(() => root.render(createElement(Icon, { size, color, strokeWidth: 2 })))
  const svg = host.innerHTML
  root.unmount()
  return loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
}

// --- Faces -------------------------------------------------------------------

function serialText(serialNo: number | null, maxClaims: number | null): string {
  if (serialNo == null) return ''
  const pad = (n: number) => String(n).padStart(3, '0')
  return maxClaims ? `#${pad(serialNo)} / ${pad(maxClaims)}` : `#${pad(serialNo)}`
}

async function drawFront(card: CardFrontInput): Promise<string> {
  await ensureFonts(`${card.name} ${card.lore ?? ''} ${card.region ?? ''} ${card.tags.join(' ')}`)
  const p = palette()
  const rim = p.rarity[card.rarity]
  const [canvas, ctx] = newCanvas()

  frame(ctx, rim, p.card)
  header(ctx, RARITY[card.rarity].label, card.region ?? '?', rim)

  let art: HTMLImageElement | null = null
  if (card.image) art = await loadImage(card.image).catch(() => null)
  inArtWindow(ctx, () => (art ? duotone(ctx, art, p) : hatch(ctx, p)))

  // Name — Instrument Serif 64px, shrinks a little before it ellipsises.
  const maxW = CARD_FACE_W - PAD_X * 2 - 12
  ctx.textAlign = 'center'
  ctx.fillStyle = p.fg
  let size = 64
  setFont(ctx, `400 ${size}px ${SERIF}`)
  while (size > 48 && ctx.measureText(card.name).width > maxW) {
    size -= 2
    setFont(ctx, `400 ${size}px ${SERIF}`)
  }
  ctx.fillText(fit(ctx, card.name, maxW), CARD_FACE_W / 2, 640)

  // Lore — Geist 24px, one line.
  if (card.lore) {
    setFont(ctx, `400 24px ${SANS}`)
    ctx.fillStyle = p.muted
    ctx.fillText(fit(ctx, card.lore, maxW), CARD_FACE_W / 2, 692)
  }

  // Footer — serial left, tag glyphs right, Geist Mono 26px.
  const baseY = 818
  ctx.textAlign = 'left'
  setFont(ctx, `500 26px ${MONO}`, '1px')
  ctx.fillStyle = p.fg
  ctx.fillText(serialText(card.serialNo, card.maxClaims), PAD_X + 6, baseY)

  let x = CARD_FACE_W - PAD_X - 6
  ctx.textAlign = 'right'
  ctx.fillStyle = p.muted
  for (const tag of card.tags.slice(0, 2).reverse()) {
    ctx.fillText(tag, x, baseY)
    x -= ctx.measureText(tag).width + 8
    const icon = await lucideImage(TAG_ICONS[tag] ?? Tag, p.muted, 26).catch(() => null)
    if (icon) ctx.drawImage(icon, x - 26, baseY - 23, 26, 26)
    x -= 26 + 22
  }

  return toBlobUrl(canvas)
}

// Simplified Vieques coastline, [lng, lat], clockwise from Punta Arenas (W).
// Decorative only: the card back needs a recognisable silhouette, not a survey.
const VIEQUES: [number, number][] = [
  [-65.585, 18.12], [-65.57, 18.134], [-65.545, 18.142], [-65.515, 18.147],
  [-65.48, 18.15], [-65.443, 18.153], [-65.41, 18.15], [-65.38, 18.148],
  [-65.35, 18.145], [-65.32, 18.142], [-65.29, 18.137], [-65.272, 18.13],
  [-65.285, 18.116], [-65.31, 18.11], [-65.34, 18.104], [-65.37, 18.098],
  [-65.42, 18.095], [-65.455, 18.092], [-65.475, 18.09], [-65.5, 18.095],
  [-65.53, 18.1], [-65.56, 18.105], [-65.578, 18.112],
]

async function drawBack(card: CardBackInput): Promise<string> {
  const found = card.claimedAt ? `Found ${formatDay(card.claimedAt)}` : ''
  const badges = card.badges.length ? `Counts toward: ${card.badges.join(', ')}` : ''
  await ensureFonts(`${found} ${badges}`)
  const p = palette()
  const rim = p.rarity[card.rarity]
  const [canvas, ctx] = newCanvas()

  frame(ctx, rim, p.card)
  header(ctx, RARITY[card.rarity].label, serialText(card.serialNo, null), rim)

  inArtWindow(ctx, () => {
    ctx.fillStyle = p.navy
    ctx.fillRect(ART.x, ART.y, ART.w, ART.h)

    // Equirectangular, lng scaled by cos(lat) so the island isn't stretched.
    const lngs = VIEQUES.map((c) => c[0])
    const lats = VIEQUES.map((c) => c[1])
    const [minLng, maxLng] = [Math.min(...lngs), Math.max(...lngs)]
    const [minLat, maxLat] = [Math.min(...lats), Math.max(...lats)]
    const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180)
    const scale = Math.min((ART.w - 80) / ((maxLng - minLng) * k), (ART.h - 80) / (maxLat - minLat))
    const cx = ART.x + ART.w / 2
    const cy = ART.y + ART.h / 2
    const midLng = (minLng + maxLng) / 2
    const midLat = (minLat + maxLat) / 2
    const project = ([lng, lat]: [number, number]): [number, number] => [
      cx + (lng - midLng) * k * scale,
      cy - (lat - midLat) * scale,
    ]

    ctx.beginPath()
    VIEQUES.forEach((c, i) => {
      const [x, y] = project(c)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.closePath()
    ctx.globalAlpha = 0.12
    ctx.fillStyle = p.sea
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.lineJoin = 'round'
    ctx.lineWidth = 3
    ctx.strokeStyle = p.sea
    ctx.stroke()

    // Find-spot dot — only when the spot is on the island (test cards aren't).
    const c = card.center
    const pad = 0.01
    if (c && c[0] >= minLng - pad && c[0] <= maxLng + pad && c[1] >= minLat - pad && c[1] <= maxLat + pad) {
      const [x, y] = project(c)
      ctx.globalAlpha = 0.3
      ctx.fillStyle = p.sea
      ctx.beginPath()
      ctx.arc(x, y, 22, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.beginPath()
      ctx.arc(x, y, 10, 0, Math.PI * 2)
      ctx.fill()
    }
  })

  ctx.textAlign = 'left'
  const maxW = CARD_FACE_W - PAD_X * 2 - 12
  let y = 616
  if (found) {
    setFont(ctx, `400 24px ${SANS}`)
    ctx.fillStyle = p.fg
    ctx.fillText(fit(ctx, found, maxW), PAD_X + 6, y)
    y += 40
  }
  if (badges) {
    setFont(ctx, `400 24px ${SANS}`)
    ctx.fillStyle = p.muted
    for (const line of wrap(ctx, badges, maxW, 3)) {
      ctx.fillText(line, PAD_X + 6, y)
      y += 34
    }
  }

  return toBlobUrl(canvas)
}

async function drawUnfound(): Promise<string> {
  await ensureFonts('? EXPLORE VIEQUES')
  const p = palette()
  const [canvas, ctx] = newCanvas()

  frame(ctx, p.sea, p.navy)

  // Contour lines: concentric rings, like a depth chart around the "?".
  const cx = CARD_FACE_W / 2
  const cy = CARD_FACE_H / 2 - 20
  ctx.save()
  roundRect(ctx, RIM, RIM, CARD_FACE_W - RIM * 2, CARD_FACE_H - RIM * 2, RADIUS - RIM)
  ctx.clip()
  ctx.strokeStyle = p.sea
  ctx.lineWidth = 2
  for (let r = 40; r < 560; r += 26) {
    ctx.globalAlpha = Math.max(0.1, 0.55 - r / 1100)
    ctx.beginPath()
    ctx.ellipse(cx, cy, r, r * 1.08, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()
  ctx.globalAlpha = 1

  setFont(ctx, `400 120px ${SERIF}`)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = p.sea
  ctx.fillText('?', cx, cy + 6)

  setFont(ctx, `500 22px ${MONO}`, '6px')
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = p.sea
  ctx.fillText('EXPLORE VIEQUES', cx, CARD_FACE_H - 64)

  return toBlobUrl(canvas)
}

async function drawBadgeSticker(): Promise<string> {
  const p = palette()
  const ink = getComputedStyle(document.documentElement).getPropertyValue('--primary-foreground').trim()
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = BADGE_STICKER_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('cardFace: no 2d context')
  const c = BADGE_STICKER_SIZE / 2

  // Die-cut edge: a light rim like a real vinyl sticker.
  ctx.beginPath()
  ctx.arc(c, c, c - 4, 0, Math.PI * 2)
  ctx.fillStyle = p.fg
  ctx.fill()

  // Disc: the primary CTA's teal → sky.
  const g = ctx.createLinearGradient(0, 0, BADGE_STICKER_SIZE, BADGE_STICKER_SIZE)
  g.addColorStop(0, p.sea)
  g.addColorStop(1, p.sky)
  ctx.beginPath()
  ctx.arc(c, c, c - 22, 0, Math.PI * 2)
  ctx.fillStyle = g
  ctx.fill()

  const glyph = 168
  const icon = await lucideImage(Award, ink, glyph).catch(() => null)
  if (icon) ctx.drawImage(icon, c - glyph / 2, c - glyph / 2 + 4, glyph, glyph)

  return toBlobUrl(canvas)
}

// --- Text helpers ------------------------------------------------------------

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Puerto_Rico',
  })
}

/** Word-wrap to at most `lines` lines; the last one ellipsises. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, lines: number): string[] {
  const out: string[] = []
  let cur = ''
  const words = text.split(' ')
  for (let i = 0; i < words.length; i++) {
    const next = cur ? `${cur} ${words[i]}` : words[i]
    if (ctx.measureText(next).width <= maxW) {
      cur = next
      continue
    }
    if (out.length === lines - 1) {
      out.push(fit(ctx, `${cur} ${words.slice(i).join(' ')}`, maxW))
      return out
    }
    out.push(cur)
    cur = words[i]
  }
  if (cur) out.push(cur)
  return out
}
