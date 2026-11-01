const INSTALLERS = {
  unix: 'https://github.com/portalshq/px/releases/latest/download/install.sh',
  windows: 'https://github.com/portalshq/px/releases/latest/download/install.ps1',
} as const

export type InstallerPlatform = keyof typeof INSTALLERS

export function installerForPlatform(value: string | null): string | null {
  const platform = value || 'unix'
  return platform === 'unix' || platform === 'windows' ? INSTALLERS[platform] : null
}
