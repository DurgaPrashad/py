import { createHmac } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { validCheckoutSignature, validWebhookSignature } from './razorpay.js'

const SECRET = 'test_secret_for_unit_tests'

describe('Razorpay signatures', () => {
  beforeAll(() => {
    process.env.RAZORPAY_KEY_SECRET = SECRET
  })

  it('accepts a genuine checkout signature and rejects forgeries', () => {
    const good = createHmac('sha256', SECRET).update('order_ABC|pay_XYZ').digest('hex')
    expect(validCheckoutSignature('order_ABC', 'pay_XYZ', good)).toBe(true)
    expect(validCheckoutSignature('order_ABC', 'pay_XYZ', good.toUpperCase())).toBe(true)
    expect(validCheckoutSignature('order_ABC', 'pay_OTHER', good)).toBe(false)
    expect(validCheckoutSignature('order_ABC', 'pay_XYZ', 'deadbeef')).toBe(false)
    expect(validCheckoutSignature('order_ABC', 'pay_XYZ', 'not-hex')).toBe(false)
    expect(validCheckoutSignature('order_ABC', 'pay_XYZ', '')).toBe(false)
  })

  it('checks webhook bodies byte for byte', () => {
    const body = '{"event":"payment.captured","payload":{}}'
    const sig = createHmac('sha256', 'whsec').update(body).digest('hex')
    expect(validWebhookSignature(body, sig, 'whsec')).toBe(true)
    expect(validWebhookSignature(body + ' ', sig, 'whsec')).toBe(false)
    expect(validWebhookSignature(body, sig, 'other-secret')).toBe(false)
  })
})

describe('DATABASE_URL', () => {
  it('encodes a raw @ in the password and leaves encoded ones alone', async () => {
    const { databaseUrl } = await import('./db.js')
    expect(databaseUrl('postgresql://postgres.ref:pa@ss@aws-0-us-east-1.pooler.supabase.com:6543/postgres')).toBe(
      'postgresql://postgres.ref:pa%40ss@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
    )
    expect(databaseUrl('postgresql://postgres.ref:pa%40ss@host:6543/postgres')).toBe('postgresql://postgres.ref:pa%40ss@host:6543/postgres')
  })
})
