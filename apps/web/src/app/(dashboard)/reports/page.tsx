'use client';

import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

interface Machine {
  id: number;
  code: string;
  name: string;
  status: string;
  sensorCount: number;
  zone: any;
}

interface KPI {
  totalMachines: number;
  runningMachines: number;
  stoppedMachines: number;
  maintenanceMachines: number;
  openAlerts: number;
  criticalAlerts: number;
  openTickets: number;
  productionEfficiency: number;
  energyKwh: number;
  availability: number;
  performance: number;
  quality: number;
  oee: number;
  greenIndex: number;
}

interface Activity {
  id: number;
  machine: string;
  activityType: string;
  description: string;
  createdAt: string;
}

interface ProductionRecord {
  id: number;
  machine: string;
  output: number;
  target: number;
  unit: string;
  periodEnd: string;
}

interface EnergyRecord {
  id: number;
  machine: string;
  kwh: number;
  cost: number;
  periodEnd: string;
}

const API_URL = typeof window !== 'undefined' 
  ? `${window.location.origin}/api` 
  : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api');

const getSocketUrl = (serverIp?: string) => {
  if (typeof window !== 'undefined') {
    const isHttps = window.location.protocol === 'https:';
    if (isHttps) {
      return window.location.origin;
    }
    // Đối với HTTP, tự động kết nối cổng 3001 trên cùng host hiện tại (localhost hoặc IP LAN)
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    return `${protocol}//${hostname}:3001`;
  }
  return 'http://localhost:3001';
};

let socket: Socket | null = null;

const statusColors: Record<string, string> = {
  RUNNING: 'bg-emerald-500',
  ERROR: 'bg-red-500 animate-pulse',
  MAINTENANCE: 'bg-amber-500',
  STOPPED: 'bg-slate-400',
};

const statusLabels: Record<string, string> = {
  RUNNING: 'Đang chạy',
  ERROR: 'Sự cố',
  MAINTENANCE: 'Bảo trì',
  STOPPED: 'Dừng máy',
};

const CircularProgress = ({ value, label, color, delay }: { value: number; label: string; color: string; delay?: string }) => {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (value / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2 animate-fade-in" style={{ animationDelay: delay }}>
      <div className="relative w-16 h-16 flex items-center justify-center">
        {/* Background Circle */}
        <svg className="w-full h-full transform -rotate-90">
          <circle
            cx="32"
            cy="32"
            r={radius}
            className="stroke-slate-100"
            strokeWidth="5"
            fill="transparent"
          />
          {/* Progress Circle */}
          <circle
            cx="32"
            cy="32"
            r={radius}
            style={{
              transition: 'stroke-dashoffset 1s ease-out',
              strokeDasharray: circumference,
              strokeDashoffset: strokeDashoffset,
            }}
            stroke={color}
            strokeWidth="5.5"
            fill="transparent"
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute font-mono text-[10px] font-black text-slate-800">{value}%</span>
      </div>
      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
    </div>
  );
};

const getGreenRating = (val: number) => {
  if (val <= 0.5) return { grade: 'A', color: 'text-emerald-500 bg-emerald-50 border-emerald-200', text: 'Xuất sắc (Green Factory)', desc: 'Tiêu hao năng lượng tối ưu, giảm lượng phát thải carbon trên từng sản phẩm.' };
  if (val <= 1.0) return { grade: 'B', color: 'text-indigo-500 bg-indigo-50 border-indigo-200', text: 'Tốt (Hiệu quả cao)', desc: 'Mức tiêu thụ tốt, duy trì chế độ vận hành ổn định.' };
  if (val <= 2.0) return { grade: 'C', color: 'text-amber-500 bg-amber-50 border-amber-200', text: 'Cần cải tiến', desc: 'Dấu hiệu tiêu hao điện cao. Cần tra mỡ vòng bi hoặc căn chỉnh trục động cơ.' };
  return { grade: 'D', color: 'text-red-500 bg-red-50 border-red-200', text: 'Kém (Lãng phí năng lượng)', desc: 'Tiêu hao quá mức. Kiểm tra chập stator hoặc ổ đỡ mài mòn nặng.' };
};

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<'status' | 'production' | 'energy' | 'predictive'>('status');
  const [selectedMachineId, setSelectedMachineId] = useState<string>('all');
  const [machines, setMachines] = useState<Machine[]>([]);
  const [kpis, setKpis] = useState<KPI | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [production, setProduction] = useState<ProductionRecord[]>([]);
  const [energy, setEnergy] = useState<EnergyRecord[]>([]);
  const [predictiveInsights, setPredictiveInsights] = useState<any[]>([]);
  const [approvingScheduleId, setApprovingScheduleId] = useState<number | null>(null);
  const [analyzingMachineId, setAnalyzingMachineId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const [serverIp, setServerIp] = useState('localhost');

  useEffect(() => {
    const fetchIp = async () => {
      try {
        const res = await fetch(`${API_URL}/public/system-ip`);
        if (res.ok) {
          const data = await res.json();
          if (data.ipAddress) {
            setServerIp(data.ipAddress);
          }
        }
      } catch (err) {
        console.error('Error fetching system IP in reports:', err);
      }
    };
    fetchIp();
  }, []);

  const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 6000);
  };
  
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleReanalyzeMachine = async (machineId: number) => {
    setAnalyzingMachineId(machineId);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/predictive/analyze/${machineId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setPredictiveInsights(prev => 
          prev.map(p => p.machineId === machineId ? data.data : p)
        );
        if (data.data?.isSimulated) {
          showToast('Phân tích hoàn tất: Phát hiện lỗi API/Hết quota Gemini. Đã tự động sử dụng Luật Giả lập dự phòng.', 'warning');
        } else {
          showToast('Yêu cầu AI phân tích lại thành công!', 'success');
        }
      } else {
        const errData = await res.json();
        showToast(`Lỗi: ${errData.error || 'Không thể phân tích'}`, 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Đã xảy ra lỗi khi yêu cầu phân tích lại', 'error');
    } finally {
      setAnalyzingMachineId(null);
    }
  };

  const handleApproveMaintenance = async (scheduleId: number) => {
    setApprovingScheduleId(scheduleId);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/maintenance-schedules/${scheduleId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'ACTIVE' })
      });
      if (res.ok) {
        setRefreshTrigger(prev => prev + 1);
        showToast('Đã phê duyệt kế hoạch bảo trì thành công!', 'success');
      } else {
        const errData = await res.json();
        showToast(`Lỗi: ${errData.error || 'Không thể phê duyệt'}`, 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Đã xảy ra lỗi khi duyệt bảo trì', 'error');
    } finally {
      setApprovingScheduleId(null);
    }
  };

  useEffect(() => {
    const targetUrl = getSocketUrl(serverIp);
    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
    if (socket) {
      socket.disconnect();
    }
    socket = io(targetUrl, {
      path: '/api/socket.io',
      transports: ['websocket', 'polling'],
    });

    const loadData = async () => {
      try {
        const token = localStorage.getItem('token');
        const zoneId = localStorage.getItem('selectedZoneId');
        const factoryId = localStorage.getItem('selectedFactoryId');

        // Fetch machines for filter list
        const mQuery = zoneId 
          ? `${API_URL}/machines?zoneId=${zoneId}` 
          : (factoryId ? `${API_URL}/machines?factoryId=${factoryId}` : `${API_URL}/machines`);
          
        const mRes = await fetch(mQuery, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (mRes.ok) {
          const mData = await mRes.json();
          setMachines(mData.data || []);
        }

        // Fetch KPI overview
        let oParams = '';
        if (selectedMachineId !== 'all') {
          oParams = `?machineId=${selectedMachineId}`;
        } else if (zoneId) {
          oParams = `?zoneId=${zoneId}`;
        } else if (factoryId) {
          oParams = `?factoryId=${factoryId}`;
        }

        const oRes = await fetch(`${API_URL}/reports/overview${oParams}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (oRes.ok) {
          const oData = await oRes.json();
          setKpis(oData.data?.kpis || null);
        }

        // Fetch detailed logs & history metrics
        let historyUrl = '';
        if (selectedMachineId !== 'all') {
          historyUrl = `${API_URL}/reports/history?machineId=${selectedMachineId}`;
        } else {
          let hParams = '';
          if (zoneId) hParams = `?zoneId=${zoneId}`;
          else if (factoryId) hParams = `?factoryId=${factoryId}`;
          historyUrl = `${API_URL}/reports/history${hParams}`;
        }
          
        const hRes = await fetch(historyUrl, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (hRes.ok) {
          const hData = await hRes.json();
          setActivities(hData.data?.activities || []);
          setProduction(hData.data?.production || []);
          setEnergy(hData.data?.energy || []);
        }

        // Fetch predictive insights
        let predParams = '';
        if (zoneId) predParams = `?zoneId=${zoneId}`;
        else if (factoryId) predParams = `?factoryId=${factoryId}`;
        const pRes = await fetch(`${API_URL}/predictive/insights${predParams}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (pRes.ok) {
          const pData = await pRes.json();
          const insights = pData.data || [];
          setPredictiveInsights(insights);
          
          const hasSimulated = insights.some((item: any) => item.isSimulated);
          if (hasSimulated) {
            showToast('Lưu ý: Hết hạn mức API Gemini (Lỗi 429). Hệ thống đã tự động chuyển đổi sang dữ liệu phân tích giả lập.', 'warning');
          }
        }

      } catch (err) {
        console.error('Error loading reports data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();

    const handleFactoryChange = () => {
      setRefreshTrigger(prev => prev + 1);
    };
    window.addEventListener('factory-changed', handleFactoryChange);

    // WebSocket real-time machine status update
    socket.on('sensor_update', (data: { machineId: number; status?: string }) => {
      if (data.status) {
        setMachines(prev =>
          prev.map(m => m.id === data.machineId ? { ...m, status: data.status! } : m)
        );
      }
    });

    socket.on('machine_status_change', (data: { machineId: number; status: string }) => {
      setMachines(prev =>
        prev.map(m => m.id === data.machineId ? { ...m, status: data.status } : m)
      );
    });

    return () => {
      socket?.disconnect();
      socket = null;
      window.removeEventListener('factory-changed', handleFactoryChange);
    };
  }, [refreshTrigger, selectedMachineId, serverIp]);

  if (loading) {
    return (
      <div className="min-h-full flex items-center justify-center p-8">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400">Đang tổng hợp báo cáo...</p>
        </div>
      </div>
    );
  }

  // Calculate SVG production chart metrics
  const maxOutput = production.length > 0 ? Math.max(...production.map(p => Math.max(p.output, p.target))) : 100;
  const prodChartHeight = 220;
  const prodChartWidth = 680;
  const paddingX = 40;
  const paddingY = 20;

  // Calculate SVG energy chart metrics
  const maxEnergy = energy.length > 0 ? Math.max(...energy.map(e => e.kwh)) : 100;
  const energyChartHeight = 220;
  const energyChartWidth = 680;

  const filteredInsights = selectedMachineId === 'all'
    ? predictiveInsights
    : predictiveInsights.filter(p => p.machineId === Number(selectedMachineId));

  return (
    <div className="min-h-full bg-white rounded-3xl border border-slate-200/60 shadow-sm overflow-hidden text-slate-800 flex flex-col">
      {/* Banner */}
      <section className="relative overflow-hidden border-b border-slate-200/80 bg-white px-6 py-8 lg:px-10 shrink-0">
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.35em] text-indigo-650">Analytics & Insights</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">Báo Cáo & Phân Tích</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-500">Giám sát tổng quan tình trạng thiết bị, thống kê hiệu suất sản xuất (OEE) và phân tích năng lượng điện tiêu thụ.</p>
          </div>

          {/* Quick Filters */}
          <div className="flex items-center gap-3 shrink-0 self-start md:self-auto">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Chọn máy:</span>
            <select
              value={selectedMachineId}
              onChange={(e) => setSelectedMachineId(e.target.value)}
              className="bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white px-4 py-2.5 rounded-2xl text-xs outline-none font-bold text-slate-700 transition cursor-pointer"
            >
              <option value="all">Tất cả thiết bị</option>
              {machines.map(m => (
                <option key={m.id} value={m.id}>{m.code} - {m.name}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Navigation Tabs */}
      <div className="px-6 border-b border-slate-200/60 bg-slate-50/40 shrink-0 lg:px-10 py-3 flex gap-2">
        <button
          onClick={() => setActiveTab('status')}
          className={`px-5 py-2.5 rounded-xl font-mono text-[10px] uppercase font-bold tracking-[0.1em] transition-all border ${
            activeTab === 'status'
              ? 'bg-indigo-600 border-indigo-650 text-white shadow-sm shadow-indigo-100'
              : 'bg-white border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50'
          }`}
        >
          ⏱️ Trạng thái & Lịch sử
        </button>
        <button
          onClick={() => setActiveTab('production')}
          className={`px-5 py-2.5 rounded-xl font-mono text-[10px] uppercase font-bold tracking-[0.1em] transition-all border ${
            activeTab === 'production'
              ? 'bg-indigo-600 border-indigo-650 text-white shadow-sm shadow-indigo-100'
              : 'bg-white border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50'
          }`}
        >
          📈 Hiệu suất sản xuất
        </button>
        <button
          onClick={() => setActiveTab('energy')}
          className={`px-5 py-2.5 rounded-xl font-mono text-[10px] uppercase font-bold tracking-[0.1em] transition-all border ${
            activeTab === 'energy'
              ? 'bg-indigo-600 border-indigo-650 text-white shadow-sm shadow-indigo-100'
              : 'bg-white border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50'
          }`}
        >
          ⚡ Điện năng tiêu thụ
        </button>
        <button
          onClick={() => setActiveTab('predictive')}
          className={`px-5 py-2.5 rounded-xl font-mono text-[10px] uppercase font-bold tracking-[0.1em] transition-all border ${
            activeTab === 'predictive'
              ? 'bg-indigo-600 border-indigo-650 text-white shadow-sm shadow-indigo-100'
              : 'bg-white border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50'
          }`}
        >
          🤖 Dự báo AI (Gemini)
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 lg:p-10 space-y-6">
        
        {/* KPI Row (Overview) */}
        {kpis && (
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="border border-slate-200 bg-white/70 backdrop-blur-md rounded-2xl p-5 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Hiệu suất sản xuất (OEE)</p>
              <p className="mt-2 text-3xl font-black text-indigo-650 tracking-tight">
                {kpis.oee !== undefined ? kpis.oee : kpis.productionEfficiency}%
              </p>
              <p className="mt-1 text-xs text-slate-500">Hiệu suất thiết bị tổng thể thực tế</p>
            </div>
            <div className="border border-slate-200 bg-white/70 backdrop-blur-md rounded-2xl p-5 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Tổng điện tiêu thụ</p>
              <p className="mt-2 text-3xl font-black text-slate-900 tracking-tight">{kpis.energyKwh.toLocaleString()} kWh</p>
              <p className="mt-1 text-xs text-slate-500">Tổng năng lượng phân xưởng</p>
            </div>
            <div className="border border-slate-200 bg-white/70 backdrop-blur-md rounded-2xl p-5 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Thiết bị hoạt động</p>
              <p className="mt-2 text-3xl font-black text-emerald-600 tracking-tight">
                {kpis.runningMachines} <span className="text-sm font-bold text-slate-400">/ {kpis.totalMachines}</span>
              </p>
              <p className="mt-1 text-xs text-slate-500">Số lượng máy đang chạy</p>
            </div>
            <div className="border border-slate-200 bg-white/70 backdrop-blur-md rounded-2xl p-5 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Phiếu xử lý sự cố</p>
              <p className="mt-2 text-3xl font-black text-red-600 tracking-tight">{kpis.openTickets}</p>
              <p className="mt-1 text-xs text-slate-500">Phiếu bảo trì đang mở</p>
            </div>
          </section>
        )}

        {/* Detailed OEE Breakdown & Green Rating */}
        {kpis && kpis.oee !== undefined && (
          <section className="grid gap-6 md:grid-cols-2">
            {/* 1. OEE Detailed Breakdown */}
            <div className="border border-slate-200 bg-white rounded-3xl p-6 shadow-sm flex flex-col gap-4">
              <div>
                <h2 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">Phân tích OEE 3 Nhân tố thời gian thực</h2>
                <p className="text-[10px] text-slate-400 mt-0.5">Các nhân tố cấu thành hiệu suất thiết bị tổng thể (OEE).</p>
              </div>
              
              <div className="grid grid-cols-3 gap-2 py-2">
                <CircularProgress value={kpis.availability} label="Availability" color="#3b82f6" delay="0ms" />
                <CircularProgress value={kpis.performance} label="Performance" color="#6366f1" delay="150ms" />
                <CircularProgress value={kpis.quality} label="Quality" color="#10b981" delay="300ms" />
              </div>
              
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 text-[10px] leading-relaxed text-slate-650 font-semibold">
                <span className="text-slate-950 font-bold block mb-1">💡 Hướng dẫn tối ưu hóa:</span>
                {kpis.oee < 60 ? (
                  "Hiệu suất OEE ở mức cảnh báo trung bình. Hãy tập trung xử lý nhanh các sự cố đang báo động để cải thiện tính sẵn sàng (Availability) và chất lượng sản phẩm (Quality)."
                ) : kpis.oee < 85 ? (
                  "Hiệu suất OEE đạt mức khá. Khuyến nghị duy trì kế hoạch sản xuất hiện tại và tra dầu mỡ định kỳ bảo trì phòng ngừa để đạt mốc 85% tiêu chuẩn thế giới."
                ) : (
                  "Tuyệt vời! Chỉ số OEE đạt mức hoàn hảo chuẩn thế giới (World-Class OEE). Quy trình vận hành và chất lượng sản xuất đang tối ưu tối đa."
                )}
              </div>
            </div>

            {/* 2. Green Energy Efficiency (kWh/Unit) & Green Rating */}
            {(() => {
              const rating = getGreenRating(kpis.greenIndex);
              return (
                <div className="border border-slate-200 bg-white rounded-3xl p-6 shadow-sm flex flex-col gap-4 justify-between">
                  <div className="flex justify-between items-start">
                    <div>
                      <h2 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">Chỉ số Năng lượng Xanh (Green Rating)</h2>
                      <p className="text-[10px] text-slate-400 mt-0.5">Tiêu hao điện năng trên mỗi đơn vị sản phẩm sản xuất.</p>
                    </div>
                    
                    <div className={`px-3 py-1 rounded-xl text-xs font-black border font-mono tracking-wider ${rating.color}`}>
                      GRADE {rating.grade}
                    </div>
                  </div>
                  
                  <div className="flex items-baseline gap-2 py-1">
                    <span className="text-3xl font-black text-slate-950 tracking-tight">{kpis.greenIndex}</span>
                    <span className="text-xs font-mono font-bold text-slate-400">kWh / sản phẩm</span>
                  </div>
                  
                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 text-[10px] leading-relaxed text-slate-655 font-semibold flex flex-col gap-1">
                    <span className="text-slate-950 font-bold block">{rating.text}</span>
                    <span>{rating.desc}</span>
                  </div>
                  
                  {/* Dynamic Rating Indicator bar */}
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden flex relative">
                    <div className="h-full bg-emerald-500 w-[16.7%]" title="Grade A (<= 0.5)" />
                    <div className="h-full bg-indigo-500 w-[16.7%]" title="Grade B (0.5 - 1.0)" />
                    <div className="h-full bg-amber-500 w-[33.3%]" title="Grade C (1.0 - 2.0)" />
                    <div className="h-full bg-red-500 w-[33.3%]" title="Grade D (> 2.0)" />
                    
                    {/* Floating pointer */}
                    <div 
                      className="absolute top-0 bottom-0 w-1.5 bg-slate-950 border border-white rounded shadow-sm transition-all duration-1000"
                      style={{ 
                        left: `${Math.min(95, Math.max(5, (kpis.greenIndex / 3.0) * 100))}%`,
                        transform: 'translateX(-50%)'
                      }}
                    />
                  </div>
                </div>
              );
            })()}
          </section>
        )}

        {/* Tab content 1: Status & Timeline */}
        {activeTab === 'status' && (
          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            
            {/* Machine Status Cards List */}
            <div className="border border-slate-200 bg-white rounded-3xl p-6 shadow-sm">
              <div className="mb-4">
                <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">Trạng thái máy móc thời gian thực</h2>
                <p className="text-xs text-slate-400 mt-1">Danh sách thiết bị trong phân xưởng cập nhật tự động.</p>
              </div>

              <div className="space-y-2.5 max-h-[450px] overflow-y-auto pr-1">
                {machines.length === 0 ? (
                  <p className="text-xs text-slate-400 py-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">Không tìm thấy thiết bị nào.</p>
                ) : (
                  machines.map(m => (
                    <div key={m.id} className="border border-slate-100 bg-slate-50/50 hover:bg-slate-50 p-3.5 rounded-2xl flex items-center justify-between transition">
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-bold text-slate-950">{m.code}</p>
                        <p className="font-extrabold text-slate-800 text-xs mt-0.5 truncate">{m.name}</p>
                        <p className="text-[9px] text-indigo-650 font-bold uppercase mt-1 tracking-wider">
                          {typeof m.zone === 'object' && m.zone !== null ? (m.zone as any).name : m.zone}
                        </p>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <span className={`h-2.5 w-2.5 rounded-full ${statusColors[m.status] || 'bg-slate-400'}`} />
                        <span className="font-mono text-[10px] uppercase font-bold text-slate-650">{statusLabels[m.status] || m.status}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Timeline of activities */}
            <div className="border border-slate-200 bg-white rounded-3xl p-6 shadow-sm flex flex-col">
              <div className="mb-4">
                <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">Dòng thời gian hoạt động & bảo trì (Lịch sử)</h2>
                <p className="text-xs text-slate-400 mt-1">Lịch sử sự kiện ghi nhận gần đây nhất trên toàn bộ máy móc.</p>
              </div>

              <div className="flex-1 overflow-y-auto max-h-[450px] space-y-4 pr-1 relative pl-6">
                {activities.length === 0 ? (
                  <p className="text-xs text-slate-400 py-12 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 -ml-6">Không ghi nhận hoạt động nào.</p>
                ) : (
                  <>
                    {/* Timeline vertical line */}
                    <div className="absolute left-2.5 top-2 bottom-2 w-0.5 bg-slate-200/70" />
                    
                    {activities.map((a, idx) => (
                      <div key={a.id} className="relative group">
                        {/* Timeline dot */}
                        <span className="absolute -left-[21px] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-indigo-500 shadow-sm group-hover:scale-110 transition z-10" />
                      
                      <div className="border border-slate-100 bg-slate-50/30 hover:bg-slate-50/80 p-3.5 rounded-2xl transition">
                        <div className="flex justify-between items-start gap-2 mb-1.5">
                          <span className="font-mono text-[9px] font-bold text-indigo-650 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded">
                            {a.activityType}
                          </span>
                          <span className="text-[9px] font-mono text-slate-400">
                            {new Date(a.createdAt).toLocaleDateString('vi-VN')} {new Date(a.createdAt).toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'})}
                          </span>
                        </div>
                        <p className="font-extrabold text-xs text-slate-900">{a.machine}</p>
                        <p className="text-xs text-slate-655 mt-1 leading-relaxed">{a.description}</p>
                      </div>
                    </div>
                  ))}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab content 2: Production performance */}
        {activeTab === 'production' && (
          <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
            
            {/* SVG line-graph */}
            <div className="border border-slate-200 bg-white rounded-3xl p-6 shadow-sm overflow-hidden flex flex-col">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">Biểu đồ sản lượng và chỉ tiêu sản xuất</h2>
                  <p className="text-xs text-slate-400 mt-1">Đối chiếu sản lượng thực tế (Thực tế) so với chỉ tiêu kế hoạch (Chỉ tiêu).</p>
                </div>
                
                <div className="flex items-center gap-4 text-[9px] font-mono font-bold uppercase tracking-wider">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-4 bg-indigo-500 rounded" />
                    <span>Thực tế</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-4 bg-slate-300 border border-dashed border-slate-450 rounded" />
                    <span>Chỉ tiêu</span>
                  </div>
                </div>
              </div>

              {production.length === 0 ? (
                <div className="flex-1 flex items-center justify-center py-20 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <p className="text-xs text-slate-400">Không có dữ liệu thống kê sản xuất cho thiết bị này.</p>
                </div>
              ) : (
                <div className="flex-1 w-full overflow-x-auto min-h-[250px]">
                  <svg 
                    viewBox={`0 0 ${prodChartWidth} ${prodChartHeight}`} 
                    className="w-full h-auto select-none"
                    style={{ minWidth: '600px' }}
                  >
                    {/* Y-axis helper lines */}
                    {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                      const y = paddingY + (1 - ratio) * (prodChartHeight - 2 * paddingY);
                      const val = Math.round(ratio * maxOutput);
                      return (
                        <g key={idx} className="opacity-60">
                          <line 
                            x1={paddingX} 
                            y1={y} 
                            x2={prodChartWidth - paddingX} 
                            y2={y} 
                            stroke="#e2e8f0" 
                            strokeDasharray="4 4" 
                          />
                          <text 
                            x={paddingX - 10} 
                            y={y + 4} 
                            textAnchor="end" 
                            className="font-mono text-[9px] fill-slate-400 font-bold"
                          >
                            {val}
                          </text>
                        </g>
                      );
                    })}

                    {/* Chart Paths */}
                    {(() => {
                      const dataPoints = [...production].reverse().slice(-10); // Show last 10 points
                      const stepX = (prodChartWidth - 2 * paddingX) / (Math.max(dataPoints.length - 1, 1));
                      
                      const actualPoints = dataPoints.map((p, idx) => {
                        const x = paddingX + idx * stepX;
                        const y = prodChartHeight - paddingY - (p.output / maxOutput) * (prodChartHeight - 2 * paddingY);
                        return { x, y, label: p.output, name: p.periodEnd };
                      });

                      const targetPoints = dataPoints.map((p, idx) => {
                        const x = paddingX + idx * stepX;
                        const y = prodChartHeight - paddingY - (p.target / maxOutput) * (prodChartHeight - 2 * paddingY);
                        return { x, y, label: p.target };
                      });

                      const actualPath = actualPoints.length > 0 
                        ? `M ${actualPoints[0].x} ${actualPoints[0].y} ` + actualPoints.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')
                        : '';
                        
                      const targetPath = targetPoints.length > 0 
                        ? `M ${targetPoints[0].x} ${targetPoints[0].y} ` + targetPoints.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')
                        : '';

                      return (
                        <>
                          {/* Target line */}
                          {targetPath && (
                            <path 
                              d={targetPath} 
                              fill="none" 
                              stroke="#cbd5e1" 
                              strokeWidth={2} 
                              strokeDasharray="4 4" 
                            />
                          )}

                          {/* Actual Area gradient fill */}
                          {actualPoints.length > 0 && (
                            <path 
                              d={`${actualPath} L ${actualPoints[actualPoints.length - 1].x} ${prodChartHeight - paddingY} L ${actualPoints[0].x} ${prodChartHeight - paddingY} Z`} 
                              fill="url(#prodGrad)" 
                              className="opacity-20"
                            />
                          )}

                          {/* Actual line */}
                          {actualPath && (
                            <path 
                              d={actualPath} 
                              fill="none" 
                              stroke="#4f46e5" 
                              strokeWidth={3} 
                              strokeLinecap="round"
                            />
                          )}

                          {/* Dots */}
                          {actualPoints.map((pt, idx) => (
                            <g key={idx} className="cursor-pointer group">
                              <circle 
                                cx={pt.x} 
                                cy={pt.y} 
                                r={4} 
                                fill="#4f46e5" 
                                stroke="#ffffff" 
                                strokeWidth={1.5} 
                              />
                              <text 
                                x={pt.x} 
                                y={pt.y - 8} 
                                textAnchor="middle" 
                                className="font-mono text-[8px] fill-indigo-650 font-bold opacity-0 group-hover:opacity-100 transition duration-200"
                              >
                                {pt.label}
                              </text>
                            </g>
                          ))}

                          {/* Gradients declarations */}
                          <defs>
                            <linearGradient id="prodGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#4f46e5" />
                              <stop offset="100%" stopColor="#ffffff" />
                            </linearGradient>
                          </defs>
                        </>
                      );
                    })()}
                  </svg>
                </div>
              )}
            </div>

            {/* List of efficiency */}
            <div className="border border-slate-200 bg-white rounded-3xl p-6 shadow-sm flex flex-col">
              <div className="mb-4">
                <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">Thống kê sản lượng gần đây</h2>
                <p className="text-xs text-slate-400 mt-1">Chi tiết hiệu suất đầu ra theo từng ca làm việc.</p>
              </div>

              <div className="flex-1 overflow-y-auto max-h-[350px] space-y-2.5 pr-1">
                {production.length === 0 ? (
                  <p className="text-xs text-slate-400 py-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">Không có bản ghi sản xuất nào.</p>
                ) : (
                  production.slice(0, 10).map((p, idx) => {
                    const rate = p.target > 0 ? Math.round((p.output / p.target) * 100) : 0;
                    return (
                      <div key={idx} className="border border-slate-100 bg-slate-50/50 p-3.5 rounded-2xl">
                        <div className="flex justify-between items-start gap-2 mb-1.5">
                          <p className="font-extrabold text-xs text-slate-800 line-clamp-1">{p.machine}</p>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold shrink-0 ${
                            rate >= 100 ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                            rate >= 80 ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' :
                            'bg-red-50 text-red-600 border border-red-100'
                          }`}>
                            {rate}% Đạt
                          </span>
                        </div>
                        <div className="flex justify-between text-[10px] text-slate-500 font-mono font-bold">
                          <span>Thực tế: {p.output} {p.unit}</span>
                          <span>Chỉ tiêu: {p.target} {p.unit}</span>
                        </div>
                        <p className="mt-1 text-[8px] font-mono text-slate-400">Ca kết thúc: {new Date(p.periodEnd).toLocaleDateString('vi-VN')}</p>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab content 3: Energy consumption */}
        {activeTab === 'energy' && (
          <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
            
            {/* SVG bar-graph */}
            <div className="border border-slate-200 bg-white rounded-3xl p-6 shadow-sm overflow-hidden flex flex-col">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">Biểu đồ năng lượng tiêu thụ (kWh)</h2>
                  <p className="text-xs text-slate-400 mt-1">Phân tích lượng điện tiêu thụ trong các chu kỳ vừa qua.</p>
                </div>
              </div>

              {energy.length === 0 ? (
                <div className="flex-1 flex items-center justify-center py-20 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <p className="text-xs text-slate-400">Không có dữ liệu đo điện năng cho thiết bị này.</p>
                </div>
              ) : (
                <div className="flex-1 w-full overflow-x-auto min-h-[250px]">
                  <svg 
                    viewBox={`0 0 ${energyChartWidth} ${energyChartHeight}`} 
                    className="w-full h-auto select-none"
                    style={{ minWidth: '600px' }}
                  >
                    {/* Y-axis helper lines */}
                    {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                      const y = paddingY + (1 - ratio) * (energyChartHeight - 2 * paddingY);
                      const val = Math.round(ratio * maxEnergy);
                      return (
                        <g key={idx} className="opacity-60">
                          <line 
                            x1={paddingX} 
                            y1={y} 
                            x2={energyChartWidth - paddingX} 
                            y2={y} 
                            stroke="#e2e8f0" 
                            strokeDasharray="4 4" 
                          />
                          <text 
                            x={paddingX - 10} 
                            y={y + 4} 
                            textAnchor="end" 
                            className="font-mono text-[9px] fill-slate-400 font-bold"
                          >
                            {val}
                          </text>
                        </g>
                      );
                    })}

                    {/* SVG bars */}
                    {(() => {
                      const dataPoints = [...energy].reverse().slice(-10); // Show last 10 points
                      const totalBars = dataPoints.length;
                      const chartInnerWidth = energyChartWidth - 2 * paddingX;
                      const barGap = 16;
                      const barWidth = (chartInnerWidth - (totalBars - 1) * barGap) / totalBars;
                      
                      return dataPoints.map((item, idx) => {
                        const x = paddingX + idx * (barWidth + barGap);
                        const ratio = item.kwh / maxEnergy;
                        const barHeight = ratio * (energyChartHeight - 2 * paddingY);
                        const y = energyChartHeight - paddingY - barHeight;

                        return (
                          <g key={idx} className="cursor-pointer group">
                            {/* Bar item with gradient */}
                            <rect 
                              x={x} 
                              y={y} 
                              width={barWidth} 
                              height={barHeight} 
                              rx={4}
                              fill="url(#energyGrad)"
                              className="hover:opacity-90 transition duration-200"
                            />
                            {/* Value label on hover */}
                            <text 
                              x={x + barWidth / 2} 
                              y={y - 6} 
                              textAnchor="middle" 
                              className="font-mono text-[8px] fill-indigo-650 font-bold opacity-0 group-hover:opacity-100 transition duration-200"
                            >
                              {Math.round(item.kwh)} kWh
                            </text>
                            
                            {/* Bottom label */}
                            <text 
                              x={x + barWidth / 2} 
                              y={energyChartHeight - 4} 
                              textAnchor="middle" 
                              className="font-mono text-[7px] fill-slate-400 font-bold"
                            >
                              {new Date(item.periodEnd).toLocaleDateString('vi-VN', {month: '2-digit', day: '2-digit'})}
                            </text>
                          </g>
                        );
                      });
                    })()}

                    {/* Gradient definition */}
                    <defs>
                      <linearGradient id="energyGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#818cf8" />
                        <stop offset="100%" stopColor="#4f46e5" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
              )}
            </div>

            {/* List of energy costs */}
            <div className="border border-slate-200 bg-white rounded-3xl p-6 shadow-sm flex flex-col">
              <div className="mb-4">
                <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">Chi phí năng lượng chi tiết</h2>
                <p className="text-xs text-slate-400 mt-1">Số liệu điện năng và ước tính chi phí quy đổi.</p>
              </div>

              <div className="flex-1 overflow-y-auto max-h-[350px] space-y-2.5 pr-1">
                {energy.length === 0 ? (
                  <p className="text-xs text-slate-400 py-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">Không có bản ghi điện năng nào.</p>
                ) : (
                  energy.slice(0, 10).map((e, idx) => (
                    <div key={idx} className="border border-slate-100 bg-slate-50/50 p-3.5 rounded-2xl">
                      <div className="flex justify-between items-start gap-2 mb-1.5">
                        <p className="font-extrabold text-xs text-slate-800 line-clamp-1">{e.machine}</p>
                        <span className="bg-indigo-50 text-indigo-650 border border-indigo-100 px-2 py-0.5 rounded text-[9px] font-mono font-bold shrink-0">
                          {e.kwh.toLocaleString()} kWh
                        </span>
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-500 font-mono font-bold">
                        <span>Chi phí ước tính:</span>
                        <span className="text-indigo-650">{(e.cost || 0).toLocaleString('vi-VN')} VND</span>
                      </div>
                      <p className="mt-1 text-[8px] font-mono text-slate-400">Chu kỳ đo: {new Date(e.periodEnd).toLocaleDateString('vi-VN')}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab content 4: Predictive AI Maintenance */}
        {activeTab === 'predictive' && (
          <div className="space-y-6">
            <div className="border border-slate-200 bg-slate-50/40 rounded-3xl p-6 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <span>🤖</span> Phân tích & Dự báo bảo trì bằng Trí tuệ nhân tạo (Gemini AI)
                  </h2>
                  <p className="text-xs text-slate-400 mt-1 max-w-2xl">
                    Hệ thống tích hợp mô hình phân tích chuỗi thời gian kết hợp mô hình ngôn ngữ lớn Google Gemini để tự động phân tích dữ liệu nhiệt độ, độ rung trong 24 giờ qua, phát hiện mài mòn cơ khí sớm từ 3-5 ngày.
                  </p>
                </div>
                <div className="flex items-center gap-2 font-mono text-[9px] bg-white border border-slate-200 px-3 py-1.5 rounded-xl font-bold text-slate-655 self-start md:self-auto shrink-0 shadow-sm">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Model: gemini-2.5-flash</span>
                </div>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              {filteredInsights.length === 0 ? (
                <div className="col-span-2 py-20 text-center bg-slate-50 border border-dashed border-slate-200 rounded-3xl">
                  <p className="text-xs text-slate-400">Không tìm thấy dữ liệu phân tích dự báo cho thiết bị đã chọn.</p>
                </div>
              ) : (
                filteredInsights.map((item, idx) => {
                  const getRiskColor = (score: number) => {
                    if (score > 80) return 'text-rose-600 bg-rose-50 border-rose-100 progress-rose-500';
                    if (score > 50) return 'text-amber-600 bg-amber-50 border-amber-100 progress-amber-500';
                    return 'text-emerald-600 bg-emerald-50 border-emerald-100 progress-emerald-500';
                  };

                  const colorClass = getRiskColor(item.riskScore);
                  const isCritical = item.riskScore > 80;
                  const isWarning = item.riskScore > 50 && item.riskScore <= 80;

                  return (
                    <div key={idx} className="border border-slate-200 bg-white rounded-3xl p-6 shadow-sm hover:shadow-md transition duration-300 flex flex-col justify-between">
                      <div>
                        {/* Title Row */}
                        <div className="flex items-start justify-between gap-4 mb-4">
                          <div>
                            <span className="text-[10px] font-mono font-black text-slate-450 tracking-wider">#{item.machineCode}</span>
                            <h3 className="font-extrabold text-slate-900 text-xs mt-0.5">{item.machineName}</h3>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <button
                              disabled={analyzingMachineId === item.machineId}
                              onClick={() => handleReanalyzeMachine(item.machineId)}
                              className={`px-2.5 py-1 rounded-xl text-[10px] font-bold border transition flex items-center gap-1.5 ${
                                analyzingMachineId === item.machineId 
                                  ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                                  : 'bg-white border-indigo-200 text-indigo-650 hover:bg-indigo-50/50 shadow-sm'
                              }`}
                              title="Yêu cầu AI phân tích lại"
                            >
                              <svg 
                                className={`w-3 h-3 ${analyzingMachineId === item.machineId ? 'animate-spin' : ''}`}
                                fill="none" 
                                viewBox="0 0 24 24" 
                                strokeWidth="2.5" 
                                stroke="currentColor"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                              </svg>
                              <span>{analyzingMachineId === item.machineId ? 'Đang phân tích...' : 'Phân tích lại'}</span>
                            </button>
                            <span className={`px-2.5 py-1 rounded-xl text-[10px] font-bold border ${
                              item.hasAnomaly 
                                ? (isCritical ? 'bg-rose-50 text-rose-600 border-rose-100 animate-pulse' : 'bg-amber-50 text-amber-600 border-amber-100')
                                : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                            }`}>
                              {item.hasAnomaly ? (isCritical ? '⚠️ Nguy cơ cao' : '⚡ Cần theo dõi') : '✅ Hoạt động tốt'}
                            </span>
                          </div>
                        </div>

                        {/* Risk & Days to Failure */}
                        <div className="grid grid-cols-2 gap-4 mb-4">
                          <div className="bg-slate-50/50 border border-slate-100 rounded-2xl p-3">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Mức độ rủi ro hư hỏng</span>
                            <div className="flex items-baseline gap-1 mt-1">
                              <span className={`text-2xl font-black ${
                                item.riskScore > 80 ? 'text-rose-600' : item.riskScore > 50 ? 'text-amber-600' : 'text-emerald-600'
                              }`}>{item.riskScore}%</span>
                            </div>
                            {/* Simple Progress Bar */}
                            <div className="w-full bg-slate-200 h-1.5 rounded-full mt-2 overflow-hidden">
                              <div 
                                className={`h-full rounded-full transition-all duration-500 ${
                                  item.riskScore > 80 ? 'bg-rose-500' : item.riskScore > 50 ? 'bg-amber-500' : 'bg-emerald-500'
                                }`}
                                style={{ width: `${item.riskScore}%` }}
                              />
                            </div>
                          </div>

                          <div className="bg-slate-50/50 border border-slate-100 rounded-2xl p-3">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Dự đoán thời gian hỏng hóc</span>
                            <span className={`text-xs font-extrabold mt-1.5 block ${item.hasAnomaly ? 'text-slate-800' : 'text-slate-500'}`}>
                              {item.hasAnomaly 
                                ? `Khoảng ${item.daysToFailure} ngày tới (±1 ngày)` 
                                : 'Chưa phát hiện nguy cơ'}
                            </span>
                            <span className="text-[9px] text-slate-455 mt-1 block">Ngày đề xuất bảo trì: {new Date(item.recommendedMaintenanceDate).toLocaleDateString('vi-VN')}</span>
                          </div>
                        </div>

                        {/* LSTM Details Card */}
                        <div className="mb-4 bg-indigo-50/30 border border-indigo-100/50 rounded-2xl p-3.5 flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-[9px] font-black text-indigo-500 uppercase tracking-wider block">Mạng nơ-ron LSTM Time-series</span>
                              <span className="text-[10px] text-slate-550 font-bold mt-0.5 block">
                                Mức độ bất thường: <span className="text-indigo-650 font-black">{item.lstmAnomalyScore}%</span>
                              </span>
                            </div>
                            <span className="px-2 py-0.5 rounded-lg text-[8px] font-mono font-black uppercase bg-indigo-50 text-indigo-600 border border-indigo-100">
                              Mô hình TF.js
                            </span>
                          </div>
                          
                          {item.lstmForecastTemp && item.lstmForecastTemp.length > 0 && (
                            <div className="border-t border-indigo-100/30 pt-2 grid grid-cols-2 gap-2 text-[9px] text-slate-500 font-medium">
                              <div>
                                <span className="text-slate-400 block font-bold">Dự báo Nhiệt độ:</span>
                                <span className="font-mono text-indigo-650 font-bold">{item.lstmForecastTemp.map((t: number) => `${t}°C`).join(' → ')}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block font-bold">Dự báo Độ rung:</span>
                                <span className="font-mono text-indigo-650 font-bold">{item.lstmForecastVib.map((v: number) => `${v}mm/s`).join(' → ')}</span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Analysis Content */}
                        <div className="space-y-3 mb-5">
                          <div className="border border-slate-100 bg-slate-50/20 rounded-2xl p-3.5">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block mb-1">AI Phân tích xu hướng</span>
                            <p className="text-xs text-slate-600 leading-relaxed font-medium">{item.analysis}</p>
                          </div>

                          <div className="border border-slate-100 bg-slate-50/20 rounded-2xl p-3.5">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block mb-1">Khuyến nghị kỹ thuật</span>
                            <p className="text-xs text-indigo-650 leading-relaxed font-semibold">{item.recommendedAction}</p>
                          </div>
                        </div>

                        {/* Trend Chart (Recharts Dynamic LineChart) */}
                        <div className="mb-4">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block mb-2">Biểu đồ dự báo xu hướng (5 ngày kế tiếp)</span>
                          <div className="w-full bg-slate-50 border border-slate-150 rounded-2xl p-4">
                            {isMounted && item.lstmForecastTemp && item.lstmForecastTemp.length > 0 ? (
                              <div style={{ width: '100%', height: 160 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                  <LineChart 
                                    data={item.lstmForecastTemp.map((temp: number, index: number) => {
                                      const date = new Date();
                                      date.setDate(date.getDate() + index + 1);
                                      return {
                                        name: date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
                                        temperature: temp,
                                        vibration: item.lstmForecastVib[index] || 0
                                      };
                                    })}
                                    margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
                                  >
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis 
                                      dataKey="name" 
                                      tick={{ fontSize: 8, fill: '#64748b', fontWeight: 'bold' }}
                                      axisLine={false}
                                      tickLine={false}
                                    />
                                    <YAxis 
                                      yAxisId="left"
                                      domain={['auto', 'auto']}
                                      tick={{ fontSize: 8, fill: '#f43f5e', fontWeight: 'bold' }}
                                      axisLine={false}
                                      tickLine={false}
                                      unit="°C"
                                    />
                                    <YAxis 
                                      yAxisId="right"
                                      orientation="right"
                                      domain={['auto', 'auto']}
                                      tick={{ fontSize: 8, fill: '#3b82f6', fontWeight: 'bold' }}
                                      axisLine={false}
                                      tickLine={false}
                                      unit="mm"
                                    />
                                    <Tooltip 
                                      contentStyle={{ 
                                        backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                                        borderRadius: '16px', 
                                        border: '1px solid #e2e8f0',
                                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
                                        fontSize: '9px',
                                        fontWeight: 'bold'
                                      }}
                                    />
                                    <Legend 
                                      iconSize={8}
                                      wrapperStyle={{ fontSize: '8px', fontWeight: 'bold', paddingTop: '5px' }}
                                    />
                                    <Line 
                                      yAxisId="left"
                                      type="monotone" 
                                      dataKey="temperature" 
                                      name="Nhiệt độ (°C)"
                                      stroke="#f43f5e" 
                                      strokeWidth={2}
                                      activeDot={{ r: 5 }} 
                                      animationDuration={1200}
                                    />
                                    <Line 
                                      yAxisId="right"
                                      type="monotone" 
                                      dataKey="vibration" 
                                      name="Độ rung (mm/s)"
                                      stroke="#3b82f6" 
                                      strokeWidth={2}
                                      activeDot={{ r: 5 }}
                                      animationDuration={1200}
                                    />
                                  </LineChart>
                                </ResponsiveContainer>
                              </div>
                            ) : (
                              <div className="h-40 flex items-center justify-center">
                                <span className="text-[10px] text-slate-400 font-bold">Không có dữ liệu dự báo...</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Approval Section */}
                      <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-[10px] text-slate-400 font-bold">Trạng thái duyệt lịch:</span>
                        {item.pendingScheduleId ? (
                          <button
                            disabled={approvingScheduleId === item.pendingScheduleId}
                            onClick={() => handleApproveMaintenance(item.pendingScheduleId)}
                            className={`px-4 py-2 text-white rounded-xl font-mono text-[10px] uppercase font-bold tracking-[0.1em] transition flex items-center gap-1.5 shadow-sm ${
                              approvingScheduleId === item.pendingScheduleId
                                ? 'bg-slate-400 cursor-not-allowed'
                                : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100'
                            }`}
                          >
                            {approvingScheduleId === item.pendingScheduleId ? (
                              <>
                                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                <span>Đang duyệt...</span>
                              </>
                            ) : (
                              <>
                                <span>✓</span> Phê duyệt bảo trì
                              </>
                            )}
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-500 font-bold bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-xl">
                            {item.hasAnomaly ? 'Đã duyệt lịch bảo trì' : 'Không cần bảo trì'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Toast Notification */}
        {toast && (
          <div className="fixed top-6 right-6 z-50 animate-fade-in">
            <div className={`px-6 py-3.5 rounded-2xl shadow-lg border text-[11px] font-bold tracking-wide flex items-center gap-3 transition duration-300 ${
              toast.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : toast.type === 'warning'
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}>
              <span>🤖</span>
              <span>{toast.message}</span>
              <button onClick={() => setToast(null)} className="ml-3 hover:opacity-70 font-black text-xs">×</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
