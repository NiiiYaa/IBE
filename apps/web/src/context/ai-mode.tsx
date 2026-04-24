'use client'

import { createContext, useContext, useState } from 'react'

interface AiModeCtx {
  aiLayout: boolean
  setAiLayout: (v: boolean) => void
}

const AiModeContext = createContext<AiModeCtx>({ aiLayout: false, setAiLayout: () => {} })

export function AiModeProvider({ children }: { children: React.ReactNode }) {
  const [aiLayout, setAiLayout] = useState(false)
  return <AiModeContext.Provider value={{ aiLayout, setAiLayout }}>{children}</AiModeContext.Provider>
}

export function useAiMode() {
  return useContext(AiModeContext)
}
