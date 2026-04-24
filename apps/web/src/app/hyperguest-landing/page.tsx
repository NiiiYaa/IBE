import type { Metadata } from 'next'
import Image from 'next/image'
import { ZohoForm } from './ZohoForm'

export const metadata: Metadata = {
  title: 'HyperGuest — The Native AI Booking Engine',
  description: 'The Native AI Booking Engine. Book directly with the hotels you love.',
  icons: { icon: '/hg-favicon.png' },
}

const externalIcon = (
  <svg className="h-5 w-5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
  </svg>
)

const downloadIcon = (
  <svg className="h-5 w-5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
)

const loginIcon = (
  <svg className="h-5 w-5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
  </svg>
)

const cardCls = 'flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md'

export default function HyperGuestLanding() {
  return (
    <div className="flex min-h-screen flex-col bg-white font-sans text-gray-900">

      {/* Header — logo */}
      <header className="flex justify-center px-6 pt-14 pb-8">
        <Image
          src="/hg-logo-landing.png"
          alt="HyperGuest"
          width={280}
          height={72}
          priority
          className="h-auto w-auto max-w-[240px] sm:max-w-[280px]"
        />
      </header>

      {/* Hero — slogan */}
      <section className="flex flex-col items-center px-6 pb-16 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl md:text-5xl">
          The Native AI Booking Engine.
        </h1>
      </section>

      {/* Links */}
      <section className="mx-auto w-full max-w-2xl px-6 pb-20">
        <div className="flex flex-col gap-4">
          <a href="https://www.hyperguest.com/" target="_blank" rel="noopener noreferrer" className={cardCls}>
            <div>
              <p className="text-lg font-semibold text-gray-900">HyperGuest</p>
              <p className="mt-1 text-sm text-gray-500">www.hyperguest.com</p>
            </div>
            {externalIcon}
          </a>

          <a href="/HG-IBE-Admin-User-Manual.pdf" download className={cardCls}>
            <div>
              <p className="text-lg font-semibold text-gray-900">IBE Whitepaper</p>
              <p className="mt-1 text-sm text-gray-500">Download PDF</p>
            </div>
            {downloadIcon}
          </a>

          <a href="/admin" className={cardCls}>
            <div>
              <p className="text-lg font-semibold text-gray-900">IBE Admin Login</p>
              <p className="mt-1 text-sm text-gray-500">Manage your booking engine</p>
            </div>
            {loginIcon}
          </a>
        </div>
      </section>

      {/* Contact */}
      <section className="flex-1 bg-gray-50 px-6 py-16">
        <div className="mx-auto max-w-2xl">
          <h2 className="mb-2 text-xl font-semibold text-gray-900">Get in touch</h2>
          <p className="mb-8 text-sm text-gray-500">Have a question or want to learn more? Send us a message.</p>
          <ZohoForm />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 bg-white px-6 py-8 text-center text-xs text-gray-400">
        © {new Date().getFullYear()} HyperGuest. All rights reserved.
      </footer>
    </div>
  )
}
