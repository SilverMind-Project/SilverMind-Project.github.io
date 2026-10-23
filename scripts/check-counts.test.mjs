import { describe, expect, it } from 'vitest'

import { checkText, toNumber } from './check-counts.mjs'

const vocab = { mcp_tools: ['a', 'b', 'c'], step_types: [{}, {}] }

describe('check-counts', () => {
  it('passes a marked count that matches the vocabulary', () => {
    expect(checkText('exposes <!-- count:mcp_tools -->3 tools', 'p.md', vocab)).toEqual([])
  })

  it('fails a marked count that disagrees with the vocabulary', () => {
    const problems = checkText('exposes <!-- count:mcp_tools -->61 tools', 'p.md', vocab)
    expect(problems).toEqual(['p.md:1: count:mcp_tools says 61, the code has 3'])
  })

  it('fails a count phrase that carries no marker', () => {
    const problems = checkText('a 3-tool server', 'p.md', vocab)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('unmarked count "3-tool"')
  })

  it('accepts number words and the count:none subset marker', () => {
    expect(checkText('<!-- count:step_types -->Two step types', 'p.md', vocab)).toEqual([])
    expect(checkText('through <!-- count:none -->two notification channels', 'p.md', vocab)).toEqual([])
  })

  it('fails an unknown count key', () => {
    expect(checkText('<!-- count:widgets -->4 tools', 'p.md', vocab)[0]).toContain('unknown count key')
  })

  it('skips fenced code blocks but keeps line numbers', () => {
    const text = '```mermaid\nA["(24 step types)"]\n```\n9 tools'
    expect(checkText(text, 'p.md', vocab)).toEqual([
      'p.md:4: unmarked count "9 tools"; add <!-- count:KEY --> before the number',
    ])
  })

  it('reads digits and words', () => {
    expect(toNumber('61')).toBe(61)
    expect(toNumber('Nine')).toBe(9)
  })
})
