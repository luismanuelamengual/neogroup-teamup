'use client'

import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import LanguageIcon from '@mui/icons-material/Language'
import LogoutIcon from '@mui/icons-material/Logout'
import PersonIcon from '@mui/icons-material/Person'
import SearchIcon from '@mui/icons-material/Search'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import AppBar from '@mui/material/AppBar'
import Avatar from '@mui/material/Avatar'
import BottomNavigation from '@mui/material/BottomNavigation'
import BottomNavigationAction from '@mui/material/BottomNavigationAction'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Toolbar from '@mui/material/Toolbar'
import { signOut } from 'next-auth/react'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { MouseEvent, ReactNode, useState } from 'react'

import { setLocale, setProfile } from '@/app/_actions/account.actions'
import { Profile } from '@/app/_models/types'

import './AppShell.styles.scss'

interface AppShellProps {
  profile: Profile
  userName: string
  avatarUrl: string
  children: ReactNode
}

interface NavItem {
  key: string
  label: string
  href: string
  icon: ReactNode
}

export default function AppShell({ profile, userName, avatarUrl, children }: AppShellProps) {
  const t = useTranslations('nav')
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const [switchingProfile, setSwitchingProfile] = useState(false)

  const navItems: NavItem[] =
    profile === 'organizer'
      ? [
          {
            key: 'tournaments',
            label: t('myTournaments'),
            href: '/organizer/tournaments',
            icon: <EmojiEventsIcon />
          },
          {
            key: 'new',
            label: t('newTournament'),
            href: '/organizer/tournaments/new',
            icon: <AddCircleOutlineIcon />
          }
        ]
      : [
          {
            key: 'tournaments',
            label: t('myTournaments'),
            href: '/player/tournaments',
            icon: <EmojiEventsIcon />
          },
          {
            key: 'search',
            label: t('searchTournaments'),
            href: '/player/search',
            icon: <SearchIcon />
          }
        ]

  const isActive = (href: string) =>
    href === '/organizer/tournaments' || href === '/player/tournaments'
      ? pathname === href || /^\/(organizer|player)\/tournaments\/\d+/.test(pathname)
      : pathname.startsWith(href)

  const openMenu = (event: MouseEvent<HTMLElement>) => setMenuAnchor(event.currentTarget)
  const closeMenu = () => setMenuAnchor(null)

  const handleSwitchProfile = async () => {
    closeMenu()
    setSwitchingProfile(true)
    await setProfile(profile === 'organizer' ? 'player' : 'organizer')
    setSwitchingProfile(false)
    router.push('/')
    router.refresh()
  }

  const handleToggleLanguage = async () => {
    closeMenu()
    await setLocale(locale === 'es' ? 'en' : 'es')
    router.refresh()
  }

  const handleLogout = () => {
    closeMenu()
    signOut({ redirectTo: '/login' })
  }

  return (
    <div className="app-shell">
      <AppBar position="sticky" className="app-shell__appbar">
        <Toolbar className="app-shell__toolbar">
          <Link href="/" className="app-shell__brand">
            <SportsLogo />
            <span>TeamUp</span>
          </Link>
          <nav className="app-shell__nav">
            {navItems.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className={`app-shell__nav-link ${isActive(item.href) ? 'app-shell__nav-link--active' : ''}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="app-shell__spacer" />
          <IconButton onClick={openMenu} size="small">
            <Avatar src={avatarUrl} alt={userName} className="app-shell__avatar" />
          </IconButton>
          <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={closeMenu}>
            <div className="app-shell__menu-header">
              <span className="app-shell__menu-name">{userName}</span>
              <span className="app-shell__menu-profile">
                {profile === 'organizer' ? t('profileOrganizer') : t('profilePlayer')}
              </span>
            </div>
            <Divider />
            <MenuItem component={Link} href="/account" onClick={closeMenu}>
              <ListItemIcon>
                <PersonIcon fontSize="small" />
              </ListItemIcon>
              {t('account')}
            </MenuItem>
            <MenuItem onClick={handleToggleLanguage}>
              <ListItemIcon>
                <LanguageIcon fontSize="small" />
              </ListItemIcon>
              {t('language')}: {locale === 'es' ? t('english') : t('spanish')}
            </MenuItem>
            <MenuItem onClick={handleSwitchProfile} disabled={switchingProfile}>
              <ListItemIcon>
                <SwapHorizIcon fontSize="small" />
              </ListItemIcon>
              {t('switchProfile')} ({profile === 'organizer' ? t('profilePlayer') : t('profileOrganizer')})
            </MenuItem>
            <Divider />
            <MenuItem onClick={handleLogout}>
              <ListItemIcon>
                <LogoutIcon fontSize="small" />
              </ListItemIcon>
              {t('logout')}
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>
      <main className="app-shell__content">{children}</main>
      <BottomNavigation
        showLabels
        className="app-shell__bottom-nav"
        value={navItems.findIndex((item) => isActive(item.href))}
        onChange={(_, index) => {
          if (navItems[index]) {
            router.push(navItems[index].href)
          }
        }}
      >
        {navItems.map((item) => (
          <BottomNavigationAction key={item.key} label={item.label} icon={item.icon} />
        ))}
      </BottomNavigation>
    </div>
  )
}

function SportsLogo() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="#f59e0b" />
      <path
        d="M4 6.5C7 9 7 15 4 17.5M20 6.5C17 9 17 15 20 17.5"
        stroke="#fff"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}
