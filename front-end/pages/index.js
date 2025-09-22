import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

export default function Home() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // run only on client — localStorage is not available on server
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('msd_token') : null;
      if (token) {
        router.replace('/dashboard');
      } else {
        router.replace('/login');
      }
    } catch (e) {
      // fallback
      router.replace('/login');
    } finally {
      setChecking(false);
    }
  }, [router]);

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>Redirecting…</h1>
      <p>If you are not redirected automatically, choose: <a href="/dashboard">Dashboard</a> or <a href="/login">Login</a>.</p>
      {checking ? <p style={{ color: '#64748b' }}>Checking authentication…</p> : null}
    </div>
  );
}