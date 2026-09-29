import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { isLaunchCategory, LAUNCH_CATEGORY_SLUGS } from './launch-categories.ts'

describe('launch categories', () => {
  test('the MVP launches with groceries and beverages', () => {
    assert.deepEqual([...LAUNCH_CATEGORY_SLUGS], ['groceries', 'beverages'])
  })

  test('silenced and unknown categories are not launched', () => {
    assert.equal(isLaunchCategory('groceries'), true)
    assert.equal(isLaunchCategory('beverages'), true)
    assert.equal(isLaunchCategory('pharmacy'), false)
    assert.equal(isLaunchCategory('building-materials'), false)
    assert.equal(isLaunchCategory(null), false)
    assert.equal(isLaunchCategory(''), false)
  })
})
