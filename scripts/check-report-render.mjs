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
import { originalSessionPath, reportTranscriptText } from './src/components/final-report/ReportTranscript.jsx'
import fs from 'node:fs'
import assert from 'node:assert/strict'
globalThis.window = { matchMedia: () => ({ matches: false }) }
const report = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
// Canvas textures are browser-only; keep group positions and all vote evidence.
for (const group of report.opinionLandscape.groups || []) group.density = null
const extra = { title: 'SHOULD_NOT_RENDER', explanation: 'Removed section', evidenceStatementIds: ['fixture-s0'] }
const language = report.sourceLanguage
const isTraffic = report.evidence.statements.some(s => s.id === 'traffic-s8')
report.narrative[language].principles = [extra]
report.narrative[language].actionAreas = [extra]
let html = renderToStaticMarkup(<FinalReportPage report={report} preview />)
const restoredProfiles = structuredClone(report);
delete restoredProfiles.opinionLandscape.themes.generatedAt;
restoredProfiles.opinionLandscape.themes.status = 'ready';
const restoredHtml = renderToStaticMarkup(<FinalReportPage report={restoredProfiles} preview />);
assert.ok(!restoredHtml.includes('There is not yet enough evidence for a clear shared theme.'));
assert.ok(!restoredHtml.includes('投票不足，尚無明確主題。'));
if (isTraffic) {
  const proposalIndex = html.indexOf('story-proposal-section');
  assert.ok(proposalIndex > html.indexOf('story-opening'));
  assert.ok(proposalIndex < html.indexOf('story-opinion-section'));
  assert.ok(html.includes('Common ground'));
  assert.ok(html.includes('Approved as final'));
  assert.ok(html.indexOf('story-analysis-heading') > proposalIndex);
  assert.ok(html.indexOf('story-analysis-heading') < html.indexOf('story-opinion-section'));
  assert.ok(html.includes(report.commonGroundProposal.groupStatement));
  assert.ok(html.includes('48 of 54 respondents agreed'));
  assert.ok(html.includes('54 of 60 participants responded'));
  const draft = structuredClone(report);
  draft.commonGroundProposal.status = 'working_draft';
  delete draft.commonGroundProposal.endorsement;
  const draftHtml = renderToStaticMarkup(<FinalReportPage report={draft} preview />);
  assert.ok(draftHtml.includes('Draft · not yet approved'));
  assert.ok(!draftHtml.includes('Approved as final'));
  draft.commonGroundProposal.votes = {};
  const noReactionsHtml = renderToStaticMarkup(<FinalReportPage report={draft} preview />);
  assert.ok(noReactionsHtml.includes('Draft · not yet approved'));
  assert.ok(!noReactionsHtml.includes('story-proposal-unvalidated'));
  assert.ok(!noReactionsHtml.includes('story-proposal-metrics'));
} else {
  assert.ok(!html.includes('story-proposal-section'));
}
// Generic packages retain their original point-focused structure in every locale.
const generic = structuredClone(report);
generic.commonGroundProposal = { mode: 'generic', status: 'working_draft',
  groupStatement: 'A shared starting point with remaining questions.',
  commonGround: ['Keep access affordable.'], divides: ['How should opening hours change?'],
  bridgingProposal: 'Compare ways to extend access.', insights: ['Access is a shared concern.'], votes: {} };
const genericHtml = renderToStaticMarkup(<FinalReportPage report={generic} preview />);
for (const point of ['Keep access affordable.', 'How should opening hours change?', 'Compare ways to extend access.', 'Access is a shared concern.']) {
  assert.ok(genericHtml.includes(point));
}
const genericCard = genericHtml.slice(genericHtml.indexOf('story-proposal-section'), genericHtml.indexOf('story-analysis-heading'));
assert.ok(!genericCard.includes('story-proposal-metrics'));
assert.ok(!genericCard.includes('<details'));
assert.equal((html.match(/id="report-statement-/g) || []).length, report.evidence.statements.length)
assert.ok(html.includes('story-section story-all-statements'))
assert.ok(!html.includes('<details class="story-all-statements"'))
assert.ok(!html.includes('SHOULD_NOT_RENDER'))
assert.ok(!html.includes('story-overlap-section'))
assert.ok(html.indexOf('story-coverage-section') > html.indexOf('story-methods'))
// Small discussions retain their scope caveat in methodology without a blanket
// opening warning. Sparse responses/statements and unknown reasons still warn.
const smallDiscussion = structuredClone(report);
smallDiscussion.meta.voterCount = 10;
smallDiscussion.analysis.responseCoverage.averageRate = 0.9;
smallDiscussion.evidence.dataSufficiency = { status: 'limited', reasons: ['few-voters'] };
const smallDiscussionHtml = renderToStaticMarkup(<FinalReportPage report={smallDiscussion} preview />);
assert.ok(!smallDiscussionHtml.includes('story-data-warning'));
assert.ok(smallDiscussionHtml.includes('data-testid="report-scope-note"'));
assert.ok(smallDiscussionHtml.indexOf('data-testid="report-scope-note"') > smallDiscussionHtml.indexOf('story-methods'));
for (const reasons of [['few-statements'], ['low-response-coverage'], ['few-voters', 'low-response-coverage'], ['unknown'], []]) {
  smallDiscussion.evidence.dataSufficiency = { status: 'limited', reasons };
  assert.ok(renderToStaticMarkup(<FinalReportPage report={smallDiscussion} preview />).includes('story-data-warning'));
}
delete smallDiscussion.evidence.dataSufficiency;
assert.ok(!renderToStaticMarkup(<FinalReportPage report={smallDiscussion} preview />).includes('story-data-warning'));
smallDiscussion.analysis.responseCoverage.averageRate = 0.4;
assert.ok(renderToStaticMarkup(<FinalReportPage report={smallDiscussion} preview />).includes('story-data-warning'));
const profilesIndex = html.indexOf('opinion-group-cards')
const comparisonIndex = html.indexOf('data-testid="group-differences"')
assert.ok(profilesIndex >= 0)
assert.ok(comparisonIndex > profilesIndex)
if (language === 'en') {
  for (const label of ['Majority support', 'Majority opposition', 'Neutral most common', 'No clear majority']) assert.ok(html.includes(label))
  if (isTraffic) {
    assert.ok(html.includes('A Saturday trial has support; permanent restrictions remain open'))
    assert.ok(html.includes('51 unanswered'))
    for (const title of ['Extend the pedestrian zone', 'A Saturday trial with limits', 'Better buses without road restrictions']) assert.ok(html.includes(title))
  } else {
    assert.ok(html.includes('Pilot new library services while preserving access to staff'))
    assert.ok(html.includes('96 unanswered'))
  }
  assert.ok(html.includes('Key findings'))
  if (isTraffic) {
    // Saved common-ground directions replace the report's proposed next steps.
    assert.ok(html.includes('Directions in the package'))
    assert.ok(!html.includes('Next steps'))
  } else assert.ok(html.includes('Next steps'))
  assert.ok(!html.includes('Three findings') && !html.includes('a more even division'))
  assert.ok(!/[\u3400-\u9fff]/u.test(html), 'English report must not contain Chinese copy')
} else {
  assert.ok(html.includes('多數反對') && html.includes('中立最多') && html.includes('意見分歧'))
}
assert.ok(!html.includes('攤開重疊的圓點') && !html.includes('顯示組別主題'))
assert.ok(!html.includes('Show group themes') && !html.includes('Spread overlapping dots'))
assert.ok(!html.includes('opinion-map-legend') && !html.includes('opinion-map-detail'))
const dotTags = html.match(/<g class="opinion-dot"[^>]*>/g) || []
assert.equal(dotTags.length, report.opinionLandscape.groups.reduce((n, group) => n + group.dots.length, 0))
assert.ok(dotTags.every(tag => !tag.includes('role="button"') && !tag.includes('tabindex') && tag.includes('aria-hidden="true"')))
assert.ok(!html.includes('Participant 1') && !html.includes('Select a dot'))
assert.equal((html.match(/class="opinion-theme-label opinion-group-color"/g) || []).length, report.opinionLandscape.groups.length)
// Reports carry a readable, escaped transcript and a correctly encoded room link.
assert.ok(html.includes('data-testid="report-original-session"'))
assert.ok(html.includes('href="/?code=' + encodeURIComponent(report.meta.sessionId) + '"'))
assert.ok(html.includes('href="#report-transcript"'))
assert.ok(html.includes('data-testid="report-transcript"'))
assert.ok(html.indexOf('data-testid="report-transcript"') < html.indexOf('story-methods'))
const withTranscript = structuredClone(report);
withTranscript.meta.sessionId = 'ROOM&next=https://example.invalid';
withTranscript.transcript = [
  { text: '<img src=x onerror=alert(1)> & actual words', speaker: '<b>Room</b>', timestamp: 1700000000 },
  { text: '', speaker: 'Room', timestamp: 1700000030, transcriptionStatus: 'missing' },
  { text: 'No timestamp', timestamp: null },
];
const transcriptHtml = renderToStaticMarkup(<FinalReportPage report={withTranscript} preview />);
assert.ok(transcriptHtml.includes('&lt;img src=x onerror=alert(1)&gt;'));
assert.ok(!transcriptHtml.includes('<img src=x'));
assert.ok(transcriptHtml.includes('&lt;b&gt;Room&lt;/b&gt;'));
assert.match(transcriptHtml, /datetime="2023-11-14T22:13:20\.000Z"/i);
assert.ok(transcriptHtml.includes('class="is-missing"'));
assert.ok(transcriptHtml.includes('Download transcript (.txt)') || transcriptHtml.includes('下載逐字稿'));
assert.equal(originalSessionPath('ROOM&next=x'), '/?code=ROOM%26next%3Dx');
assert.equal(originalSessionPath(null), null);
const downloaded = reportTranscriptText(withTranscript, 'https://murmi.example');
assert.ok(downloaded.includes('https://murmi.example/?code=ROOM%26next%3Dhttps%3A%2F%2Fexample.invalid'));
assert.ok(downloaded.includes('[2023-11-14T22:13:20.000Z] <b>Room</b>'));
assert.ok(downloaded.includes('<img src=x onerror=alert(1)> & actual words'));
assert.ok(!downloaded.includes('1970-01-01'));
const legacy = structuredClone(report);
legacy.presentationVersion = 'concise-report-v1';
delete legacy.transcript;
const legacyHtml = renderToStaticMarkup(<FinalReportPage report={legacy} preview />);
assert.ok(legacyHtml.includes('No transcript was included') || legacyHtml.includes('未包含逐字稿'));
assert.ok(!legacyHtml.includes('SHOULD_NOT_RENDER'));
legacy.transcript = [];
const emptyHtml = renderToStaticMarkup(<FinalReportPage report={legacy} preview />);
assert.ok(emptyHtml.includes('No transcript was recorded') || emptyHtml.includes('沒有記錄逐字稿'));
assert.ok(!emptyHtml.includes('Download transcript (.txt)') && !emptyHtml.includes('下載逐字稿'));
// Missing AI output must still leave a complete, readable report.
delete report.narrative
html = renderToStaticMarkup(<FinalReportPage report={report} preview />)
if (isTraffic) assert.ok(html.includes(report.commonGroundProposal.groupStatement));
assert.equal((html.match(/id="report-statement-/g) || []).length, report.evidence.statements.length)
assert.ok(html.indexOf('story-coverage-section') > html.indexOf('story-methods'))
assert.ok(!html.includes('story-overlap-section'))
console.log('Report render checks passed (' + language + '): complete statements, concise sections, profiles, coverage, and AI fallback.')
`
const result = await build({ stdin: { contents: source, resolveDir: path.resolve('frontend'), loader: 'jsx' }, bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', loader: { '.css': 'empty' }, write: false })
const directory = await mkdtemp(path.join(tmpdir(), 'murmi-report-render-'))
try {
  const script = path.join(directory, 'check.cjs')
  await writeFile(script, result.outputFiles[0].text)
  execFileSync(process.execPath, [script, path.resolve(process.argv[2] || 'outputs/local-report-preview.json')], { stdio: 'inherit' })
} finally { await rm(directory, { recursive: true, force: true }) }
