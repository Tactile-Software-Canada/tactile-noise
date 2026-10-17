/**
 * Platform and device detection helpers for progressive enhancement.
 */

export function isIos(
  nav: Navigator = typeof navigator !== 'undefined' ? navigator : ({} as Navigator),
): boolean {
  if (!nav) return false
  const ua = nav.userAgent || ''
  const platform =
    (nav as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ||
    nav.platform ||
    ''
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1) ||
    (/Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1)
  )
}

export function isAndroid(
  nav: Navigator = typeof navigator !== 'undefined' ? navigator : ({} as Navigator),
): boolean {
  return /Android/.test(nav?.userAgent || '')
}

export function isMac(
  nav: Navigator = typeof navigator !== 'undefined' ? navigator : ({} as Navigator),
): boolean {
  if (!nav) return false
  const ua = nav.userAgent || ''
  const platform =
    (nav as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ||
    nav.platform ||
    ''
  return (/Macintosh|MacIntel|MacPPC|Mac68K/.test(platform) || /Macintosh/.test(ua)) && !isIos(nav)
}

export function isMacSafari(
  nav: Navigator = typeof navigator !== 'undefined' ? navigator : ({} as Navigator),
): boolean {
  if (!isMac(nav)) return false
  const ua = nav.userAgent || ''
  return /Safari\//.test(ua) && /Version\//.test(ua) && !/Chrome\/|Chromium\//.test(ua)
}

/** Returns true for Apple devices where manual instructions (Share / Add to Dock) apply. */
export function isAppleDevice(nav?: Navigator): boolean {
  return isIos(nav) || isMacSafari(nav)
}
