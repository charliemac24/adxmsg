import Link from 'next/link';
import { useState } from 'react';
import IconNotePencil from './IconNotePencil';

const sidebarStyle = {
  width: 250,
  background: '#f8fafc',
  height: '100vh',
  padding: '24px 0',
  boxShadow: '2px 0 8px #f0f1f2',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  position: 'sticky',
  top: 0,
  zIndex: 1200,
  overflowY: 'auto',
};

const logoStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  marginBottom: 28,
};

const navStyle = {
  width: '100%',
};

const sectionTitle = {
  color: '#888',
  fontSize: 13,
  margin: '24px 0 8px 32px',
  textTransform: 'uppercase',
  letterSpacing: 1,
};

const linkStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '10px 32px',
  color: '#222',
  textDecoration: 'none',
  borderLeft: '4px solid transparent',
  fontWeight: 500,
  fontSize: 16,
};

const hoverBg = '#eef3f7';
const hoverBorder = '#46aa42';

function SidebarLink({ href, children, id, hoverId, setHoverId }) {
  const isHover = hoverId === id;
  return (
    <Link href={href} style={{ ...linkStyle, background: isHover ? hoverBg : 'transparent', borderLeft: `4px solid ${isHover ? hoverBorder : 'transparent'}` }} onMouseEnter={() => setHoverId(id)} onMouseLeave={() => setHoverId(null)} onFocus={() => setHoverId(id)} onBlur={() => setHoverId(null)}>
      {children}
    </Link>
  );
}

export default function Sidebar() {
  const [hoverId, setHoverId] = useState(null);
  return (
    <aside style={sidebarStyle}>
      <div style={logoStyle}>
        <img src="/images/adxmsg-logo.png" alt="ADX MSG" style={{ height: 48, objectFit: 'contain' }} />
      </div>
      <nav style={navStyle}>
        <SidebarLink href="/dashboard" id="dashboard" hoverId={hoverId} setHoverId={setHoverId}><span>📊</span> Dashboard</SidebarLink>

        <div style={sectionTitle}>Contacts</div>
        <SidebarLink href="/contacts" id="all-contacts" hoverId={hoverId} setHoverId={setHoverId}><span>👥</span> All Contacts</SidebarLink>
        <SidebarLink href="/contacts/import" id="import-contacts" hoverId={hoverId} setHoverId={setHoverId}><span>⬆️</span> Import Contacts</SidebarLink>
        <SidebarLink href="/groups" id="manage-groups" hoverId={hoverId} setHoverId={setHoverId}><span>🗂️</span> Manage Groups</SidebarLink>
        <SidebarLink href="/address-states" id="manage-states" hoverId={hoverId} setHoverId={setHoverId}><span>🏷️</span> Manage Address States</SidebarLink>

        <div style={sectionTitle}>SMS</div>
        <SidebarLink href="/sms/inbox" id="sms-inbox" hoverId={hoverId} setHoverId={setHoverId}><span>✉️</span> Inbox</SidebarLink>
        <SidebarLink href="/sms/create" id="sms-create" hoverId={hoverId} setHoverId={setHoverId}><span>✍️</span> Create SMS</SidebarLink>
        <SidebarLink href="/sms/campaign" id="sms-campaign" hoverId={hoverId} setHoverId={setHoverId}><span>📣</span> Campaign</SidebarLink>
        <SidebarLink href="/sms/sent" id="sms-sent" hoverId={hoverId} setHoverId={setHoverId}><span>📤</span> Sent Items</SidebarLink>

  {/* Mailchimp Sync link removed */}
      </nav>
    </aside>
  );
}