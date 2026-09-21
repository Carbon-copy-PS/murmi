// Server-render the real component against a generated synthetic snapshot.
import { build } from '../frontend/node_modules/esbuild/lib/main.js'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const source = `
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import FinalReportPage from './src/components/final-report/FinalReportPage.jsx'
import fs from 'node:fs'
import assert from 'node:assert/strict'
globalThis.window = { matchMedia: () => ({ matches: false }) }
const report = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
// Canvas textures are browser-only; keep group positions and all vote evidence.
for (const group of report.opinionLandscape.groups || []) group.density = null
const extra = { title: 'SHOULD_NOT_RENDER', explanation: 'Removed section', evidenceStatementIds: ['fixture-s0'] }
report.narrative.zh.principles = [extra]
report.narrative.zh.actionAreas = [extra]
let html = renderToStaticMarkup(<FinalReportPage report={report} preview />)
assert.equal((html.match(/id="report-statement-/g) || []).length, report.evidence.statements.length)
assert.ok(html.includes('story-section story-all-statements'))
assert.ok(!html.includes('<details class="story-all-statements"'))
assert.ok(!html.includes('SHOULD_NOT_RENDER'))
assert.ok(!html.includes('story-overlap-section'))
assert.ok(html.includes('story-coverage-section'))
const profilesIndex = html.indexOf('opinion-group-cards')
const comparisonIndex = html.indexOf('data-testid="group-differences"')
assert.ok(profilesIndex >= 0 && comparisonIndex > profilesIndex)
assert.ok(html.includes('多數反對') && html.includes('中立最多') && html.includes('意見分歧'))
assert.ok(!html.includes('攤開重疊的圓點') && !html.includes('顯示組別主題'))
// Missing AI output must still leave a complete, readable report.
delete report.narrative
html = renderToStaticMarkup(<FinalReportPage report={report} preview />)
assert.equal((html.match(/id="report-statement-/g) || []).length, report.evidence.statements.length)
assert.ok(html.includes('story-coverage-section'))
assert.ok(!html.includes('story-overlap-section'))
console.log('Report render checks passed: complete statements, concise sections, profiles, coverage, and AI fallback.')
`
const result = await build({ stdin: { contents: source, resolveDir: path.resolve('frontend'), loader: 'jsx' }, bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', loader: { '.css': 'empty' }, write: false })
const directory = await mkdtemp(path.join(tmpdir(), 'murmi-report-render-'))
try {
  const script = path.join(directory, 'check.cjs')
  await writeFile(script, result.outputFiles[0].text)
  execFileSync(process.execPath, [script, path.resolve(process.argv[2] || 'outputs/local-report-preview.json')], { stdio: 'inherit' })
} finally { await rm(directory, { recursive: true, force: true }) }
