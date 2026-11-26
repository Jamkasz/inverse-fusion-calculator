import { describe, expect, it } from 'vitest'

// Load the license files as raw strings, the same way tests/vendor.test.ts
// loads the vendored reference files.
const rawFiles = import.meta.glob(
  ['../LICENSE', '../NOTICE', '../public/LICENSE', '../public/NOTICE'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>

function rawFile(relativePath: string): string | undefined {
  return rawFiles[relativePath]
}

describe('license files', () => {
  it('root LICENSE and NOTICE exist and are non-empty', () => {
    expect((rawFile('../LICENSE') ?? '').length).toBeGreaterThan(0)
    expect((rawFile('../NOTICE') ?? '').length).toBeGreaterThan(0)
  })

  it('public/LICENSE and public/NOTICE are byte-identical copies of the root files', () => {
    expect(rawFile('../public/LICENSE')).toBe(rawFile('../LICENSE'))
    expect(rawFile('../public/NOTICE')).toBe(rawFile('../NOTICE'))
  })

  it('root LICENSE is the canonical Apache-2.0 text', () => {
    const license = rawFile('../LICENSE') ?? ''

    expect(license).toContain('Copyright [yyyy] [name of copyright owner]')
    expect(license).toContain('END OF TERMS AND CONDITIONS')
  })

  it('root NOTICE names our copyright', () => {
    expect(rawFile('../NOTICE') ?? '').toContain('Copyright 2026 Jamkasz')
  })
})
