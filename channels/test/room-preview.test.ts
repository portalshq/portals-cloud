import { describe, expect, it } from 'vitest'
import { embedSurface, frameAncestors, previewElements, roomElementsFor } from '../lib/room-preview'

describe('room previews', () => {
  it('requires exactly one preview selector', () => {
    expect(embedSurface('preview')).toBe('preview')
    for (const value of [undefined, 'full', '', ['preview', 'preview'], ['preview']]) {
      expect(embedSurface(value)).toBe('embed')
    }
  })

  it('allows an exact HTTPS partner origin only for previews', () => {
    expect(frameAncestors('embed', 'https://partner.example')).not.toContain('partner.example')
    expect(frameAncestors('preview', 'https://partner.example, https://partner.example/').match(/partner\.example/g)).toHaveLength(1)
    expect(frameAncestors('preview')).toContain("'self'")
    for (const invalid of ['https://*.example', 'http://a.example', 'https://a.example/path', 'https://a.example?x', 'https://a.example#x', 'https://user@a.example', 'invalid']) {
      expect(() => frameAncestors('preview', invalid)).toThrow()
    }
  })

  it('limits the public tail and never enables writes', () => {
    expect(previewElements()).toEqual({ chatMessages: 3, input: false, reactions: false, forms: false, actions: false })
    expect(previewElements(0).chatMessages).toBe(0)
    expect(previewElements(10).chatMessages).toBe(10)
    for (const invalid of [-1, 1.3, 11, '3', null, Infinity]) {
      expect(() => previewElements(invalid)).toThrow()
    }
  })

  it('keeps non-preview overrides narrow instead of inventing preview limits', () => {
    expect(roomElementsFor(undefined, { reactions: false })).toEqual({ reactions: false })
    expect(roomElementsFor('preview', { chatMessages: 5 })).toEqual({
      chatMessages: 5, input: false, reactions: false, forms: false, actions: false,
    })
  })
})
