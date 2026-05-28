export default function PendingPage() {
  return (
    <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem', textAlign: 'center' }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
      <h1 style={{ marginBottom: '0.5rem' }}>You&apos;re all set!</h1>
      <p style={{ color: '#444', fontSize: '1.05rem', maxWidth: '480px', lineHeight: 1.6 }}>
        Your property has been successfully connected. Our team will review your setup and reach out within 24 hours to confirm you&apos;re live on HyperGuest.
      </p>
      <div style={{ marginTop: '2rem', padding: '1rem 1.5rem', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0', maxWidth: '400px' }}>
        <p style={{ color: '#15803d', fontWeight: 600, margin: 0 }}>What happens next?</p>
        <p style={{ color: '#166534', margin: '0.5rem 0 0', fontSize: '0.9rem' }}>
          HyperGuest will verify your connection, activate your listing, and notify you when buyers can start booking.
        </p>
      </div>
    </main>
  );
}
