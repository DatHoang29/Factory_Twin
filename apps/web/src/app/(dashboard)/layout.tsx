'use client';

import { ReactNode, useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

interface Factory {
  id: number;
  name: string;
}

interface Zone {
  id: number;
  name: string;
}

const API_URL = typeof window !== 'undefined' 
  ? `${window.location.origin}/api` 
  : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api');

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, logout, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Selection state
  const [factories, setFactories] = useState<Factory[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [activeFactory, setActiveFactory] = useState<string>('');
  const [activeZone, setActiveZone] = useState<string>('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (user) {
      fetchFactories();
    }
  }, [user, pathname]);

  useEffect(() => {
    const handleRefresh = () => {
      fetchFactories();
    };
    window.addEventListener('refresh-header-dropdowns', handleRefresh);
    return () => {
      window.removeEventListener('refresh-header-dropdowns', handleRefresh);
    };
  }, [user]);

  useEffect(() => {
    if (activeFactory) {
      fetchZones(activeFactory);
    } else {
      setZones([]);
      setActiveZone('');
    }
  }, [activeFactory]);

  const fetchFactories = async () => {
    try {
      const res = await fetch(`${API_URL}/factories`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (res.status === 401) {
        logout();
        return;
      }
      if (res.ok) {
        const data = await res.json();
        const list = data.data || [];
        setFactories(list);

        // Load cached selection or default to first
        const cachedF = localStorage.getItem('selectedFactoryId');
        if (cachedF && list.some((f: Factory) => String(f.id) === cachedF)) {
          setActiveFactory(cachedF);
        } else if (list.length > 0) {
          const defaultF = String(list[0].id);
          setActiveFactory(defaultF);
          localStorage.setItem('selectedFactoryId', defaultF);
        }
      }
    } catch (err) {
      console.error('Error fetching factories:', err);
    }
  };

  const fetchZones = async (factoryId: string) => {
    try {
      const res = await fetch(`${API_URL}/zones?factoryId=${factoryId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (res.status === 401) {
        logout();
        return;
      }
      if (res.ok) {
        const data = await res.json();
        const list = data.data || [];
        setZones(list);

        const cachedZ = localStorage.getItem('selectedZoneId');
        if (cachedZ && list.some((z: Zone) => String(z.id) === cachedZ)) {
          setActiveZone(cachedZ);
        } else if (list.length > 0) {
          const defaultZ = String(list[0].id);
          setActiveZone(defaultZ);
          localStorage.setItem('selectedZoneId', defaultZ);
          window.dispatchEvent(new Event('factory-changed'));
        } else {
          setActiveZone('');
          localStorage.removeItem('selectedZoneId');
          window.dispatchEvent(new Event('factory-changed'));
        }
      }
    } catch (err) {
      console.error('Error fetching zones:', err);
    }
  };

  const handleFactoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setActiveFactory(val);
    localStorage.setItem('selectedFactoryId', val);
    localStorage.removeItem('selectedZoneId');
    setActiveZone('');
    window.dispatchEvent(new Event('factory-changed'));
  };

  const handleZoneChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setActiveZone(val);
    localStorage.setItem('selectedZoneId', val);
    window.dispatchEvent(new Event('factory-changed'));
  };

  if (isLoading) {
    return <div className="min-h-[calc(100vh-24px)] flex items-center justify-center bg-slate-50 text-slate-700">Đang tải...</div>;
  }

  if (!user) {
    router.push('/');
    return null;
  }

  const navItems = [
    { href: '/dashboard', label: 'Tổng quan', roles: ['ADMIN', 'TECHNICIAN', 'OPERATOR', 'VIEWER'] },
    { href: '/twin', label: 'Mô hình 3D', roles: ['ADMIN', 'TECHNICIAN', 'OPERATOR', 'VIEWER'] },
    { href: '/maintenance', label: 'Lịch bảo trì', roles: ['ADMIN', 'TECHNICIAN', 'OPERATOR', 'VIEWER'] },
    { href: '/tickets', label: 'Ticket', roles: ['ADMIN', 'TECHNICIAN', 'OPERATOR'] },
    { href: '/reports', label: 'Báo cáo', roles: ['ADMIN', 'TECHNICIAN', 'OPERATOR', 'VIEWER'] },
    { href: '/settings', label: 'Thiết lập', roles: ['ADMIN', 'OPERATOR', 'TECHNICIAN'] },
  ];

  const filteredNav = navItems.filter(item => item.roles.includes(user.role));
  const isTwin = pathname === '/twin';

  return (
    <div className="h-[calc(100vh-24px)] bg-slate-50 flex flex-col rounded-3xl border border-slate-200/50 shadow-sm overflow-hidden">
      <nav className="bg-white border-b border-slate-200/80 shrink-0 relative z-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex justify-between h-16 items-center">
            
            {/* Mobile Menu Button */}
            <div className="flex lg:hidden">
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="text-slate-500 hover:text-slate-700 focus:outline-none p-2 rounded-xl hover:bg-slate-100 transition-colors"
                aria-label="Toggle menu"
              >
                {isMobileMenuOpen ? (
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>
            </div>

            {/* Desktop Nav links */}
            <div className="hidden lg:flex space-x-6">
              {filteredNav.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-bold transition-colors h-16 whitespace-nowrap ${
                    pathname === item.href
                      ? 'border-emerald-500 text-slate-900'
                      : 'border-transparent text-slate-400 hover:text-slate-650'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>

            {/* Logo/Title on Mobile */}
            <div className="flex lg:hidden items-center">
              <span className="font-extrabold text-sm text-slate-950 tracking-wider">FACTORY TWIN</span>
            </div>

            {/* Desktop Quick selection dropdowns */}
            <div className="hidden lg:flex items-center gap-3">
              <select
                value={activeFactory}
                onChange={handleFactoryChange}
                className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 focus:border-indigo-500 outline-none max-w-[180px]"
              >
                <option value="">-- Chọn Nhà Máy --</option>
                {factories.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>

              <select
                value={activeZone}
                onChange={handleZoneChange}
                disabled={!activeFactory}
                className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 focus:border-indigo-500 outline-none max-w-[180px] disabled:opacity-50"
              >
                <option value="">-- Chọn Phân Xưởng --</option>
                {zones.map(z => (
                  <option key={z.id} value={z.id}>{z.name}</option>
                ))}
              </select>
            </div>

            {/* User and Logout */}
            <div className="flex items-center space-x-3">
              <span className="hidden sm:inline-flex text-[10px] font-extrabold text-slate-500 bg-slate-50 border border-slate-200/60 px-2.5 py-1 rounded-xl whitespace-nowrap">
                {user.fullName} ({user.role})
              </span>
              <button
                onClick={logout}
                className="bg-red-500 hover:bg-red-655 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors shadow-sm shadow-red-100"
              >
                Đăng xuất
              </button>
            </div>
            
          </div>
        </div>

        {/* Mobile Dropdown Panel */}
        {isMobileMenuOpen && (
          <div className="lg:hidden bg-white border-b border-slate-200 px-6 py-4 space-y-4 absolute top-16 left-0 right-0 shadow-lg z-50">
            {/* Nav links */}
            <div className="flex flex-col space-y-1">
              {filteredNav.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${
                    pathname === item.href
                      ? 'bg-emerald-50 text-emerald-800'
                      : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>

            {/* Dropdowns */}
            <div className="flex flex-col gap-2 pt-3 border-t border-slate-100">
              <span className="text-[10px] font-bold text-slate-450 uppercase tracking-wider">Lọc khu vực</span>
              <select
                value={activeFactory}
                onChange={handleFactoryChange}
                className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 outline-none"
              >
                <option value="">-- Chọn Nhà Máy --</option>
                {factories.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>

              <select
                value={activeZone}
                onChange={handleZoneChange}
                disabled={!activeFactory}
                className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 outline-none disabled:opacity-50"
              >
                <option value="">-- Chọn Phân Xưởng --</option>
                {zones.map(z => (
                  <option key={z.id} value={z.id}>{z.name}</option>
                ))}
              </select>
            </div>

            {/* Mobile User Profile Info */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tài khoản</span>
              <span className="font-extrabold text-slate-800 bg-slate-100 px-2.5 py-1.2 rounded-lg text-[10px]">
                {user.fullName} ({user.role})
              </span>
            </div>
          </div>
        )}
      </nav>

      {isTwin ? (
        <main className="flex-1 relative overflow-hidden bg-slate-100">
          {children}
        </main>
      ) : (
        <main className="max-w-7xl w-full mx-auto py-6 px-6 flex-1 overflow-y-auto">
          {children}
        </main>
      )}
    </div>
  );
}