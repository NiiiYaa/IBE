export default function AffiliateTermsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 py-2">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">Affiliate Program Agreement</h1>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          This Affiliate Program Agreement (&ldquo;Agreement&rdquo;) is entered into by and between{' '}
          <strong>HPG R&amp;D LTD (DBA: HyperGuest)</strong>, a company organized under the laws of Israel,
          with its principal place of business at Derech Menachem Begin 11, Rogovin Tidhar Tower, 7th Floor,
          Ramat Gan 526810, Israel (&ldquo;Platform&rdquo;), and the Affiliate as identified during registration
          (&ldquo;Affiliate&rdquo;).
        </p>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          By registering and participating in the Affiliate Program, the Affiliate agrees to be bound by the terms set forth below.
        </p>
      </div>

      <Section title="1. Definitions">
        <Def term="&ldquo;Platform&rdquo;">The system operated by HyperGuest that enables booking of hotel accommodations.</Def>
        <Def term="&ldquo;Hotel Partner&rdquo;">Any hotel or accommodation provider listed on the Platform.</Def>
        <Def term="&ldquo;Affiliate Link&rdquo;">A unique tracking link assigned to the Affiliate.</Def>
        <Def term="&ldquo;Qualified Booking&rdquo;">A completed and non-cancelled booking made via an Affiliate Link and eligible for commission.</Def>
        <Def term="&ldquo;Commission&rdquo;">The compensation payable to the Affiliate for Qualified Bookings.</Def>
      </Section>

      <Section title="2. Enrollment & Eligibility">
        <p>2.1 The Affiliate must provide accurate and complete information during registration.</p>
        <p>2.2 The Platform reserves the right to approve, reject, or revoke any Affiliate application at its sole discretion.</p>
        <p>2.3 The Affiliate must be at least 18 years of age and legally capable of entering into binding agreements.</p>
      </Section>

      <Section title="3. Affiliate Rights & Responsibilities">
        <p>3.1 The Affiliate is granted a non-exclusive, revocable, limited right to promote Hotel Partners listed on the Platform.</p>
        <p>3.2 The Affiliate agrees to:</p>
        <ul>
          <li>Promote hotels in a truthful, ethical, and lawful manner</li>
          <li>Avoid misleading, deceptive, or false claims</li>
          <li>Comply with all applicable laws and regulations</li>
        </ul>
        <p>3.3 The Affiliate shall be solely responsible for:</p>
        <ul>
          <li>Content published on its channels</li>
          <li>Marketing methods and traffic sources</li>
          <li>Compliance with advertising and consumer protection laws</li>
        </ul>
      </Section>

      <Section title="4. Prohibited Activities">
        <p>The Affiliate shall NOT:</p>
        <ul>
          <li>Engage in spam, unsolicited communications, or misleading advertising</li>
          <li>Use the Platform&rsquo;s or Hotel Partners&rsquo; brand names for unauthorized paid advertising (e.g., trademark bidding) unless explicitly approved</li>
          <li>Misrepresent pricing, availability, or hotel details</li>
          <li>Use coupon, cashback, or incentive-based promotions without prior approval</li>
          <li>Generate fraudulent bookings or artificial traffic</li>
        </ul>
        <p>The Platform reserves the right to suspend or terminate accounts engaging in such activities immediately.</p>
      </Section>

      <Section title="5. Tracking & Attribution">
        <p>5.1 The Platform will track referrals via Affiliate Links and related technologies (e.g., cookies).</p>
        <p>5.2 Attribution model:</p>
        <ul>
          <li>Default: last-click attribution</li>
          <li>Attribution window: 30 days</li>
        </ul>
        <p>5.3 The Platform is not responsible for tracking failures due to browser restrictions, ad blockers, or incorrect link usage.</p>
      </Section>

      <Section title="6. Commissions & Payments">
        <p>6.1 The Affiliate shall earn commissions on Qualified Bookings only.</p>
        <p>6.2 A booking qualifies only if it is completed and not cancelled or refunded, and the guest has completed the stay.</p>
        <p>6.3 Commission status: Pending → Approved → Payable</p>
        <p>6.4 The Platform reserves the right to reverse commissions for cancellations, fraud, or policy violations, and to adjust commission rates at any time.</p>
        <p>6.5 Payments are made on a monthly basis, subject to a minimum payout threshold of $50, via the selected payment method.</p>
        <p>6.6 The Affiliate is responsible for all applicable taxes.</p>
      </Section>

      <Section title="7. Hotel Partner Participation">
        <p>7.1 Hotel Partners may opt in or out of the affiliate program and define commission structures and promotional terms.</p>
        <p>7.2 The Platform does not guarantee availability of specific hotels or consistent commission rates.</p>
      </Section>

      <Section title="8. Intellectual Property">
        <p>8.1 The Affiliate is granted a limited license to use Platform branding and hotel content (images, descriptions).</p>
        <p>8.2 The Affiliate shall NOT modify or misuse brand assets, or imply partnership beyond this Agreement. All intellectual property rights remain with the Platform and Hotel Partners.</p>
      </Section>

      <Section title="9. Data Protection & Privacy">
        <p>9.1 The Affiliate agrees to comply with all applicable data protection laws (e.g., GDPR where applicable).</p>
        <p>9.2 The Affiliate shall not collect or misuse personal data without proper consent, or store customer data obtained through the Platform.</p>
      </Section>

      <Section title="10. Term & Termination">
        <p>10.1 This Agreement remains in effect until terminated by either party.</p>
        <p>10.2 The Platform may terminate immediately in case of breach of Agreement, fraudulent or prohibited activity, or reputational risk.</p>
        <p>10.3 Upon termination, all Affiliate Links must be removed. Outstanding commissions may be withheld in case of violations.</p>
      </Section>

      <Section title="11. Limitation of Liability">
        <p>The Platform shall not be liable for indirect or consequential damages, loss of revenue, profits, or data, or actions of Hotel Partners. Total liability shall not exceed the commissions paid to the Affiliate in the preceding 3 months.</p>
      </Section>

      <Section title="12. Indemnification">
        <p>The Affiliate agrees to indemnify and hold harmless the Platform and Hotel Partners from any claims arising from the Affiliate&rsquo;s marketing activities, breach of this Agreement, or violation of laws or third-party rights.</p>
      </Section>

      <Section title="13. Modifications">
        <p>The Platform reserves the right to modify this Agreement at any time. Continued participation constitutes acceptance of updated terms.</p>
      </Section>

      <Section title="14. Governing Law">
        <p>This Agreement shall be governed by the laws of the State of Israel, and any disputes shall be subject to the exclusive jurisdiction of its courts.</p>
      </Section>

      <Section title="15. Entire Agreement">
        <p>This Agreement constitutes the entire agreement between the parties and supersedes all prior agreements or understandings. By registering, the Affiliate acknowledges and agrees to these terms.</p>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-3 text-base font-semibold text-[var(--color-text)]">{title}</h2>
      <div className="space-y-2 text-sm text-[var(--color-text-muted)] [&_ul]:mt-1 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        {children}
      </div>
    </div>
  )
}

function Def({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <p>
      <strong className="text-[var(--color-text)]">{term}</strong>{' '}
      {children}
    </p>
  )
}
