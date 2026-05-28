interface Props {
  step: { id: string; title: string; description: string };
}

export function UserActionStep({ step }: Props) {
  return (
    <div style={{ textAlign: 'center', padding: '2rem' }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📋</div>
      <h2 style={{ marginBottom: '0.5rem' }}>{step.title}</h2>
      <p style={{ color: '#444', fontSize: '1.05rem', lineHeight: 1.6 }}>{step.description}</p>
      <div style={{ marginTop: '2rem', padding: '1rem', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
        <p style={{ color: '#15803d', fontWeight: 600, margin: 0 }}>What happens next?</p>
        <p style={{ color: '#166534', margin: '0.5rem 0 0', fontSize: '0.9rem' }}>
          Your HyperGuest team will review your connection and reach out within 24 hours to confirm your listing is live.
        </p>
      </div>
    </div>
  );
}
