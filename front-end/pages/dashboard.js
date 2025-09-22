import { useEffect, useState } from "react";
import API_BASE_URL from "../utils/apiConfig";

export default function Dashboard() {
  const [contactCount, setContactCount] = useState(0);
  const [unsubscribedCount, setUnsubscribedCount] = useState(0);
  const [subscribedCount, setSubscribedCount] = useState(0);
  const [twilioInfo, setTwilioInfo] = useState(null);

  const [recentMessages, setRecentMessages] = useState([]);
  const [recentTotal, setRecentTotal] = useState(0);

  const [campaigns, setCampaigns] = useState([]);
  const [contactsList, setContactsList] = useState([]);
  const [loading, setLoading] = useState(true);

  // Insights state: labels (YYYY-MM-DD oldest->newest) and counts
  const [seriesLabels, setSeriesLabels] = useState([]);
  const [seriesCounts, setSeriesCounts] = useState([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsTotal, setInsightsTotal] = useState(0);
  const [insightsLatest, setInsightsLatest] = useState(0);

  const [range, setRange] = useState("7");
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    let mounted = true;

    const normalizeList = (x) => (Array.isArray(x) ? x : (Array.isArray(x?.data) ? x.data : []));

    const fetchAll = async () => {
      setLoading(true);
      try {
        const r = Number(range) || 7;
        const perPage = Math.min(Math.max(r, 50), 365);

        const [
          contactsRes,
          unsubRes,
          twilioRes,
          seriesRes,
          messagesRes,
          campaignsRes,
          contactsListRes,
        ] = await Promise.all([
          fetch(`${API_BASE_URL}/api/v1/contacts/total-count`, { cache: "no-store" }).then(r => r.json()).catch(() => ({})),
          fetch(`${API_BASE_URL}/api/v1/contacts/total-unsubscribed`, { cache: "no-store" }).then(r => r.json()).catch(() => ({})),
          fetch(`${API_BASE_URL}/api/v1/twilio/balance`, { cache: "no-store" }).then(r => r.json()).catch(() => ({})),
          // series endpoint: returns { status:"ok", data: [{date:"YYYY-MM-DD", count: N}, ...] }
          fetch(`${API_BASE_URL}/api/v1/dashboard/messages-7days?days=${encodeURIComponent(r)}`, { cache: "no-store" }).then(r => r.json()).catch(() => ({})),
          fetch(`${API_BASE_URL}/api/v1/inbound/messages?per_page=${perPage}&days=${encodeURIComponent(r)}`, { cache: "no-store" }).then(r => r.json()).catch(() => ([])),
          fetch(`${API_BASE_URL}/v1/campaigns`, { cache: "no-store" }).then(r => r.json()).catch(() => ([])),
          fetch(`${API_BASE_URL}/v1/contacts`, { cache: "no-store" }).then(r => r.json()).catch(() => ([])),
        ]);

        if (!mounted) return;

        // totals
        const totalContacts = Number(contactsRes?.total_contacts ?? contactsRes?.total ?? 0);
        setContactCount(totalContacts);

        const totalUnsub = Number(unsubRes?.total_unsubscribed ?? unsubRes?.total ?? 0);
        setUnsubscribedCount(totalUnsub);
        setSubscribedCount(Math.max(0, totalContacts - totalUnsub));

        if (twilioRes?.data) setTwilioInfo(twilioRes.data);

        // process server series for insights
        try {
          setInsightsLoading(true);
          const rows = Array.isArray(seriesRes?.data) ? seriesRes.data.slice() : [];
          if (rows.length) {
            rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
            const labels = rows.map((x) => String(x.date));
            const series = rows.map((x) => Number(x.count || 0));
            setSeriesLabels(labels);
            setSeriesCounts(series);
            setInsightsTotal(series.reduce((s, v) => s + v, 0));
            setInsightsLatest(series.length ? series[series.length - 1] : 0);
          } else {
            // fallback: clear
            setSeriesLabels([]);
            setSeriesCounts([]);
            setInsightsTotal(0);
            setInsightsLatest(0);
          }
        } finally {
          setInsightsLoading(false);
        }

        // lists
        setCampaigns(normalizeList(campaignsRes));
        setContactsList(normalizeList(contactsListRes));

        // recent messages for activity panel
        let msgs = [];
        let messagesTotal = 0;
        if (Array.isArray(messagesRes)) {
          msgs = messagesRes;
          messagesTotal = msgs.length;
        } else if (Array.isArray(messagesRes?.data)) {
          msgs = messagesRes.data;
          messagesTotal = Number(messagesRes.total ?? msgs.length ?? 0);
        }
        setRecentMessages(msgs);
        setRecentTotal(messagesTotal);
      } catch (e) {
        console.error("dashboard fetch error", e);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchAll();
    const iv = setInterval(fetchAll, 60000);
    return () => {
      mounted = false;
      clearInterval(iv);
    };
  }, [range]);

  const formatCurrency = (amt) => {
    const v = Number(amt) || 0;
    const cur = twilioInfo?.currency ? twilioInfo.currency : "USD";
    const s = v.toFixed(4).replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "").replace(/\.$/, "");
    return `${cur} ${s}`;
  };

  // ==== SMS helpers ==========================================================
  const isGsmCompatible = (text) => {
    if (!text) return true;
    for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) > 127) return false;
    return true;
  };
  const smsSegmentsForText = (text) => {
    if (!text || text.length === 0) return 0;
    const gsm = isGsmCompatible(text);
    if (gsm) return text.length <= 160 ? 1 : Math.ceil(text.length / 153);
    return text.length <= 70 ? 1 : Math.ceil(text.length / 67);
  };
  const PRICE_PER_SEGMENT = 0.0515;

  const campaignRecipientCount = (camp) => {
    if (!camp) return 0;
    if (!contactsList?.length) return camp.recipients ? camp.recipients.length : 0;
    if (camp.recipient_type === "person")
      return contactsList.filter((c) => (camp.recipients || []).includes(c.id)).length;
    if (camp.recipient_type === "group") {
      const ids = (camp.recipients || []).map(Number);
      return contactsList.filter((c) => ids.includes(Number(c.group_no))).length;
    }
    if (camp.recipient_type === "state") {
      const vals = (camp.recipients || []).map(String);
      return contactsList.filter((c) => vals.includes(String(c.address_state))).length;
    }
    return camp.recipients ? camp.recipients.length : 0;
  };

  const campaignEstimatedCost = (camp) => {
    if (!camp || !contactsList?.length) return 0;
    let matched = [];
    if (camp.recipient_type === "person") {
      matched = contactsList.filter((c) => (camp.recipients || []).includes(c.id));
    } else if (camp.recipient_type === "group") {
      const ids = (camp.recipients || []).map(Number);
      matched = contactsList.filter((c) => ids.includes(Number(c.group_no)));
    } else if (camp.recipient_type === "state") {
      const vals = (camp.recipients || []).map(String);
      matched = contactsList.filter((c) => vals.includes(String(c.address_state)));
    }
    if (!matched.length) return 0;
    let totalSegments = 0;
    matched.forEach((c) => {
      const link = c.unsubscribe_link || "";
      const body = (camp.message || "") + (link ? "\nOpt out link: " + link : "");
      totalSegments += smsSegmentsForText(body);
    });
    return totalSegments * PRICE_PER_SEGMENT;
  };

  const campaignInRange = (camp) => {
    const days = Number(range) || 7;
    const now = new Date();
    const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const dstr = camp.sent_at || camp.scheduled_at;
    if (!dstr) return false;
    const d = new Date(dstr);
    if (isNaN(d)) return false;
    return d >= start && d <= now;
  };

  const filteredCampaigns = Array.isArray(campaigns) ? campaigns.filter(campaignInRange) : [];

  // ==== UI ===================================================================
  return (
    <div>
      {/* Local styles to ensure dashboard chart SVG is not clobbered by global svg rules */}
      <style>{`
        /* container that reserves the panel area; adjust height as needed */
        .insights-chart {
          width: 100%;
          height: 320px; /* fits the red area — change to 280/340 as you prefer */
          display: block;
          position: relative;
        }
        /* target only the chart SVG inside this container and force dimensions */
        .insights-chart > svg,
        .insights-chart svg {
          width: 100% !important;
          height: 100% !important;
          display: block;
        }

        /* make the insights card sticky so it remains visible while scrolling */
        .insights-card {
          position: sticky;
          top: 88px;               /* space below top header — adjust to match your layout */
          align-self: start;
          z-index: 100;
          width: 100%;
          max-height: calc(100vh - 112px); /* keep card from growing past viewport */
          overflow: auto;          /* allow internal scrolling if content is tall */
        }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", gap: 20, marginBottom: 20, alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: "#0f172a" }}>Portal Overview</h1>
          <div style={{ color: "#64748b", marginTop: 6 }}>
            Key stats and quick actions — everything you need at a glance.
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button
            onClick={() => (window.location.href = "/contacts")}
            style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #e6e6e6", background: "#fff", cursor: "pointer" }}
          >
            Manage Contacts
          </button>
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "#fff",
              border: "1px solid #e6e6e6",
              padding: "6px 8px",
              borderRadius: 8,
            }}
          >
            <span style={{ fontSize: 13, color: "#475569" }}>Range</span>
            <select
              value={range}
              onChange={(e) => setRange(e.target.value)}
              style={{ border: "none", background: "transparent", fontWeight: 700, cursor: "pointer" }}
            >
              <option value="7">7d</option>
              <option value="30">30d</option>
              <option value="90">3m</option>
              <option value="180">6m</option>
              <option value="365">1y</option>
            </select>
          </label>
          <button
            onClick={() => (window.location.href = "/sms/campaign")}
            aria-label="Manage Campaign"
            style={{
              padding: "12px 18px",
              borderRadius: 12,
              border: "none",
              background: "linear-gradient(90deg, #06b6d4 0%, #0ea5ff 100%)",
              color: "#fff",
              cursor: "pointer",
              fontWeight: 800,
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              minWidth: 160,
              justifyContent: "center",
              boxShadow: "0 8px 20px rgba(14,165,255,0.18)",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
              <path d="M12 5v14M5 12h14" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M20.5 7.5a8 8 0 11-5.657 5.657" stroke="#ffffff66" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ fontSize: 15 }}>Manage Campaign</span>
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
        <SummaryCard label="Total Contacts" value={contactCount} color="#0ea5a4" sub="All contacts in the portal" />
        <SummaryCard label="Subscribed" value={subscribedCount} color="#16a34a" sub="Active contacts" />
        <SummaryCard label="Unsubscribed" value={unsubscribedCount} color="#ef4444" sub="Opted-out contacts" />
        <SummaryCard
          label="Twilio Credits"
          value={twilioInfo && twilioInfo.balance !== null ? `${twilioInfo.balance} ${twilioInfo.currency || ""}` : "N/A"}
          color="#0ea5ff"
          sub={twilioInfo?.friendly_name || ""}
        />
      </div>

      {/* Activity + Insights */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        {/* Recent Activity */}
        <div style={{ background: "#fff", borderRadius: 12, padding: 18, boxShadow: "0 6px 24px rgba(2,6,23,0.06)" }}>
          <h3 style={{ marginTop: 0, marginBottom: 12 }}>
            Recent Activity — showing {recentTotal} (last {range} days)
          </h3>
          {loading ? (
            <div style={{ padding: 24, color: "#64748b" }}>Loading recent messages…</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {recentMessages.length === 0 ? (
                <div style={{ color: "#64748b", padding: 12 }}>No recent messages.</div>
              ) : (
                recentMessages.map((m, idx) => (
                  <div
                    key={m.id || m.twilio_sid || `${(m.from_number || m.to_number || "x")}-${idx}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: 12,
                      borderRadius: 8,
                      background: "#fbfdff",
                      border: "1px solid #eef2ff",
                    }}
                  >
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      <div
                        style={{
                          width: 44, height: 44, borderRadius: 44, background: "#fff",
                          display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700,
                        }}
                      >
                        {(m.from_number || m.to_number || "MSG").slice(0, 2).toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {m.from_number || m.to_number || "Unknown"}
                        </div>
                        <div style={{ color: "#475569", fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {(m.message_body || m.body || "").slice(0, 80)}
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right", color: "#64748b", fontSize: 13 }}>
                      {m.received_at || m.created_at || ""}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Insights removed */}
        <div
          className="insights-card"
          style={{ background: "#fff", borderRadius: 12, padding: 18, boxShadow: "0 6px 24px rgba(2,6,23,0.06)", alignSelf: "start" }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <h4 style={{ margin: 0 }}>Incoming Messages</h4>
            <div style={{ color: "#64748b", fontSize: 13 }}>Messages per day (last {range} days)</div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>{insightsTotal}</div>
            <div style={{ color: "#94a3b8" }}>Total</div>
            <div style={{ marginLeft: "auto", fontWeight: 700 }}>{insightsLatest} latest</div>
          </div>

          {insightsLoading ? (
            <div style={{ padding: 24, color: "#64748b" }}>Loading insights…</div>
          ) : seriesLabels.length && seriesCounts.length ? (
            /* wrapper ensures chart fills the panel and its svg sizing is forced by local CSS */
            <div className="insights-chart">
              <DailyLineChart labels={seriesLabels} values={seriesCounts} />
            </div>
          ) : (
            <div style={{ padding: 24, color: "#94a3b8" }}>No message data for this range.</div>
          )}
        </div>
      </div>

      {/* Campaigns Report */}
      <div style={{ marginTop: 20 }}>
        <div style={{ background: "#fff", borderRadius: 12, padding: 18, boxShadow: "0 6px 24px rgba(2,6,23,0.06)" }}>
          <h3 style={{ margin: 0, marginBottom: 8 }}>Campaigns Report</h3>
          <div style={{ color: "#64748b", marginBottom: 12 }}>
            Overview of recent campaigns, status and estimated Twilio cost (includes per-contact unsubscribe links).
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 20 }}>
              {filteredCampaigns?.length || 0}
            </div>
            <div style={{ color: "#475569" }}>campaigns</div>
            <div style={{ marginLeft: "auto", fontWeight: 700 }}>
              {formatCurrency((filteredCampaigns || []).reduce((s, c) => s + campaignEstimatedCost(c), 0))}
            </div>
          </div>

          {filteredCampaigns?.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filteredCampaigns.slice(0, 12).map((c, idx) => {
                const cost = campaignEstimatedCost(c);
                const count = campaignRecipientCount(c);
                const maxCost = Math.max(0.0001, (campaigns || []).reduce((s, x) => Math.max(s, campaignEstimatedCost(x)), 0));
                const pct = Math.min(100, (cost / maxCost) * 100);

                return (
                  <div
                    key={c.id || c.title || `camp-${idx}`}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: 10, borderRadius: 8, border: "1px solid #eef2ff" }}
                  >
                    <div style={{ width: 220, minWidth: 120 }}>
                      <div style={{ fontWeight: 800, color: "#0f172a" }}>{c.title || "Untitled"}</div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>
                        {c.status || ""} • {count} recipients
                      </div>
                    </div>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ height: 12, background: "#f1f5f9", borderRadius: 6, overflow: "hidden" }}>
                        <div style={{ height: "100%", background: "#0ea5ff", width: `${pct}%` }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#475569" }}>
                        <div>
                          {c.scheduled_at
                            ? new Date(c.scheduled_at).toLocaleDateString()
                            : c.sent_at
                            ? new Date(c.sent_at).toLocaleDateString()
                            : ""}
                        </div>
                        <div style={{ fontWeight: 700 }}>{formatCurrency(cost)}</div>
                      </div>
                    </div>
                    <div style={{ width: 96, textAlign: "right", fontWeight: 700 }}>
                      {c.status === "draft" ? <span style={{ color: "#64748b" }}>Draft</span> : c.status || ""}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ color: "#94a3b8" }}>No campaigns yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ----------------------- Small UI bits ----------------------- */

function SummaryCard({ label, value, color = "#16a34a", sub }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: 18, boxShadow: "0 6px 18px rgba(2,6,23,0.04)", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 13, color: "#94a3b8", fontWeight: 700 }}>{label}</div>
        <div style={{ width: 22, height: 22, borderRadius: 100, background: color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>
          {label === "Twilio Credits" ? "💳" : " "}
        </div>
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: "#0f172a" }}>{value}</div>
      {sub ? <div style={{ color: "#64748b", fontSize: 13 }}>{sub}</div> : null}
    </div>
  );
}

/* ----------------------- Chart (daily line, axes & tooltip) ----------------------- */

function DailyLineChart({ labels = [], values = [], width = 360, height = 220, stroke = "#10b981" /* green */ }) {
  const pad = { top: 12, right: 12, bottom: 44, left: 40 };
  const innerW = Math.max(1, width - pad.left - pad.right);
  const innerH = Math.max(1, height - pad.top - pad.bottom);

  const n = Math.max(0, Math.min(labels.length, values.length));
  const xs = labels.slice(0, n);
  const ys = values.slice(0, n);
  if (n === 0) {
    return (
      <div style={{ width, height, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8" }}>
        No messages in this range
      </div>
    );
  }

  const maxY = Math.max(1, ...ys.map(Number));
  const ticks = makeNiceTicks(0, maxY, 4); // 0..max ~4 steps
  const yScale = (v) => pad.top + innerH - (Number(v) / ticks.max) * innerH;

  const xForIndex = (i) => pad.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const points = ys.map((v, i) => ({ x: xForIndex(i), y: yScale(v), v }));

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");

  const [hover, setHover] = useState({ i: -1, x: 0, y: 0 });

  const labelEvery = Math.max(1, Math.ceil(n / 8)); // show ~8 x-labels
  const prettyDate = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso) || "");
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
    }
    const d = new Date(iso);
    return isNaN(d) ? String(iso) : d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
  };

  return (
    <div style={{ position: "relative", width, height }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        onMouseMove={(e) => {
          if (!points.length) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const mouseX = e.clientX - rect.left;
          let best = Infinity, idx = 0;
          points.forEach((p, i) => {
            const d = Math.abs(p.x - mouseX);
            if (d < best) { best = d; idx = i; }
          });
          setHover({ i: idx, x: points[idx].x, y: points[idx].y });
        }}
        onMouseLeave={() => setHover({ i: -1, x: 0, y: 0 })}
      >
        {/* Y grid + labels */}
        {ticks.values.map((t, i) => {
          const y = yScale(t);
          return (
            <g key={`yt-${i}`}>
              <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="#e2e8f0" />
              <text x={pad.left - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#64748b">{t}</text>
            </g>
          );
        })}

        {/* X axis line */}
        <line x1={pad.left} x2={width - pad.right} y1={height - pad.bottom} y2={height - pad.bottom} stroke="#cbd5e1" />

        {/* X labels */}
        {xs.map((lab, i) => {
          if (i % labelEvery !== 0 && i !== n - 1) return null;
          const x = xForIndex(i);
          return (
            <text key={`xl-${i}`} x={x} y={height - pad.bottom + 28} textAnchor="middle" fontSize="10" fill="#64748b">
              {prettyDate(lab)}
            </text>
          );
        })}

        {/* Area under line (subtle) */}
        {points.length ? (
          <path
            d={[
              `M ${points[0].x} ${yScale(0)}`,
              ...points.map((p) => `L ${p.x} ${p.y}`),
              `L ${points[points.length - 1].x} ${yScale(0)}`,
              "Z",
            ].join(" ")}
            fill="#10b98122"
            stroke="none"
          />
        ) : null}

        {/* Line */}
        <path d={path} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Points */}
        {points.map((p, i) => (
          <circle key={`pt-${i}`} cx={p.x} cy={p.y} r={3} fill={stroke} />
        ))}
      </svg>

      {/* Tooltip */}
      {hover.i >= 0 && points.length ? (
        <div
          style={{
            position: "absolute",
            left: Math.min(Math.max(hover.x - 60, 0), width - 120),
            top: hover.y - 50,
            background: "#0f172a",
            color: "#fff",
            padding: "6px 8px",
            borderRadius: 8,
            fontSize: 12,
            pointerEvents: "none",
            boxShadow: "0 6px 18px rgba(2,6,23,0.12)",
            zIndex: 10,
          }}
        >
          <div style={{ fontWeight: 700 }}>{prettyDate(xs[hover.i])}</div>
          <div>{`${ys[hover.i] || 0} messages`}</div>
        </div>
      ) : null}
    </div>
  );
}

/* ----------------------- Helpers ----------------------- */

/** Build client-side buckets aligned to the server (YYYY-MM-DD oldest->newest) */
function aggregateFromMessages(list, days = 7) {
  days = Math.max(1, Number(days) || 7);

  // Generate labels for last N days (oldest -> newest)
  const today = new Date();
  const labels = [];
  const indexByKey = new Map();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    indexByKey.set(key, labels.length);
    labels.push(key);
  }

  const counts = new Array(labels.length).fill(0);
  const arr = Array.isArray(list) ? list : [];
  arr.forEach((m) => {
    const s = m.received_at || m.created_at || m.received_at_iso || m.created_at_iso;
    if (!s) return;
    const dt = new Date(s);
    if (isNaN(dt)) return;
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    const idx = indexByKey.get(key);
    if (idx != null) counts[idx] += 1;
  });

  return { labels, series: counts };
}

/** Create "nice" y-axis ticks up to ~steps count */
function makeNiceTicks(min, max, steps = 4) {
  const span = niceNum((max - min) || 1, false);
  const step = niceNum(span / (steps || 4), true);
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const values = [];
  for (let v = niceMin; v <= niceMax + 1e-9; v += step) values.push(Math.round(v));
  return { values, step, min: niceMin, max: Math.max(1, niceMax) };
}

function niceNum(range, round) {
  const exp = Math.floor(Math.log10(range || 1));
  const f = (range || 1) / Math.pow(10, exp);
  let nf;
  if (round) {
    if (f < 1.5) nf = 1;
    else if (f < 3) nf = 2;
    else if (f < 7) nf = 5;
    else nf = 10;
  } else {
    if (f <= 1) nf = 1;
    else if (f <= 2) nf = 2;
    else if (f <= 5) nf = 5;
    else nf = 10;
  }
  return nf * Math.pow(10, exp);
}
