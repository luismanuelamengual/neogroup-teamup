'use client'

import './index.scss'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import LogoutIcon from '@mui/icons-material/Logout'
import PersonIcon from '@mui/icons-material/Person'
import SearchIcon from '@mui/icons-material/Search'
import AppBar from '@mui/material/AppBar'
import BottomNavigation from '@mui/material/BottomNavigation'
import BottomNavigationAction from '@mui/material/BottomNavigationAction'
import ButtonBase from '@mui/material/ButtonBase'
import Divider from '@mui/material/Divider'
import ListItemIcon from '@mui/material/ListItemIcon'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Toolbar from '@mui/material/Toolbar'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { getSession, signOut } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { MouseEvent, ReactNode, useEffect, useState } from 'react'
import { Role } from '@/app/(auth)/models/Role'
import { SessionUser } from '@/app/(auth)/models/SessionUser'
import { useUserStore } from '@/app/(auth)/stores/users'
import Avatar from '@/app/components/Avatar'

interface NavItem {
  key: string
  label: string
  href: string
  icon: ReactNode
}

export default function AppShell({ children, user: initialUser }: { children: ReactNode; user: SessionUser }) {
  const t = useTranslations('nav')
  const router = useRouter()
  const pathname = usePathname()
  const storeUser = useUserStore((state) => state.user)
  const user = storeUser ?? initialUser
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        const session = await getSession()

        if (!session) {
          router.push('/login')
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [router])
  const isOrganizer = user?.roleId === Role.ORGANIZER
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
      <AppBar className="appbar">
        <Toolbar className="toolbar">
          <Link href="/" className="brand">
            <Image src="/logo-white.png" alt="TeamUp" width={158} height={26} priority />
          </Link>
          <nav className="nav">
            {navItems.map((item) => (
              <Link key={item.key} href={item.href} className={`nav-link ${isActive(item.href) ? 'active' : ''}`}>
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="spacer" />
          <ButtonBase onClick={openMenu} className="user" focusRipple>
            <Avatar email={user?.email ?? ''} name={user?.displayName ?? ''} size="sm" className="avatar" />
            <span className="user-name">
              {[user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.displayName}
            </span>
          </ButtonBase>
          <Menu
            anchorEl={menuAnchor}
            anchorOrigin={{
              vertical: 'bottom',
              horizontal: 'center'
            }}
            transformOrigin={{
              vertical: 'top',
              horizontal: 'center'
            }}
            open={!!menuAnchor}
            onClose={closeMenu}
          >
            <div className="app-shell-menu-header">
              <span className="name">{user?.displayName}</span>
              <span className="profile">{isOrganizer ? t('profileOrganizer') : t('profilePlayer')}</span>
            </div>
            <Divider className="app-shell-menu-divider" />
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
      <div className="content-wrapper">
        <main className="content">{children}</main>
      </div>
      <BottomNavigation
        showLabels
        className="bottom-nav"
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
