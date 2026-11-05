import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// WCAG ratios computed from the tokens in styles.css, in both themes. White on the green primary button (2.09:1) is
// left out on purpose: it waits on the owner's decision (docs/backlog.md, P10).
const css = readFileSync(resolve(__dirname, '../src/styles.css'), 'utf8')

function tokens(selector: string) {
  const block = css.slice(css.indexOf(`${selector} {`), css.indexOf('}', css.indexOf(`${selector} {`)))
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6});/gi)].map(match => [match[1], match[2]]))
}

const THEMES = { light: tokens(':root'), dark: tokens('.dark') }
type Rgb = [number, number, number]
const rgb = (hex: string): Rgb => [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16)) as Rgb
/** `color-mix(in oklab, color N%, transparent)` is the colour at N% opacity, painted over what is behind it. */
const over = (color: Rgb, opacity: number, behind: Rgb): Rgb =>
  color.map((channel, index) => channel * opacity + behind[index] * (1 - opacity)) as Rgb

function luminance(color: Rgb) {
  const [r, g, b] = color.map(channel => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function ratio(first: Rgb, second: Rgb) {
  const [high, low] = [luminance(first), luminance(second)].sort((a, b) => b - a)
  return (high + 0.05) / (low + 0.05)
}

const STATUSES = ['pending', 'verifying', 'accepted', 'progress', 'resolved', 'rejected']

describe.each(Object.entries(THEMES))('contrast in the %s theme', (_name, theme) => {
  const token = (name: string) => rgb(theme[name])
  const passes = (text: Rgb, surface: Rgb, minimum: number) =>
    expect(Number(ratio(text, surface).toFixed(2))).toBeGreaterThanOrEqual(minimum)

  it('reads errors on the page and on their tint', () => {
    passes(token('destructive'), token('background'), 4.5)
    passes(token('destructive'), over(token('destructive'), 0.1, token('background')), 4.5)
    passes(token('destructive'), over(token('destructive'), 0.1, token('card')), 4.5)
  })

  it('reads links and muted text on the blue tint', () => {
    passes(token('link'), token('sky-soft'), 4.5)
    passes(token('link'), token('background'), 4.5)
    passes(token('muted-foreground'), token('sky-soft'), 4.5)
    passes(token('muted-foreground'), token('background'), 4.5)
    passes(token('muted-foreground'), token('muted'), 4.5)
  })

  it.each(STATUSES)('reads the %s badge on its tint, on the page and in a card', status => {
    const color = token(`status-${status}`)
    // The strongest tint in use is 14% (the "outside the area" note); badges use 12%.
    for (const surface of ['background', 'card', 'muted']) passes(color, over(color, 0.14, token(surface)), 4.5)
  })

  it('draws focus rings and input borders at 3:1', () => {
    passes(token('ring'), token('background'), 3)
    passes(token('ring'), token('card'), 3)
    passes(token('input'), token('background'), 3)
    passes(token('input'), token('card'), 3)
    // The inside of a resting input is the muted fill, so the border has to stand off that too.
    passes(token('input'), token('muted'), 3)
  })
})

it('uses the ring at full strength on buttons, and the ring token for the base outline', () => {
  const button = readFileSync(resolve(__dirname, '../src/components/ui/button.tsx'), 'utf8')
  expect(button).toContain('focus-visible:ring-ring ')
  expect(button).not.toContain('ring-ring/50')
  expect(css).toMatch(/:focus-visible \{\s*outline: 2px solid var\(--ring\)/)
})
