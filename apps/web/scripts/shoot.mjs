// Screenshot routes in headless Chrome/Edge, signed in as a seeded demo account, and report console errors.
//   API on :8000 and `npm run dev` on :5173 (see the visual-check skill), seeded with SEED_DEMO_PASSWORD set
//   node scripts/shoot.mjs [--as resident|staff|admin|none] [--theme light|dark] [--widths 390,768,1024,1440] [--out <dir>] home reports/<id> report-flow ...
// Routes are written without the leading "/" (Git Bash mangles it); "home" is the bare URL. Set BASE_URL or CHROME_PATH.
import { existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? args.splice(i, 2)[1] : fallback
}
const role = opt('--as', 'resident')
const theme = opt('--theme', 'light')
const suffix = theme === 'dark' ? '-dark' : ''
const out = opt('--out', fileURLToPath(new URL('../../../.shots', import.meta.url)))
const widths = opt('--widths', '390,768,1024,1440').split(',').map(Number)
const routes = args.length ? args : ['home']
const base = process.env.BASE_URL ?? 'http://127.0.0.1:5173/'
const ACCOUNTS = { resident: 'resident1@demo.test', staff: 'staff@demo.test', admin: 'admin@demo.test' }
const HEIGHT = { 1440: 900, 1280: 800, 1024: 768, 820: 1180, 768: 1024, 390: 844, 375: 667 }
// Residents report from phones and tablets: emulate touch up to tablet landscape so coarse-pointer styles are shot.
const TOUCH_MAX = 1024

const chrome = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find(p => p && existsSync(p))
if (!chrome) throw new Error('No Chrome or Edge found; set CHROME_PATH.')
if (role !== 'none' && !ACCOUNTS[role]) throw new Error(`--as must be one of ${Object.keys(ACCOUNTS)}, none`)
if (role !== 'none' && !process.env.SEED_DEMO_PASSWORD)
  throw new Error('Set SEED_DEMO_PASSWORD to the seeded demo password.')

mkdirSync(out, { recursive: true })
// CHROME_NO_SANDBOX=1 for containers that run as root (cloud sessions); never needed on a desktop.
const browser = await puppeteer.launch({
  executablePath: chrome,
  args: process.env.CHROME_NO_SANDBOX ? ['--no-sandbox'] : [],
})
const context = await browser.createBrowserContext()
if (role !== 'none') {
  const page = await context.newPage()
  await page.goto(base, { waitUntil: 'networkidle0' })
  const status = await page.evaluate(
    (email, password) =>
      fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }).then(r => r.status),
    ACCOUNTS[role],
    process.env.SEED_DEMO_PASSWORD,
  )
  if (status !== 200) throw new Error(`Login as ${role} returned ${status}; run the seed-demo skill first.`)
  await page.close()
}

// Multi-step flows: each step is shot as <role>-<flow>-<n>-<step>-<width>.png. A submit writes to the local DB.
const click = (page, text) => page.locator(`::-p-text(${text})`).click()
// Full-page capture resizes the viewport, which replays chart draw-ins and can catch entrance animations mid-way.
// So grow the viewport to the page's height first, give charts time to redraw, then end every one-shot animation
// (looping ones, like Kap breathing, keep running) and capture the settled layout.
const settle = async page => {
  const viewport = page.viewport()
  const height = await page.evaluate(() => document.documentElement.scrollHeight)
  if (height > viewport.height) {
    await page.setViewport({ ...viewport, height })
    await new Promise(r => setTimeout(r, 900))
  }
  await page.evaluate(() =>
    document.getAnimations().forEach(animation => {
      if (Number.isFinite(animation.effect?.getComputedTiming().endTime)) animation.finish()
    }),
  )
  return viewport
}
const capture = async (page, path) => {
  const viewport = await settle(page)
  await page.screenshot({ path, fullPage: true })
  await page.setViewport(viewport)
}
const addPhoto = page =>
  page.evaluate(async () => {
    // Synthetic "flooded street" photo drawn in the page, so no real image is used.
    const canvas = Object.assign(document.createElement('canvas'), { width: 800, height: 520 })
    const g = canvas.getContext('2d')
    g.fillStyle = '#9fb7c9'
    g.fillRect(0, 0, 800, 260)
    g.fillStyle = '#6b6f52'
    g.fillRect(0, 230, 800, 60)
    g.fillStyle = '#7d6a47'
    g.fillRect(0, 290, 800, 230)
    g.fillStyle = 'rgba(90,120,135,.75)'
    g.fillRect(0, 330, 800, 190)
    const blob = await new Promise(done => canvas.toBlob(done, 'image/jpeg', 0.85))
    const input = document.querySelector('input[capture]')
    const files = new DataTransfer()
    files.items.add(new File([blob], 'flooded-street.jpg', { type: 'image/jpeg' }))
    input.files = files.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
const FLOWS = {
  'report-flow': async (page, shot) => {
    await page.goto(new URL('report', base).href, { waitUntil: 'networkidle0' })
    await shot('1-empty')
    await addPhoto(page)
    await new Promise(r => setTimeout(r, 900))
    await shot('2-photo')
    await click(page, 'Next')
    // Headless GPS is unreliable, so type the synthetic point; the map still shows the pin.
    await click(page, 'Enter coordinates manually')
    await page.type('input[placeholder="14.326900"]', '14.3294')
    await page.type('input[placeholder="120.936400"]', '120.9367')
    await click(page, 'Adjust pin on map')
    await new Promise(r => setTimeout(r, 1500))
    await shot('3-location')
    await click(page, 'Next')
    await click(page, 'Flooding')
    await new Promise(r => setTimeout(r, 400))
    await shot('4-details')
    await click(page, 'Next')
    await new Promise(r => setTimeout(r, 400))
    await shot('5-review')
    // If the local AI filled anything in, the resident has to confirm it before sending.
    if (await page.$('input[type=checkbox]')) await page.click('input[type=checkbox]')
    await click(page, 'Submit report')
    await new Promise(r => setTimeout(r, 1200))
    // The seeded resident already has an open flood report nearby, so the "already reported" sheet opens.
    if (await page.$('::-p-text(different problem)')) {
      await shot('6-already-reported')
      await click(page, 'different problem')
      await new Promise(r => setTimeout(r, 1200))
    }
    await shot('7-sent')
  },
  // The warning for a pin outside every barangay (a synthetic point). No submit.
  'report-outside': async (page, shot) => {
    await page.goto(new URL('report', base).href, { waitUntil: 'networkidle0' })
    await addPhoto(page)
    await new Promise(r => setTimeout(r, 900))
    await click(page, 'Next')
    await click(page, 'Enter coordinates manually')
    await page.type('input[placeholder="14.326900"]', '14.3541')
    await page.type('input[placeholder="120.936400"]', '120.9196')
    await click(page, 'Adjust pin on map')
    await new Promise(r => setTimeout(r, 1800))
    await shot('1-location')
  },
  // The Review step when location came from the phone (a synthetic fix), so the auto-fill check shows. No submit.
  'report-autofill': async (page, shot) => {
    await context.overridePermissions(new URL(base).origin, ['geolocation'])
    await page.setGeolocation({ latitude: 14.3294, longitude: 120.9367 })
    await page.goto(new URL('report', base).href, { waitUntil: 'networkidle0' })
    await addPhoto(page)
    await new Promise(r => setTimeout(r, 1500))
    await click(page, 'Next')
    await new Promise(r => setTimeout(r, 600))
    await shot('1-location')
    await click(page, 'Next')
    await click(page, 'Flooding')
    await click(page, 'Next')
    await new Promise(r => setTimeout(r, 400))
    await shot('2-review')
    await page.click('input[type=checkbox]')
    await new Promise(r => setTimeout(r, 200))
    await shot('3-confirmed')
  },
}

let failures = 0
for (const route of routes.filter(route => FLOWS[route])) {
  for (const w of widths) {
    const page = await context.newPage()
    await page.setViewport({ width: w, height: HEIGHT[w] ?? 900, isMobile: w <= TOUCH_MAX, hasTouch: w <= TOUCH_MAX })
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }])
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', m => m.type() === 'error' && errors.push(m.text()))
    await FLOWS[route](page, async step => {
      const path = `${out}/${role}-${route}-${step}-${w}${suffix}.png`
      await capture(page, path)
      console.log(path)
    })
    if (errors.length) {
      failures++
      console.log(`  ERRORS: ${errors.join(' | ')}`)
    }
    await page.close()
  }
}
for (const route of routes.filter(route => !FLOWS[route])) {
  for (const w of widths) {
    const page = await context.newPage()
    const touch = w <= TOUCH_MAX
    await page.setViewport({
      width: w,
      height: HEIGHT[w] ?? 900,
      isMobile: touch,
      hasTouch: touch,
      deviceScaleFactor: 1,
    })
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }])
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    // Signed out, the app's session probe (/auth/me) is expected to return 401.
    const expected = text => role === 'none' && text.includes('status of 401')
    page.on('console', m => m.type() === 'error' && !expected(m.text()) && errors.push(m.text()))
    await page.goto(route === 'home' ? base : new URL(route, base).href, { waitUntil: 'networkidle0', timeout: 60_000 })
    await new Promise(r => setTimeout(r, 2000)) // map tiles, photos and chart animations settle
    const name = `${role}-${route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}-${w}${suffix}.png`
    await capture(page, `${out}/${name}`)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    if (errors.length || overflow) failures++
    console.log(
      `${out}/${name}${overflow ? '  HORIZONTAL OVERFLOW' : ''}${errors.length ? `  ERRORS: ${errors.join(' | ')}` : ''}`,
    )
    await page.close()
  }
}
await browser.close()
process.exit(failures ? 1 : 0)
