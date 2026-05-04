'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiClientError } from '@/lib/api-client'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { SaveBar } from '@/app/admin/design/components'

// ── Shared ───────────────────────────────────────────────────────────────────

const inputCls = 'w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-light)]'

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

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={['rounded-full border px-3 py-1.5 text-sm transition-colors',
        active
          ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)] font-medium'
          : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-text)]',
      ].join(' ')}>
      {label}
    </button>
  )
}

function toggle(arr: string[], val: string) {
  return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]
}

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
const COUNTRIES          = ['Afghanistan','Albania','Algeria','Argentina','Australia','Austria','Bangladesh','Belgium','Brazil','Canada','Chile','China','Colombia','Croatia','Czech Republic','Denmark','Egypt','Finland','France','Germany','Greece','Hungary','India','Indonesia','Iran','Iraq','Ireland','Israel','Italy','Japan','Jordan','Kenya','Lebanon','Malaysia','Mexico','Morocco','Netherlands','New Zealand','Nigeria','Norway','Pakistan','Philippines','Poland','Portugal','Romania','Russia','Saudi Arabia','Singapore','South Africa','South Korea','Spain','Sweden','Switzerland','Thailand','Turkey','UAE','Ukraine','United Kingdom','United States','Vietnam']

// ── Change Password Tab ───────────────────────────────────────────────────────

function ChangePasswordTab() {
  const [current, setCurrent]     = useState('')
  const [next, setNext]           = useState('')
  const [confirm, setConfirm]     = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [success, setSuccess]     = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    if (next !== confirm) { setError('New passwords do not match'); return }
    setSaving(true)
    try {
      await apiClient.updateMyAdminProfile({ currentPassword: current, newPassword: next })
      setSuccess(true)
      setCurrent(''); setNext(''); setConfirm('')
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to update password')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-sm space-y-4">
      <Field label="Current password">
        <PasswordInput value={current} onChange={e => setCurrent(e.target.value)} required autoComplete="current-password" className={inputCls} />
      </Field>
      <Field label="New password">
        <PasswordInput value={next} onChange={e => setNext(e.target.value)} required autoComplete="new-password" className={inputCls} />
      </Field>
      <Field label="Confirm new password">
        <PasswordInput value={confirm} onChange={e => setConfirm(e.target.value)} required autoComplete="new-password" className={inputCls} />
      </Field>
      {error   && <p className="text-sm text-[var(--color-error)]">{error}</p>}
      {success && <p className="text-sm text-[var(--color-success)]">Password updated successfully.</p>}
      <button type="submit" disabled={saving}
        className="rounded-md bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-60">
        {saving ? 'Saving…' : 'Update password'}
      </button>
    </form>
  )
}

// ── Edit Profile Tab ──────────────────────────────────────────────────────────

function EditProfileTab() {
  const qc = useQueryClient()
  const { data: profile } = useQuery({ queryKey: ['affiliate-profile'], queryFn: () => apiClient.affiliateProfile() })
  const { data: me } = useQuery({ queryKey: ['affiliate-me'], queryFn: () => apiClient.affiliateMe() })

  const [saving, setSaving]     = useState(false)
  const [isDirty, setDirty]     = useState(false)
  const [error, setError]       = useState<string | null>(null)

  // Basic info
  const [name, setName]                     = useState('')
  const [country, setCountry]               = useState('')
  const [accountType, setAccountType]       = useState('')
  const [companyName, setCompanyName]       = useState('')
  const [websiteUrl, setWebsiteUrl]         = useState('')
  const [primaryLanguage, setPrimaryLanguage] = useState('')
  // Audience
  const [audienceLocations, setAudLoc]      = useState<string[]>([])
  const [audienceTypes, setAudType]         = useState<string[]>([])
  const [monthlyTraffic, setTraffic]        = useState('')
  // Promotion
  const [promotionMethods, setPromoMethods] = useState<string[]>([])
  const [runsBrandedKw, setBrandedKw]       = useState<boolean | null>(null)
  // Social
  const [socialInstagram, setSocialIG]      = useState('')
  const [socialTiktok, setSocialTT]         = useState('')
  const [socialYoutube, setSocialYT]        = useState('')
  const [newsletterSize, setNewsletterSize] = useState('')
  // Experience
  const [hasAffiliateExp, setHasExp]        = useState<boolean | null>(null)
  const [expIndustries, setExpInd]          = useState<string[]>([])
  const [expMonthlyBookings, setExpBookings] = useState('')
  // Payment
  const [paymentMethod, setPaymentMethod]   = useState('')
  const [paymentCurrency, setPaymentCurrency] = useState('')
  const [taxId, setTaxId]                   = useState('')

  useEffect(() => {
    if (me) setName(me.name ?? '')
    if (!profile) return
    if (profile.country) setCountry(profile.country)
    if (profile.accountType) setAccountType(profile.accountType)
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
    setDirty(false)
  }, [profile, me])

  const hasPaidAds = promotionMethods.includes('Paid ads (Google / Meta)')

  async function handleSave() {
    setError(null)
    setSaving(true)
    try {
      if (name.trim() !== (me?.name ?? '')) {
        await apiClient.updateMyAdminProfile({ name: name.trim() })
      }
      await apiClient.affiliateUpdateProfile({
        country: country || null,
        accountType: accountType || null,
        companyName: companyName || null,
        websiteUrl: websiteUrl || null,
        primaryLanguage: primaryLanguage || null,
        audienceLocations,
        audienceTypes,
        monthlyTraffic: monthlyTraffic || null,
        promotionMethods,
        runsBrandedKw: hasPaidAds ? (runsBrandedKw ?? false) : null,
        socialInstagram: socialInstagram || null,
        socialTiktok: socialTiktok || null,
        socialYoutube: socialYoutube || null,
        newsletterSize: newsletterSize || null,
        hasAffiliateExp,
        expIndustries,
        expMonthlyBookings: expMonthlyBookings || null,
        paymentMethod: paymentMethod || null,
        paymentCurrency: paymentCurrency || null,
        taxId: taxId || null,
      })
      await qc.invalidateQueries({ queryKey: ['affiliate-profile'] })
      await qc.invalidateQueries({ queryKey: ['affiliate-me'] })
      setDirty(false)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  function SectionHeader({ title }: { title: string }) {
    return <h3 className="border-t border-[var(--color-border)] pt-6 text-sm font-semibold text-[var(--color-text)]">{title}</h3>
  }

  function d<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setDirty(true) }
  }

  return (
    <form onSubmit={e => { e.preventDefault(); void handleSave() }} className="space-y-5">

      {/* Basic info */}
      <h3 className="text-sm font-semibold text-[var(--color-text)]">Basic Information</h3>
      <Field label="Full name">
        <input type="text" value={name} onChange={e => d(setName)(e.target.value)} className={inputCls} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Country" optional>
          <select value={country} onChange={e => d(setCountry)(e.target.value)} className={inputCls}>
            <option value="">Select…</option>
            {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Account type" optional>
          <div className="flex gap-2 pt-0.5">
            {(['individual', 'company'] as const).map(t => (
              <button key={t} type="button" onClick={() => d(setAccountType)(t)}
                className={['flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                  accountType === t
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                    : 'border-[var(--color-border)] text-[var(--color-text-muted)]',
                ].join(' ')}>
                {t === 'individual' ? 'Individual' : 'Company'}
              </button>
            ))}
          </div>
        </Field>
      </div>
      <Field label="Company name" optional>
        <input type="text" value={companyName} onChange={e => d(setCompanyName)(e.target.value)} className={inputCls} />
      </Field>
      <Field label="Website URL" optional>
        <input type="url" value={websiteUrl} onChange={e => d(setWebsiteUrl)(e.target.value)} placeholder="https://yoursite.com" className={inputCls} />
      </Field>
      <Field label="Primary language" optional>
        <select value={primaryLanguage} onChange={e => d(setPrimaryLanguage)(e.target.value)} className={inputCls}>
          <option value="">Select…</option>
          {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      </Field>

      {/* Audience */}
      <SectionHeader title="Audience & Reach" />
      <Field label="Primary audience location">
        <div className="flex flex-wrap gap-2 pt-1">
          {AUDIENCE_LOCATIONS.map(l => <Chip key={l} label={l} active={audienceLocations.includes(l)} onClick={() => d(setAudLoc)(toggle(audienceLocations, l))} />)}
        </div>
      </Field>
      <Field label="Audience type">
        <div className="flex flex-wrap gap-2 pt-1">
          {AUDIENCE_TYPES.map(t => <Chip key={t} label={t} active={audienceTypes.includes(t)} onClick={() => d(setAudType)(toggle(audienceTypes, t))} />)}
        </div>
      </Field>
      <Field label="Monthly traffic" optional>
        <div className="flex flex-wrap gap-2 pt-1">
          {TRAFFIC_OPTIONS.map(o => <Chip key={o} label={o} active={monthlyTraffic === o} onClick={() => d(setTraffic)(o)} />)}
        </div>
      </Field>

      {/* Promotion */}
      <SectionHeader title="Promotion Methods" />
      <Field label="How do you promote?">
        <div className="flex flex-col gap-2 pt-1">
          {PROMO_METHODS.map(m => (
            <label key={m} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-[var(--color-border)] px-3 py-2.5 transition-colors hover:border-[var(--color-primary)]">
              <input type="checkbox" checked={promotionMethods.includes(m)} onChange={() => d(setPromoMethods)(toggle(promotionMethods, m))} className="accent-[var(--color-primary)]" />
              <span className="text-sm text-[var(--color-text)]">{m}</span>
            </label>
          ))}
        </div>
      </Field>
      {hasPaidAds && (
        <Field label="Do you run branded keyword campaigns?">
          <div className="flex gap-3 pt-1">
            {[true, false].map(v => (
              <button key={String(v)} type="button" onClick={() => d(setBrandedKw)(v)}
                className={['flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                  runsBrandedKw === v
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                    : 'border-[var(--color-border)] text-[var(--color-text-muted)]',
                ].join(' ')}>
                {v ? 'Yes' : 'No'}
              </button>
            ))}
          </div>
        </Field>
      )}

      {/* Social */}
      <SectionHeader title="Social Channels" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Instagram" optional>
          <input type="url" value={socialInstagram} onChange={e => d(setSocialIG)(e.target.value)} placeholder="https://instagram.com/…" className={inputCls} />
        </Field>
        <Field label="TikTok" optional>
          <input type="url" value={socialTiktok} onChange={e => d(setSocialTT)(e.target.value)} placeholder="https://tiktok.com/@…" className={inputCls} />
        </Field>
        <Field label="YouTube" optional>
          <input type="url" value={socialYoutube} onChange={e => d(setSocialYT)(e.target.value)} placeholder="https://youtube.com/@…" className={inputCls} />
        </Field>
        <Field label="Newsletter subscribers" optional>
          <div className="flex flex-wrap gap-2 pt-1">
            {NEWSLETTER_SIZES.map(s => <Chip key={s} label={s} active={newsletterSize === s} onClick={() => d(setNewsletterSize)(s)} />)}
          </div>
        </Field>
      </div>

      {/* Experience */}
      <SectionHeader title="Experience" />
      <Field label="Have you worked with affiliate programs before?" optional>
        <div className="flex gap-3 pt-1">
          {[true, false].map(v => (
            <button key={String(v)} type="button" onClick={() => d(setHasExp)(v)}
              className={['flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                hasAffiliateExp === v
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                  : 'border-[var(--color-border)] text-[var(--color-text-muted)]',
              ].join(' ')}>
              {v ? 'Yes' : 'No'}
            </button>
          ))}
        </div>
      </Field>
      {hasAffiliateExp && (
        <>
          <Field label="Industries" optional>
            <div className="flex flex-wrap gap-2 pt-1">
              {INDUSTRIES.map(i => <Chip key={i} label={i} active={expIndustries.includes(i)} onClick={() => d(setExpInd)(toggle(expIndustries, i))} />)}
            </div>
          </Field>
          <Field label="Estimated monthly bookings" optional>
            <div className="flex flex-wrap gap-2 pt-1">
              {BOOKING_RANGES.map(r => <Chip key={r} label={r} active={expMonthlyBookings === r} onClick={() => d(setExpBookings)(r)} />)}
            </div>
          </Field>
        </>
      )}

      {/* Payment */}
      <SectionHeader title="Payment" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Payment method" optional>
          <div className="flex flex-wrap gap-2 pt-1">
            {PAYMENT_METHODS.map(m => <Chip key={m} label={m} active={paymentMethod === m} onClick={() => d(setPaymentMethod)(m)} />)}
          </div>
        </Field>
        <Field label="Currency" optional>
          <div className="flex flex-wrap gap-2 pt-1">
            {CURRENCIES.map(c => <Chip key={c} label={c} active={paymentCurrency === c} onClick={() => d(setPaymentCurrency)(c)} />)}
          </div>
        </Field>
      </div>
      <Field label="Tax ID / VAT number" optional>
        <input type="text" value={taxId} onChange={e => d(setTaxId)(e.target.value)} placeholder="Optional" className={inputCls} />
      </Field>

      {error && <p className="text-sm text-[var(--color-error)]">{error}</p>}

      <SaveBar isDirty={isDirty} isSaving={saving} onSave={handleSave} />
    </form>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

function AffiliateAccountContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const activeTab = searchParams.get('tab') === 'profile' ? 'profile' : 'password'

  function setTab(tab: string) {
    router.replace(`/affiliate/account?tab=${tab}`)
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold text-[var(--color-text)]">Account Settings</h1>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-1 w-fit">
        {[
          { key: 'password', label: 'Change Password' },
          { key: 'profile',  label: 'Edit Profile' },
        ].map(t => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={['rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
              activeTab === t.key
                ? 'bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
            ].join(' ')}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
        {activeTab === 'password' ? <ChangePasswordTab /> : <EditProfileTab />}
      </div>
    </div>
  )
}

export default function AffiliateAccountPage() {
  return (
    <Suspense>
      <AffiliateAccountContent />
    </Suspense>
  )
}
