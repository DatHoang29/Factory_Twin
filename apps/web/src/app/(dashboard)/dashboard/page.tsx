'use client';

import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';

interface Sensor {
  id: number;
  sensor_type?: string;
  sensorType?: string;
  value: number | null;
  unit: string;
}

interface Machine {
  id: number;
  code: string;
  name: string;
  status: string;
  zone?: { name: string };
  sensors: Sensor[];
}

interface Alert {
  id: number;
  severity: string;
  message: string;
  status: string;
  machine?: { name: string; code: string };
  createdAt: string;
  created_at?: string;
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

const toneClass: Record<string, string> = {
  RUNNING: 'bg-emerald-50 text-emerald-800 border-emerald-250',
  ERROR: 'bg-red-50 text-red-800 border-red-200 animate-pulse',
  MAINTENANCE: 'bg-amber-50 text-amber-800 border-amber-200',
  STOPPED: 'bg-slate-50 text-slate-800 border-slate-200',
};

const getSensorVal = (sensors: Sensor[], type: string): { val: string; unit: string } => {
  const s = sensors.find(x => {
    const sType = x.sensorType || x.sensor_type;
    return sType?.toUpperCase() === type.toUpperCase();
  });
  if (!s || s.value == null) return { val: '--', unit: '' };
  return { val: s.value.toLocaleString(), unit: s.unit };
};

const roleMatrix = [
  ['Admin', 'Nhà máy, phân xưởng, tài sản 3D/360°, cấu hình thiết bị'],
  ['Kỹ thuật viên', 'Lập lịch bảo trì, xử lý ticket sự cố, xem thông số lịch sử'],
  ['Operator', 'Gửi telemetry IoT, quản lý trạng thái máy, xác nhận cảnh báo'],
  ['Viewer', 'Chỉ xem digital twin 3D, ảnh 360° và báo cáo số liệu'],
];

export default function DashboardPage() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
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
        console.error('Error fetching system IP in dashboard:', err);
      }
    };
    fetchIp();
  }, []);

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

    const fetchData = async () => {
      try {
        const token = localStorage.getItem('token');
        const zoneId = localStorage.getItem('selectedZoneId');
        const factoryId = localStorage.getItem('selectedFactoryId');

        const machineQuery = zoneId 
          ? `${API_URL}/machines?includeSensors=true&zoneId=${zoneId}` 
          : (factoryId ? `${API_URL}/machines?includeSensors=true&factoryId=${factoryId}` : `${API_URL}/machines?includeSensors=true`);
        
        const alertQuery = zoneId
          ? `${API_URL}/alerts?zoneId=${zoneId}`
          : (factoryId ? `${API_URL}/alerts?factoryId=${factoryId}` : `${API_URL}/alerts`);

        const [machinesRes, alertsRes] = await Promise.all([
          fetch(machineQuery, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(alertQuery, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (machinesRes.ok) {
          const mData = await machinesRes.json();
          setMachines(mData.data || []);
        }

        if (alertsRes.ok) {
          const aData = await alertsRes.json();
          setAlerts((aData.data || []).slice(0, 5));
        }
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    const handleFactoryChange = () => {
      setRefreshTrigger(prev => prev + 1);
    };
    window.addEventListener('factory-changed', handleFactoryChange);

    // Socket listeners for real-time telemetry updates
    socket.on('sensor_update', (data: { machineId: number; sensorId: number; value: number; status?: string }) => {
      setMachines(prev =>
        prev.map(machine => {
          if (machine.id !== data.machineId) return machine;
          return {
            ...machine,
            status: data.status || machine.status,
            sensors: machine.sensors.map(sensor =>
              sensor.id === data.sensorId ? { ...sensor, value: data.value } : sensor
            ),
          };
        })
      );
    });

    socket.on('new_alert', (alert: Alert) => {
      setAlerts(prev => [alert, ...prev].slice(0, 5));
    });

    socket.on('machine_status_change', (data: { machineId: number; status: string }) => {
      setMachines(prev =>
        prev.map(machine => (machine.id === data.machineId ? { ...machine, status: data.status } : machine))
      );
    });

    return () => {
      socket?.disconnect();
      socket = null;
      window.removeEventListener('factory-changed', handleFactoryChange);
    };
  }, [refreshTrigger, serverIp]);

  if (loading) {
    return <div className="p-8 text-center text-sm font-medium text-slate-500">Đang tải số liệu điều hành...</div>;
  }

  const runningCount = machines.filter(m => m.status === 'RUNNING').length;
  const errorCount = machines.filter(m => m.status === 'ERROR').length;
  const maintenanceCount = machines.filter(m => m.status === 'MAINTENANCE').length;
  const oeeRate = machines.length > 0 ? Math.round((runningCount / machines.length) * 100) : 0;

  const filteredMachines = filterStatus
    ? machines.filter(m => m.status === filterStatus)
    : machines;

  return (
    <div className="min-h-full bg-white rounded-3xl border border-slate-200/60 shadow-sm overflow-hidden text-slate-800">
      {/* Banner */}
      <section className="relative overflow-hidden border-b border-slate-200/80 bg-white px-6 py-8 lg:px-10">
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.35em] text-indigo-650">Factory Command Center</p>
            <h1 className="mt-2 max-w-5xl text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">Bảng Điều Hành Hoạt Động</h1>
            <p className="mt-2.5 max-w-3xl text-sm leading-relaxed text-slate-500">Giám sát tổng quan thiết bị, số đo cảm biến IoT thời gian thực, quản lý các cảnh báo và phân quyền hệ thống.</p>
          </div>
          <div className="rounded-2xl border border-indigo-150 bg-indigo-50/50 px-6 py-4 shadow-sm self-start xl:self-auto">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-700">Tỷ lệ máy online (OEE)</p>
            <p className="text-3xl font-black text-indigo-600 mt-1">{oeeRate}%</p>
          </div>
        </div>
      </section>

      {/* KPI Cards */}
      <section className="grid gap-4 px-6 py-6 sm:grid-cols-2 lg:grid-cols-4 lg:px-10">
        <button 
          onClick={() => setFilterStatus(filterStatus === 'RUNNING' ? null : 'RUNNING')}
          className={`text-left border rounded-2xl p-5 shadow-sm transition-all duration-200 cursor-pointer ${
            filterStatus === 'RUNNING' 
              ? 'border-indigo-500 bg-indigo-50/30 ring-2 ring-indigo-500/20' 
              : 'border-slate-200 bg-white hover:border-slate-350 hover:shadow-md'
          }`}
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Thiết bị hoạt động</p>
          <p className="mt-2 text-2xl font-black text-slate-900 tracking-tight">{runningCount} / {machines.length}</p>
          <p className="mt-1 text-xs text-slate-500">Máy đang chạy bình thường</p>
        </button>

        <button 
          onClick={() => setFilterStatus(filterStatus === 'ERROR' ? null : 'ERROR')}
          className={`text-left border rounded-2xl p-5 shadow-sm transition-all duration-200 cursor-pointer ${
            filterStatus === 'ERROR' 
              ? 'border-red-500 bg-red-50/50 ring-2 ring-red-500/20' 
              : 'border-red-200 bg-red-50/20 hover:border-red-300 hover:shadow-md'
          }`}
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-500">Sự cố khẩn cấp</p>
          <p className="mt-2 text-2xl font-black text-red-650 tracking-tight">{errorCount}</p>
          <p className="mt-1 text-xs text-slate-500">Thiết bị cần kiểm tra sửa chữa</p>
        </button>

        <button 
          onClick={() => setFilterStatus(filterStatus === 'MAINTENANCE' ? null : 'MAINTENANCE')}
          className={`text-left border rounded-2xl p-5 shadow-sm transition-all duration-200 cursor-pointer ${
            filterStatus === 'MAINTENANCE' 
              ? 'border-amber-500 bg-amber-50/50 ring-2 ring-amber-500/20' 
              : 'border-amber-200 bg-amber-50/20 hover:border-amber-300 hover:shadow-md'
          }`}
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-600">Máy đang bảo trì</p>
          <p className="mt-2 text-2xl font-black text-amber-700 tracking-tight">{maintenanceCount}</p>
          <p className="mt-1 text-xs text-slate-500">Thuộc lịch bảo dưỡng định kỳ</p>
        </button>

        <button 
          onClick={() => setFilterStatus(null)}
          className="text-left border border-slate-200 rounded-2xl p-5 shadow-sm bg-white hover:border-slate-350 hover:shadow-md transition-all duration-200 cursor-pointer"
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Tổng số cảnh báo</p>
          <p className="mt-2 text-2xl font-black text-slate-900 tracking-tight">{alerts.length}</p>
          <p className="mt-1 text-xs text-slate-500">Nhấp để hiển thị toàn bộ máy</p>
        </button>
      </section>

      {/* Main Grid */}
      <section className="grid gap-6 px-6 pb-8 lg:grid-cols-[1.35fr_.65fr] lg:px-10">
        
        {/* Layout & Machine list */}
        <div className="border border-slate-200 bg-white p-6 rounded-3xl shadow-sm min-w-0">
          <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 uppercase tracking-tight">Sơ đồ máy móc phân xưởng</h2>
              <p className="text-xs text-slate-400 mt-1">Giám sát vị trí tương đối và các chỉ số đo cảm biến chính.</p>
            </div>
            <div className="flex items-center gap-2">
              {filterStatus && (
                <button 
                  onClick={() => setFilterStatus(null)}
                  className="border border-rose-200 bg-rose-50 hover:bg-rose-100 px-3 py-1 rounded-xl text-[9px] font-bold uppercase tracking-[0.1em] text-rose-700 transition"
                >
                  Đang lọc: {filterStatus === 'RUNNING' ? 'Hoạt động' : filterStatus === 'ERROR' ? 'Sự cố' : 'Bảo trì'} ✕
                </button>
              )}
              <span className="border border-emerald-250 bg-emerald-50 px-3 py-1 rounded-xl text-[9px] font-bold uppercase tracking-[0.15em] text-emerald-700">Live Telemetry</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filteredMachines.length === 0 ? (
              <p className="text-sm text-slate-400 py-8 text-center col-span-2">Không tìm thấy máy móc nào thỏa mãn bộ lọc này.</p>
            ) : (
              filteredMachines.map((m) => {
                const temp = getSensorVal(m.sensors, 'TEMPERATURE');
                const vib = getSensorVal(m.sensors, 'VIBRATION');
                const speed = getSensorVal(m.sensors, 'SPEED');
                return (
                  <div key={m.code} className="border border-slate-200 bg-slate-50/50 p-4 shadow-sm rounded-2xl hover:shadow-md transition duration-300">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold text-slate-950">{m.code}</span>
                      <span className={`px-2.5 py-0.5 text-[9px] font-bold rounded-full border ${toneClass[m.status]}`}>{m.status}</span>
                    </div>
                    <h3 className="mt-2 font-extrabold text-slate-900 text-sm">{m.name}</h3>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-[10px] text-slate-500 font-bold font-mono">
                      <div className="bg-white border rounded-xl p-1.5 text-center">
                        <p className="text-[8px] text-slate-400">Nhiệt độ</p>
                        <p className="mt-0.5 text-slate-800">{temp.val} {temp.unit}</p>
                      </div>
                      <div className="bg-white border rounded-xl p-1.5 text-center">
                        <p className="text-[8px] text-slate-400">Độ rung</p>
                        <p className="mt-0.5 text-slate-800">{vib.val} {vib.unit}</p>
                      </div>
                      <div className="bg-white border rounded-xl p-1.5 text-center">
                        <p className="text-[8px] text-slate-400">Tốc độ</p>
                        <p className="mt-0.5 text-slate-800">{speed.val} {speed.unit}</p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Sidebar Alerts */}
        <aside className="space-y-6">
          <div className="border border-red-150 bg-white p-6 rounded-3xl shadow-sm">
            <h2 className="text-base font-extrabold text-slate-900 uppercase tracking-tight">Cảnh Báo Sự Cố Mới Nhất</h2>
            <div className="mt-4 space-y-3">
              {alerts.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">Phân xưởng hoạt động an toàn, không có cảnh báo.</p>
              ) : (
                alerts.map((alert) => (
                  <div key={alert.id} className="border border-slate-100 bg-slate-50/50 p-3 rounded-2xl hover:bg-slate-50 transition">
                    <div className="flex items-start gap-2.5">
                      <span className="text-base mt-0.5">⚠️</span>
                      <div className="min-w-0 flex-1">
                        <p className={`text-[8px] font-bold uppercase tracking-[0.15em] ${alert.severity === 'CRITICAL' ? 'text-red-650' : 'text-amber-600'}`}>{alert.severity}</p>
                        <p className="text-xs text-slate-700 mt-1 leading-normal">{alert.message}</p>
                        <p className="mt-2 text-[8px] font-mono text-slate-400">
                          {(() => {
                            const val = alert.createdAt || alert.created_at;
                            return val ? new Date(val).toLocaleTimeString('vi-VN') : '';
                          })()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="border border-slate-200 bg-white p-6 rounded-3xl shadow-sm">
            <h2 className="text-base font-extrabold text-slate-900 uppercase tracking-tight">Phân Quyền Hệ Thống (RBAC)</h2>
            <div className="mt-4 space-y-2">
              {roleMatrix.map(([role, scope]) => (
                <div key={role} className="grid grid-cols-[100px_1fr] gap-3 border border-slate-100 p-3 rounded-2xl text-[11px] hover:bg-slate-50 transition">
                  <span className="font-extrabold text-slate-800">{role}</span>
                  <span className="text-slate-500 leading-normal">{scope}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </section>

      {/* Detail Table */}
      <section className="px-6 pb-10 lg:px-10">
        <div className="overflow-x-auto border border-slate-200 bg-white rounded-3xl shadow-sm">
          <table className="w-full min-w-[900px] border-collapse text-xs">
            <thead className="bg-slate-50/80 text-left uppercase tracking-[0.15em] text-slate-400 font-bold border-b border-slate-200">
              <tr>
                <th className="p-4 text-xs font-bold text-slate-400">Thiết bị</th>
                <th className="p-4 text-xs font-bold text-slate-400">Trạng thái</th>
                <th className="p-4 text-center text-xs font-bold text-slate-400">Nhiệt độ</th>
                <th className="p-4 text-center text-xs font-bold text-slate-400">Độ rung</th>
                <th className="p-4 text-center text-xs font-bold text-slate-400">Tốc độ máy</th>
                <th className="p-4 text-center text-xs font-bold text-slate-400">Công suất (kW)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60 font-medium">
              {machines.map((m) => {
                const temp = getSensorVal(m.sensors, 'TEMPERATURE');
                const vib = getSensorVal(m.sensors, 'VIBRATION');
                const speed = getSensorVal(m.sensors, 'SPEED');
                const power = getSensorVal(m.sensors, 'POWER');
                return (
                  <tr key={m.code} className="hover:bg-slate-50/40 transition">
                    <td className="p-4 font-extrabold text-slate-900">{m.code} · {m.name}</td>
                    <td className="p-4"><span className={`px-2.5 py-1 rounded-full border text-[9px] font-bold ${toneClass[m.status]}`}>{m.status}</span></td>
                    <td className="p-4 text-center text-slate-700 font-mono">{temp.val} {temp.unit}</td>
                    <td className="p-4 text-center text-slate-700 font-mono">{vib.val} {vib.unit}</td>
                    <td className="p-4 text-center text-slate-700 font-mono">{speed.val} {speed.unit}</td>
                    <td className="p-4 text-center text-slate-700 font-mono">{power.val} {power.unit}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
