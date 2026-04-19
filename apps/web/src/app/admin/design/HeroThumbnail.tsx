export function HeroThumbnail({ style }: { style: 'fullpage' | 'rectangle' | 'quilt' }) {
  if (style === 'fullpage') {
    return (
      <div className="relative h-full w-full bg-slate-600">
        <div className="absolute bottom-2 left-2 right-2 h-3 rounded-full bg-white/70" />
        <div className="absolute inset-x-0 top-2 mx-auto h-2 w-1/2 rounded bg-white/40" />
      </div>
    )
  }
  if (style === 'quilt') {
    return (
      <div className="flex h-full flex-col gap-0.5 p-1">
        <div className="flex flex-1 gap-0.5 overflow-hidden rounded">
          <div className="flex-[3] bg-slate-500" />
          <div className="flex flex-[2] flex-col gap-0.5">
            <div className="flex flex-1 gap-0.5"><div className="flex-1 bg-slate-400" /><div className="flex-1 bg-slate-600" /></div>
            <div className="flex flex-1 gap-0.5"><div className="flex-1 bg-slate-600" /><div className="flex-1 bg-slate-400" /></div>
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className="flex h-full flex-col">
      <div className="h-1.5 bg-[var(--color-surface)]" />
      <div className="h-7 flex-none bg-slate-500" />
      <div className="flex flex-1 flex-col items-center justify-center gap-1 px-2">
        <div className="h-1.5 w-3/4 rounded bg-[var(--color-border)]" />
        <div className="h-2.5 w-full rounded-full bg-[var(--color-primary)]/40" />
      </div>
    </div>
  )
}
