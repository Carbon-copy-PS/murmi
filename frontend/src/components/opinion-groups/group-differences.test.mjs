import test from 'node:test'
import assert from 'node:assert/strict'
import { selectGroupDifferences } from './group-differences.js'

const statement = (id, agree, neutral, disagree) => ({ id, text: id, agree, neutral, disagree, responded: agree + neutral + disagree })

test('compares response rates across unequal groups, not raw support counts', () => {
  const groups = [
    { id: 0, size: 10, statements: [statement('same', 4, 1, 0), statement('different', 1, 2, 2)] },
    { id: 1, size: 20, statements: [statement('same', 16, 4, 0), statement('different', 18, 1, 1)] },
  ]
  const before = structuredClone(groups)
  const result = selectGroupDifferences(groups)
  assert.deepEqual(result.map(item => item.id), ['different'])
  assert.ok(Math.abs(result[0].gap - .7) < 1e-12)
  assert.deepEqual(groups, before)
})

test('excludes larger gaps with sparse answers or fewer than five respondents', () => {
  const groups = [
    { id: 0, size: 14, statements: [statement('sparse', 0, 0, 5), statement('eligible', 2, 3, 9)] },
    { id: 1, size: 29, statements: [statement('sparse', 20, 0, 0), statement('eligible', 24, 3, 0)] },
  ]
  assert.deepEqual(selectGroupDifferences(groups).map(item => item.id), ['eligible'])
  assert.deepEqual(selectGroupDifferences(groups.map(group => ({ ...group, size: 4, statements: [statement('tiny', group.id ? 4 : 0, 0, group.id ? 0 : 4)] }))), [])
})

test('requires valid responses in every group and handles more than two groups', () => {
  const groups = [
    { id: 0, size: 10, statements: [statement('all', 1, 4, 0), statement('missing', 1, 4, 0)] },
    { id: 1, size: 10, statements: [statement('all', 3, 2, 0), statement('missing', 5, 0, 0)] },
    { id: 2, size: 10, statements: [statement('all', 5, 0, 0)] },
  ]
  const result = selectGroupDifferences(groups)
  assert.deepEqual(result.map(item => item.id), ['all'])
  assert.equal(result[0].rows.length, 3)
  groups[2].statements[0].agree = 6
  assert.deepEqual(selectGroupDifferences(groups), [])
})

test('shows at most two contrasts and hides weak or unavailable comparisons', () => {
  const groups = [
    { id: 0, size: 10, statements: ['a', 'b', 'c', 'weak'].map(id => statement(id, 0, 5, 0)) },
    { id: 1, size: 10, statements: [statement('a', 3, 2, 0), statement('b', 5, 0, 0), statement('c', 4, 1, 0), statement('weak', 1, 9, 0)] },
  ]
  assert.deepEqual(selectGroupDifferences(groups).map(item => item.id), ['b', 'c'])
  assert.deepEqual(selectGroupDifferences([]), [])
  assert.deepEqual(selectGroupDifferences([groups[0]]), [])
})
