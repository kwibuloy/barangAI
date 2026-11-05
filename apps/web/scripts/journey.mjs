// One whole journey in a real browser, on a real server with a throwaway database: a resident reports with a synthetic
// photo, staff work it to Resolved, the resident sees the note and points, spends them, asks for deletion, staff approve.
//   node scripts/journey.mjs [--no-build]       (from apps/web; PYTHON, CHROME_PATH and CHROME_NO_SANDBOX=1 are read)
// Prints PASS or FAIL per step and exits non-zero on failure. Everything it creates goes in a temp folder, removed after.
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const web = fileURLToPath(new URL('..', import.meta.url))
const repo = resolve(web, '../..')
const api = join(repo, 'apps/api')
const dist = join(web, 'dist')
const python =
  process.env.PYTHON ??
  [join(repo, '.venv/Scripts/python.exe'), join(repo, '.venv/bin/python')].find(existsSync) ??
  'python'
const chrome = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find(path => path && existsSync(path))
if (!chrome) throw new Error('No Chrome or Edge found; set CHROME_PATH.')

const PIN = { latitude: '14.3294', longitude: '120.9367' } // Synthetic point inside Dasmariñas.
// 25 when accepted and 10 when resolved. Deleting takes both back; only what is left can go, never below zero.
const POINTS = { reward: 20, afterResolved: 35, afterSpending: 15, afterDeleting: 0 }
const NOTES = {
  'Start verification': 'Synthetic note: checking the photo.',
  'Accept report': 'Synthetic note: confirmed on the street.',
  'Mark in progress': 'Synthetic note: crew assigned.',
  'Mark resolved': 'Synthetic note: water drained.',
}
const WAIT = 30_000
const sleep = ms => new Promise(done => setTimeout(done, ms))

const freePort = () =>
  new Promise(done => {
    const probe = createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => done(port))
    })
  })

/** The visible control whose words are exactly these, optionally inside the panel with this heading. */
async function press(page, text, within) {
  const control = await page.waitForFunction(
    (wanted, panel) => {
      const words = element => element.innerText.trim().replace(/\s+/g, ' ').toLowerCase()
      let scope = document
      if (panel) {
        const heading = [...document.querySelectorAll('h2,h3')].find(item => words(item) === panel.toLowerCase())
        if (!heading) return null
        scope = heading.parentElement
      }
      return [...scope.querySelectorAll('button,a,summary,label,[role=option]')].find(
        item => item.offsetParent !== null && !item.disabled && words(item) === wanted.toLowerCase(),
      )
    },
    { timeout: WAIT },
    text,
    within,
  )
  await control.asElement().click()
}
const sees = (page, text) =>
  page.waitForFunction(
    wanted => document.body.innerText.toLowerCase().includes(wanted.toLowerCase()),
    { timeout: WAIT },
    text,
  )
const gone = (page, text) =>
  page.waitForFunction(
    wanted => !document.body.innerText.toLowerCase().includes(wanted.toLowerCase()),
    { timeout: WAIT },
    text,
  )
const go = (page, base, path) => page.goto(new URL(path, base).href, { waitUntil: 'networkidle0', timeout: WAIT })
const askApi = (page, path) =>
  page.evaluate(
    target => fetch(`/api${target}`).then(async r => ({ status: r.status, body: await r.json().catch(() => null) })),
    path,
  )
const drawPhoto = page =>
  page.evaluate(async () => {
    const canvas = Object.assign(document.createElement('canvas'), { width: 800, height: 520 })
    const pen = canvas.getContext('2d')
    pen.fillStyle = '#9fb7c9'
    pen.fillRect(0, 0, 800, 260)
    pen.fillStyle = '#7d6a47'
    pen.fillRect(0, 260, 800, 260)
    pen.fillStyle = 'rgba(90,120,135,.75)'
    pen.fillRect(0, 330, 800, 190)
    const blob = await new Promise(done => canvas.toBlob(done, 'image/jpeg', 0.85))
    const input = document.querySelector('input[capture]')
    const files = new DataTransfer()
    files.items.add(new File([blob], 'synthetic-flood.jpg', { type: 'image/jpeg' }))
    input.files = files.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
const savedDrafts = page =>
  page.evaluate(
    () =>
      new Promise((done, fail) => {
        const open = indexedDB.open('barangai-drafts', 1)
        open.onsuccess = () => {
          const count = open.result.transaction('report-drafts').objectStore('report-drafts').count()
          count.onsuccess = () => done(count.result)
          count.onerror = () => fail(count.error)
        }
        open.onerror = () => fail(open.error)
      }),
  )

function expectThat(condition, message) {
  if (!condition) throw new Error(message)
}

const steps = []
const step = (name, run) => steps.push({ name, run })
const state = {}
const passwords = {
  resident: `journey-${randomBytes(9).toString('hex')}`,
  staff: `journey-${randomBytes(9).toString('hex')}`,
}
const RESIDENT = 'resident@journey.test'
const STAFF = 'staff@journey.test'

step('Server starts on a throwaway database with the built site', async () => {
  await fetch(new URL('api/legal/operator', state.base)).then(r => expectThat(r.ok, `operator ${r.status}`))
  const shell = await fetch(state.base).then(r => r.text())
  expectThat(shell.includes('<div id="root"'), 'The site is not being served')
})

step('Resident registers through the form', async () => {
  const page = state.resident
  await go(page, state.base, '/')
  await press(page, 'New here? Create an account')
  await page.type('input[type=email]', RESIDENT)
  await page.type('input[autocomplete="new-password"]', passwords.resident)
  await page.click('form input[type=checkbox]')
  await press(page, 'Create account')
  await page.waitForSelector('a[href="/report"]', { timeout: WAIT })
  expectThat((await askApi(page, '/auth/me')).body.role === 'resident', 'Not signed in as a resident')
})

step('An unfinished report survives switching tabs and reloading', async () => {
  const page = state.resident
  await press(page, 'Report')
  await page.waitForSelector('input[capture]', { timeout: WAIT })
  await drawPhoto(page)
  await press(page, 'Next')
  await press(page, 'Enter coordinates manually')
  await page.type('input[placeholder="14.326900"]', PIN.latitude)
  await page.type('input[placeholder="120.936400"]', PIN.longitude)
  await sees(page, 'Location set')
  await sleep(600)
  await press(page, 'Home')
  await press(page, 'Report')
  await sees(page, 'Continue your report?')
  await press(page, 'Continue')
  await sees(page, 'Location set')
  await page.reload({ waitUntil: 'networkidle0' })
  await sees(page, 'Continue your report?')
  await press(page, 'Continue')
  await sees(page, 'Location set')
})

step('Resident submits the report with its photo', async () => {
  const page = state.resident
  await press(page, 'Next')
  await press(page, 'Flooding')
  await press(page, 'Next')
  const tick = await page.$('input[type=checkbox]')
  if (tick) await tick.click()
  await press(page, 'Submit report')
  await sees(page, 'Report sent')
  const link = await page.waitForSelector('a[href^="/reports/"]', { timeout: WAIT })
  state.report = (await link.evaluate(item => item.getAttribute('href'))).split('/').pop()
  const photo = await page.evaluate(id => fetch(`/api/reports/${id}/image`).then(r => r.status), state.report)
  expectThat(photo === 200, `Photo answered ${photo}`)
  await sleep(500)
  expectThat((await savedDrafts(page)) === 0, 'The draft was not wiped after sending')
})

step('Staff sign in and work it to Resolved through the screen, with a note at each step', async () => {
  const page = state.staff
  await go(page, state.base, '/')
  await page.type('input[type=email]', STAFF)
  await page.type('input[autocomplete="current-password"]', passwords.staff)
  await press(page, 'Sign in')
  await sees(page, 'Overview')
  await go(page, state.base, `/desk/reports/${state.report}`)
  const box = '::-p-xpath(//label[contains(., "Reason or description")]//textarea)'
  for (const [button, note] of Object.entries(NOTES)) {
    await (await page.waitForSelector(box, { timeout: WAIT })).type(note)
    await press(page, button, 'Change status')
    await gone(page, button)
  }
  const report = await askApi(page, `/reports/${state.report}`)
  expectThat(report.body.status === 'Resolved', `Status is ${report.body.status}`)
})

step('Resident sees the status, the latest note, what happens next and the points', async () => {
  const page = state.resident
  await go(page, state.base, `/reports/${state.report}`)
  await sees(page, 'Resolved')
  await sees(page, NOTES['Mark resolved'])
  await sees(page, 'What happens next')
  await sees(page, 'Still not fixed? Report it again')
  const text = await page.evaluate(() => document.body.innerText)
  expectThat(!text.includes(STAFF), 'The resident can see who the staff member is')
  const report = (await askApi(page, `/reports/${state.report}`)).body
  expectThat(
    report.events.every(event => !('actor_id' in event)),
    'The API gave the resident a staff ID',
  )
  await go(page, state.base, '/rewards')
  await sees(page, 'Your points')
  const balance = (await askApi(page, '/points')).body.balance
  expectThat(balance === POINTS.afterResolved, `Balance is ${balance}, expected ${POINTS.afterResolved}`)
  expectThat(
    new RegExp(`your points\\s+${balance}`, 'i').test(await page.evaluate(() => document.body.innerText)),
    'The screen does not show it',
  )
})

step('Resident redeems the seeded reward for a code', async () => {
  const page = state.resident
  await page.click('label button')
  await press(page, state.barangay)
  await sees(page, 'Synthetic certificate')
  await press(page, 'Redeem')
  await press(page, 'Spend the points')
  await press(page, 'My codes')
  const code = await page.waitForSelector('code', { timeout: WAIT })
  state.code = (await code.evaluate(item => item.textContent)).trim()
  expectThat(state.code.length >= 6, `Odd code: ${state.code}`)
  const balance = (await askApi(page, '/points')).body.balance
  expectThat(balance === POINTS.afterSpending, `Balance is ${balance}, expected ${POINTS.afterSpending}`)
})

step('Staff mark the code as used', async () => {
  const page = state.staff
  await go(page, state.base, '/desk/rewards')
  await page.waitForSelector('input[placeholder="Code"]', { timeout: WAIT })
  await page.type('input[placeholder="Code"]', state.code)
  await press(page, 'Mark as used')
  await sees(page, 'Marked as used')
})

step('Resident asks to delete the report', async () => {
  const page = state.resident
  await go(page, state.base, `/reports/${state.report}`)
  await press(page, 'Ask to delete this report')
  await press(page, 'Send request')
  await sees(page, 'You asked for this report to be deleted')
})

step('Staff approve the deletion', async () => {
  const page = state.staff
  await go(page, state.base, `/desk/reports/${state.report}`)
  await sees(page, 'The resident asked to delete this report')
  await press(page, 'Approve and delete')
  const asked = await page.evaluate(id => fetch(`/api/reports/${id}`).then(r => r.status), state.report)
  for (let tries = 0; tries < 40 && (await askApi(page, `/reports/${state.report}`)).status !== 404; tries += 1)
    await sleep(250)
  expectThat((await askApi(page, `/reports/${state.report}`)).status === 404, `The report answered ${asked}`)
})

step('The report is gone for the resident, and its points are taken back', async () => {
  const page = state.resident
  await go(page, state.base, '/reports')
  const listed = (await askApi(page, '/reports')).body
  expectThat(listed.length === 0, `${listed.length} reports still listed`)
  const balance = (await askApi(page, '/points')).body.balance
  expectThat(balance === POINTS.afterDeleting, `Balance is ${balance}, expected ${POINTS.afterDeleting}`)
  console.log(
    `      points: ${POINTS.afterResolved} earned, ${POINTS.reward} spent, ${balance} after the deletion (never below zero)`,
  )
})

step('With the server stopped, the offline strip appears within about 20 seconds', async () => {
  const page = state.resident
  await go(page, state.base, '/home')
  await stopServer()
  const stopped = Date.now()
  await sees(page, 'Offline')
  const seconds = Math.round((Date.now() - stopped) / 1000)
  console.log(`      after ${seconds} s`)
  expectThat(seconds <= 25, `Took ${seconds} s`)
})

let server
const stopServer = () =>
  new Promise(done => {
    if (!server || server.exitCode !== null || server.signalCode !== null) return done()
    server.once('exit', done)
    server.kill()
  })

function run(command, args, options) {
  const result = spawnSync(command, args, { encoding: 'utf8', shell: false, ...options })
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`)
  return result.stdout
}

const SEED = `
import json, os
from sqlalchemy import select
from barangai.barangays import barangay_id_for, import_boundaries
from barangai.bootstrap_staff import create_staff
from barangai.db import session_for_url
from barangai.models import Barangay, Reward, User

create_staff("admin@journey.test", os.environ["JOURNEY_STAFF_PASSWORD"], "administrator")
with open(os.environ["JOURNEY_BOUNDARIES"], encoding="utf-8") as source:
    import_boundaries(json.load(source))
with session_for_url() as db:
    place = db.get(Barangay, barangay_id_for(db, float(os.environ["JOURNEY_LAT"]), float(os.environ["JOURNEY_LNG"])))
    name = place.name
create_staff(os.environ["JOURNEY_STAFF"], os.environ["JOURNEY_STAFF_PASSWORD"], "staff", name)
with session_for_url() as db:
    staff = db.scalar(select(User).where(User.email == os.environ["JOURNEY_STAFF"]))
    db.add(Reward(barangay_id=staff.barangay_id, name="Synthetic certificate", points_cost=int(os.environ["JOURNEY_COST"]),
                  created_by=staff.id))
    db.commit()
print(name)
`

const scratch = mkdtempSync(join(tmpdir(), 'barangai-journey-'))
let failed = false
let browser
try {
  if (!process.argv.includes('--no-build'))
    run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { cwd: web, shell: true })
  const port = await freePort()
  state.base = `http://127.0.0.1:${port}/`
  const env = { ...process.env }
  for (const name of [
    'CLOUDFLARE_ACCOUNT_ID',
    'CLOUDFLARE_WORKERS_AI_TOKEN',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'MODEL_CHECKPOINT',
    'CHECKER_MODEL_DIR',
  ])
    delete env[name]
  Object.assign(env, {
    DATABASE_URL: `sqlite:///${join(scratch, 'journey.db').replaceAll('\\', '/')}`,
    PRIVATE_MEDIA_DIR: join(scratch, 'photos'),
    COOKIE_SECURE: 'false',
    MEDIA_STORAGE: 'local',
    STATIC_SITE_DIR: dist,
    GEOCODER: 'off',
    PYTHONPATH: api,
  })
  let output = ''
  server = spawn(
    python,
    [
      '-m',
      'uvicorn',
      'barangai.main:app',
      '--app-dir',
      api,
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--log-level',
      'warning',
    ],
    { env, cwd: scratch },
  )
  server.stdout.on('data', chunk => (output += chunk))
  server.stderr.on('data', chunk => (output += chunk))
  for (let tries = 0; ; tries += 1) {
    const up = await fetch(new URL('api/legal/operator', state.base)).then(
      r => r.ok,
      () => false,
    )
    if (up) break
    if (server.exitCode !== null || tries > 120) throw new Error(`The server did not start:\n${output}`)
    await sleep(500)
  }
  state.barangay = run(python, ['-c', SEED], {
    cwd: scratch,
    env: {
      ...env,
      JOURNEY_BOUNDARIES: join(api, 'data/dasmarinas-barangays.geojson'),
      JOURNEY_LAT: PIN.latitude,
      JOURNEY_LNG: PIN.longitude,
      JOURNEY_STAFF: STAFF,
      JOURNEY_STAFF_PASSWORD: passwords.staff,
      JOURNEY_COST: String(POINTS.reward),
    },
  }).trim()

  browser = await puppeteer.launch({
    executablePath: chrome,
    args: process.env.CHROME_NO_SANDBOX ? ['--no-sandbox'] : [],
  })
  const problems = []
  const open = async (who, viewport) => {
    const context = await browser.createBrowserContext()
    const page = await context.newPage()
    await page.setViewport(viewport)
    page.on('pageerror', error => problems.push(`${who}: ${error.message}`))
    state[who] = page
  }
  await open('resident', { width: 390, height: 844, isMobile: true, hasTouch: true })
  await open('staff', { width: 1440, height: 900 })

  for (const { name, run: body } of steps) {
    if (failed) {
      console.log(`SKIP  ${name}`)
      continue
    }
    try {
      await body()
      console.log(`PASS  ${name}`)
    } catch (error) {
      failed = true
      console.log(`FAIL  ${name}\n      ${error.message}`)
      if (process.env.JOURNEY_SHOTS) {
        for (const who of ['resident', 'staff'])
          await state[who]
            .screenshot({ path: join(process.env.JOURNEY_SHOTS, `journey-failed-${who}.png`) })
            .catch(() => {})
      }
      if (output.trim()) console.log(output.slice(-2000))
    }
  }
  if (problems.length) {
    failed = true
    console.log(`FAIL  No uncaught errors in the page\n      ${problems.join('\n      ')}`)
  } else console.log('PASS  No uncaught errors in the page')
} catch (error) {
  failed = true
  console.log(`FAIL  Setting up\n      ${error.message}`)
} finally {
  await browser?.close().catch(() => {})
  await stopServer()
  // Windows holds the database's files for a moment after the server exits.
  for (let tries = 0; tries < 10 && existsSync(scratch); tries += 1) {
    try {
      rmSync(scratch, { recursive: true, force: true })
    } catch {
      await sleep(500)
    }
  }
}
process.exit(failed ? 1 : 0)
