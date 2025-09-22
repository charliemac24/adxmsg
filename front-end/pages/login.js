import { useState } from 'react';
import { useRouter } from 'next/router';
import API from '../utils/apiConfig';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const router = useRouter();

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.message || 'Login failed');
        setLoading(false);
        return;
      }
      if (typeof window !== 'undefined') {
        localStorage.setItem('msd_token', body.token);
        localStorage.setItem('msd_user', JSON.stringify(body.user || {}));
      }
      router.push('/dashboard');
    } catch (err) {
      setError('Network error');
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, background: 'radial-gradient(circle at 10% 20%, #f8fbfc 0%, #eef6f8 30%, #f1f5f9 100%), linear-gradient(180deg, #f6fbfa 0%, #f1f5f9 100%)' }}>
      {/* subtle diagonal stripe overlay */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(135deg, rgba(255,255,255,0.02) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.02) 50%, rgba(255,255,255,0.02) 75%, transparent 75%, transparent)', backgroundSize: '28px 28px', pointerEvents: 'none' }} />
      <div style={{ width: '100%', maxWidth: 980, borderRadius: 16, overflow: 'hidden', display: 'flex', boxShadow: '0 30px 80px rgba(2,6,23,0.12), inset 0 1px 0 rgba(255,255,255,0.5)', background: 'white', position: 'relative', zIndex: 2 }}>
        {/* Left visual panel (ADXDepot green) */}
        <div style={{ flex: 1, background: 'linear-gradient(135deg,#2f8f33 0%,#46aa42 60%)', color: 'white', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '64px' }}>
          <div style={{ maxWidth: 520 }}>
            <h1 style={{ fontSize: 40, margin: 0, lineHeight: 1.05 }}>ADXDepot SMS Portal</h1>
            <p style={{ marginTop: 18, opacity: 0.95, fontSize: 16 }}>Send and manage SMS campaigns · Contact management · Delivery analytics · Opt-out handling</p>
            <div style={{ marginTop: 28, display: 'flex', gap: 12 }}>
              <div style={{ background: 'rgba(255,255,255,0.08)', padding: '10px 14px', borderRadius: 8 }}>Campaigns</div>
              <div style={{ background: 'rgba(255,255,255,0.08)', padding: '10px 14px', borderRadius: 8 }}>Contacts</div>
              <div style={{ background: 'rgba(255,255,255,0.08)', padding: '10px 14px', borderRadius: 8 }}>Analytics</div>
            </div>
          </div>
        </div>

        {/* Right form panel */}
  <div style={{ width: 420, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, background: '#f8fafc' }}>
          <div style={{ width: '100%', maxWidth: 360 }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                <img src="/images/adxmsg-logo.png" alt="ADX" style={{ height: 42 }} />
              </div>
            <h2 style={{ textAlign: 'center', marginTop: 6, marginBottom: 6 }}>Login</h2>
            <p style={{ textAlign: 'center', marginTop: 0, marginBottom: 18, color: '#475569', fontSize: 13 }}>Enter your credentials to continue</p>
            {error ? <div style={{ color: '#dc2626', marginBottom: 12, textAlign: 'center' }}>{error}</div> : null}
            <form onSubmit={submit}>
              <label style={{ display: 'block', fontSize: 13, color: '#334155', marginBottom: 8 }}>Username</label>
              <input value={username} onChange={e => setUsername(e.target.value)} required placeholder="Enter your username" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e6eef5', marginBottom: 12, outline: 'none' }} />

              <label style={{ display: 'block', fontSize: 13, color: '#334155', marginBottom: 8 }}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="password" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e6eef5', marginBottom: 12, outline: 'none' }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#475569' }}>
                  <input type="checkbox" style={{ width: 14, height: 14 }} /> Remember me
                </label>
                {/* removed Forgot password link as requested */}
                <div />
              </div>

              <button type="submit" disabled={loading} style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: 'none', background: '#46aa42', color: 'white', fontWeight: 700, boxShadow: '0 8px 18px rgba(70,170,66,0.12)' }}>
                {loading ? 'Signing in...' : 'Login'}
              </button>
            </form>

            <div style={{ textAlign: 'center', marginTop: 16, color: '#94a3b8', fontSize: 13 }}>
              Don't have an account? <a href="#" style={{ color: '#46aa42' }}>Contact admin</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
