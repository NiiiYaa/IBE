interface SessionExpiredBannerProps {
  onRefresh: () => void
  onBack: () => void
}

export function SessionExpiredBanner({ onRefresh, onBack }: SessionExpiredBannerProps) {
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2">
        <svg className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <p className="text-sm font-semibold text-amber-800">Your session has expired</p>
          <p className="text-xs text-amber-700">Prices may have changed. Check for the latest availability before booking.</p>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors"
        >
          Check prices again
        </button>
        <button
          type="button"
          onClick={onBack}
          className="rounded-md border border-amber-400 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors"
        >
          Back to search
        </button>
      </div>
    </div>
  )
}
