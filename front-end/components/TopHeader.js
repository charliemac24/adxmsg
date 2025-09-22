import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import API_BASE_URL from '../utils/apiConfig';

export default function TopHeader({ titleOverride }) {
  const router = useRouter();
  const [twilioInfo, setTwilioInfo] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchTwilioInfo();
    const iv = setInterval(() => fetchTwilioInfo(), 60000);
    return () => clearInterval(iv);
  }, []);

  const fetchTwilioInfo = async () => {
    setLoading(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('msd_token') : null;
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE_URL}/api/v1/twilio/balance`, { headers });
      if (res.ok) {
        const body = await res.json();
        if (body && body.data) setTwilioInfo(body.data);
      }
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('msd_token') : null;
    try {
      await fetch(`${API_BASE_URL}/api/v1/auth/logout`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    } catch (e) {
      // ignore
    }
    if (typeof window !== 'undefined') {
      localStorage.removeItem('msd_token');
      localStorage.removeItem('msd_user');
      window.location.href = '/login';
    }
  };

  // derive page title from route if not overridden
  const deriveTitle = () => {
    if (titleOverride) return titleOverride;
    const path = router.pathname || '';
    if (path === '/' || path === '/dashboard') return 'Dashboard';
    if (path.startsWith('/contacts')) return path === '/contacts' ? 'All Contacts' : 'Contacts';
    if (path.startsWith('/sms')) {
      if (path.includes('/inbox')) return 'SMS Inbox';
      if (path.includes('/create')) return 'Create SMS';
      if (path.includes('/campaign')) return 'Campaign';
      if (path.includes('/sent')) return 'Sent Items';
      return 'SMS';
    }
    if (path.startsWith('/groups')) return 'Groups';
    if (path.startsWith('/address-states')) return 'Address States';
    if (path.startsWith('/unsubscribed')) return 'Unsubscribed';
    return path.replace('/', '').replace('-', ' ').replace('/', ' ').replace(/(^|\s)\S/g, l => l.toUpperCase()) || 'App';
  };

  const title = deriveTitle();

  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 1300, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 24px', background: '#fff', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#111' }}>{title}</div>
      </div>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginRight: 8 }}>
          <div style={{ fontSize: 12, color: '#666' }}>Account</div>
          <div style={{ fontWeight: 700 }}>{twilioInfo && twilioInfo.friendly_name ? twilioInfo.friendly_name : (twilioInfo && twilioInfo.account_sid ? twilioInfo.account_sid : 'Twilio')}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginRight: 12 }}>
          <div style={{ fontSize: 12, color: '#666' }}>Available Credits</div>
          <div style={{ fontWeight: 800, color: '#0b1220' }}>{loading ? '…' : (twilioInfo && twilioInfo.balance !== null ? `${twilioInfo.balance} ${twilioInfo.currency || ''}` : 'N/A')}</div>
        </div>

        <div style={{ width: 44, height: 44, borderRadius: 44, background: '#f2f6fa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 36, height: 36, borderRadius: 36, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#334155' }}>
            {twilioInfo && twilioInfo.friendly_name ? twilioInfo.friendly_name.split(' ').map(s => s[0]).slice(0,2).join('').toUpperCase() : 'TW'}
          </div>
        </div>
  <button onClick={logout} style={{ marginLeft: 8, padding: '8px 10px', borderRadius: 6, border: '1px solid #eee', background: '#fff' }}>Logout</button>
      </div>
    </div>
  );
}
