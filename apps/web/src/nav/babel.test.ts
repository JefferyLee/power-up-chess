// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  babelLibraryUrl,
  babelReturnUrl,
  parseBabelArrival,
  rememberBabelArrival,
} from './babel'

function fakeStorage(): Storage {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() {
      return m.size
    },
  }
}

beforeEach(() => {
  Object.defineProperty(window, 'sessionStorage', { value: fakeStorage(), configurable: true })
})

describe('parseBabelArrival', () => {
  it('reads the door of a Babel arrival, negative floors included', () => {
    expect(parseBabelArrival('?from=babel&door=0.1')).toBe('0.1')
    expect(parseBabelArrival('?door=-2.0&from=babel')).toBe('-2.0')
  })
  it("is the castle's own door for a Babel arrival without a usable one", () => {
    expect(parseBabelArrival('?from=babel')).toBe('1.0')
    expect(parseBabelArrival('?from=babel&door=0.1/../x')).toBe('1.0')
  })
  it('is null for any other arrival', () => {
    expect(parseBabelArrival('')).toBeNull()
    expect(parseBabelArrival('?door=0.1')).toBeNull()
    expect(parseBabelArrival('?from=zhipeng&door=0.1')).toBeNull()
  })
})

describe('the way back', () => {
  it('is nothing unless the visit came from the library', () => {
    rememberBabelArrival('?utm=x')
    expect(babelReturnUrl()).toBeNull()
    expect(babelLibraryUrl()).toBe('https://cornerofbabel.com/zh/?pub=1.0')
  })
  it('lands in front of the door they came through', () => {
    rememberBabelArrival('?from=babel&door=3.-1')
    expect(babelReturnUrl()).toBe('https://cornerofbabel.com/zh/?pub=3.-1')
    expect(babelLibraryUrl()).toBe('https://cornerofbabel.com/zh/?pub=3.-1')
  })
  it("falls back to the castle's door when the library sent none", () => {
    rememberBabelArrival('?from=babel')
    expect(babelReturnUrl()).toBe('https://cornerofbabel.com/zh/?pub=1.0')
  })
  it('survives a visit without storage', () => {
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('blocked')
      },
    })
    expect(() => rememberBabelArrival('?from=babel&door=0.1')).not.toThrow()
    expect(babelReturnUrl()).toBeNull()
  })
})
