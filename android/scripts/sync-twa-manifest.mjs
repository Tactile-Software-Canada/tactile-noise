// Writes android/twa-manifest.json (Bubblewrap's project file) from app.config.json, and
// android/manifest-checksum.txt so Bubblewrap doesn't think the project is out of date.
// Usage: node android/scripts/sync-twa-manifest.mjs [--check]
//   --check  exit 1 instead of writing if the files are out of date (used by CI)
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const manifestUrl = new URL('android/twa-manifest.json', root)
const checksumUrl = new URL('android/manifest-checksum.txt', root)
const app = JSON.parse(readFileSync(new URL('app.config.json', root), 'utf8'))
const a = app.android

const manifest = {
  packageId: a.packageId,
  host: app.host,
  name: app.name,
  launcherName: app.shortName,
  display: 'standalone',
  themeColor: app.themeColor,
  themeColorDark: a.themeColorDark,
  navigationColor: a.navigationColor,
  navigationColorDark: a.navigationColorDark,
  navigationDividerColor: a.navigationDividerColor,
  navigationDividerColorDark: a.navigationDividerColorDark,
  backgroundColor: app.backgroundColor,
  enableNotifications: true,
  startUrl: a.launchUrl,
  iconUrl: `https://${app.host}/icons/icon-512.png`,
  maskableIconUrl: `https://${app.host}/icons/maskable-512.png`,
  splashScreenFadeOutDuration: 300,
  signingKey: { path: './upload-keystore.jks', alias: a.keyAlias },
  appVersionName: a.versionName,
  appVersionCode: a.versionCode,
  shortcuts: [],
  generatorApp: 'bubblewrap-cli',
  webManifestUrl: `https://${app.host}/manifest.webmanifest`,
  fallbackType: 'customtabs',
  features: {},
  alphaDependencies: { enabled: false },
  enableSiteSettingsShortcut: true,
  isChromeOSOnly: false,
  isMetaQuest: false,
  minSdkVersion: a.minSdkVersion,
  orientation: 'default',
  fingerprints: a.sha256CertFingerprints.map((value) => ({ value })),
  additionalTrustedOrigins: [],
  retainedBundles: [],
  displayOverride: [],
}

const text = JSON.stringify(manifest, null, 2) + '\n'
// Bubblewrap's checksum is the SHA-1 of twa-manifest.json's bytes.
const checksum = createHash('sha1').update(text).digest('hex')

const read = (url) => {
  try {
    return readFileSync(url, 'utf8')
  } catch {
    return ''
  }
}

if (process.argv.includes('--check')) {
  if (read(manifestUrl) !== text || read(checksumUrl).trim() !== checksum) {
    console.error(
      'android/twa-manifest.json is out of date with app.config.json.\n' +
        'Run: node android/scripts/sync-twa-manifest.mjs',
    )
    process.exit(1)
  }
  console.log('android/twa-manifest.json is up to date')
} else {
  writeFileSync(manifestUrl, text)
  writeFileSync(checksumUrl, checksum)
  console.log('wrote android/twa-manifest.json and android/manifest-checksum.txt')
}
