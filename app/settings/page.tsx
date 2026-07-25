import type { Metadata } from 'next'
import { SettingsClient } from '@/app/settings/settings-client'

export const metadata: Metadata = {
  title: 'Settings | TaskChain',
  description: 'Manage your profile, preferences, wallet, theme, and security settings.',
}

export default function SettingsPage() {
  return <SettingsClient />
}
