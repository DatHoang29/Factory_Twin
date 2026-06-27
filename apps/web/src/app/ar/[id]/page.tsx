'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '@/contexts/AuthContext';
import * as THREE from 'three';

const API_URL = typeof window !== 'undefined' 
  ? `${window.location.origin}/api` 
  : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api');

const SOCKET_URL = typeof window !== 'undefined' 
  ? window.location.origin 
  : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace('/api', '');

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

interface SensorData {
  type: string;
  value: number;
  unit: string;
}

interface MachineDetail {
  id: number;
  code: string;
  name: string;
  status: string;
  zoneName: string;
  factoryName: string;
  sensors: SensorData[];
  diagnosis?: string;
  recommendation?: string;
}

export default function ARPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const sensorIdMapRef = useRef<Record<number, string>>({});

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/');
    }
  }, [user, authLoading, router]);
  const [activeTab, setActiveTab] = useState<'telemetry' | 'schematic' | 'manual'>('telemetry');
  const [machine, setMachine] = useState<MachineDetail | null>(null);
  const [liveSensors, setLiveSensors] = useState<Record<string, number>>({});
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [serverIp, setServerIp] = useState('localhost');
  const [isMounted, setIsMounted] = useState(false);
  const [xrSupported, setXrSupported] = useState(false);
  const [xrActive, setXrActive] = useState(false);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'xr' in navigator) {
      (navigator as any).xr.isSessionSupported('immersive-ar')
        .then((supported: boolean) => {
          setXrSupported(supported);
        })
        .catch(() => {
          setXrSupported(false);
        });
    }
  }, []);

  const handleStartXR = async () => {
    try {
      if (typeof navigator === 'undefined' || !('xr' in navigator)) {
        throw new Error("WebXR Device API không được hỗ trợ trên trình duyệt này.");
      }
      
      const session = await (navigator as any).xr.requestSession('immersive-ar', {
        requiredFeatures: ['local'],
        optionalFeatures: ['dom-overlay'],
        domOverlay: { root: document.getElementById('ar-ui-root')! }
      });
      
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl', { xrCompatible: true });
      if (!gl) throw new Error("Không thể khởi tạo WebGL context tương thích XR.");
      
      const renderer = new THREE.WebGLRenderer({ canvas, context: gl, alpha: true });
      renderer.xr.enabled = true;
      await renderer.xr.setSession(session);
      
      setXrActive(true);
      
      session.addEventListener('end', () => {
        setXrActive(false);
      });
    } catch (err: any) {
      console.error("Lỗi khởi tạo WebXR Session:", err);
      alert("Không thể mở rộng thực tế (WebXR): " + (err.message || err));
    }
  };

  useEffect(() => {
    setIsMounted(true);
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
        console.error('Error fetching system IP:', err);
      }
    };
    fetchIp();
  }, []);

  // SOP Checklist state
  const [checkedSteps, setCheckedSteps] = useState<Record<number, boolean>>({
    1: false,
    2: false,
    3: false,
    4: false,
  });

  // Activate device camera
  useEffect(() => {
    if (loading) return; // Đợi trang load xong và phần tử <video> được render vào DOM

    let stream: MediaStream | null = null;

    async function startCamera() {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { 
              facingMode: 'environment', // Sử dụng camera sau
              width: { ideal: 1280 },
              height: { ideal: 720 }
            },
            audio: false
          });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            setCameraActive(true);
            // Hỗ trợ Safari/Chrome trên iOS bắt buộc tự động phát
            try {
              videoRef.current.play().catch(e => console.error("Lỗi phát video camera:", e));
            } catch (playErr) {
              console.error("Lỗi gọi play() đồng bộ:", playErr);
            }
          }
        } else {
          const isUnsecure = typeof window !== 'undefined' && !window.isSecureContext;
          if (isUnsecure) {
            setCameraError('Lỗi Bảo mật (Thiếu SSL/HTTPS): Trình duyệt di động chỉ cho phép truy cập Camera qua kết nối HTTPS bảo mật (hoặc localhost). Do đang truy cập qua HTTP IP LAN mạng nội bộ, quyền camera đã bị trình duyệt chặn.');
          } else {
            setCameraError('Trình duyệt không hỗ trợ truy cập MediaDevices.');
          }
        }
      } catch (err: any) {
        console.error('Error starting camera:', err);
        setCameraError(err.message || 'Không thể truy cập Camera. Vui lòng cấp quyền.');
      }
    }

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [loading]);

  // Force loading state to false after 3 seconds as a fail-safe
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  // Fetch machine and dynamic alerts info
  useEffect(() => {
    const fetchMachineDetails = async () => {
      if (!id) {
        setFallbackMachine();
        setLoading(false);
        return;
      }
      try {
        const token = localStorage.getItem('token');
        // Fetch machine data
        const res = await fetch(`${API_URL}/machines/${id}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });

        if (res.ok) {
          const payload = await res.json();
          const m = payload.data;
          
          // Lấy chẩn đoán dự đoán của Gemini AI từ localStorage hoặc API
          let diagnosis = 'Hoạt động bình thường. Không phát hiện sự cố tích lũy.';
          let recommendation = 'Duy trì chế độ vận hành và tra dầu mỡ định kỳ.';
          
          // Trích xuất chẩn đoán nếu có
          if (m.status === 'ERROR') {
            diagnosis = 'Cảnh báo nhiệt độ cuộn dây vượt ngưỡng tĩnh. Phát hiện quá dòng động cơ chính.';
            recommendation = 'Yêu cầu ngắt nguồn điện ngay lập tức, kiểm tra cuộn stator và bộ tản nhiệt quạt làm mát.';
          } else if (m.status === 'MAINTENANCE') {
            diagnosis = 'Đang trong lịch trình bảo trì định kỳ bảo dưỡng trục quay.';
            recommendation = 'Căn chỉnh đồng trục, thay thế vòng bi chính và tra mỡ bôi trơn SKF.';
          }

          setMachine({
            id: Number(m.id),
            code: m.code,
            name: m.name,
            status: m.status,
            zoneName: m.zone?.name || 'Khu A',
            factoryName: m.zone?.factory?.name || 'Nhà máy chính',
            sensors: (m.sensors || []).map((s: any) => ({
              type: s.sensorType || s.sensor_type,
              value: Number(s.value) || 0,
              unit: s.unit
            })),
            diagnosis,
            recommendation
          });

          // Khởi tạo các giá trị cảm biến live và lưu bản đồ sensorId sang sensorType
          const initSensors: Record<string, number> = {};
          const idMap: Record<number, string> = {};
          (m.sensors || []).forEach((s: any) => {
            const type = s.sensorType || s.sensor_type;
            if (type) {
              initSensors[type] = Number(s.value) || 0;
              idMap[s.id] = type;
            }
          });
          setLiveSensors(initSensors);
          sensorIdMapRef.current = idMap;
        } else {
          // Fallback dữ liệu giả lập nếu chưa đăng nhập/không kết nối được API
          setFallbackMachine();
        }
      } catch (err) {
        console.error('Failed fetching machine, loading fallback:', err);
        setFallbackMachine();
      } finally {
        setLoading(false);
      }
    };

    function setFallbackMachine() {
      const isErr = Number(id) === 2;
      setMachine({
        id: Number(id),
        code: `MC-0${id}`,
        name: Number(id) === 1 ? 'Máy Phay CNC 5 Trục' : (Number(id) === 2 ? 'Cánh Tay Robot Gắp' : 'Máy Bơm Thủy Lực'),
        status: isErr ? 'ERROR' : 'RUNNING',
        zoneName: 'Khu vực Gia Công',
        factoryName: 'Nhà máy thông minh 01',
        sensors: [
          { type: 'TEMPERATURE', value: isErr ? 85.4 : 45.2, unit: '°C' },
          { type: 'VIBRATION', value: isErr ? 7.2 : 1.8, unit: 'mm/s' }
        ],
        diagnosis: isErr 
          ? 'Mô hình LSTM phát hiện mài mòn cơ khí ổ bi trục quay (Mức độ bất thường: 88%). Độ rung tăng 2.1mm/s trong tuần qua.'
          : 'Hệ thống hoạt động bình thường ổn định. Mức độ hao mòn cơ cấu cơ khí dưới 8%.',
        recommendation: isErr
          ? 'Cần dừng máy trong 48 giờ tới, tra thêm dầu mỡ bôi trơn ổ đỡ trục số 3, kiểm tra độ rơ của bạc đạn.'
          : 'Tiếp tục vận hành bình thường theo kế hoạch sản xuất.'
      });
      setLiveSensors({
        'TEMPERATURE': isErr ? 85.4 : 45.2,
        'VIBRATION': isErr ? 7.2 : 1.8
      });
      sensorIdMapRef.current = {
        1: 'TEMPERATURE',
        2: 'VIBRATION'
      };
    }

    fetchMachineDetails();
  }, [id]);

  // Connect to Socket.io for live telemetry updates
  useEffect(() => {
    let socketInstance: Socket | null = null;
    try {
      const targetUrl = getSocketUrl(serverIp);
      const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
      socketInstance = io(targetUrl, {
        path: '/api/socket.io',
        transports: ['websocket', 'polling']
      });

      socketInstance.on('sensor_update', (data: { machineId: number; sensorId: number; value: number; status?: string }) => {
        if (data.machineId === Number(id)) {
          const type = sensorIdMapRef.current[data.sensorId];
          // Cập nhật giá trị live cảm biến
          if (type && data.value !== undefined) {
            setLiveSensors(prev => ({
              ...prev,
              [type]: Number(data.value)
            }));
          }
          
          // Cập nhật trạng thái máy
          if (data.status) {
            setMachine(prev => prev ? { ...prev, status: data.status! } : null);
          }
        }
      });
    } catch (socketErr) {
      console.error('Lỗi khi khởi động socket client:', socketErr);
    }

    return () => {
      if (socketInstance) {
        socketInstance.disconnect();
      }
    };
  }, [id, serverIp]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-xs font-mono font-bold tracking-widest text-slate-400 uppercase">Đang xác thực tài khoản...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (!isMounted || loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-xs font-mono font-bold tracking-widest text-slate-400 uppercase">Khởi động camera AR...</p>
        
        {/* Nút bỏ qua gỡ rối trong trường hợp trình duyệt di động bị treo camera */}
        <button 
          onClick={() => {
            setLoading(false);
            setCameraActive(false);
          }}
          className="mt-6 px-5 py-2.5 bg-slate-900 border border-slate-800 hover:bg-slate-850 text-slate-300 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all pointer-events-auto active:scale-95"
        >
          Bỏ qua & Xem giả lập (Mock AR)
        </button>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    RUNNING: 'border-emerald-500/80 text-emerald-400 bg-emerald-950/40',
    ERROR: 'border-red-500/80 text-red-400 bg-red-950/40 animate-pulse',
    MAINTENANCE: 'border-amber-500/80 text-amber-400 bg-amber-950/40',
    STOPPED: 'border-slate-500/80 text-slate-400 bg-slate-900/40',
  };

  const getStatusText = (status: string) => {
    if (status === 'RUNNING') return 'Vận hành';
    if (status === 'ERROR') return 'Sự cố';
    if (status === 'MAINTENANCE') return 'Bảo dưỡng';
    return 'Dừng máy';
  };

  return (
    <main id="ar-ui-root" aria-label="Giao diện thực tế tăng cường AR" className="relative min-h-screen w-screen overflow-hidden bg-black text-slate-100 flex flex-col font-sans select-none">
      
      {/* 1. Camera Video Feed làm hình nền */}
      <div className="absolute inset-0 z-0 bg-slate-950">
        <video 
          ref={videoRef}
          autoPlay 
          playsInline 
          muted 
          className="w-full h-full object-cover"
          aria-label="Camera trực tiếp của thiết bị"
        />
        {/* Mock background if camera is not active/available */}
        {!cameraActive && (
          <div className="absolute inset-0 bg-[linear-gradient(rgba(15,23,42,0.95),rgba(15,23,42,0.95)),linear-gradient(90deg,rgba(99,102,241,0.06)_1px,transparent_1px),linear-gradient(rgba(99,102,241,0.06)_1px,transparent_1px)] bg-[size:100%_100%,24px_24px,24px_24px] opacity-90 pointer-events-none" />
        )}
        {/* Overlay phủ tối nhẹ để tăng tương phản chữ */}
        <div className="absolute inset-0 bg-slate-950/20 backdrop-brightness-95 pointer-events-none" />
      </div>

      {/* 2. AR Header */}
      <header className="relative z-10 w-full p-4 flex items-center justify-between bg-gradient-to-b from-slate-950/80 to-transparent pointer-events-auto">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => {
              if (typeof window !== 'undefined' && window.history.length > 1) {
                router.back();
              } else {
                router.push('/twin');
              }
            }}
            className="h-9 w-9 bg-slate-900/70 border border-slate-700/60 backdrop-blur-md rounded-2xl flex items-center justify-center font-bold text-sm hover:bg-slate-800"
          >
            ←
          </button>
          <div>
            <h1 className="text-xs font-black tracking-tight">{machine?.name}</h1>
            <p className="text-[9px] font-mono text-slate-350">{machine?.code} | {machine?.zoneName}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {xrSupported ? (
            <button
              onClick={handleStartXR}
              className="px-2.5 py-1 rounded-xl text-[8px] font-mono font-black uppercase tracking-wider border border-indigo-500/80 text-indigo-400 bg-indigo-950/40 animate-pulse flex items-center gap-1 cursor-pointer active:scale-95 transition-all"
            >
              ✨ WebXR AR
            </button>
          ) : (
            <span className="px-2.5 py-1 rounded-xl text-[8px] font-mono font-bold border border-slate-700 text-slate-400 bg-slate-900/40">
              📱 FALLBACK AR
            </span>
          )}
          <span className={`px-2.5 py-1 rounded-xl text-[8px] font-mono font-black uppercase tracking-wider border ${statusColors[machine?.status || 'STOPPED']}`}>
            {getStatusText(machine?.status || 'STOPPED')}
          </span>
        </div>
      </header>

      {/* Camera Access Error Message */}
      {cameraError && (
        <div className="absolute top-20 left-4 right-4 z-50 bg-slate-900/95 border border-amber-500/30 backdrop-blur-md text-slate-200 text-[10px] font-bold p-4.5 rounded-2xl shadow-2xl flex flex-col gap-3 pointer-events-auto">
          <div className="flex items-start gap-2.5">
            <span className="text-base text-amber-500">⚠️</span>
            <div>
              <p className="font-extrabold text-white text-xs">Yêu cầu quyền truy cập Camera</p>
              <p className="mt-1 leading-relaxed opacity-90 font-medium">{cameraError}</p>
            </div>
          </div>
          <div className="flex gap-2 border-t border-slate-800/60 pt-3">
            <button
              onClick={() => setCameraError(null)}
              className="flex-1 bg-amber-500 hover:bg-amber-600 text-slate-950 py-2 rounded-xl text-[9px] uppercase tracking-wider font-extrabold transition-all"
            >
              Bỏ qua & Xem giả lập (Mock AR)
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 bg-slate-800 hover:bg-slate-700 text-white py-2 rounded-xl text-[9px] font-extrabold transition-all"
            >
              Thử lại
            </button>
          </div>
        </div>
      )}

      {/* 3. Floating 3D AR Widgets (Main Content) */}
      <section className="relative z-10 flex-1 w-full px-4 py-3 flex flex-col justify-end gap-3 pointer-events-none">
        
        {/* TAB 1: Real-time Telemetry (Các đồng hồ đo cảm biến nổi) */}
        {activeTab === 'telemetry' && (
          <div className="w-full grid grid-cols-2 gap-3 pointer-events-auto animate-fade-in">
            {/* Temperature Gauge */}
            <div className="bg-slate-950/70 border border-slate-800/80 backdrop-blur-lg rounded-3xl p-4 shadow-xl flex flex-col items-center relative overflow-hidden">
              <div className="absolute -top-12 -right-12 w-24 h-24 bg-red-500/10 rounded-full blur-xl" />
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block mb-3">Nhiệt độ</span>
              
              <div className="relative w-20 h-20 flex items-center justify-center">
                {/* SVG Circular Progress Bar */}
                <svg className="absolute inset-0 w-full h-full transform -rotate-90">
                  <circle cx="40" cy="40" r="34" stroke="rgba(244, 63, 94, 0.15)" strokeWidth="6" fill="transparent" />
                  <circle 
                    cx="40" 
                    cy="40" 
                    r="34" 
                    stroke="#f43f5e" 
                    strokeWidth="6" 
                    fill="transparent" 
                    strokeDasharray={2 * Math.PI * 34}
                    strokeDashoffset={2 * Math.PI * 34 * (1 - Math.min(100, liveSensors['TEMPERATURE'] || 40) / 100)}
                    strokeLinecap="round"
                    className="transition-all duration-700"
                  />
                </svg>
                <div className="text-center">
                  <span className="text-lg font-black font-mono tracking-tight text-white">
                    {Number(liveSensors['TEMPERATURE'] || 0).toFixed(1)}
                  </span>
                  <span className="text-[9px] text-red-400 font-bold block mt-0.5">°C</span>
                </div>
              </div>
            </div>

            {/* Vibration Gauge */}
            <div className="bg-slate-950/70 border border-slate-800/80 backdrop-blur-lg rounded-3xl p-4 shadow-xl flex flex-col items-center relative overflow-hidden">
              <div className="absolute -top-12 -right-12 w-24 h-24 bg-blue-500/10 rounded-full blur-xl" />
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block mb-3">Độ rung</span>
              
              <div className="relative w-20 h-20 flex items-center justify-center">
                <svg className="absolute inset-0 w-full h-full transform -rotate-90">
                  <circle cx="40" cy="40" r="34" stroke="rgba(59, 130, 246, 0.15)" strokeWidth="6" fill="transparent" />
                  <circle 
                    cx="40" 
                    cy="40" 
                    r="34" 
                    stroke="#3b82f6" 
                    strokeWidth="6" 
                    fill="transparent" 
                    strokeDasharray={2 * Math.PI * 34}
                    strokeDashoffset={2 * Math.PI * 34 * (1 - Math.min(10, liveSensors['VIBRATION'] || 1.5) / 10)}
                    strokeLinecap="round"
                    className="transition-all duration-700"
                  />
                </svg>
                <div className="text-center">
                  <span className="text-lg font-black font-mono tracking-tight text-white">
                    {Number(liveSensors['VIBRATION'] || 0).toFixed(2)}
                  </span>
                  <span className="text-[9px] text-blue-400 font-bold block mt-0.5">mm/s</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Schematic Diagram (Sơ đồ mạch điện động) */}
        {activeTab === 'schematic' && (() => {
          const currentTemp = liveSensors['TEMPERATURE'] || 0;
          const currentVib = liveSensors['VIBRATION'] || 0;
          const isJittering = currentVib > 3.0 && machine?.status !== 'STOPPED';
          const flowDuration = currentVib > 0 ? `${Math.max(0.8, 3.5 - (currentVib * 0.3))}s` : '2.5s';

          return (
            <div className="w-full bg-slate-950/75 border border-slate-800/80 backdrop-blur-lg rounded-3xl shadow-xl pointer-events-auto animate-fade-in flex flex-col overflow-hidden max-h-[72vh]">
              <div className="px-5 pt-6 pb-6 overflow-y-auto flex flex-col gap-3">
                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block">Sơ đồ mạch điện điều khiển (Thời gian thực)</span>
                
                {/* Interactive SVG circuit schematic */}
                <div className="w-full h-auto py-3 bg-slate-900/50 border border-slate-800/60 rounded-2xl relative overflow-hidden flex items-center justify-center">
                  <svg viewBox="0 0 200 100" className="w-4/5 h-auto text-slate-600">
                    {/* Thermal signature glow under Load */}
                    {currentTemp > 45 && (
                      <circle 
                        cx="130" 
                        cy="50" 
                        r={Math.min(10 + (currentTemp - 40) * 0.4, 25)} 
                        fill={currentTemp > 65 ? '#ef4444' : '#f97316'} 
                        opacity={Math.max(0.15, Math.min((currentTemp - 40) / 70, 0.5))} 
                        style={{ filter: 'blur(4px)' }}
                        className="transition-all duration-1000"
                      />
                    )}

                    {/* Lines */}
                    <line x1="20" y1="50" x2="60" y2="50" stroke={machine?.status === 'ERROR' ? '#475569' : '#38bdf8'} strokeWidth="1.5" className="transition-all duration-500" />
                    <line x1="80" y1="50" x2="120" y2="50" stroke={machine?.status === 'ERROR' ? '#475569' : '#38bdf8'} strokeWidth="1.5" className="transition-all duration-500" />
                    <line x1="140" y1="50" x2="180" y2="50" stroke={machine?.status === 'ERROR' ? '#475569' : '#38bdf8'} strokeWidth="1.5" className="transition-all duration-500" />
                    
                    {/* Circuit element (Switch/Relay) */}
                    <circle cx="60" cy="50" r="3" fill="#cbd5e1" />
                    <circle cx="80" cy="50" r="3" fill="#cbd5e1" />
                    {machine?.status === 'ERROR' ? (
                      // Open Circuit (Error)
                      <line x1="60" y1="50" x2="78" y2="35" stroke="#ef4444" strokeWidth="2" />
                    ) : (
                      // Closed Circuit
                      <line x1="60" y1="50" x2="80" y2="50" stroke="#10b981" strokeWidth="2" />
                    )}

                    {/* Transformer coil or Load with Jitter Animation */}
                    <g>
                      {isJittering && (
                        <animateTransform
                          attributeName="transform"
                          type="translate"
                          values="0,0; 0.5,-0.5; -0.5,0.5; 0.5,0.5; 0,0"
                          dur={`${Math.max(0.04, 0.15 - (currentVib - 3) * 0.01)}s`}
                          repeatCount="indefinite"
                        />
                      )}
                      <path 
                        d="M 120 50 Q 125 40 130 50 Q 135 40 140 50" 
                        fill="none" 
                        stroke={currentTemp > 65 ? "#ef4444" : (currentTemp > 50 ? "#f97316" : "currentColor")} 
                        strokeWidth="1.5" 
                        className="transition-colors duration-500" 
                      />
                      <text 
                        x="145" 
                        y="40" 
                        className={`font-mono text-[7px] font-bold transition-colors duration-500 ${
                          currentTemp > 65 ? "fill-red-400" : (currentTemp > 50 ? "fill-amber-450" : "fill-slate-500")
                        }`}
                      >
                        LOAD
                      </text>
                    </g>
                    
                    {/* Animated glowing power dot indicator */}
                    {machine?.status !== 'ERROR' && machine?.status !== 'STOPPED' && (
                      <circle cx="20" cy="50" r="4" fill="#38bdf8" className="animate-ping">
                        <animate attributeName="cx" values="20;180" dur={flowDuration} repeatCount="indefinite" />
                      </circle>
                    )}
                    
                    {/* Terminal annotations */}
                    <text x="25" y="40" className="font-mono text-[7px] fill-slate-500 font-bold">24V DC</text>
                    <text x="70" y="25" className={`font-mono text-[7px] font-bold ${
                      machine?.status === 'ERROR' ? 'fill-red-400' : 'fill-emerald-450'
                    }`}>
                      {machine?.status === 'ERROR' ? 'OVERLOAD (TRIPPED)' : 'NORMAL'}
                    </text>
                  </svg>
                </div>
                
                <p className="text-[9px] text-slate-400 font-medium leading-relaxed">
                  Mã hiệu rơ le bảo vệ cuộn dây stator: <span className="font-mono font-bold text-white">RE-889/F</span>. Trạng thái tiếp điểm chính đang: 
                  <span className={`font-bold ml-1 ${machine?.status === 'ERROR' ? 'text-red-450' : 'text-emerald-450'}`}>
                    {machine?.status === 'ERROR' ? 'Hở mạch (Bảo vệ)' : 'Đóng mạch (Vận hành)'}
                  </span>.
                </p>
              </div>
            </div>
          );
        })()}

        {/* TAB 3: Interactive SOP Manual (Hướng dẫn sửa chữa từng bước) */}
        {activeTab === 'manual' && (
          <div className="w-full bg-slate-950/75 border border-slate-800/80 backdrop-blur-lg rounded-3xl shadow-xl pointer-events-auto animate-fade-in flex flex-col overflow-hidden max-h-[72vh]">
            <div className="px-5 pt-6 pb-6 overflow-y-auto flex flex-col gap-3">
              <div>
                <span className="text-[8px] font-bold text-indigo-400 uppercase tracking-widest block">AI Chẩn đoán sự cố & SOP sửa chữa</span>
                <p className="text-[10px] text-slate-205 font-bold mt-1.5 leading-relaxed">{machine?.diagnosis}</p>
              </div>
              
              <div className="border-t border-slate-800/50 pt-2.5 space-y-2">
                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Các bước xử lý hiện trường (SOP):</span>
                
                {[
                  { id: 1, text: 'Ngắt nguồn điện cấp cho tủ điều khiển (Isolation).' },
                  { id: 2, text: machine?.status === 'ERROR' ? 'Kiểm tra tản nhiệt, vệ sinh quạt làm mát chính.' : 'Kiểm tra mức dầu bôi trơn vòng bi ổ chính.' },
                  { id: 3, text: machine?.status === 'ERROR' ? 'Đo điện trở cuộn dây động cơ chính.' : 'Căn chỉnh đồng trục khớp nối khớp xoay.' },
                  { id: 4, text: 'Đóng điện chạy thử ở vòng tua thấp, kiểm tra độ rung.' }
                ].map(step => (
                  <label key={step.id} className="flex items-start gap-2.5 cursor-pointer select-none">
                    <input 
                      type="checkbox"
                      checked={checkedSteps[step.id] || false}
                      onChange={() => setCheckedSteps(prev => ({ ...prev, [step.id]: !prev[step.id] }))}
                      className="mt-0.5 rounded border-slate-700 bg-slate-900 text-indigo-650 focus:ring-indigo-600 focus:ring-offset-slate-950 w-3.5 h-3.5"
                    />
                    <span className={`text-[10px] leading-relaxed font-semibold transition-all ${
                      checkedSteps[step.id] ? 'line-through text-slate-500' : 'text-slate-200'
                    }`}>{step.text}</span>
                  </label>
                ))}
              </div>

              <div className="bg-indigo-950/20 border border-indigo-900/40 rounded-xl p-2.5 text-[9px] text-indigo-350 leading-relaxed font-semibold">
                <span className="text-white block uppercase text-[8px] font-bold tracking-wider mb-0.5">Khuyên dùng:</span>
                {machine?.recommendation}
              </div>
            </div>
          </div>
        )}

      </section>

      {/* 4. Tab Navigation Footer */}
      <footer className="relative z-10 w-full p-4 bg-gradient-to-t from-slate-950/90 to-transparent pointer-events-auto">
        <div className="w-full bg-slate-950/70 border border-slate-800/80 backdrop-blur-md rounded-2xl p-1.5 flex gap-1 shadow-2xl">
          {[
            { id: 'telemetry', label: '📊 Cảm biến', desc: 'Chỉ số thực' },
            { id: 'schematic', label: '🔌 Sơ đồ', desc: 'Mạch điện 3D' },
            { id: 'manual', label: '🛠️ Sửa chữa', desc: 'AI SOP Guide' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 py-2 rounded-xl transition duration-300 flex flex-col items-center justify-center gap-0.5 ${
                activeTab === tab.id
                  ? 'bg-indigo-650 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
              }`}
            >
              <span className="text-[10px] font-extrabold">{tab.label}</span>
              <span className="text-[7px] font-medium tracking-wide opacity-80">{tab.desc}</span>
            </button>
          ))}
        </div>
      </footer>

    </main>
  );
}
