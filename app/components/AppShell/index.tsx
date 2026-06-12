'use client'

import './index.scss'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import LogoutIcon from '@mui/icons-material/Logout'
import PersonIcon from '@mui/icons-material/Person'
import SearchIcon from '@mui/icons-material/Search'
import AppBar from '@mui/material/AppBar'
import Avatar from '@mui/material/Avatar'
import BottomNavigation from '@mui/material/BottomNavigation'
import BottomNavigationAction from '@mui/material/BottomNavigationAction'
import ButtonBase from '@mui/material/ButtonBase'
import Divider from '@mui/material/Divider'
import ListItemIcon from '@mui/material/ListItemIcon'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Toolbar from '@mui/material/Toolbar'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { MouseEvent, ReactNode, useState } from 'react'
import { UserRoles } from '@/app/(auth)/models/UserRoles'
import { useUserStore } from '@/app/(auth)/stores/user.store'

interface NavItem {
  key: string
  label: string
  href: string
  icon: ReactNode
}

export default function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations('nav')
  const router = useRouter()
  const pathname = usePathname()
  const user = useUserStore((state) => state.user)
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const isOrganizer = user?.roleId === UserRoles.ORGANIZER
  const navItems: NavItem[] = isOrganizer
    ? [
        {
          key: 'tournaments',
          label: t('myTournaments'),
          href: '/tournaments',
          icon: <EmojiEventsIcon />
        }
      ]
    : [
        {
          key: 'tournaments',
          label: t('myTournaments'),
          href: '/tournaments',
          icon: <EmojiEventsIcon />
        },
        {
          key: 'search',
          label: t('searchTournaments'),
          href: '/tournaments/search',
          icon: <SearchIcon />
        }
      ]
  const isActive = (href: string) =>
    href === '/tournaments' ? pathname === href || /^\/tournaments\/\d+/.test(pathname) : pathname.startsWith(href)
  const openMenu = (event: MouseEvent<HTMLElement>) => setMenuAnchor(event.currentTarget)
  const closeMenu = () => setMenuAnchor(null)

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
          <ButtonBase onClick={openMenu} className="app-shell__user" focusRipple>
            <Avatar src={user?.avatarUrl ?? ''} alt={user?.displayName ?? ''} className="app-shell__avatar" />
            <span className="app-shell__user-name">
              {[user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.displayName}
            </span>
          </ButtonBase>
          <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={closeMenu}>
            <div className="app-shell__menu-header">
              <span className="app-shell__menu-name">{user?.displayName}</span>
              <span className="app-shell__menu-profile">
                {isOrganizer ? t('profileOrganizer') : t('profilePlayer')}
              </span>
            </div>
            <Divider />
            <MenuItem component={Link} href="/account" onClick={closeMenu}>
              <ListItemIcon>
                <PersonIcon fontSize="small" />
              </ListItemIcon>
              {t('account')}
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
