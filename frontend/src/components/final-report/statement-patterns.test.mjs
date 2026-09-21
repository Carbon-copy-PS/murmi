import test from 'node:test'
import assert from 'node:assert/strict'
import { statementPattern } from './statement-patterns.js'
const result = (support, neutral, oppose) => ({ support, neutral, oppose, responded: support + neutral + oppose })
test('requires more than half of respondents for a majority, not just a plurality', () => {
  assert.equal(statementPattern(result(6, 2, 2)), 'support')
  assert.equal(statementPattern(result(2, 2, 6)), 'oppose')
  assert.equal(statementPattern(result(5, 3, 2)), 'mixed')
  assert.equal(statementPattern(result(2, 3, 5)), 'mixed')
})
test('distinguishes a neutral plurality from ties and unanswered statements', () => {
  assert.equal(statementPattern(result(3, 4, 2)), 'neutral')
  assert.equal(statementPattern(result(2, 4, 4)), 'mixed')
  assert.equal(statementPattern(result(0, 0, 0)), 'unanswered')
})
test('unanswered people do not count as disagreement or change the denominator', () => {
  assert.equal(statementPattern({ ...result(3, 1, 1), missing: 95 }), 'support')
})
