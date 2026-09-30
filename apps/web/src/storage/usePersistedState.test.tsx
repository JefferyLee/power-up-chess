import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { KEYS } from './keys'
import { flagCodec, usePersistedState } from './usePersistedState'

describe('usePersistedState', () => {
  beforeEach(() => window.localStorage.clear())

  it('starts from the stored value when there is one', () => {
    window.localStorage.setItem(KEYS.board3dView.key, '1')
    const { result } = renderHook(() => usePersistedState(KEYS.board3dView, false, flagCodec))
    expect(result.current[0]).toBe(true)
  })

  it('falls back to initial when the key is absent or unparsable', () => {
    const a = renderHook(() => usePersistedState(KEYS.siegeProgress, { stars: 0 }))
    expect(a.result.current[0]).toEqual({ stars: 0 })

    window.localStorage.setItem(KEYS.siegeProgress.key, '{nope')
    const b = renderHook(() => usePersistedState(KEYS.siegeProgress, () => ({ stars: 7 })))
    expect(b.result.current[0]).toEqual({ stars: 7 })
  })

  it('does not write on mount, but writes every change', () => {
    const { result } = renderHook(() => usePersistedState(KEYS.board3dView, false, flagCodec))
    expect(window.localStorage.getItem(KEYS.board3dView.key)).toBeNull()

    act(() => result.current[1](true))
    expect(window.localStorage.getItem(KEYS.board3dView.key)).toBe('1')

    act(() => result.current[1]((v) => !v))
    expect(result.current[0]).toBe(false)
    expect(window.localStorage.getItem(KEYS.board3dView.key)).toBe('0')
  })

  it('uses JSON by default', () => {
    const { result } = renderHook(() => usePersistedState(KEYS.siegeProgress, { stars: 0 }))
    act(() => result.current[1]({ stars: 3 }))
    expect(window.localStorage.getItem(KEYS.siegeProgress.key)).toBe('{"stars":3}')
  })

  it('keeps working when storage throws', () => {
    const getItem = Storage.prototype.getItem
    const setItem = Storage.prototype.setItem
    Storage.prototype.getItem = () => { throw new Error('SecurityError') }
    Storage.prototype.setItem = () => { throw new Error('QuotaExceededError') }
    try {
      const { result } = renderHook(() => usePersistedState(KEYS.board3dView, true, flagCodec))
      expect(result.current[0]).toBe(true)
      act(() => result.current[1](false))
      expect(result.current[0]).toBe(false)
    } finally {
      Storage.prototype.getItem = getItem
      Storage.prototype.setItem = setItem
    }
  })
})
