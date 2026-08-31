import { useState, useEffect, useRef, useCallback } from "react";
import {
  Shield, Activity, Globe, Download, Users, BarChart3,
  CheckCircle2, XCircle, Clock, Wifi, WifiOff, LogOut, Search, RefreshCw
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const ADMIN_SESSION_KEY = "cvs_admin_token";
const API_BASE = "/api";

// Country code → flag emoji
function countryFlag(code: string): string {
  if (!code || code === "XX") return "🌐";
  return code
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65));
}

// Device type icons
function DeviceIcon({ type }: { type: string }) {
  const icons: Record<string, string> = {
    mobile: "📱", desktop: "🖥️", bot: "🤖", unknown: "❓",
  };
  return <span>{icons[type] ?? "❓"}</span>;
}

type DownloadEvent = {
  id: number;
  transferId: string | null;
  fileId: number | null;
  eventType: string;
  country: string;
  deviceType: string;
  receiptHash: string | null;
  createdAt: string;
};

type Stats = {
  total: number;
  today: number;
  byCountry: { country: string; count: number }[];
  byDevice: { deviceType: string; count: number }[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Login Gate
// ─────────────────────────────────────────────────────────────────────────────
function AdminLogin({ onLogin }: { onLogin: (token: string) => void }) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE}/admin/stats`, {
        headers: { "X-Admin-Secret": password },
      });
      if (res.ok) {
        sessionStorage.setItem(ADMIN_SESSION_KEY, password);
        onLogin(password);
        toast({ title: "Access granted", description: "Welcome to the command center." });
      } else {
        setError("Invalid admin credentials. Access denied.");
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-primary)" }}>
      <div className="w-full max-w-md">
        {/* Animated shield */}
        <div className="flex flex-col items-center mb-10">
          <div className="relative mb-6">
            <div className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", boxShadow: "0 0 40px rgba(99,102,241,0.4)" }}>
              <Shield className="w-10 h-10 text-white" />
            </div>
            <div className="absolute -inset-1 rounded-full animate-ping"
              style={{ background: "rgba(99,102,241,0.15)" }} />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Admin Access</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            ChainVault Command Center
          </p>
        </div>

        <form onSubmit={handleLogin}
          className="p-8 rounded-2xl border"
          style={{ background: "var(--glass)", backdropFilter: "blur(20px)", borderColor: "var(--border)" }}>
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
              Admin Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter admin secret…"
              className="w-full px-4 py-3 rounded-xl text-sm outline-none"
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
              }}
              autoFocus
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 mb-4 p-3 rounded-lg"
              style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
              <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span className="text-sm text-red-400">{error}</span>
            </div>
          )}

          <button type="submit" disabled={loading || !password.trim()}
            className="w-full py-3 rounded-xl font-semibold text-sm transition-all"
            style={{
              background: loading ? "var(--bg-tertiary)" : "linear-gradient(135deg, #6366f1, #8b5cf6)",
              color: "white",
              opacity: loading || !password.trim() ? 0.6 : 1,
              cursor: loading ? "wait" : "pointer",
            }}>
            {loading ? "Verifying…" : "Enter Command Center"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats Cards
// ─────────────────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, accent }: {
  icon: React.ReactNode; label: string; value: string | number; accent: string;
}) {
  return (
    <div className="p-6 rounded-2xl border flex items-center gap-4"
      style={{ background: "var(--glass)", backdropFilter: "blur(20px)", borderColor: "var(--border)" }}>
      <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: `${accent}20`, border: `1px solid ${accent}40` }}>
        <span style={{ color: accent }}>{icon}</span>
      </div>
      <div>
        <div className="text-2xl font-bold text-white">{value}</div>
        <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{label}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Receipt Verifier
// ─────────────────────────────────────────────────────────────────────────────
function ReceiptVerifier({ adminToken }: { adminToken: string }) {
  const [receipt, setReceipt] = useState("");
  const [transferId, setTransferId] = useState("");
  const [fileId, setFileId] = useState("");
  const [timestamp, setTimestamp] = useState("");
  const [result, setResult] = useState<{ valid: boolean; message: string; event?: any } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receipt || !transferId || !fileId || !timestamp) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/verify-receipt`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Secret": adminToken },
        body: JSON.stringify({
          receipt,
          transferId,
          fileId: parseInt(fileId),
          timestamp: parseInt(timestamp),
        }),
      });
      setResult(await res.json());
    } catch {
      setResult({ valid: false, message: "Failed to reach server." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 rounded-2xl border"
      style={{ background: "var(--glass)", backdropFilter: "blur(20px)", borderColor: "var(--border)" }}>
      <div className="flex items-center gap-2 mb-5">
        <Shield className="w-5 h-5" style={{ color: "#6366f1" }} />
        <h3 className="font-semibold text-white">Receipt Verifier</h3>
      </div>
      <form onSubmit={handleVerify} className="space-y-3">
        {[
          { label: "Receipt Code", value: receipt, setter: setReceipt, placeholder: "CVT-RECEIPT:…" },
          { label: "Transfer ID", value: transferId, setter: setTransferId, placeholder: "uuid-…" },
          { label: "File ID", value: fileId, setter: setFileId, placeholder: "123" },
          { label: "Timestamp", value: timestamp, setter: setTimestamp, placeholder: "1720000000000" },
        ].map(({ label, value, setter, placeholder }) => (
          <div key={label}>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>{label}</label>
            <input
              value={value} onChange={(e) => setter(e.target.value)}
              placeholder={placeholder}
              className="w-full px-3 py-2 rounded-lg text-xs outline-none font-mono"
              style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
            />
          </div>
        ))}
        <button type="submit" disabled={loading}
          className="w-full py-2 rounded-lg text-sm font-semibold"
          style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "white" }}>
          {loading ? "Verifying…" : "Verify Receipt"}
        </button>
      </form>

      {result && (
        <div className="mt-4 p-3 rounded-lg"
          style={{ background: result.valid ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", border: `1px solid ${result.valid ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}` }}>
          <div className="flex items-center gap-2 mb-1">
            {result.valid ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
            <span className={`text-sm font-medium ${result.valid ? "text-green-400" : "text-red-400"}`}>
              {result.valid ? "VALID" : "INVALID"}
            </span>
          </div>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>{result.message}</p>
          {result.event && (
            <div className="mt-2 text-xs" style={{ color: "var(--text-secondary)" }}>
              <p>Downloaded: {new Date(result.event.downloadedAt).toLocaleString()}</p>
              <p>Country: {countryFlag(result.event.country)} {result.event.country}</p>
              <p>Device: {result.event.deviceType}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Dashboard
// ─────────────────────────────────────────────────────────────────────────────
function Dashboard({ adminToken, onLogout }: { adminToken: string; onLogout: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [events, setEvents] = useState<DownloadEvent[]>([]);
  const [liveConnected, setLiveConnected] = useState(false);
  const [statsLoading, setStatsLoading] = useState(true);
  const sseRef = useRef<EventSource | null>(null);
  const { toast } = useToast();

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/stats`, { headers: { "X-Admin-Secret": adminToken } });
      if (res.ok) setStats(await res.json());
    } catch { /* ignore */ }
    finally { setStatsLoading(false); }
  }, [adminToken]);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/events?limit=50`, { headers: { "X-Admin-Secret": adminToken } });
      if (res.ok) setEvents(await res.json());
    } catch { /* ignore */ }
  }, [adminToken]);

  // Connect to live SSE stream
  useEffect(() => {
    fetchStats();
    fetchEvents();

    const es = new EventSource(`${API_BASE}/admin/events/stream`);
    // SSE can't send custom headers — use URL param for admin auth
    sseRef.current = es;

    es.addEventListener("open", () => setLiveConnected(true));
    es.addEventListener("error", () => setLiveConnected(false));
    es.addEventListener("message", (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "download") {
          const newEvent: DownloadEvent = {
            id: Date.now(),
            transferId: data.transferId,
            fileId: data.fileId,
            eventType: "download",
            country: data.country,
            deviceType: data.deviceType,
            receiptHash: null,
            createdAt: data.timestamp,
          };
          setEvents((prev) => [newEvent, ...prev].slice(0, 100));
          fetchStats(); // refresh stats on new download
          toast({
            title: `📥 New download — ${countryFlag(data.country)} ${data.country}`,
            description: `${data.deviceType} device`,
          });
        }
      } catch { /* ignore malformed */ }
    });

    return () => { es.close(); setLiveConnected(false); };
  }, [adminToken, fetchStats, fetchEvents]);

  const uniqueCountries = stats?.byCountry.length ?? 0;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-primary)" }}>
      {/* Header */}
      <div className="sticky top-0 z-10 border-b" style={{ background: "rgba(10,10,20,0.95)", backdropFilter: "blur(20px)", borderColor: "var(--border)" }}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white">ChainVault Admin</h1>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Command Center</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              {liveConnected ? (
                <><Wifi className="w-4 h-4 text-green-400" /><span className="text-xs text-green-400">Live</span></>
              ) : (
                <><WifiOff className="w-4 h-4 text-red-400" /><span className="text-xs text-red-400">Offline</span></>
              )}
            </div>
            <button onClick={fetchStats} title="Refresh"
              className="p-2 rounded-lg hover:bg-white/5 transition-colors">
              <RefreshCw className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
            </button>
            <button onClick={onLogout}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
              style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)" }}>
              <LogOut className="w-3.5 h-3.5" /> Logout
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={<Download className="w-5 h-5" />} label="Total Downloads" value={statsLoading ? "…" : (stats?.total ?? 0)} accent="#6366f1" />
          <StatCard icon={<Activity className="w-5 h-5" />} label="Downloads Today" value={statsLoading ? "…" : (stats?.today ?? 0)} accent="#22c55e" />
          <StatCard icon={<Globe className="w-5 h-5" />} label="Unique Countries" value={statsLoading ? "…" : uniqueCountries} accent="#f59e0b" />
          <StatCard icon={<Users className="w-5 h-5" />} label="Mobile vs Desktop"
            value={statsLoading ? "…" : `${stats?.byDevice.find(d => d.deviceType === "mobile")?.count ?? 0}/${stats?.byDevice.find(d => d.deviceType === "desktop")?.count ?? 0}`}
            accent="#ec4899" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Country breakdown */}
          <div className="p-6 rounded-2xl border"
            style={{ background: "var(--glass)", backdropFilter: "blur(20px)", borderColor: "var(--border)" }}>
            <div className="flex items-center gap-2 mb-5">
              <Globe className="w-5 h-5" style={{ color: "#f59e0b" }} />
              <h3 className="font-semibold text-white">Top Countries</h3>
            </div>
            {!stats || stats.byCountry.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>No downloads yet</p>
            ) : (
              <div className="space-y-2">
                {stats.byCountry.slice(0, 10).map(({ country, count }) => {
                  const max = stats.byCountry[0].count;
                  return (
                    <div key={country} className="flex items-center gap-3">
                      <span className="text-lg w-8 flex-shrink-0">{countryFlag(country)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between text-xs mb-1">
                          <span style={{ color: "var(--text-secondary)" }}>{country}</span>
                          <span style={{ color: "var(--text-muted)" }}>{count}</span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-secondary)" }}>
                          <div className="h-full rounded-full transition-all"
                            style={{ width: `${(count / max) * 100}%`, background: "linear-gradient(90deg, #6366f1, #8b5cf6)" }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Device breakdown */}
          <div className="p-6 rounded-2xl border"
            style={{ background: "var(--glass)", backdropFilter: "blur(20px)", borderColor: "var(--border)" }}>
            <div className="flex items-center gap-2 mb-5">
              <BarChart3 className="w-5 h-5" style={{ color: "#ec4899" }} />
              <h3 className="font-semibold text-white">Device Types</h3>
            </div>
            {!stats || stats.byDevice.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>No data yet</p>
            ) : (
              <div className="space-y-4">
                {stats.byDevice.map(({ deviceType, count }) => {
                  const total = stats.byDevice.reduce((s, d) => s + d.count, 0);
                  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                  return (
                    <div key={deviceType}>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="flex items-center gap-2" style={{ color: "var(--text-secondary)" }}>
                          <DeviceIcon type={deviceType} />{deviceType}
                        </span>
                        <span style={{ color: "var(--text-muted)" }}>{pct}%</span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-secondary)" }}>
                        <div className="h-full rounded-full"
                          style={{ width: `${pct}%`, background: "linear-gradient(90deg, #ec4899, #f472b6)", transition: "width 0.5s ease" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Receipt verifier */}
          <ReceiptVerifier adminToken={adminToken} />
        </div>

        {/* Live Events Feed */}
        <div className="rounded-2xl border overflow-hidden"
          style={{ background: "var(--glass)", backdropFilter: "blur(20px)", borderColor: "var(--border)" }}>
          <div className="px-6 py-4 border-b flex items-center justify-between"
            style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5" style={{ color: "#22c55e" }} />
              <h3 className="font-semibold text-white">Live Download Feed</h3>
              {liveConnected && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                  style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.2)" }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  LIVE
                </span>
              )}
            </div>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>{events.length} events</span>
          </div>

          <div className="overflow-x-auto">
            {events.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Clock className="w-8 h-8 mb-3" style={{ color: "var(--text-muted)" }} />
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>Waiting for downloads…</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    {["Time", "Country", "Device", "Transfer", "Receipt"].map((h) => (
                      <th key={h} className="px-6 py-3 text-left text-xs font-medium" style={{ color: "var(--text-muted)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {events.map((ev) => (
                    <tr key={ev.id}
                      className="transition-colors hover:bg-white/[0.02]"
                      style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="px-6 py-3 text-xs" style={{ color: "var(--text-muted)" }}>
                        {new Date(ev.createdAt).toLocaleTimeString()}
                      </td>
                      <td className="px-6 py-3">
                        <span className="flex items-center gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                          {countryFlag(ev.country)} {ev.country}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                          <DeviceIcon type={ev.deviceType} /> {ev.deviceType}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                          {ev.transferId ? `${ev.transferId.slice(0, 8)}…` : "—"}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        {ev.receiptHash ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                            style={{ background: "rgba(99,102,241,0.1)", color: "#818cf8", border: "1px solid rgba(99,102,241,0.2)" }}>
                            <CheckCircle2 className="w-3 h-3" /> Receipt
                          </span>
                        ) : (
                          <span className="text-xs" style={{ color: "var(--text-muted)" }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin Page Root
// ─────────────────────────────────────────────────────────────────────────────
export default function Admin() {
  const [adminToken, setAdminToken] = useState<string | null>(
    () => sessionStorage.getItem(ADMIN_SESSION_KEY)
  );

  const handleLogin = (token: string) => setAdminToken(token);
  const handleLogout = () => {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    setAdminToken(null);
  };

  if (!adminToken) return <AdminLogin onLogin={handleLogin} />;
  return <Dashboard adminToken={adminToken} onLogout={handleLogout} />;
}
