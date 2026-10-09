import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router'

import { useUnreadCount } from '../api/queries'
import { DemoBanner } from './DemoBanner'
import { Icon } from './Icon'
import { QuickUploadDialog } from './QuickUploadDialog'
import { useAuth, useHousehold } from '../auth/useAuth'

function Navigation({ unread }: { unread: number }) {
  return (
    <nav aria-label="Main">
      <div className="nav-group">
        <span className="eyebrow">Ledger</span>
        <NavLink to="/" end className="nav-link">Overview</NavLink>
        <NavLink to="/bills" className="nav-link">Bills</NavLink>
        <NavLink to="/recurring" className="nav-link">Recurring</NavLink>
        <NavLink to="/documents" className="nav-link">Documents</NavLink>
      </div>
      <div className="nav-group">
        <span className="eyebrow">Insight</span>
        <NavLink to="/analytics" className="nav-link">Analytics</NavLink>
      </div>
      <div className="nav-group">
        <span className="eyebrow">Household</span>
        <NavLink to="/notifications" className="nav-link">
          <span>Notifications</span>
          {unread > 0 && (
            <span className="count-badge" aria-label={`${unread} unread`}>{unread}</span>
          )}
        </NavLink>
        <NavLink to="/providers" className="nav-link">Providers &amp; categories</NavLink>
        <NavLink to="/settings" className="nav-link">Settings</NavLink>
      </div>
    </nav>
  )
}

export function AppShell() {
  const { logout } = useAuth()
  const household = useHousehold()
  const unread = useUnreadCount().data?.count ?? 0
  const location = useLocation()
  // The menu belongs to the page it was opened on, so navigating anywhere closes it.
  const [menuOpenedOn, setMenuOpenedOn] = useState<string | null>(null)
  const menuOpen = menuOpenedOn === location.pathname
  const setMenuOpen = (open: boolean) => setMenuOpenedOn(open ? location.pathname : null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    // Move focus into the opened menu; Escape closes it.
    menuRef.current?.querySelector<HTMLElement>('a, button')?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpenedOn(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  const actions = (
    <div className="sidebar-actions">
      <Link to="/bills/new" className="btn btn-primary">
        <Icon name="plus" />
        Add bill
      </Link>
      <button type="button" className="btn btn-secondary" onClick={() => {
        setMenuOpen(false)
        setUploadOpen(true)
      }}>
        <Icon name="upload" />
        Upload statement
      </button>
    </div>
  )

  const footer = (
    <div className="sidebar-footer">
      <span className="household">{household.displayName}</span>
      <span className="small muted truncate">{household.email}</span>
      <button type="button" className="btn btn-text" style={{ justifySelf: 'start' }} onClick={() => void logout()}>
        Sign out
      </button>
    </div>
  )

  return (
    <div className="app">
      <a href="#main" className="skip-link">Skip to content</a>

      <aside className="sidebar" aria-label="Sidebar">
        <Link to="/" className="wordmark" aria-label="PaperTrail, overview">Paper<em>Trail</em></Link>
        {actions}
        <Navigation unread={unread} />
        {footer}
      </aside>

      <header className="topbar">
        <Link to="/" className="wordmark" aria-label="PaperTrail, overview">Paper<em>Trail</em></Link>
        <div className="topbar-actions">
          <Link to="/notifications" className="btn btn-icon" aria-label={`Notifications, ${unread} unread`}>
            <Icon name="bell" />
            {unread > 0 && <span className="count-badge" aria-hidden="true">{unread}</span>}
          </Link>
          <button
            type="button"
            className="btn btn-secondary btn-small"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <Icon name={menuOpen ? 'close' : 'menu'} />
            Menu
          </button>
        </div>
      </header>

      {menuOpen && (
        <div id="mobile-nav" className="mobile-nav" ref={menuRef}>
          {actions}
          <div style={{ marginTop: '1.5rem' }}>
            <Navigation unread={unread} />
          </div>
          <div style={{ marginTop: '1.5rem' }}>{footer}</div>
        </div>
      )}

      <main id="main" className="main" tabIndex={-1}>
        <div className="page">
          {import.meta.env.VITE_DEMO_MODE === 'true' && <DemoBanner />}
          <Outlet context={{ openUpload: () => setUploadOpen(true) }} />
        </div>
      </main>

      <QuickUploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
      <ScrollRestoration />
    </div>
  )
}

export interface ShellContext {
  openUpload: () => void
}
