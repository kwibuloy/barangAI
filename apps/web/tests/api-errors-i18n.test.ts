import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { filipino } from '../src/lib/i18n'

// A static scan of the API: every sentence a resident or staff member can be shown as an error needs a Filipino entry,
// because lib/api.ts shows `detail` and every screen runs it through useText.
const API = resolve(__dirname, '../../api/barangai')
const STRING = String.raw`f?(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')`
const python = readdirSync(API)
  .filter(name => name.endsWith('.py'))
  .map(name => ({ name, source: readFileSync(resolve(API, name), 'utf8') }))

/** The call's arguments, up to its closing bracket. */
function argumentsAt(source: string, start: number) {
  let depth = 1
  let at = start
  let quote = ''
  for (; at < source.length && depth > 0; at += 1) {
    const char = source[at]
    if (quote) {
      if (char === '\\') at += 1
      else if (char === quote) quote = ''
    } else if (char === '"' || char === "'") quote = char
    else if (char === '(') depth += 1
    else if (char === ')') depth -= 1
  }
  return source.slice(start, at - 1)
}

const decode = (literal: string) => {
  const body = literal.replace(/^f/, '').slice(1, -1)
  return body.replace(/\\(.)/g, '$1')
}

/** The errors raised through a variable, named here so the scan can follow them: `problem`, `check`, `message`. */
const VARIABLE_DETAILS = /raise (?:Starlette)?HTTPException\(\s*\d+\s*,\s*(problem|check|message)\s*\)/
/** Where those variables get their sentences. A sentence added to one of these is scanned like any other. */
const SENTENCE_SOURCES: Record<string, RegExp[]> = {
  'auth.py': [/def password_problem[\s\S]*?(?=\ndef |\n@)/],
  'barangays.py': [],
  'cases.py': [/def link_problem[\s\S]*?(?=\ndef |\n@)/, /"message":\s*"[^"]*"/],
  'reports.py': [],
}
/** Text that only ever goes to a person at a terminal or into logs; never a screen. */
const NOT_SHOWN = new Set<string>()

function detailStrings() {
  const found = new Set<string>()
  for (const { name, source } of python) {
    for (const call of source.matchAll(/\b(?:HTTPException|StorageRequestUncertain|error)\(/g)) {
      const args = argumentsAt(source, call.index + call[0].length)
      const comma = args.indexOf(',')
      if (comma < 0 || !/^\s*[\w. ]*\d*[\w. ]*\s*$/.test(args.slice(0, comma))) continue
      for (const literal of args.slice(comma + 1).matchAll(new RegExp(STRING, 'g'))) {
        // f-strings would need an entry per value; none may reach a screen.
        expect(literal[0].startsWith('f'), `${name}: an f-string error can't be translated: ${literal[0]}`).toBe(false)
        found.add(decode(literal[0]))
      }
    }
    // Limits name their own sentence: within_daily_cap(..., message="...").
    for (const pattern of [...(SENTENCE_SOURCES[name] ?? []), /\bmessage="[^"]*"/]) {
      for (const block of source.replace(/"""[\s\S]*?"""/g, '').matchAll(new RegExp(pattern, 'g'))) {
        for (const literal of block[0].matchAll(new RegExp(STRING, 'g'))) {
          const text = decode(literal[0])
          // Keys and identifiers aren't sentences.
          if (/\s/.test(text) && /^[A-Z]/.test(text)) found.add(text)
        }
      }
    }
  }
  return [...found].filter(text => !NOT_SHOWN.has(text))
}

it('finds what the API can answer with', () => {
  const details = detailStrings()
  expect(details.length).toBeGreaterThan(60)
  expect(details).toContain('Report not found')
  expect(details).toContain('This report is closed')
  expect(details).toContain('These reports are far apart or in different categories. Confirm to group them anyway.')
})

it('has a Filipino entry for every error the API can answer with', () => {
  expect(detailStrings().filter(text => !filipino[text])).toEqual([])
})

it('follows every error raised through a variable, so none slips past the scan', () => {
  for (const { name, source } of python) {
    const raised = source.match(new RegExp(VARIABLE_DETAILS, 'g')) ?? []
    if (raised.length) expect(SENTENCE_SOURCES[name], `${name} raises through a variable`).toBeDefined()
    const unknown = source.match(/raise HTTPException\(\s*\d+\s*,\s*(?!problem\b|check\b|message\b)[a-z_]+\s*\)/g)
    expect(unknown, `${name}: add this variable to the scan`).toBeNull()
  }
})
