#!/usr/bin/env node
// Downloads the pinned reference files from chinhodado/persona5_calculator
// into vendor/reference/, preserving their repository-relative paths.
//
// Usage: npm run fetch
//
// Requirements: Node 22.13+ (global fetch). If global fetch is unavailable the
// script falls back to the node:https module. No shell syntax is used, so it
// works on Windows, macOS and Linux.

import { mkdir, writeFile } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import https from 'node:https'

/** Pinned upstream commit. Do not change without re-vendoring and updating NOTICE. */
export const SHA = '802422dad1f5b9eee441e594e738aceaeb9e5a85'

const REPO = 'chinhodado/persona5_calculator'
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/${SHA}/`

/** Repository paths to vendor, relative to the upstream repo root. */
export const REFERENCE_FILES = [
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
]

const scriptDir = dirname(fileURLToPath(import.meta.url))
const vendorDir = join(scriptDir, '..', 'vendor', 'reference')

/**
 * Fetch a URL into a Buffer.
 * @param {string} url
 * @returns {Promise<Buffer>}
 */
async function download(url) {
  if (typeof fetch === 'function') {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`)
    }
    return Buffer.from(await response.arrayBuffer())
  }

  return await new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        const status = response.statusCode ?? 0
        if (status !== 200) {
          response.resume()
          reject(new Error(`HTTP ${status}`))
          return
        }
        /** @type {Buffer[]} */
        const chunks = []
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
        response.on('end', () => resolve(Buffer.concat(chunks)))
        response.on('error', reject)
      })
      .on('error', reject)
  })
}

async function main() {
  console.log(`Fetching ${REFERENCE_FILES.length} files from`)
  console.log(`  https://github.com/${REPO}/tree/${SHA}`)
  console.log(`into ${vendorDir}\n`)

  /** @type {string[]} */
  const failures = []

  for (const relativePath of REFERENCE_FILES) {
    const url = RAW_BASE + relativePath
    const destination = join(vendorDir, relativePath)

    try {
      const body = await download(url)
      if (body.byteLength === 0) {
        throw new Error('downloaded body is empty')
      }

      await mkdir(dirname(destination), { recursive: true })
      await writeFile(destination, body)
      console.log(`  ok    ${relativePath} (${body.byteLength} bytes)`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failures.push(relativePath)
      console.error(`  FAIL  ${relativePath}: ${message}`)
    }
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} download(s) failed:`)
    for (const file of failures) {
      console.error(`  - ${file}`)
    }
    process.exitCode = 1
    return
  }

  await writeFile(join(vendorDir, 'PINNED_SHA'), `${SHA}\n`, 'utf8')
  console.log(`\nWrote PINNED_SHA (${SHA})`)
  console.log(`All ${REFERENCE_FILES.length} reference files fetched successfully.`)
}

// Only run when executed directly (e.g. `npm run fetch`). Importing this module
// for SHA / REFERENCE_FILES must not perform any network I/O.
//
// Compare realpaths rather than raw paths: on Windows the working directory may
// be under a OneDrive/junction redirect, where process.argv[1] (the path as
// invoked) and import.meta.url (already resolved) can differ.
function isDirectInvocation() {
  if (!process.argv[1]) return false

  try {
    return (
      realpathSync(process.argv[1]) ===
      realpathSync(fileURLToPath(import.meta.url))
    )
  } catch {
    return false
  }
}

if (isDirectInvocation()) {
  await main()
}
