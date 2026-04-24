'use client'

import { useEffect, useRef } from 'react'

const ZOHO_SCRIPT_SRC = 'https://crm.zoho.com/crm/WebFormServeServlet?rid=b8b4fa5824561e7d676ef917facb344d6b9566e1cad44a535303bd8f726d4b22839023609ccbe57dd1fda79bbf432b0dgid37850420f0809209402ced252638fbf44bb99e739ea759f15f1c3b0c86042136&script=$sYG'
const JQUERY_SRC = 'https://code.jquery.com/jquery-3.7.1.min.js'

let loaded = false

function loadScript(src: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) { resolve(); return }
    const s = document.createElement('script')
    s.id = id; s.src = src
    s.onload = () => resolve()
    s.onerror = reject
    document.head.appendChild(s)
  })
}

export function ZohoForm() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (loaded) return
    loaded = true

    const container = containerRef.current
    if (!container) return

    // Snapshot body children before Zoho loads so we can identify what it adds
    const before = new Set(Array.from(document.body.children))

    const moveZohoElements = () => {
      Array.from(document.body.children)
        .filter(el => !before.has(el) && !['SCRIPT', 'STYLE', 'LINK'].includes(el.tagName))
        .forEach(el => container.appendChild(el))
    }

    loadScript(JQUERY_SRC, 'jquery-cdn').then(() => {
      // Watch body for elements Zoho appends, then move them into our container
      const observer = new MutationObserver(moveZohoElements)
      observer.observe(document.body, { childList: true })

      const script = document.createElement('script')
      script.id = 'formScript4384628000428311648'
      script.src = ZOHO_SCRIPT_SRC
      script.async = true
      document.body.appendChild(script)

      // Fallback sweep after 2s in case observer missed the insertion
      setTimeout(() => { moveZohoElements(); observer.disconnect() }, 2000)
    }).catch(console.error)
  }, [])

  return <div ref={containerRef} />
}
