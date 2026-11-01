import { expect, it, vi } from 'vitest'
import { Registry } from '../src/index.js'
import { createAnonymousIngestion } from '../src/server.js'

it('attaches verified session context and rejects anonymous IDs not bound to that session', async () => {
  const registry = new Registry()
  registry.registerCustom({name:'custom.action', version:1, purpose:'measure action', properties:{}})
  const send = vi.fn().mockResolvedValue(undefined), identify = vi.fn().mockResolvedValue(undefined)
  const anonymousId = 'a9c7d403-354f-43b5-900d-681c14b6c261'
  const ingest = createAnonymousIngestion({registry, sink:{send,identify}, resolveContext: async () => ({userId:'user-1', anonymousId, attribution:{tenantId:'tenant-1', appId:'app-1'}})})
  const request = (id: string) => new Request('https://example.test', {method:'POST',body:JSON.stringify({events:[{id:'ce5dbd3b-99b7-40b7-b780-5e1e3dd6780d', name:'custom.action', version:1, occurredAt:'2026-01-01T00:00:00Z', provenance:'client', identity:{anonymousId:id}, properties:{}}]})})
  expect((await ingest(request(anonymousId))).status).toBe(204)
  expect(identify).toHaveBeenCalledWith({anonymousId,userId:'user-1'})
  expect(send.mock.calls[0][0][0]).toMatchObject({identity:{anonymousId,userId:'user-1'},attribution:{tenantId:'tenant-1',appId:'app-1'}})
  expect((await ingest(request('b9c7d403-354f-43b5-900d-681c14b6c261'))).status).toBe(403)
  expect(send).toHaveBeenCalledTimes(1)
})
