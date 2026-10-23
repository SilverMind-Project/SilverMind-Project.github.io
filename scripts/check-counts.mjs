#!/usr/bin/env node
// Public counts (MCP tools, pipeline step types, channels, filters, CTS signal kinds) must match
// the code. A page marks a count with an HTML comment immediately before the number:
//
//   <!-- count:mcp_tools -->61 tools
//
// The number (digits or an English number word) is compared with the length of the named list
// in cognitive-companion's generated frontend/src/generated/vocabularies.json, read from the CC
// main branch on GitHub (or from --vocab <path> / CC_VOCABULARIES for a local run). A phrase
// that states a count without a marker also fails, so a new page cannot add an unchecked number;
// a deliberate subset ("two notification channels") is marked <!-- count:none --> instead.
// Fenced code blocks (mermaid diagrams) are skipped.
//
// Exit codes: 0 ok, 1 mismatch or unmarked count, 2 vocabulary unavailable. In CI (CI=true) a
// fetch failure is fatal; locally it is a warning and the check is skipped.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const VOCAB_URL =
  'https://raw.githubusercontent.com/SilverMind-Project/cognitive-companion/main/frontend/src/generated/vocabularies.json'

const WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20,
}
const NUMBER = `(\\d+|${Object.keys(WORDS).join('|')})`
const MARKED = new RegExp(`<!--\\s*count:([a-z_]+)\\s*-->\\s*${NUMBER}\\b`, 'gi')

// Phrases that state a count of something the vocabulary lists. Each must carry a marker.
const COUNT_PHRASES = [
  new RegExp(`\\b${NUMBER}[ -](?:MCP )?tools?\\b`, 'gi'),
  new RegExp(`\\b${NUMBER} (?:pipeline )?step types\\b`, 'gi'),
  new RegExp(`\\b${NUMBER} (?:notification |delivery )?channels\\b`, 'gi'),
  new RegExp(`\\b${NUMBER} (?:(?:behavioral|dementia) signals|signal kinds)\\b`, 'gi'),
]

export function toNumber(token) {
  return /^\d+$/.test(token) ? Number(token) : WORDS[token.toLowerCase()]
}

function stripFences(text) {
  // Replace fenced blocks with blank lines so line numbers stay correct.
  return text.replace(/^```[\s\S]*?^```/gm, (block) => block.replace(/[^\n]/g, ''))
}

export function checkText(text, file, vocab) {
  const problems = []
  const lines = stripFences(text).split('\n')
  lines.forEach((line, i) => {
    const marked = new Set()
    for (const m of line.matchAll(MARKED)) {
      const [, key, token] = m
      marked.add(m.index + m[0].length - token.length)
      if (key === 'none') continue
      const list = vocab[key]
      if (!Array.isArray(list) && (list === null || typeof list !== 'object')) {
        problems.push(`${file}:${i + 1}: unknown count key "${key}" (not in vocabularies.json)`)
        continue
      }
      const expected = Array.isArray(list) ? list.length : Object.keys(list).length
      if (toNumber(token) !== expected) {
        problems.push(`${file}:${i + 1}: count:${key} says ${token}, the code has ${expected}`)
      }
    }
    for (const re of COUNT_PHRASES) {
      for (const m of line.matchAll(re)) {
        if (!marked.has(m.index)) {
          problems.push(`${file}:${i + 1}: unmarked count "${m[0]}"; add <!-- count:KEY --> before the number`)
        }
      }
    }
  })
  return problems
}

function markdownFiles(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...markdownFiles(path))
    else if (name.endsWith('.md')) out.push(path)
  }
  return out
}

async function loadVocab(args) {
  const i = args.indexOf('--vocab')
  const local = i >= 0 ? args[i + 1] : process.env.CC_VOCABULARIES
  if (local) return JSON.parse(readFileSync(local, 'utf8'))
  let lastError
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(VOCAB_URL)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (err) {
      lastError = err
    }
  }
  throw lastError
}

async function main() {
  const args = process.argv.slice(2)
  let vocab
  try {
    vocab = await loadVocab(args)
  } catch (err) {
    const msg = `check-counts: cannot read vocabularies.json (${err.message})`
    if (process.env.CI) {
      console.error(msg)
      process.exit(2)
    }
    console.warn(`${msg}; skipped locally`)
    return
  }
  if (!Array.isArray(vocab.mcp_tools)) {
    console.error(
      'check-counts: vocabularies.json has no "mcp_tools" list. Push cognitive-companion (with the ' +
        'mcp_tools export) to main first, or pass --vocab <path>.',
    )
    process.exit(2)
  }
  const root = new URL('..', import.meta.url).pathname
  const problems = markdownFiles(join(root, 'docs')).flatMap((f) =>
    checkText(readFileSync(f, 'utf8'), relative(root, f), vocab),
  )
  if (problems.length) {
    console.error(`check-counts: ${problems.length} problem(s)`)
    for (const p of problems) console.error(`  ${p}`)
    process.exit(1)
  }
  console.log('check-counts: every marked count matches the code')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main()
}
