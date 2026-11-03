import type { ReactElement } from 'react'
import { ChevronsUpDown, LogOut, Monitor, Moon, Sun } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTheme, type ThemeChoice } from '../../lib/theme'
import { Txt, useLanguage } from '../../lib/i18n'
import { useSignOut, type User } from '../auth/queries'
import { initials, ROLE } from './AccountSettings'

/** Avatar, email and role for a sidebar footer; pass it to AccountMenu inside the shell's own button. */
export function AccountIdentity({ user }: { user: User }) {
  return (
    <>
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-[13px] font-semibold text-primary-foreground">
        {initials(user)}
      </span>
      <span className="min-w-0 flex-1 text-left leading-tight">
        <span className="block truncate text-[13px] font-medium">{user.email}</span>
        <span className="block text-[12px] text-muted-foreground">
          <Txt>{ROLE[user.role]}</Txt>
        </span>
      </span>
      <ChevronsUpDown className="size-4 text-muted-foreground" aria-hidden="true" />
    </>
  )
}

/** Desktop account menu (appearance, language, sign out) opening upward from a sidebar footer button. */
export function AccountMenu({ trigger }: { trigger: ReactElement }) {
  const { theme, setTheme } = useTheme()
  const { language, setLanguage } = useLanguage()
  const signOut = useSignOut()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-60">
        <DropdownMenuLabel>
          <Txt>Appearance</Txt>
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={value => setTheme(value as ThemeChoice)}>
          <DropdownMenuRadioItem value="system">
            <Monitor /> <Txt>Automatic</Txt>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="light">
            <Sun /> <Txt>Light</Txt>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon /> <Txt>Dark</Txt>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>
          <Txt>Language</Txt>
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={language} onValueChange={value => setLanguage(value as 'en' | 'fil')}>
          <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="fil">Filipino</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => signOut.mutate()}>
          <LogOut /> <Txt>Sign out</Txt>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
