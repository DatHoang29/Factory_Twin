'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

const accessRoles = [
  {
    role: 'Admin',
    email: 'admin@factory.local',
    scope: 'Toàn quyền nhà máy, cấu hình ngưỡng cảnh báo, quản lý người dùng',
    tone: 'border-slate-200/80 bg-white hover:border-emerald-300 hover:bg-emerald-50/20 text-slate-800 shadow-sm',
  },
  {
    role: 'Kỹ thuật viên',
    email: 'tech@factory.local',
    scope: 'Bảo trì, xử lý ticket sự cố, xem lịch sử máy',
    tone: 'border-slate-200/80 bg-white hover:border-amber-300 hover:bg-amber-50/20 text-slate-800 shadow-sm',
  },
  {
    role: 'Operator',
    email: 'operator@factory.local',
    scope: 'Vận hành dây chuyền, ingestion telemetry, nhận cảnh báo thời gian thực',
    tone: 'border-slate-200/80 bg-white hover:border-cyan-300 hover:bg-cyan-50/20 text-slate-800 shadow-sm',
  },
  {
    role: 'Viewer',
    email: 'viewer@factory.local',
    scope: 'Chỉ xem dashboard, báo cáo, trạng thái thiết bị',
    tone: 'border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/50 text-slate-800 shadow-sm',
  },
];

const stateClassName: Record<string, string> = {
  normal: 'border-slate-200 bg-white text-slate-800 shadow-sm',
  warning: 'border-amber-100 bg-amber-50/40 text-amber-800 shadow-sm',
  critical: 'border-red-100 bg-red-50/40 text-red-800 shadow-sm',
};

export default function LoginPage() {
  const [email, setEmail] = useState('admin@factory.local');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const router = useRouter();

  const [stats, setStats] = useState({ machinesCount: 6, errorCount: 0 });

  useEffect(() => {
    const fetchPublicStats = async () => {
      try {
        const API_URL = typeof window !== 'undefined' 
          ? `${window.location.origin}/api` 
          : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api');
        const res = await fetch(`${API_URL}/public/stats`);
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setStats({
              machinesCount: data.machinesCount,
              errorCount: data.errorCount,
            });
          }
        }
      } catch (err) {
        console.error('Error fetching public stats:', err);
      }
    };
    fetchPublicStats();
    // Poll every 5s for real-time telemetry stats
    const interval = setInterval(fetchPublicStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const statusTiles = [
    { label: 'Plant network', value: '02', detail: 'sites online', state: 'normal' },
    { label: 'Active lines', value: stats.machinesCount < 10 ? `0${stats.machinesCount}` : `${stats.machinesCount}`, detail: 'syncing telemetry', state: 'normal' },
    { label: 'Critical alerts', value: stats.errorCount < 10 ? `0${stats.errorCount}` : `${stats.errorCount}`, detail: 'need dispatch', state: stats.errorCount > 0 ? 'critical' : 'normal' },
    { label: 'Uptime', value: '99.2%', detail: 'last 24h', state: 'warning' },
  ];

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    try {
      await login(email, password);
      router.push('/dashboard');
    } catch {
      setError('Không thể xác thực tài khoản. Vui lòng kiểm tra email hoặc mật khẩu.');
    }
  };

  return (
    <main className="min-h-[calc(100vh-24px)] w-full overflow-hidden bg-slate-50 text-slate-700 relative flex items-center justify-center rounded-3xl border border-slate-200/50 shadow-sm">
      {/* Dynamic Soft Light Background Gradients */}
      <div className="pointer-events-none absolute inset-0 rounded-3xl overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.06),transparent_35%),radial-gradient(circle_at_80%_80%,rgba(14,165,233,0.08),transparent_40%),linear-gradient(180deg,#f8fafc,#f1f5f9)]" />
        <div className="absolute inset-0 opacity-[0.4] [background-image:linear-gradient(rgba(148,163,184,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.05)_1px,transparent_1px)] [background-size:40px_40px]" />
        <div className="absolute left-[-10rem] top-1/4 h-96 w-96 rounded-full border border-emerald-100/50 bg-emerald-500/5 blur-3xl" />
        <div className="absolute bottom-[-10rem] right-[-5rem] h-[40rem] w-[40rem] rounded-full border border-sky-100/50 bg-sky-500/5 blur-3xl" />
      </div>

      <section className="relative z-10 mx-auto grid w-full max-w-7xl grid-cols-1 gap-8 px-5 py-8 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:px-10">
        {/* Left Side: Info & Cockpit Summary */}
        <div className="flex flex-col justify-between gap-8 py-4">
          <header className="flex flex-col gap-3 border-b border-slate-200/80 pb-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-emerald-600">
                Factory Digital Twin
              </p>
              <h1 className="mt-3 max-w-3xl text-4xl font-extrabold leading-[1.05] tracking-tight text-slate-900 sm:text-5xl xl:text-6xl">
                Hệ thống Giám sát & Vận hành Số hóa
              </h1>
            </div>
            <div className="mt-4 self-start border border-slate-200/80 bg-white/60 backdrop-blur-sm px-4 py-2 rounded-2xl shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                Cổng xác thực người dùng
              </p>
              <p className="mt-0.5 text-xs font-semibold text-slate-800">Bảo mật / RBAC / Thời gian thực</p>
            </div>
          </header>

          <div className="grid grid-cols-2 gap-4">
            {statusTiles.map((tile) => (
              <div
                key={tile.label}
                className={`border p-5 rounded-2xl shadow-sm transition-all duration-300 hover:shadow-md ${stateClassName[tile.state]}`}
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  {tile.label}
                </p>
                <p className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">
                  {tile.value}
                </p>
                <p className="mt-1 text-xs text-slate-500">{tile.detail}</p>
              </div>
            ))}
          </div>

          <div className="relative min-h-[260px] border border-slate-200/80 bg-white/60 p-6 rounded-3xl shadow-sm backdrop-blur-sm flex flex-col justify-end">
            <div className={`absolute right-5 top-5 flex items-center gap-2 border px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-[0.1em] ${
              stats.errorCount > 0
                ? 'border-red-250 bg-red-50/50 text-red-700'
                : 'border-emerald-250 bg-emerald-50/50 text-emerald-700'
            }`}>
              <span className={`h-2 w-2 rounded-full ${stats.errorCount > 0 ? 'bg-red-500 animate-ping' : 'bg-emerald-500'}`} />
              {stats.errorCount} sự cố khẩn cấp
            </div>
            
            <div className="relative z-10 max-w-lg">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-600">
                MÔ PHỎNG 3D VÀ TELEMETRY
              </p>
              <p className="mt-2 text-xl font-bold tracking-tight text-slate-800">
                Đăng nhập để điều phối nhà máy, xử lý cảnh báo và theo dõi thời gian thực.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {accessRoles.map((item) => (
              <div key={item.email} className={`border p-4 rounded-2xl transition-all duration-200 ${item.tone}`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-bold text-slate-900">{item.role}</p>
                  <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded">RBAC</span>
                </div>
                <p className="mt-1.5 text-xs font-mono text-slate-600">{item.email}</p>
                <p className="mt-1.5 text-xs text-slate-500">{item.scope}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right Side: Clean Login Card */}
        <div className="flex items-center lg:justify-end">
          <div className="w-full max-w-xl border border-slate-200/80 bg-white/90 p-6 shadow-xl shadow-slate-200/40 rounded-3xl backdrop-blur-md sm:p-8">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-600">
                  Command Console
                </p>
                <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">
                  Đăng nhập hệ thống
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Truy cập dashboard Digital Twin, quản lý máy móc, bảo trì và xuất báo cáo.
                </p>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="mb-5 flex items-start gap-3 border border-red-200 bg-red-50/50 p-4 rounded-2xl text-sm text-red-700"
              >
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-red-100 text-xs font-extrabold text-red-700">
                  !
                </span>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.15em] text-slate-500">
                  Email tài khoản
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full border border-slate-200 bg-slate-50 px-4 py-3 rounded-2xl text-sm text-slate-800 outline-none transition duration-200 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
                  placeholder="admin@factory.local"
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.15em] text-slate-500">
                  Mật khẩu
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full border border-slate-200 bg-slate-50 px-4 py-3 rounded-2xl text-sm text-slate-800 outline-none transition duration-200 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
                  placeholder="password123"
                  required
                />
              </div>

              <button
                type="submit"
                className="flex w-full items-center justify-between bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-4 rounded-2xl text-sm font-bold uppercase tracking-[0.15em] transition duration-200 hover:-translate-y-0.5 shadow-md shadow-emerald-500/15 focus:outline-none focus:ring-4 focus:ring-emerald-500/20"
              >
                Vào command center
                <span className="text-lg" aria-hidden="true">
                  →
                </span>
              </button>
            </form>

            <div className="mt-6 border border-slate-100 bg-slate-50/50 p-5 rounded-2xl">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                Tài khoản dùng thử
              </p>
              <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                {accessRoles.map((item) => (
                  <button
                    key={item.email}
                    type="button"
                    onClick={() => {
                      setEmail(item.email);
                      setPassword('password123');
                    }}
                    className="border border-slate-200 bg-white rounded-xl px-3 py-2.5 text-left transition duration-200 hover:border-emerald-500/60 hover:bg-emerald-50/10 hover:-translate-y-0.5 shadow-sm"
                  >
                    <span className="block font-bold text-slate-800">{item.role}</span>
                    <span className="text-[10px] font-mono text-slate-500">{item.email}</span>
                  </button>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-slate-400 text-center">Mật khẩu demo chung: <strong className="text-slate-600">password123</strong></p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}