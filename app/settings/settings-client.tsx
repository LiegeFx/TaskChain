'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import {
  Loader2,
  ArrowLeft,
  Bell,
  ShieldCheck,
  Wallet,
  Palette,
  User,
  Copy,
  Check,
  MoonStar,
  SunMedium,
  Monitor,
  LogOut,
  KeyRound,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { useStellarWallet, truncateStellarAddress, networkLabel, REQUIRED_NETWORK } from '@/components/wallet-provider'
import { cn } from '@/lib/utils'

type NotificationPrefs = {
  email: boolean
  push: boolean
  inApp: boolean
  digest: 'instant' | 'daily' | 'weekly'
}

type ProfileDraft = {
  displayName: string
  email: string
  phone: string
  avatarUrl: string
  bio: string
}

const PROFILE_STORAGE_KEY = 'taskchain_settings_profile'
const NOTIFICATION_STORAGE_KEY = 'taskchain_settings_notifications'

const defaultProfile: ProfileDraft = {
  displayName: '',
  email: '',
  phone: '',
  avatarUrl: '',
  bio: '',
}

const defaultNotifications: NotificationPrefs = {
  email: true,
  push: true,
  inApp: true,
  digest: 'daily',
}

function readStoredJSON<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return { ...fallback, ...JSON.parse(raw) }
  } catch {
    return fallback
  }
}

function SectionHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

export function SettingsClient() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const { address, isConnected, network } = useStellarWallet()
  const [profile, setProfile] = useState<ProfileDraft>(() => readStoredJSON(PROFILE_STORAGE_KEY, defaultProfile))
  const [notifications, setNotifications] = useState<NotificationPrefs>(() => readStoredJSON(NOTIFICATION_STORAGE_KEY, defaultNotifications))
  const [profileSaved, setProfileSaved] = useState(false)
  const [notificationsSaved, setNotificationsSaved] = useState(false)
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle')
  const [securityDialogOpen, setSecurityDialogOpen] = useState(false)

  const maskedWallet = useMemo(() => {
    if (!address) return 'No wallet connected'
    return truncateStellarAddress(address)
  }, [address])

  const handleProfileSave = () => {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile))
    setProfileSaved(true)
    window.setTimeout(() => setProfileSaved(false), 1800)
  }

  const handleNotificationsSave = () => {
    localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(notifications))
    setNotificationsSaved(true)
    window.setTimeout(() => setNotificationsSaved(false), 1800)
  }

  const handleCopyWallet = async () => {
    if (!address) return
    await navigator.clipboard.writeText(address)
    setCopyState('copied')
    window.setTimeout(() => setCopyState('idle'), 1600)
  }

  const handleSignOutDevice = () => {
    localStorage.removeItem('tc_dev_access_token')
    localStorage.removeItem('stellar_wallet_address')
    router.push('/login')
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20">
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3">
            <Button asChild variant="ghost" className="w-fit pl-0 text-muted-foreground hover:text-foreground">
              <Link href="/dashboard">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to dashboard
              </Link>
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Settings & Preferences</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
                Manage your profile, notification preferences, wallet details, theme, and security controls from one place.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={isConnected ? 'secondary' : 'outline'}>
              {isConnected ? 'Wallet connected' : 'Wallet disconnected'}
            </Badge>
            {address && (
              <Badge variant={network === REQUIRED_NETWORK ? 'default' : 'destructive'}>
                {networkLabel(network)}
              </Badge>
            )}
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.9fr)]">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <SectionHeading
                    icon={User}
                    title="Profile"
                    description="Update your personal information and public-facing identity."
                  />
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="display-name">Display name</Label>
                      <Input
                        id="display-name"
                        value={profile.displayName}
                        onChange={(e) => setProfile((prev) => ({ ...prev, displayName: e.target.value }))}
                        placeholder="Your name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={profile.email}
                        onChange={(e) => setProfile((prev) => ({ ...prev, email: e.target.value }))}
                        placeholder="you@example.com"
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="phone">Contact phone</Label>
                      <Input
                        id="phone"
                        value={profile.phone}
                        onChange={(e) => setProfile((prev) => ({ ...prev, phone: e.target.value }))}
                        placeholder="+234..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="avatar-url">Avatar URL</Label>
                      <Input
                        id="avatar-url"
                        value={profile.avatarUrl}
                        onChange={(e) => setProfile((prev) => ({ ...prev, avatarUrl: e.target.value }))}
                        placeholder="https://..."
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bio">Bio</Label>
                    <Textarea
                      id="bio"
                      value={profile.bio}
                      onChange={(e) => setProfile((prev) => ({ ...prev, bio: e.target.value }))}
                      placeholder="Short summary for your profile"
                      className="min-h-28"
                    />
                  </div>
                </CardContent>
                <CardFooter className="justify-between gap-3 border-t px-6 pt-6">
                  <p className="text-sm text-muted-foreground">
                    Changes are stored locally until a server profile endpoint is connected.
                  </p>
                  <Button onClick={handleProfileSave}>
                    {profileSaved ? <Check className="mr-2 h-4 w-4" /> : null}
                    {profileSaved ? 'Saved' : 'Save profile'}
                  </Button>
                </CardFooter>
              </Card>

              <Card>
                <CardHeader>
                  <SectionHeading
                    icon={Bell}
                    title="Notification Preferences"
                    description="Choose how you want to receive product and account updates."
                  />
                </CardHeader>
                <CardContent className="space-y-5">
                  <PreferenceRow
                    label="Email notifications"
                    description="Receive emails for important platform activity."
                    enabled={notifications.email}
                    onToggle={() => setNotifications((prev) => ({ ...prev, email: !prev.email }))}
                  />
                  <PreferenceRow
                    label="Push notifications"
                    description="Allow browser push alerts for time-sensitive updates."
                    enabled={notifications.push}
                    onToggle={() => setNotifications((prev) => ({ ...prev, push: !prev.push }))}
                  />
                  <PreferenceRow
                    label="In-app notifications"
                    description="Show alerts inside the TaskChain interface."
                    enabled={notifications.inApp}
                    onToggle={() => setNotifications((prev) => ({ ...prev, inApp: !prev.inApp }))}
                  />

                  <div className="space-y-2">
                    <Label>Delivery digest</Label>
                    <Select
                      value={notifications.digest}
                      onValueChange={(value) =>
                        setNotifications((prev) => ({ ...prev, digest: value as NotificationPrefs['digest'] }))
                      }
                    >
                      <SelectTrigger className="w-full sm:w-64">
                        <SelectValue placeholder="Select cadence" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="instant">Instant</SelectItem>
                        <SelectItem value="daily">Daily digest</SelectItem>
                        <SelectItem value="weekly">Weekly digest</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
                <CardFooter className="justify-between gap-3 border-t px-6 pt-6">
                  <p className="text-sm text-muted-foreground">
                    Notification preferences are saved locally in this session.
                  </p>
                  <Button variant="outline" onClick={handleNotificationsSave}>
                    {notificationsSaved ? <Check className="mr-2 h-4 w-4" /> : null}
                    {notificationsSaved ? 'Saved' : 'Save preferences'}
                  </Button>
                </CardFooter>
              </Card>

              <Card>
                <CardHeader>
                  <SectionHeading
                    icon={ShieldCheck}
                    title="Security"
                    description="Review access controls, account protection, and session state."
                  />
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                      <div className="flex items-center gap-2">
                        <KeyRound className="h-4 w-4 text-primary" />
                        <p className="font-medium">Password</p>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Use a strong password and change it periodically.
                      </p>
                      <Button variant="outline" className="mt-4" onClick={() => setSecurityDialogOpen(true)}>
                        Change password
                      </Button>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-primary" />
                        <p className="font-medium">Two-factor authentication</p>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Add a second verification step to strengthen account access.
                      </p>
                      <Button variant="outline" className="mt-4" onClick={() => setSecurityDialogOpen(true)}>
                        Enable 2FA
                      </Button>
                    </div>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-medium">Session controls</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Sign out of this device and clear stored authentication state.
                        </p>
                      </div>
                      <Button variant="destructive" onClick={handleSignOutDevice}>
                        <LogOut className="mr-2 h-4 w-4" />
                        Sign out
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <SectionHeading
                    icon={Wallet}
                    title="Wallet Information"
                    description="View the active wallet connection without exposing unnecessary details."
                  />
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Connected wallet</p>
                    <div className="mt-2 flex items-center gap-2">
                      <p className="font-mono text-sm">{maskedWallet}</p>
                      {address && (
                        <Button variant="ghost" size="icon-sm" onClick={handleCopyWallet} aria-label="Copy wallet address">
                          {copyState === 'copied' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {address ? 'Full address is kept private and only exposed when needed.' : 'Connect a wallet to see account details.'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Network</p>
                    <p className="mt-2 text-sm font-medium">{address ? networkLabel(network) : 'Unavailable'}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <SectionHeading
                    icon={Palette}
                    title="Theme Settings"
                    description="Choose the visual mode that fits your workflow."
                  />
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 p-4">
                    <div>
                      <p className="font-medium">Current theme</p>
                      <p className="mt-1 text-sm text-muted-foreground capitalize">
                        {theme ?? 'system'}
                      </p>
                    </div>
                    <ThemeToggle />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <ThemeOption
                      active={theme === 'light'}
                      icon={SunMedium}
                      label="Light"
                      onClick={() => setTheme('light')}
                    />
                    <ThemeOption
                      active={theme === 'dark'}
                      icon={MoonStar}
                      label="Dark"
                      onClick={() => setTheme('dark')}
                    />
                    <ThemeOption
                      active={theme === 'system'}
                      icon={Monitor}
                      label="System"
                      onClick={() => setTheme('system')}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-dashed">
                <CardHeader>
                  <SectionHeading
                    icon={Loader2}
                    title="Loading & Availability"
                    description="Graceful fallback state while settings data is unavailable."
                  />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    This page uses lightweight local defaults first, then hydrates user-specific state when available.
                  </p>
                </CardContent>
              </Card>
            </div>
        </div>
      </div>

      <Dialog open={securityDialogOpen} onOpenChange={setSecurityDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Security action</DialogTitle>
            <DialogDescription>
              Password reset and two-factor enrollment flows can be connected here when the backend endpoints are available.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSecurityDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}

function PreferenceRow({
  label,
  description,
  enabled,
  onToggle,
}: {
  label: string
  description: string
  enabled: boolean
  onToggle: () => void
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border/60 bg-muted/20 p-4">
      <div className="space-y-1">
        <p className="font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Button
        type="button"
        variant={enabled ? 'default' : 'outline'}
        size="sm"
        onClick={onToggle}
      >
        {enabled ? 'On' : 'Off'}
      </Button>
    </div>
  )
}

function ThemeOption({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-xl border p-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground'
      )}
    >
      <Icon className="h-5 w-5" />
      <span className="font-medium">{label}</span>
    </button>
  )
}
