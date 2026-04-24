import type { Metadata } from 'next'
import Image from 'next/image'
import { LandingCards } from './LandingCards'

export const metadata: Metadata = {
  title: 'HyperGuest — The Native AI Booking Engine',
  description: 'The Native AI Booking Engine. Book directly with the hotels you love.',
  icons: { icon: '/hg-favicon.png' },
}

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

      {/* Cards */}
      <section className="mx-auto w-full max-w-2xl flex-1 px-6 pb-20">
        <LandingCards />
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 bg-white px-6 py-8 text-center text-xs text-gray-400">
        © {new Date().getFullYear()} HyperGuest. All rights reserved.
      </footer>
    </div>
  )
}
