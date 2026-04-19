'use client'
import { useEffect } from 'react'
import { apiClient } from '@/lib/api-client'

export function PixelInjector({ propertyId, page }: { propertyId: number; page: string }) {
  useEffect(() => {
    if (!propertyId) return
    apiClient.getPublicPixels(propertyId, page).then(({ pixels }) => {
      pixels.forEach(px => {
        const container = document.createElement('div')
        container.innerHTML = px.code
        Array.from(container.querySelectorAll('script')).forEach(oldScript => {
          const newScript = document.createElement('script')
          Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value))
          if (oldScript.textContent) newScript.textContent = oldScript.textContent
          document.head.appendChild(newScript)
        })
        Array.from(container.childNodes).forEach(node => {
          if ((node as Element).tagName !== 'SCRIPT') {
            document.body.appendChild(node.cloneNode(true))
          }
        })
      })
    }).catch(() => {})
  }, [propertyId, page])

  return null
}
