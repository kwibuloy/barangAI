import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// The page the Android app falls back to. The app itself needs a device to run, so this covers what can be run here:
// the page, in jsdom, and the static agreement between the page, MainActivity and its translated strings.
const MOBILE = resolve(__dirname, '../../mobile')
const html = readFileSync(resolve(MOBILE, 'www/index.html'), 'utf8')
const activity = readFileSync(resolve(MOBILE, 'android/app/src/main/java/com/barangai/app/MainActivity.java'), 'utf8')
const strings = (folder: string) => {
  const xml = readFileSync(resolve(MOBILE, `android/app/src/main/res/${folder}/strings.xml`), 'utf8')
  return new Map(
    [...xml.matchAll(/<string name="(\w+)"([^>]*)>([^<]*)</g)].map(m => [m[1], { attrs: m[2], text: m[3] }]),
  )
}

function open(language: string, search: string) {
  document.documentElement.innerHTML = html.slice(html.indexOf('<head>'), html.indexOf('</html>'))
  const location = { search, href: '' }
  const script = document.querySelector('script')!.textContent!
  new Function('location', 'navigator', script)(location, { language })
  const text = (id: string) => document.getElementById(id)!.textContent
  return { location, text, click: (id: string) => document.getElementById(id)!.click() }
}

describe('server unreachable', () => {
  it('tells residents in English, with Retry and the address behind Advanced', () => {
    const page = open('en-US', '?failed=1')
    expect(page.text('title')).toBe("Can't reach your barangay's server")
    expect(page.text('primary')).toBe('Retry')
    expect(page.text('advanced')).toBe('Advanced')
    expect(document.querySelector('img')!.getAttribute('src')).toBe('kap.webp')
    // Nothing to fill in: not one text field on the page.
    expect(document.querySelectorAll('input, textarea, select')).toHaveLength(0)
    page.click('primary')
    expect(page.location.href).toBe('barangai-app://retry')
    page.click('advanced')
    expect(page.location.href).toBe('barangai-app://address')
  })

  it.each(['fil-PH', 'tl-PH', 'fil'])('follows a phone set to %s', language => {
    const page = open(language, '?failed=1')
    expect(document.documentElement.lang).toBe('fil')
    expect(page.text('title')).toBe('Hindi maabot ang server ng barangay mo')
    expect(page.text('primary')).toBe('Subukan ulit')
    expect(page.text('emergency')).toContain('911')
  })

  it('has every line of the page in both languages', () => {
    const page = open('en', '?failed=1')
    const english = ['title', 'body', 'primary', 'emergency'].map(page.text)
    const other = open('fil', '?failed=1')
    expect(['title', 'body', 'primary', 'emergency'].map(other.text)).not.toEqual(english)
    expect(['title', 'body', 'primary', 'emergency'].map(other.text).every(Boolean)).toBe(true)
  })
})

it('asks for the address on first launch, since there is nothing to retry', () => {
  const page = open('en', '')
  expect(page.text('primary')).toBe('Enter the address')
  expect(document.getElementById('advanced')!.hidden).toBe(true)
  // The page's own button rule would otherwise show it anyway.
  expect(html).toMatch(/button\[hidden\] \{\s*display: none/)
  page.click('primary')
  expect(page.location.href).toBe('barangai-app://address')
})

describe('MainActivity', () => {
  it('ships the picture the page shows', () => {
    expect(existsSync(resolve(MOBILE, 'www/kap.webp'))).toBe(true)
  })

  it('takes every dialog line from a string resource, with a Filipino version', () => {
    expect(activity).not.toMatch(/\.set(Title|Message|PositiveButton)\(\s*(current == null \? )?"/)
    expect(activity).not.toMatch(/setError\("/)
    const english = strings('values')
    const filipino = strings('values-fil')
    const used = [...activity.matchAll(/R\.string\.(\w+)/g)].map(match => match[1])
    expect(used.length).toBeGreaterThanOrEqual(5)
    for (const name of used) {
      expect(english.has(name), name).toBe(true)
      if (!english.get(name)!.attrs.includes('translatable="false"')) {
        expect(filipino.has(name), name).toBe(true)
        expect(filipino.get(name)!.text).not.toBe(english.get(name)!.text)
      }
    }
  })

  it('only obeys page actions from the bundled page', () => {
    expect(activity).toContain('from.startsWith(FALLBACK_PAGE)')
    expect(activity).toContain('"barangai-app"')
    for (const action of ['retry', 'address']) expect(activity).toContain(`"${action}".equals(action)`)
  })
})
