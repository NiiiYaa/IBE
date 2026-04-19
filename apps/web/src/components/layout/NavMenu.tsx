'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { NavItem } from '@ibe/shared'
import { NavPopupModal } from './NavPopupModal'

interface NavMenuProps {
  items: NavItem[]
  className?: string
  itemClassName?: string
}

export function NavMenu({ items, className = '', itemClassName = '' }: NavMenuProps) {
  const [openPopup, setOpenPopup] = useState<NavItem | null>(null)

  if (items.length === 0) return null

  return (
    <>
      <nav className={className}>
        {items.map(item => {
          if (item.type === 'static') {
            return (
              <span key={item.id} className={itemClassName}>
                {item.label}
              </span>
            )
          }
          if (item.type === 'link') {
            return (
              <Link
                key={item.id}
                href={item.url ?? '#'}
                target={item.url?.startsWith('http') ? '_blank' : undefined}
                rel={item.url?.startsWith('http') ? 'noopener noreferrer' : undefined}
                className={itemClassName}
              >
                {item.label}
              </Link>
            )
          }
          // popup
          return (
            <button
              key={item.id}
              onClick={() => setOpenPopup(item)}
              className={itemClassName}
            >
              {item.label}
            </button>
          )
        })}
      </nav>

      {openPopup && openPopup.content && (
        <NavPopupModal
          label={openPopup.label}
          content={openPopup.content}
          onClose={() => setOpenPopup(null)}
        />
      )}
    </>
  )
}
