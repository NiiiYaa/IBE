'use client'

import { useState, useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiClientError } from '@/lib/api-client'

// ── Constants ────────────────────────────────────────────────────────────────

const AUDIENCE_LOCATIONS = ['North America','Europe','Middle East','Asia','Latin America','Africa','Global']
const AUDIENCE_TYPES     = ['Leisure travelers','Business travelers','Luxury travelers','Budget travelers','Families']
const TRAFFIC_OPTIONS    = ['<1K','1K–10K','10K–50K','50K–200K','200K+']
const PROMO_METHODS      = ['Content (blog / SEO)','Social media','Paid ads (Google / Meta)','Email marketing','Travel agency / offline','Deal / coupon sites']
const NEWSLETTER_SIZES   = ['<1K','1K–5K','5K–20K','20K–100K','100K+']
const BOOKING_RANGES     = ['<10','10–50','50–200','200+']
const INDUSTRIES         = ['Travel & hospitality','E-commerce','Finance','Technology','Lifestyle','Other']
const LANGUAGES          = ['English','Arabic','French','German','Spanish','Portuguese','Italian','Hebrew','Russian','Chinese','Japanese','Other']
const PAYMENT_METHODS    = ['Bank transfer','PayPal','Wise','Credit card','Other']
const CURRENCIES         = ['USD','EUR','GBP','AED','ILS','SAR','Other']

const STEPS = ['Profile', 'Audience', 'Promotion', 'Channels', 'Payment', 'Terms']

// ── Helpers ──────────────────────────────────────────────────────────────────

function toggle(arr: string[], val: string) {
  return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]
}

// ── Input primitives ─────────────────────────────────────────────────────────

const inputCls = 'w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-light)]'

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-full border px-3 py-1.5 text-sm transition-colors',
        active
          ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)] font-medium'
          : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-text)]',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

function Field({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-[var(--color-text)]">
        {label}
        {optional && <span className="ml-1 font-normal text-[var(--color-text-muted)]">(optional)</span>}
      </label>
      {children}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AffiliateOnboardingPage() {
  const router = useRouter()
  const qc = useQueryClient()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [companyName, setCompanyName]         = useState('')
  const [websiteUrl, setWebsiteUrl]           = useState('')
  const [primaryLanguage, setPrimaryLanguage] = useState('')
  const [audienceLocations, setAudLoc]        = useState<string[]>([])
  const [audienceTypes, setAudType]           = useState<string[]>([])
  const [monthlyTraffic, setTraffic]          = useState('')
  const [promotionMethods, setPromoMethods]   = useState<string[]>([])
  const [runsBrandedKw, setBrandedKw]         = useState<boolean | null>(null)
  const [socialInstagram, setSocialIG]        = useState('')
  const [socialTiktok, setSocialTT]           = useState('')
  const [socialYoutube, setSocialYT]          = useState('')
  const [newsletterSize, setNewsletterSize]   = useState('')
  const [hasAffiliateExp, setHasExp]          = useState<boolean | null>(null)
  const [expIndustries, setExpInd]            = useState<string[]>([])
  const [expMonthlyBookings, setExpBookings]  = useState('')
  const [paymentMethod, setPaymentMethod]     = useState('')
  const [paymentCurrency, setPaymentCurrency] = useState('')
  const [taxId, setTaxId]                     = useState('')
  const [termsAccepted, setTermsAccepted]     = useState(false)
  const [noBidding, setNoBidding]             = useState(false)
  const [noSpam, setNoSpam]                   = useState(false)
  const [noMisleading, setNoMisleading]       = useState(false)

  // Pre-fill from existing profile
  const { data: profile } = useQuery({ queryKey: ['affiliate-profile'], queryFn: () => apiClient.affiliateProfile() })
  useEffect(() => {
    if (!profile) return
    if (profile.companyName) setCompanyName(profile.companyName)
    if (profile.websiteUrl) setWebsiteUrl(profile.websiteUrl)
    if (profile.primaryLanguage) setPrimaryLanguage(profile.primaryLanguage)
    if (profile.audienceLocations.length) setAudLoc(profile.audienceLocations)
    if (profile.audienceTypes.length) setAudType(profile.audienceTypes)
    if (profile.monthlyTraffic) setTraffic(profile.monthlyTraffic)
    if (profile.promotionMethods.length) setPromoMethods(profile.promotionMethods)
    if (profile.runsBrandedKw != null) setBrandedKw(profile.runsBrandedKw)
    if (profile.socialInstagram) setSocialIG(profile.socialInstagram)
    if (profile.socialTiktok) setSocialTT(profile.socialTiktok)
    if (profile.socialYoutube) setSocialYT(profile.socialYoutube)
    if (profile.newsletterSize) setNewsletterSize(profile.newsletterSize)
    if (profile.hasAffiliateExp != null) setHasExp(profile.hasAffiliateExp)
    if (profile.expIndustries.length) setExpInd(profile.expIndustries)
    if (profile.expMonthlyBookings) setExpBookings(profile.expMonthlyBookings)
    if (profile.paymentMethod) setPaymentMethod(profile.paymentMethod)
    if (profile.paymentCurrency) setPaymentCurrency(profile.paymentCurrency)
    if (profile.termsAgreedAt) { setTermsAccepted(true); setNoBidding(true); setNoSpam(true); setNoMisleading(true) }
  }, [profile])

  const hasPaidAds = promotionMethods.includes('Paid ads (Google / Meta)')
  const termsComplete = termsAccepted && noBidding && noSpam && noMisleading

  async function saveAndNext() {
    setError(null)
    setSaving(true)
    try {
      // Save step data
      if (step === 0) {
        await apiClient.affiliateUpdateProfile({ companyName: companyName || null, websiteUrl: websiteUrl || null, primaryLanguage: primaryLanguage || null })
      } else if (step === 1) {
        await apiClient.affiliateUpdateProfile({ audienceLocations, audienceTypes, monthlyTraffic: monthlyTraffic || null })
      } else if (step === 2) {
        await apiClient.affiliateUpdateProfile({ promotionMethods, ...(hasPaidAds ? { runsBrandedKw: runsBrandedKw ?? false } : { runsBrandedKw: null }) })
      } else if (step === 3) {
        await apiClient.affiliateUpdateProfile({ socialInstagram: socialInstagram || null, socialTiktok: socialTiktok || null, socialYoutube: socialYoutube || null, newsletterSize: newsletterSize || null, hasAffiliateExp, expIndustries, expMonthlyBookings: expMonthlyBookings || null })
      } else if (step === 4) {
        await apiClient.affiliateUpdateProfile({ paymentMethod: paymentMethod || null, paymentCurrency: paymentCurrency || null, taxId: taxId || null })
      } else if (step === 5) {
        if (!termsComplete) { setError('Please accept all terms to continue'); setSaving(false); return }
        await apiClient.affiliateAcceptTerms()
        await qc.invalidateQueries({ queryKey: ['affiliate-profile'] })
        router.replace('/affiliate/dashboard')
        return
      }
      await qc.invalidateQueries({ queryKey: ['affiliate-profile'] })
      setStep(s => s + 1)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Save failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const pct = Math.round((step / STEPS.length) * 100)

  type TermsItem = { state: boolean; set: (v: boolean) => void; label: ReactNode }
  const termsItems: TermsItem[] = [
    {
      state: termsAccepted,
      set: setTermsAccepted,
      label: (
        <>
          I agree to the{' '}
          <a
            href="/affiliate/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-primary)] underline hover:no-underline"
          >
            affiliate program terms and conditions
          </a>
        </>
      ),
    },
    { state: noMisleading, set: setNoMisleading, label: 'I will not use misleading promotions or false claims' },
    { state: noSpam,       set: setNoSpam,       label: 'I will not engage in spam or unsolicited marketing' },
    { state: noBidding,    set: setNoBidding,    label: 'I will not bid on brand keywords unless explicitly approved' },
  ]

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Complete your affiliate profile</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">This helps hotels evaluate and approve you faster.</p>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between text-xs text-[var(--color-text-muted)]">
            <span className="font-medium text-[var(--color-text)]">{STEPS[step]}</span>
            <span>Step {step + 1} of {STEPS.length}</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[var(--color-border)]">
            <div className="h-1.5 rounded-full bg-[var(--color-primary)] transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-2 flex gap-1">
            {STEPS.map((s, i) => (
              <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'}`} />
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">

        {/* Step 0 — Basic Profile */}
        {step === 0 && (
          <div className="space-y-4">
            <p className="text-sm font-semibold text-[var(--color-text)]">Basic Information</p>
            <Field label="Company name" optional>
              <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Your company or brand name" className={inputCls} />
            </Field>
            <Field label="Website URL" optional>
              <input type="url" value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)} placeholder="https://yoursite.com" className={inputCls} />
            </Field>
            <Field label="Primary language" optional>
              <select value={primaryLanguage} onChange={e => setPrimaryLanguage(e.target.value)} className={inputCls}>
                <option value="">Select…</option>
                {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </Field>
          </div>
        )}

        {/* Step 1 — Audience */}
        {step === 1 && (
          <div className="space-y-5">
            <p className="text-sm font-semibold text-[var(--color-text)]">Audience & Reach</p>
            <Field label="Primary audience location">
              <div className="flex flex-wrap gap-2 pt-1">
                {AUDIENCE_LOCATIONS.map(l => (
                  <Chip key={l} label={l} active={audienceLocations.includes(l)} onClick={() => setAudLoc(toggle(audienceLocations, l))} />
                ))}
              </div>
            </Field>
            <Field label="Audience type">
              <div className="flex flex-wrap gap-2 pt-1">
                {AUDIENCE_TYPES.map(t => (
                  <Chip key={t} label={t} active={audienceTypes.includes(t)} onClick={() => setAudType(toggle(audienceTypes, t))} />
                ))}
              </div>
            </Field>
            <Field label="Monthly traffic" optional>
              <div className="flex flex-wrap gap-2 pt-1">
                {TRAFFIC_OPTIONS.map(o => (
                  <Chip key={o} label={o} active={monthlyTraffic === o} onClick={() => setTraffic(o)} />
                ))}
              </div>
            </Field>
          </div>
        )}

        {/* Step 2 — Promotion Methods */}
        {step === 2 && (
          <div className="space-y-5">
            <p className="text-sm font-semibold text-[var(--color-text)]">How do you promote?</p>
            <Field label="Promotion methods">
              <div className="flex flex-col gap-2 pt-1">
                {PROMO_METHODS.map(m => (
                  <label key={m} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-[var(--color-border)] px-3 py-2.5 transition-colors hover:border-[var(--color-primary)]">
                    <input
                      type="checkbox"
                      checked={promotionMethods.includes(m)}
                      onChange={() => setPromoMethods(toggle(promotionMethods, m))}
                      className="accent-[var(--color-primary)]"
                    />
                    <span className="text-sm text-[var(--color-text)]">{m}</span>
                  </label>
                ))}
              </div>
            </Field>
            {hasPaidAds && (
              <Field label="Do you run branded keyword campaigns?">
                <div className="flex gap-3 pt-1">
                  {[true, false].map(v => (
                    <button
                      key={String(v)}
                      type="button"
                      onClick={() => setBrandedKw(v)}
                      className={[
                        'flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                        runsBrandedKw === v
                          ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                          : 'border-[var(--color-border)] text-[var(--color-text-muted)]',
                      ].join(' ')}
                    >
                      {v ? 'Yes' : 'No'}
                    </button>
                  ))}
                </div>
              </Field>
            )}
          </div>
        )}

        {/* Step 3 — Social & Experience */}
        {step === 3 && (
          <div className="space-y-5">
            <div className="space-y-4">
              <p className="text-sm font-semibold text-[var(--color-text)]">Social Channels</p>
              <Field label="Instagram" optional>
                <input type="url" value={socialInstagram} onChange={e => setSocialIG(e.target.value)} placeholder="https://instagram.com/yourhandle" className={inputCls} />
              </Field>
              <Field label="TikTok" optional>
                <input type="url" value={socialTiktok} onChange={e => setSocialTT(e.target.value)} placeholder="https://tiktok.com/@yourhandle" className={inputCls} />
              </Field>
              <Field label="YouTube" optional>
                <input type="url" value={socialYoutube} onChange={e => setSocialYT(e.target.value)} placeholder="https://youtube.com/@yourchannel" className={inputCls} />
              </Field>
              <Field label="Newsletter subscribers" optional>
                <div className="flex flex-wrap gap-2 pt-1">
                  {NEWSLETTER_SIZES.map(s => (
                    <Chip key={s} label={s} active={newsletterSize === s} onClick={() => setNewsletterSize(s)} />
                  ))}
                </div>
              </Field>
            </div>

            <div className="space-y-4 border-t border-[var(--color-border)] pt-5">
              <p className="text-sm font-semibold text-[var(--color-text)]">Experience <span className="font-normal text-[var(--color-text-muted)]">(optional)</span></p>
              <Field label="Have you worked with affiliate programs before?">
                <div className="flex gap-3 pt-1">
                  {[true, false].map(v => (
                    <button
                      key={String(v)}
                      type="button"
                      onClick={() => setHasExp(v)}
                      className={[
                        'flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                        hasAffiliateExp === v
                          ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                          : 'border-[var(--color-border)] text-[var(--color-text-muted)]',
                      ].join(' ')}
                    >
                      {v ? 'Yes' : 'No'}
                    </button>
                  ))}
                </div>
              </Field>
              {hasAffiliateExp && (
                <>
                  <Field label="Industries">
                    <div className="flex flex-wrap gap-2 pt-1">
                      {INDUSTRIES.map(i => (
                        <Chip key={i} label={i} active={expIndustries.includes(i)} onClick={() => setExpInd(toggle(expIndustries, i))} />
                      ))}
                    </div>
                  </Field>
                  <Field label="Estimated monthly bookings">
                    <div className="flex flex-wrap gap-2 pt-1">
                      {BOOKING_RANGES.map(r => (
                        <Chip key={r} label={r} active={expMonthlyBookings === r} onClick={() => setExpBookings(r)} />
                      ))}
                    </div>
                  </Field>
                </>
              )}
            </div>
          </div>
        )}

        {/* Step 4 — Payment */}
        {step === 4 && (
          <div className="space-y-4">
            <p className="text-sm font-semibold text-[var(--color-text)]">Payment Setup <span className="ml-1 font-normal text-[var(--color-text-muted)]">(you can skip this for now)</span></p>
            <Field label="Payment method" optional>
              <div className="flex flex-wrap gap-2 pt-1">
                {PAYMENT_METHODS.map(m => (
                  <Chip key={m} label={m} active={paymentMethod === m} onClick={() => setPaymentMethod(m)} />
                ))}
              </div>
            </Field>
            <Field label="Preferred currency" optional>
              <div className="flex flex-wrap gap-2 pt-1">
                {CURRENCIES.map(c => (
                  <Chip key={c} label={c} active={paymentCurrency === c} onClick={() => setPaymentCurrency(c)} />
                ))}
              </div>
            </Field>
            <Field label="Tax ID / VAT number" optional>
              <input type="text" value={taxId} onChange={e => setTaxId(e.target.value)} placeholder="Optional" className={inputCls} />
            </Field>
          </div>
        )}

        {/* Step 5 — Terms */}
        {step === 5 && (
          <div className="space-y-4">
            <p className="text-sm font-semibold text-[var(--color-text)]">Terms & Compliance</p>
            <p className="text-sm text-[var(--color-text-muted)]">Before you start promoting hotels, please agree to the following:</p>
            <div className="space-y-3 rounded-lg border border-[var(--color-border)] p-4">
              {termsItems.map((item, i) => (
                <label key={i} className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={item.state}
                    onChange={e => item.set(e.target.checked)}
                    className="mt-0.5 accent-[var(--color-primary)]"
                  />
                  <span className="text-sm text-[var(--color-text)]">{item.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {error && <p className="mt-4 text-sm text-[var(--color-error)]">{error}</p>}

        {/* Navigation */}
        <div className="mt-6 flex items-center justify-between gap-3">
          <div className="flex gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep(s => s - 1)}
                className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
              >
                Back
              </button>
            )}
            {step < STEPS.length - 1 && (
              <button
                type="button"
                onClick={() => router.replace('/affiliate/dashboard')}
                className="rounded-md px-4 py-2 text-sm text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
              >
                Save & finish later
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={saveAndNext}
            disabled={saving || (step === 5 && !termsComplete)}
            className="rounded-md bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
          >
            {saving ? 'Saving…' : step === STEPS.length - 1 ? 'Finish & start promoting' : 'Save & continue'}
          </button>
        </div>
      </div>
    </div>
  )
}
