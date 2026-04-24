'use client'

import { useEffect, useRef } from 'react'

const ZOHO_SCRIPT_SRC = 'https://crm.zoho.com/crm/WebFormServeServlet?rid=b8b4fa5824561e7d676ef917facb344d6b9566e1cad44a535303bd8f726d4b22839023609ccbe57dd1fda79bbf432b0dgid37850420f0809209402ced252638fbf44bb99e739ea759f15f1c3b0c86042136&script=$sYG'
const JQUERY_SRC = 'https://code.jquery.com/jquery-3.7.1.min.js'

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
    const container = containerRef.current
    if (!container) return

    let zohoScript: HTMLScriptElement | null = null

    loadScript(JQUERY_SRC, 'jquery-cdn').then(() => {
      zohoScript = document.createElement('script')
      zohoScript.id = 'formScript4384628000428311648'
      zohoScript.src = ZOHO_SCRIPT_SRC
      zohoScript.async = true
      container.appendChild(zohoScript)
    }).catch(console.error)

    return () => {
      if (zohoScript && container.contains(zohoScript)) container.removeChild(zohoScript)
    }
  }, [])

  return <div ref={containerRef} />
}
