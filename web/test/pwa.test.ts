import { describe, expect, it } from 'vitest'
import { isAndroid, isAppleDevice, isIos, isMac, isMacSafari } from '../src/device'

describe('pwa Apple device detection', () => {
  it('detects iPhone', () => {
    const nav = {
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
      maxTouchPoints: 5,
    } as unknown as Navigator

    expect(isIos(nav)).toBe(true)
    expect(isMac(nav)).toBe(false)
    expect(isMacSafari(nav)).toBe(false)
    expect(isAppleDevice(nav)).toBe(true)
  })

  it('detects iPad (traditional UA)', () => {
    const nav = {
      userAgent:
        'Mozilla/5.0 (iPad; CPU OS 12_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1',
      platform: 'iPad',
      maxTouchPoints: 5,
    } as unknown as Navigator

    expect(isIos(nav)).toBe(true)
    expect(isMac(nav)).toBe(false)
    expect(isMacSafari(nav)).toBe(false)
    expect(isAppleDevice(nav)).toBe(true)
  })

  it('detects iPadOS 13+ with desktop UA and touch points', () => {
    const nav = {
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 5,
    } as unknown as Navigator

    expect(isIos(nav)).toBe(true)
    expect(isMac(nav)).toBe(false)
    expect(isMacSafari(nav)).toBe(false)
    expect(isAppleDevice(nav)).toBe(true)
  })

  it('detects macOS Safari desktop (no touch points)', () => {
    const nav = {
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    } as unknown as Navigator

    expect(isIos(nav)).toBe(false)
    expect(isMac(nav)).toBe(true)
    expect(isMacSafari(nav)).toBe(true)
    expect(isAppleDevice(nav)).toBe(true)
  })

  it('distinguishes macOS Chrome from macOS Safari', () => {
    const nav = {
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    } as unknown as Navigator

    expect(isIos(nav)).toBe(false)
    expect(isMac(nav)).toBe(true)
    expect(isMacSafari(nav)).toBe(false)
    expect(isAppleDevice(nav)).toBe(false)
  })

  it('distinguishes macOS Firefox from macOS Safari', () => {
    const nav = {
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:123.0) Gecko/20100101 Firefox/123.0',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    } as unknown as Navigator

    expect(isIos(nav)).toBe(false)
    expect(isMac(nav)).toBe(true)
    expect(isMacSafari(nav)).toBe(false)
    expect(isAppleDevice(nav)).toBe(false)
  })

  it('does not classify Android as Apple device', () => {
    const nav = {
      userAgent:
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      platform: 'Linux armv8l',
      maxTouchPoints: 5,
    } as unknown as Navigator

    expect(isIos(nav)).toBe(false)
    expect(isMac(nav)).toBe(false)
    expect(isMacSafari(nav)).toBe(false)
    expect(isAppleDevice(nav)).toBe(false)
    expect(isAndroid(nav)).toBe(true)
  })

  it('does not classify iPhone or desktop as Android', () => {
    const iphone = {
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
      maxTouchPoints: 5,
    } as unknown as Navigator
    const desktop = {
      userAgent:
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      platform: 'Linux x86_64',
      maxTouchPoints: 0,
    } as unknown as Navigator
    expect(isAndroid(iphone)).toBe(false)
    expect(isAndroid(desktop)).toBe(false)
  })

  it('does not classify Windows as Apple device', () => {
    const nav = {
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      platform: 'Win32',
      maxTouchPoints: 0,
    } as unknown as Navigator

    expect(isIos(nav)).toBe(false)
    expect(isMac(nav)).toBe(false)
    expect(isMacSafari(nav)).toBe(false)
    expect(isAppleDevice(nav)).toBe(false)
  })

  it('does not classify Linux desktop as Apple device', () => {
    const nav = {
      userAgent: 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0',
      platform: 'Linux x86_64',
      maxTouchPoints: 0,
    } as unknown as Navigator

    expect(isIos(nav)).toBe(false)
    expect(isMac(nav)).toBe(false)
    expect(isMacSafari(nav)).toBe(false)
    expect(isAppleDevice(nav)).toBe(false)
  })

  it('handles empty or missing navigator gracefully', () => {
    expect(isIos({} as Navigator)).toBe(false)
    expect(isMac({} as Navigator)).toBe(false)
    expect(isMacSafari({} as Navigator)).toBe(false)
    expect(isAppleDevice({} as Navigator)).toBe(false)
  })
})
