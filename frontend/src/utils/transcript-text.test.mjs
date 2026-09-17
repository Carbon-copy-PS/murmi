import assert from 'node:assert/strict'
import test from 'node:test'
import { buildTranscriptDownload, buildOriginalTranscriptDownload } from './transcript-text.js'
import { transcriptText } from './traditional-transcript-text.js'

test('converts actual API examples to Taiwan-standard Traditional Chinese', () => {
  assert.equal(transcriptText('我觉得读书这种事情很个人的。', 'zh'), '我覺得讀書這種事情很個人的。')
  assert.equal(transcriptText('对增加自然科的常识很有帮助。', 'zh'), '對增加自然科的常識很有幫助。')
})

test('retains vocabulary, English and punctuation while converting characters', () => {
  assert.equal(transcriptText('软件、鼠标，AI policy: 2026!', 'zh'), '軟件、鼠標，AI policy: 2026!')
  assert.equal(transcriptText('不要刪掉最後一句。', 'zh'), '不要刪掉最後一句。')
})

test('accumulated caption disambiguates a phrase split across incoming deltas', () => {
  let raw = ''
  const displays = ['头', '发', '发', '展'].map((delta) => {
    raw += delta
    return transcriptText(raw, 'zh')
  })
  assert.equal(displays[1], '頭髮')
  assert.equal(displays[3], '頭髮發展')
  assert.equal(raw, '头发发展')
})

test('other language choices and original view preserve text exactly', () => {
  for (const language of ['en', 'de', 'fr', 'it', 'zh-CN', 'zh-Hans', null]) {
    assert.equal(transcriptText('他说 hello, Grüezi!', language), '他说 hello, Grüezi!')
  }
})

test('recognizes explicit Traditional Chinese locales and empty captions', () => {
  for (const language of ['zh', 'zh-TW', 'zh-Hant', 'zh-Hant-TW']) {
    assert.equal(transcriptText('头发', language), '頭髮')
    assert.equal(transcriptText('', language), '')
  }
})

test('readable export converts text and labels gaps without modifying originals', () => {
  const items = Object.freeze([Object.freeze({ itemId: 'a', text: '头发', model: 'gpt-4o-transcribe' })])
  const entries = Object.freeze([
    Object.freeze({ id: 'first', timestamp: 1, speaker: 'Speaker', text: '头发', transcriptionItems: items }),
    Object.freeze({ id: 'gap', timestamp: 2, speaker: 'Speaker', text: '', transcriptionStatus: 'missing' }),
  ])
  const text = buildTranscriptDownload(entries, 'zh', '缺少這段逐字稿', transcriptText)
  assert.match(text, /頭髮/)
  assert.match(text, /缺少這段逐字稿/)
  assert.doesNotMatch(text, /头发/)
  const audit = JSON.parse(buildOriginalTranscriptDownload(entries, 'zh'))
  assert.deepEqual(audit.entries, entries)
  assert.equal(audit.entries[0].transcriptionItems[0].text, '头发')
  assert.equal(audit.displayConversion, 'OpenCC s2tw (opencc-js 1.4.2)')
  assert.equal(JSON.parse(buildOriginalTranscriptDownload(entries, 'en')).displayConversion, null)
})
