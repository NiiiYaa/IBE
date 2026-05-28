'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  step: { id: string; title: string; description: string };
  onComplete: () => void;
}

interface SseEvent {
  type: 'start' | 'progress' | 'complete' | 'error';
  message?: string;
  stepId?: string;
  data?: Record<string, unknown>;
}

export function AutomatedStep({ step, onComplete }: Props) {
  const [messages, setMessages] = useState<string[]>([]);
  const [status, setStatus] = useState<'running' | 'done' | 'error'>('running');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const apiUrl = process.env['NEXT_PUBLIC_ONBOARDING_API_URL'] ?? 'http://localhost:3003';
    const es = new EventSource(`${apiUrl}/wizard/execute`, { withCredentials: true });

    es.onmessage = (e) => {
      const event: SseEvent = JSON.parse(e.data as string);
      if (event.type === 'progress' && event.message) {
        setMessages((prev) => [...prev, event.message!]);
      } else if (event.type === 'complete') {
        setStatus('done');
        es.close();
        setTimeout(onComplete, 800);
      } else if (event.type === 'error') {
        setMessages((prev) => [...prev, `Error: ${event.message ?? 'Unknown'}`]);
        setStatus('error');
        es.close();
      }
    };

    es.onerror = () => {
      setStatus('error');
      setMessages((prev) => [...prev, 'Connection lost']);
      es.close();
    };

    return () => es.close();
  }, [onComplete]);

  return (
    <div style={{ textAlign: 'center', padding: '2rem' }}>
      <h2 style={{ marginBottom: '0.5rem' }}>{step.title}</h2>
      <p style={{ color: '#666', marginBottom: '2rem' }}>{step.description}</p>

      {status === 'running' && <div style={{ marginBottom: '1rem', color: '#2563eb' }}>Working...</div>}
      {status === 'done' && <div style={{ color: '#16a34a', fontWeight: 600 }}>Done ✓</div>}
      {status === 'error' && <div style={{ color: '#dc2626' }}>Something went wrong. Please try again.</div>}

      <ul style={{ textAlign: 'left', listStyle: 'none', padding: 0, marginTop: '1rem' }}>
        {messages.map((m, i) => (
          <li key={i} style={{ padding: '0.25rem 0', color: status === 'error' && i === messages.length - 1 ? '#dc2626' : '#374151', fontSize: '0.9rem' }}>
            {m}
          </li>
        ))}
      </ul>
    </div>
  );
}
