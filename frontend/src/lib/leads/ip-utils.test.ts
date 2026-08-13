import assert from 'node:assert/strict'
import test from 'node:test'
import {extractClientIp, isValidIp, sanitizeIp} from './ip-utils'

test('sanitizeIp rejects private IPv4 addresses', () => {
  assert.equal(sanitizeIp('10.0.0.1'), null)
  assert.equal(sanitizeIp('10.255.255.255'), null)
  assert.equal(sanitizeIp('172.16.0.1'), null)
  assert.equal(sanitizeIp('172.31.255.255'), null)
  assert.equal(sanitizeIp('192.168.1.1'), null)
  assert.equal(sanitizeIp('192.168.255.255'), null)
  assert.equal(sanitizeIp('127.0.0.1'), null)
  assert.equal(sanitizeIp('0.0.0.0'), null)
})

test('sanitizeIp accepts public IPv4 addresses', () => {
  assert.equal(sanitizeIp('8.8.8.8'), '8.8.8.8')
  assert.equal(sanitizeIp('1.1.1.1'), '1.1.1.1')
  assert.equal(sanitizeIp('172.15.255.255'), '172.15.255.255')
  assert.equal(sanitizeIp('172.32.0.1'), '172.32.0.1')
})

test('sanitizeIp rejects private IPv6 addresses', () => {
  assert.equal(sanitizeIp('::1'), null)
  assert.equal(sanitizeIp('fc00::1'), null)
  assert.equal(sanitizeIp('fe80::1'), null)
})

test('sanitizeIp accepts public IPv6 addresses', () => {
  assert.equal(sanitizeIp('2001:4860:4860::8888'), '2001:4860:4860::8888')
  assert.equal(sanitizeIp('2606:4700:4700::1111'), '2606:4700:4700::1111')
})

test('isValidIp validates IPv4 addresses', () => {
  assert.equal(isValidIp('8.8.8.8'), true)
  assert.equal(isValidIp('192.168.1.1'), true)
  assert.equal(isValidIp('255.255.255.255'), true)
  assert.equal(isValidIp('0.0.0.0'), true)
})

test('isValidIp rejects invalid IPv4 addresses', () => {
  assert.equal(isValidIp('256.0.0.1'), false)
  assert.equal(isValidIp('192.168.1'), false)
  assert.equal(isValidIp('not.an.ip'), false)
  assert.equal(isValidIp(''), false)
})

test('isValidIp validates IPv6 addresses', () => {
  assert.equal(isValidIp('2001:4860:4860::8888'), true)
  assert.equal(isValidIp('::1'), true)
  assert.equal(isValidIp('fe80::1'), true)
})

test('isValidIp rejects invalid IPv6 addresses', () => {
  assert.equal(isValidIp('gggg::1'), false)
  assert.equal(isValidIp('not:an:ipv6'), false)
})

test('sanitizeIp returns valid public IPs', () => {
  assert.equal(sanitizeIp('8.8.8.8'), '8.8.8.8')
  assert.equal(sanitizeIp('  8.8.8.8  '), '8.8.8.8')
})

test('sanitizeIp rejects invalid IPs', () => {
  assert.equal(sanitizeIp('not.an.ip'), null)
  assert.equal(sanitizeIp(''), null)
  assert.equal(sanitizeIp(null), null)
})

test('sanitizeIp rejects IPs with invalid format', () => {
  assert.equal(sanitizeIp('256.0.0.1'), null)
  assert.equal(sanitizeIp('192.168.1'), null)
})

test('extractClientIp extracts IP from CF-Connecting-IP header', () => {
  const request = new Request('https://example.com', {
    headers: {'CF-Connecting-IP': '1.2.3.4'},
  })
  assert.equal(extractClientIp(request), '1.2.3.4')
})

test('extractClientIp extracts IP from X-Forwarded-For header', () => {
  const request = new Request('https://example.com', {
    headers: {'X-Forwarded-For': '1.2.3.4, 10.0.0.1, 192.168.1.1'},
  })
  assert.equal(extractClientIp(request), '1.2.3.4')
})

test('extractClientIp skips private IPs in X-Forwarded-For', () => {
  const request = new Request('https://example.com', {
    headers: {'X-Forwarded-For': '10.0.0.1, 192.168.1.1'},
  })
  assert.equal(extractClientIp(request), null)
})

test('extractClientIp extracts IP from Forwarded header', () => {
  const request = new Request('https://example.com', {
    headers: {'Forwarded': 'for=1.2.3.4;proto=http;by=203.0.113.43'},
  })
  assert.equal(extractClientIp(request), '1.2.3.4')
})

test('extractClientIp extracts IP from X-Real-IP header', () => {
  const request = new Request('https://example.com', {
    headers: {'X-Real-IP': '1.2.3.4'},
  })
  assert.equal(extractClientIp(request), '1.2.3.4')
})

test('extractClientIp skips private IPs in X-Real-IP', () => {
  const request = new Request('https://example.com', {
    headers: {'X-Real-IP': '192.168.1.1'},
  })
  assert.equal(extractClientIp(request), null)
})

test('extractClientIp extracts IP from X-Client-IP header', () => {
  const request = new Request('https://example.com', {
    headers: {'X-Client-IP': '1.2.3.4'},
  })
  assert.equal(extractClientIp(request), '1.2.3.4')
})

test('extractClientIp extracts IP from True-Client-IP header', () => {
  const request = new Request('https://example.com', {
    headers: {'True-Client-IP': '1.2.3.4'},
  })
  assert.equal(extractClientIp(request), '1.2.3.4')
})

test('extractClientIp returns null when no valid IP found', () => {
  const request = new Request('https://example.com')
  assert.equal(extractClientIp(request), null)
})

test('extractClientIp prioritizes headers in correct order', () => {
  const request = new Request('https://example.com', {
    headers: {
      'CF-Connecting-IP': '1.2.3.4',
      'X-Forwarded-For': '5.6.7.8',
      'X-Real-IP': '9.10.11.12',
    },
  })
  assert.equal(extractClientIp(request), '1.2.3.4')
})

test('extractClientIp handles Forwarded header with port', () => {
  const request = new Request('https://example.com', {
    headers: {'Forwarded': 'for=1.2.3.4:8080;proto=http'},
  })
  assert.equal(extractClientIp(request), '1.2.3.4')
})
