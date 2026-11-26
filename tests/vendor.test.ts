import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import App, {
  PINNED_COMMIT,
  REFERENCE_COMMIT_URL,
  REFERENCE_SITE_URL,
} from '../src/ui/App'

/**
 * Every file Task 1 must vendor from the pinned upstream commit.
 * Paths are relative to vendor/reference/.
 */
const EXPECTED_FILES = [
  'data/PersonaDataRoyal.ts',
  'data/PersonaDataRoyal.js',
  'data/SkillDataRoyal.ts',
  'data/SkillDataRoyal.js',
  'data/Data5Royal.ts',
  'data/Data5Royal.js',
  'src/FusionCalculator.ts',
  'src/FusionCalculator.js',
  'src/DataUtil.ts',
  'src/DataUtil.js',
  'indexRoyal.html',
  'view/skill.html',
  'view/persona.html',
  'LICENSE',
] as const

// Load the vendored files as raw strings. Vite resolves these at test time;
// a missing file simply has no key, which the first test reports.
const rawFiles = import.meta.glob('../vendor/reference/**/*', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

function rawFile(relativePath: string): string | undefined {
  return rawFiles[`../vendor/reference/${relativePath}`]
}

describe('vendored reference files', () => {
  it('contains every expected file and each one is non-empty', () => {
    const missing: string[] = []
    const empty: string[] = []

    for (const relativePath of EXPECTED_FILES) {
      const content = rawFile(relativePath)
      if (content === undefined) {
        missing.push(relativePath)
      } else if (content.length === 0) {
        empty.push(relativePath)
      }
    }

    expect({ missing, empty }).toEqual({ missing: [], empty: [] })
  })

  it('records the pinned commit in PINNED_SHA', () => {
    const sha = rawFile('PINNED_SHA')?.trim()

    expect(sha).toMatch(/^[0-9a-f]{40}$/)
    expect(sha).toBe(PINNED_COMMIT)
    expect(PINNED_COMMIT).toBe('802422dad1f5b9eee441e594e738aceaeb9e5a85')
  })

  it('contains the persona map in PersonaDataRoyal.js', () => {
    expect(rawFile('data/PersonaDataRoyal.js')).toContain('personaMapRoyal')
  })

  it('contains the expected content markers (not an error page or truncation)', () => {
    const markers: Array<[file: string, marker: string | RegExp]> = [
      ['data/PersonaDataRoyal.js', 'personaMapRoyal'],
      ['data/SkillDataRoyal.js', 'skillMapRoyal'],
      ['data/Data5Royal.js', 'specialCombosRoyal'],
      ['data/Data5Royal.js', 'inheritanceChartRoyal'],
      ['indexRoyal.html', /<!DOCTYPE/i],
      ['LICENSE', 'Apache License'],
    ]

    for (const [file, marker] of markers) {
      expect(rawFile(file) ?? '').toMatch(marker)
    }
  })
})

describe('App', () => {
  it('renders the app title and the reference-site link', () => {
    render(createElement(App))

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Inverse Fusion Calculator',
      }),
    ).toBeInTheDocument()

    const referenceLink = screen.getByRole('link', {
      name: 'Persona 5 fusion calculator',
    })

    expect(referenceLink).toHaveAttribute('href', REFERENCE_SITE_URL)
    expect(referenceLink).toHaveAttribute(
      'href',
      'https://chinhodado.github.io/persona5_calculator/indexRoyal.html',
    )
  })

  it('links to the pinned upstream commit and shows its short SHA', () => {
    render(createElement(App))

    const commitLink = screen.getByRole('link', { name: '802422d' })

    expect(commitLink).toHaveAttribute('href', REFERENCE_COMMIT_URL)
    expect(commitLink).toHaveAttribute(
      'href',
      'https://github.com/chinhodado/persona5_calculator/commit/802422dad1f5b9eee441e594e738aceaeb9e5a85',
    )
    expect(screen.getByText('802422d')).toBeInTheDocument()
  })
})
