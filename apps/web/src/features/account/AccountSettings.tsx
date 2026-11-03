import { useState } from 'react'
import { LogOut, Monitor, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Segmented } from '@/components/page'
import { useTheme, type ThemeChoice } from '../../lib/theme'
import { Txt, useLanguage, useText } from '../../lib/i18n'
import { useSignOut, type User } from '../auth/queries'

export const ROLE = { resident: 'Resident', staff: 'Barangay staff', administrator: 'Administrator' } as const

export const initials = (user: User) => user.email.slice(0, 1).toUpperCase()

/** Language, appearance and sign-out; shared by the resident sheet and the staff sidebar menu. */
export function AccountSettings({ user }: { user: User }) {
  const t = useText()
  const { theme, setTheme } = useTheme()
  const { language, setLanguage } = useLanguage()
  const signOut = useSignOut()
  const ThemeIcon = theme === 'system' ? Monitor : theme === 'dark' ? Moon : Sun
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="grid size-12 place-items-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">
          {initials(user)}
        </span>
        <span className="min-w-0">
          <strong className="block truncate text-[17px] font-semibold">{user.email}</strong>
          <span className="text-[14px] text-muted-foreground">
            <Txt>{ROLE[user.role]}</Txt>
          </span>
        </span>
      </div>
      <div className="space-y-2">
        <span className="px-1 text-[13px] font-medium text-muted-foreground">
          <Txt>Language</Txt>
        </span>
        <Segmented
          id="account-language"
          label={t('Language')}
          value={language}
          onChange={setLanguage}
          options={[
            { value: 'en', label: 'English' },
            { value: 'fil', label: 'Filipino' },
          ]}
        />
      </div>
      <div className="space-y-2">
        <span className="px-1 text-[13px] font-medium text-muted-foreground">
          <Txt>Appearance</Txt>
        </span>
        <Segmented<ThemeChoice>
          id="account-theme"
          label={t('Appearance')}
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'system', label: t('Automatic') },
            { value: 'light', label: t('Light') },
            { value: 'dark', label: t('Dark') },
          ]}
        />
        <p className="flex items-center gap-1.5 px-1 text-[13px] text-muted-foreground">
          <ThemeIcon className="size-3.5" aria-hidden="true" />
          <Txt>{theme === 'system' ? 'Matches your device setting.' : 'Stays this way on this device.'}</Txt>
        </p>
      </div>
      {signOut.error && (
        <p role="alert" className="text-[14px] text-destructive">
          <Txt>{signOut.error.message}</Txt>
        </p>
      )}
      <Button
        variant="destructive"
        size="lg"
        className="w-full"
        disabled={signOut.isPending}
        onClick={() => signOut.mutate()}
      >
        <LogOut />
        <Txt>Sign out</Txt>
      </Button>
    </div>
  )
}

/** The avatar in each resident page's title bar; opens settings as a bottom sheet. */
export function AccountButton({ user }: { user: User }) {
  const t = useText()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('Account and settings')}
        className="grid size-11 place-items-center rounded-full"
      >
        <span className="grid size-8 place-items-center rounded-full bg-primary text-[14px] font-semibold text-primary-foreground">
          {initials(user)}
        </span>
      </button>
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="mx-auto max-w-lg">
          <DrawerHeader className="text-left">
            <DrawerTitle className="text-[20px]">
              <Txt>Account</Txt>
            </DrawerTitle>
            <DrawerDescription className="sr-only">
              <Txt>Language, appearance and sign out</Txt>
            </DrawerDescription>
          </DrawerHeader>
          <div className="pb-safe px-4 pb-6">
            <AccountSettings user={user} />
          </div>
        </DrawerContent>
      </Drawer>
    </>
  )
}
