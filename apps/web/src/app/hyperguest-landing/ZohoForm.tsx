'use client'

import { useEffect, useRef } from 'react'

const ZOHO_SCRIPT_SRC = 'https://crm.zoho.com/crm/WebFormServeServlet?rid=b8b4fa5824561e7d676ef917facb344d6b9566e1cad44a535303bd8f726d4b22839023609ccbe57dd1fda79bbf432b0dgid37850420f0809209402ced252638fbf44bb99e739ea759f15f1c3b0c86042136&script=$sYG'

export function ZohoForm() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const script = document.createElement('script')
    script.id = 'formScript4384628000428311648'
    script.src = ZOHO_SCRIPT_SRC
    script.async = true
    container.appendChild(script)

    return () => {
      if (container.contains(script)) container.removeChild(script)
    }
  }, [])

  return <div ref={containerRef} />
}
