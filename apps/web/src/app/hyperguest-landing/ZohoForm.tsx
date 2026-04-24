'use client'

import { useEffect, useRef } from 'react'

const ZOHO_SCRIPT_SRC = 'https://crm.zoho.com/crm/WebFormServeServlet?rid=b8b4fa5824561e7d676ef917facb344d6b9566e1cad44a535303bd8f726d4b22839023609ccbe57dd1fda79bbf432b0dgid37850420f0809209402ced252638fbf44bb99e739ea759f15f1c3b0c86042136&script=$sYG'
const JQUERY_SRC = 'https://code.jquery.com/jquery-3.7.1.min.js'

// Module-level guard: prevents React Strict Mode double-effect from loading twice
let loaded = false

function loadScript(src: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) { resolve(); return }
    const s = document.createElement('script')
    s.id = id
    s.src = src
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

    loadScript(JQUERY_SRC, 'jquery-cdn').then(() => {
      const script = document.createElement('script')
      script.id = 'formScript4384628000428311648'
      script.src = ZOHO_SCRIPT_SRC
      script.async = true
      containerRef.current?.appendChild(script)
    }).catch(console.error)
  }, [])

  return <div ref={containerRef} />
}
