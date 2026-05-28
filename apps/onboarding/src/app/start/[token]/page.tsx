import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

interface Props {
  params: { token: string };
}

export default async function StartPage({ params }: Props) {
  const { token } = params;

  if (!token) redirect('/');

  const apiUrl = process.env['NEXT_PUBLIC_ONBOARDING_API_URL'] ?? 'http://localhost:3003';

  try {
    const res = await fetch(`${apiUrl}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      cache: 'no-store',
    });

    if (!res.ok) {
      const text = await res.text();
      return (
        <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem' }}>
          <h2>Invalid or Expired Invitation</h2>
          <p style={{ color: '#666' }}>{text || 'This invitation link is no longer valid.'}</p>
        </main>
      );
    }

    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const cookieStore = cookies();
      const match = setCookie.match(/onb_session=([^;]+)/);
      const sessionValue = match?.[1];
      if (sessionValue) {
        cookieStore.set('onb_session', sessionValue, {
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
          maxAge: 60 * 60 * 24 * 7,
        });
      }
    }
  } catch {
    return (
      <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <h2>Something went wrong</h2>
        <p>Please try again or contact support.</p>
      </main>
    );
  }

  redirect('/wizard');
}
