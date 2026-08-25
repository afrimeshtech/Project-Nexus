import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  assertDestructiveAllowed,
  describeTarget,
  DestructiveGuardError,
} from './destructive-guard.ts'

/**
 * This guard stands between a mistyped npm script and the production database.
 * It is worth testing precisely because the thing it prevents cannot be undone
 * and, by construction, is never exercised in normal use — a guard that has
 * silently stopped working looks exactly like a guard that has never fired.
 */

const KEYS = ['NODE_ENV', 'DATABASE_URL', 'AFRIMESH_ALLOW_REMOTE_DESTRUCTIVE'] as const
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
})

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe('allows the local case', () => {
  test('no DATABASE_URL is the embedded database, and is permitted', () => {
    assert.doesNotThrow(() => assertDestructiveAllowed('test'))
  })

  test('every recognised local host is permitted', () => {
    for (const host of ['localhost', '127.0.0.1', 'host.docker.internal']) {
      process.env.DATABASE_URL = `postgresql://u:p@${host}:5432/afrimesh`
      assert.doesNotThrow(() => assertDestructiveAllowed('test'), `${host} should be allowed`)
    }
  })
})

describe('refuses production', () => {
  test('NODE_ENV=production is refused even against a local database', () => {
    process.env.NODE_ENV = 'production'
    assert.throws(() => assertDestructiveAllowed('drop the schema'), DestructiveGuardError)
  })

  test('the refusal quotes the action, so the message says what stopped', () => {
    process.env.NODE_ENV = 'production'
    try {
      assertDestructiveAllowed('drop the schema')
      assert.fail('expected a throw')
    } catch (err) {
      assert.match((err as Error).message, /drop the schema/)
    }
  })
})

describe('refuses a remote host', () => {
  const REMOTE = 'postgresql://u:p@db.prod.example.com:5432/afrimesh'

  test('a non-local host is refused by default', () => {
    process.env.DATABASE_URL = REMOTE
    assert.throws(() => assertDestructiveAllowed('test'), DestructiveGuardError)
  })

  test('the refusal names the host and shows how to override', () => {
    process.env.DATABASE_URL = REMOTE
    try {
      assertDestructiveAllowed('test')
      assert.fail('expected a throw')
    } catch (err) {
      const m = (err as Error).message
      assert.match(m, /db\.prod\.example\.com/)
      assert.match(m, /AFRIMESH_ALLOW_REMOTE_DESTRUCTIVE/)
    }
  })

  test('naming the exact host opens the gate', () => {
    process.env.DATABASE_URL = REMOTE
    process.env.AFRIMESH_ALLOW_REMOTE_DESTRUCTIVE = 'db.prod.example.com'
    assert.doesNotThrow(() => assertDestructiveAllowed('test'))
  })

  test('naming a DIFFERENT host does not', () => {
    // The override is per-host on purpose: a blanket flag is one people learn
    // to add reflexively, and would then carry to the wrong database.
    process.env.DATABASE_URL = REMOTE
    process.env.AFRIMESH_ALLOW_REMOTE_DESTRUCTIVE = 'db.staging.example.com'
    assert.throws(() => assertDestructiveAllowed('test'), DestructiveGuardError)
  })

  test('a truthy-but-wrong override value does not open the gate', () => {
    for (const value of ['1', 'true', 'yes', '*', '']) {
      process.env.DATABASE_URL = REMOTE
      process.env.AFRIMESH_ALLOW_REMOTE_DESTRUCTIVE = value
      assert.throws(
        () => assertDestructiveAllowed('test'),
        DestructiveGuardError,
        `"${value}" must not be accepted`,
      )
    }
  })

  test('production still wins even when the host is named', () => {
    process.env.NODE_ENV = 'production'
    process.env.DATABASE_URL = REMOTE
    process.env.AFRIMESH_ALLOW_REMOTE_DESTRUCTIVE = 'db.prod.example.com'
    assert.throws(() => assertDestructiveAllowed('test'), DestructiveGuardError)
  })
})

describe('refuses what it cannot understand', () => {
  test('an unparseable DATABASE_URL is refused rather than guessed at', () => {
    process.env.DATABASE_URL = 'not-a-url'
    assert.throws(() => assertDestructiveAllowed('test'), DestructiveGuardError)
  })
})

describe('describeTarget', () => {
  test('names the embedded database when no URL is set', () => {
    assert.match(describeTarget(), /PGlite/)
  })

  test('names the host, and does not leak the password', () => {
    process.env.DATABASE_URL = 'postgresql://user:hunter2@db.example.com:5432/afrimesh'
    const described = describeTarget()
    assert.match(described, /db\.example\.com/)
    assert.doesNotMatch(described, /hunter2/)
  })
})
