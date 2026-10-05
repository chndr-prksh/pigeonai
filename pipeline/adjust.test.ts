import { test } from 'node:test'
import assert from 'node:assert/strict'
import { adjust, findEvents, type RawBar } from './adjust.ts'

const bar = (d: string, c: number, o = c, v = 1000): RawBar => ({ d, o, h: Math.max(o, c) * 1.01, l: Math.min(o, c) * 0.99, c, v })

// RELIANCE around its 1:1 bonus (ex-date 28 Oct 2024), as served by the NSE MCP server.
const reliance = [bar('2024-10-24', 2679.6), bar('2024-10-25', 2655.7), bar('2024-10-28', 1334.35, 1337), bar('2024-10-29', 1340)]

test('infers a bonus the corporate-actions feed does not carry', () => {
  const events = findEvents(reliance, [])
  assert.equal(events.length, 1)
  assert.equal(events[0].d, '2024-10-28')
  assert.equal(events[0].f, 0.5)
  assert.equal(events[0].src, 'inferred')
})

test('back-adjusts earlier bars and leaves recent prices as traded', () => {
  const out = adjust(reliance, findEvents(reliance, []))
  assert.equal(out[1].c, 2655.7 / 2)
  assert.equal(out[1].v, 2000)
  assert.equal(out[2].c, 1334.35)
  assert.ok(Math.abs(out[2].o / out[1].c - 1) < 0.02, 'no artificial gap remains')
})

test('prefers the feed when the tape confirms it, without double counting', () => {
  const feed = [{ exDate: '2024-10-28', actionType: 'BONUS', purpose: 'Bonus 1:1', adjustmentFactor: 0.5 }]
  const events = findEvents(reliance, feed)
  assert.equal(events.length, 1)
  assert.equal(events[0].src, 'feed')
})

test('ignores a feed event the prices do not show', () => {
  const flat = [bar('2024-10-24', 100), bar('2024-10-25', 101), bar('2024-10-28', 102)]
  const feed = [{ exDate: '2024-10-28', actionType: 'SPLIT', purpose: 'Split 10 to 2', adjustmentFactor: 0.2 }]
  assert.equal(findEvents(flat, feed).length, 0)
})

test('a hard fall that is not a split ratio is left alone', () => {
  const crash = [bar('2024-01-01', 100), bar('2024-01-02', 80, 80), bar('2024-01-03', 45, 45)]
  assert.equal(findEvents(crash, []).length, 0)
})
