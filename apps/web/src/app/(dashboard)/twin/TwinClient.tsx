'use client';

import { useEffect, useState, useRef, useCallback, useMemo, Suspense, Component, ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Text, Html, useGLTF, useTexture, Detailed } from '@react-three/drei';
import { io, Socket } from 'socket.io-client';
import * as THREE from 'three';
import { KTX2Loader } from 'three-stdlib';

interface Machine {
  id: number;
  code: string;
  name: string;
  status: string;
  position_x?: number;
  position_y?: number;
  position_z?: number;
  positionX?: number;
  positionY?: number;
  positionZ?: number;
  rotation_y?: number;
  rotationY?: number;
  sensors: Sensor[];
}

interface Sensor {
  id: number;
  sensor_type?: string;
  sensorType?: string;
  value: number | null;
  unit: string;
  maxThreshold?: number | null;
  minThreshold?: number | null;
}

interface Alert {
  id: number;
  severity: string;
  message: string;
  status: string;
  machine?: { name: string; code: string };
  created_at?: string;
  createdAt?: string;
}

const resolveAssetUrl = (url: string) => {
  if (!url) return '';
  if (typeof window !== 'undefined') {
    return url.replace(/^https?:\/\/[^\/]+(?::\d+)?\/uploads/, `${window.location.origin}/uploads`);
  }
  return url;
};

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

type MachineStatus = 'RUNNING' | 'STOPPED' | 'MAINTENANCE' | 'ERROR';
type AlertSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

interface TwinModel {
  id: string;
  modelType: 'THREE_D_MODEL' | 'PHOTO_360';
  fileUrl: string;
  format: string;
  version: number;
  uploadedBy: string;
  uploadedAt: string;
}

function PanoramaSphere({ url }: { url: string }) {
  const texture = useTexture(resolveAssetUrl(url));
  return (
    <mesh>
      <sphereGeometry args={[500, 60, 40]} />
      <meshBasicMaterial map={texture} side={THREE.BackSide} />
    </mesh>
  );
}

function ProceduralPanoramaSphere({ url }: { url: string | null }) {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);

  useEffect(() => {
    const cvs = document.createElement('canvas');
    cvs.width = 512;
    cvs.height = 256;
    const ctx = cvs.getContext('2d');
    if (ctx) {
      const grad = ctx.createLinearGradient(0, 0, 0, 256);
      
      // Dùng màu khác nhau cho từng góc chụp thử nghiệm để dễ phân biệt
      if (url && url.includes('mock_360_2')) {
        grad.addColorStop(0, '#064e3b'); // Dark Emerald
        grad.addColorStop(0.5, '#065f46');
        grad.addColorStop(1, '#064e3b');
      } else {
        grad.addColorStop(0, '#1e1b4b'); // Dark Indigo
        grad.addColorStop(0.5, '#312e81');
        grad.addColorStop(1, '#1e1b4b');
      }
      
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 256);

      ctx.strokeStyle = '#ffffff10';
      ctx.lineWidth = 1;
      for (let i = 0; i < 512; i += 32) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 256);
        ctx.stroke();
      }
      for (let j = 0; j < 256; j += 32) {
        ctx.beginPath();
        ctx.moveTo(0, j);
        ctx.lineTo(512, j);
        ctx.stroke();
      }
      
      ctx.fillStyle = '#ffffff';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      
      const title = url && url.includes('mock_360_2') 
        ? 'Góc nhìn 360° - Vị trí 2 (Đóng gói B)' 
        : (url && url.includes('mock_360_1') ? 'Góc nhìn 360° - Vị trí 1 (Lắp ráp A)' : 'Chế độ xem 360° Mẫu - Chưa tải lên ảnh');
        
      ctx.fillText(title, 256, 128);
      ctx.font = '10px sans-serif';
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText(url ? 'Click nút mũi tên ở hai bên để di chuyển qua lại các góc chụp' : 'Vui lòng upload ảnh Panorama 360° ở phần Thiết lập', 256, 150);
    }
    const tex = new THREE.CanvasTexture(cvs);
    setTexture(tex);
  }, [url]);

  if (!texture) return null;

  return (
    <mesh>
      <sphereGeometry args={[500, 60, 40]} />
      <meshBasicMaterial map={texture} side={THREE.BackSide} />
    </mesh>
  );
}

function PanoramaViewer({ 
  url, 
  machines,
  zoneAssets,
  onChangePanorama
}: { 
  url: string | null; 
  machines: Machine[];
  zoneAssets: TwinModel[];
  onChangePanorama: (url: string) => void;
}) {
  return (
    <>
      {/* Đưa camera vào đúng tâm khối cầu [0, 0, 0.1] để nhìn toàn cảnh xung quanh */}
      <PerspectiveCamera makeDefault position={[0, 0, 0.1]} fov={75} />
      <OrbitControls 
        enablePan={false}
        enableZoom={true}
        enableRotate={true}
        rotateSpeed={-0.5}
      />
      {url ? (
        <Suspense fallback={<ProceduralPanoramaSphere url={url} />}>
          {url.includes('mock_360') ? (
            <ProceduralPanoramaSphere url={url} />
          ) : (
            <PanoramaSphere url={url} />
          )}
        </Suspense>
      ) : (
        <ProceduralPanoramaSphere url={null} />
      )}
      
      {machines.map((m, index) => {
        const angle = (index / Math.max(1, machines.length)) * Math.PI * 2;
        const x = Math.cos(angle) * 12;
        const z = Math.sin(angle) * 12;
        const y = -1.2;
        
        return (
          <group key={m.id} position={[x, y, z]}>
            <Html center style={{ pointerEvents: 'none' }}>
              <div className="bg-white/95 border border-slate-200 px-3 py-2 rounded-xl text-[10px] font-bold text-slate-800 shadow-lg backdrop-blur-md flex flex-col gap-1 items-start min-w-[100px]">
                <span className="text-slate-900 border-b pb-1 w-full block">📍 {m.name}</span>
                {m.sensors.slice(0, 2).map(s => {
                  const sType = s.sensorType || s.sensor_type || '';
                  return (
                    <span key={s.id} className="text-slate-500 font-mono block">
                      {sType}: {formatSensorValue(s.value, sType)} {s.unit}
                    </span>
                  );
                })}
              </div>
            </Html>
          </group>
        );
      })}

      {zoneAssets
        .filter(x => x.modelType === 'PHOTO_360' && x.fileUrl !== url)
        .map((img, index) => {
          const angle = ((index + 0.5) / Math.max(1, zoneAssets.length)) * Math.PI * 2;
          const x = Math.cos(angle) * 8;
          const z = Math.sin(angle) * 8;
          const y = -1.8;

          return (
            <group key={img.id} position={[x, y, z]}>
              <Html center>
                <button
                  onClick={() => onChangePanorama(img.fileUrl)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full w-9 h-9 flex items-center justify-center font-bold shadow-lg shadow-indigo-200 border-2 border-white transition-all transform hover:scale-105"
                  title="Di chuyển đến góc chụp này"
                >
                  ➔
                </button>
              </Html>
            </group>
          );
        })}
    </>
  );
}

let socket: Socket | null = null;

const API_URL = typeof window !== 'undefined' 
  ? `${window.location.origin}/api` 
  : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api');

const SOCKET_URL = typeof window !== 'undefined' 
  ? window.location.origin 
  : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace('/api', '');

const demoMachines: Machine[] = [
  {
    id: 1,
    code: 'CNC-01',
    name: 'CNC Milling Alpha',
    status: 'RUNNING',
    position_x: -10,
    position_y: 0,
    position_z: 0,
    rotation_y: 0,
    sensors: [
      { id: 101, sensor_type: 'Temperature', value: 68, unit: '°C' },
      { id: 102, sensor_type: 'Vibration', value: 2.1, unit: 'mm/s' },
      { id: 103, sensor_type: 'Speed', value: 1450, unit: 'rpm' },
    ],
  },
  {
    id: 2,
    code: 'PRS-02',
    name: 'Hydraulic Press Beta',
    status: 'ERROR',
    position_x: -5,
    position_y: 0,
    position_z: 0,
    rotation_y: 0,
    sensors: [
      { id: 201, sensor_type: 'Temperature', value: 91, unit: '°C' },
      { id: 202, sensor_type: 'Vibration', value: 8.6, unit: 'mm/s' },
      { id: 203, sensor_type: 'Pressure', value: 230, unit: 'bar' },
    ],
  },
  {
    id: 3,
    code: 'CNV-07',
    name: 'Conveyor Sorting Gate',
    status: 'RUNNING',
    position_x: 0,
    position_y: 0,
    position_z: 0,
    rotation_y: 0,
    sensors: [
      { id: 301, sensor_type: 'Speed', value: 2.8, unit: 'm/s' },
      { id: 302, sensor_type: 'Load', value: 61, unit: '%' },
    ],
  },
  {
    id: 4,
    code: 'ROB-04',
    name: 'Robot Arm Delta',
    status: 'MAINTENANCE',
    position_x: 5,
    position_y: 0,
    position_z: 0,
    rotation_y: 0,
    sensors: [
      { id: 401, sensor_type: 'Torque', value: 0, unit: 'Nm' },
      { id: 402, sensor_type: 'Temperature', value: 42, unit: '°C' },
    ],
  },
  {
    id: 5,
    code: 'PKG-11',
    name: 'Packaging Unit Sigma',
    status: 'STOPPED',
    position_x: 10,
    position_y: 0,
    position_z: 0,
    rotation_y: 0,
    sensors: [
      { id: 501, sensor_type: 'Output', value: 0, unit: 'pcs/h' },
      { id: 502, sensor_type: 'Energy', value: 9, unit: 'kWh' },
    ],
  },
];

const statusConfig: Record<MachineStatus, { 
  label: string; 
  color: string; 
  glowColor: string;
  emissive: string;
  pulseSpeed: number;
}> = {
  RUNNING: {
    label: 'Đang chạy',
    color: '#22c55e',
    glowColor: '#22c55e',
    emissive: '#166534',
    pulseSpeed: 2.5,
  },
  STOPPED: {
    label: 'Dừng',
    color: '#6b7280',
    glowColor: '#6b7280',
    emissive: '#1f2937',
    pulseSpeed: 0,
  },
  MAINTENANCE: {
    label: 'Bảo trì',
    color: '#f59e0b',
    glowColor: '#f59e0b',
    emissive: '#78350f',
    pulseSpeed: 1.2,
  },
  ERROR: {
    label: 'Sự cố',
    color: '#ef4444',
    glowColor: '#ef4444',
    emissive: '#7f1d1d',
    pulseSpeed: 4.0,
  },
};

const severityConfig: Record<AlertSeverity, { label: string; color: string }> = {
  CRITICAL: { label: 'Khẩn cấp', color: '#ef4444' },
  WARNING: { label: 'Cảnh báo', color: '#f59e0b' },
  INFO: { label: 'Thông tin', color: '#0ea5e9' },
};

function normalizeStatus(status: string): MachineStatus {
  if (status === 'RUNNING' || status === 'STOPPED' || status === 'MAINTENANCE' || status === 'ERROR') {
    return status;
  }
  return 'STOPPED';
}

function normalizeSeverity(severity: string): AlertSeverity {
  if (severity === 'CRITICAL' || severity === 'WARNING' || severity === 'INFO') {
    return severity;
  }
  return 'INFO';
}

function formatSensorValue(value: number | null, sensorType: string): string {
  if (value === null || value === undefined) return '--';
  const num = Number(value);
  if (sensorType === 'SPEED') {
    return Math.round(num).toLocaleString();
  }
  if (sensorType === 'TEMPERATURE') {
    return num.toFixed(1);
  }
  if (sensorType === 'POWER') {
    return num.toFixed(1);
  }
  return num.toFixed(2);
}

function MachineModel({ machine, onClick, isSelected, hasCustomModel }: { 
  machine: Machine; 
  onClick: (m: Machine) => void; 
  isSelected: boolean;
  hasCustomModel: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const status = normalizeStatus(machine.status);
  const config = statusConfig[status];
  const [pulsePhase, setPulsePhase] = useState(0);

  // Pulse animation for running/error machines
  useFrame((_, delta) => {
    if (config.pulseSpeed > 0 && meshRef.current) {
      setPulsePhase(prev => prev + delta * config.pulseSpeed);
    }
  });

  // Compute dynamic color with pulse effect
  const baseColor = new THREE.Color(config.color);
  const emissiveColor = new THREE.Color(config.emissive);
  const intensity = config.pulseSpeed > 0 ? (Math.sin(pulsePhase) * 0.3 + 0.7) : 1;
  const dynamicColor = baseColor.clone().multiplyScalar(intensity);
  const dynamicEmissive = emissiveColor.clone().multiplyScalar(intensity * 0.5);

  const posX = machine.positionX !== undefined ? machine.positionX : (machine.position_x !== undefined ? machine.position_x : 0);
  const posY = 0;
  const posZ = machine.positionZ !== undefined ? machine.positionZ : (machine.position_z !== undefined ? machine.position_z : 0);
  const rotY = machine.rotationY !== undefined ? machine.rotationY : (machine.rotation_y !== undefined ? machine.rotation_y : 0);

  return (
    <group
      ref={groupRef}
      position={[posX, posY, posZ]}
      rotation={[0, rotY, 0]}
      onClick={() => onClick(machine)}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <Detailed distances={[0, 22]}>
        {/* LOD 0: Detailed Machine Model */}
        <group>
          {/* Base Platform */}
          <mesh>
            <cylinderGeometry args={[1.8, 1.8, 0.15, 32]} />
            <meshStandardMaterial 
              color="#cbd5e1" 
              roughness={0.7} 
              metalness={0.3}
            />
          </mesh>

          {/* Main Machine Body - Premium Metallic White */}
          <mesh
            ref={meshRef}
            geometry={new THREE.BoxGeometry(1.5, 2.4, 1.5)}
            position={[0, 1.25, 0]}
          >
            <meshStandardMaterial
              color="#f8fafc"
              roughness={0.3}
              metalness={0.7}
            />
          </mesh>

          {/* Real-time Status Display Accent Screen */}
          <mesh
            geometry={new THREE.BoxGeometry(0.8, 0.4, 0.05)}
            position={[0, 1.4, 0.76]}
          >
            <meshStandardMaterial
              color={config.color}
              emissive={config.color}
              emissiveIntensity={config.pulseSpeed > 0 ? 0.8 : 0.3}
            />
          </mesh>

          {/* Đèn chỉ báo trạng thái trên đầu máy */}
          <mesh
            geometry={new THREE.CylinderGeometry(0.15, 0.15, 0.25, 16)}
            position={[0, 2.6, 0]}
          >
            <meshStandardMaterial
              color={config.color}
              emissive={config.color}
              emissiveIntensity={status === 'ERROR' ? 1.5 : config.pulseSpeed > 0 ? 1 : 0.4}
            />
          </mesh>

          {/* Vòng quét trạng thái sự cố dưới đất */}
          {status === 'ERROR' && (
            <mesh
              geometry={new THREE.RingGeometry(0.9, 1.3, 32)}
              position={[0, 0.15, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <meshBasicMaterial
                color={config.color}
                transparent
                opacity={0.6}
                side={THREE.DoubleSide}
              />
            </mesh>
          )}

          {/* Viền highlight màu vàng khi click chọn */}
          {isSelected && (
            <mesh
              geometry={new THREE.BoxGeometry(1.7, 2.6, 1.7)}
              position={[0, 1.25, 0]}
            >
              <meshBasicMaterial
                color="#fbbf24"
                transparent
                opacity={0.4}
                wireframe
              />
            </mesh>
          )}

          {/* Viền highlight màu trắng khi hover */}
          {hovered && !isSelected && (
            <mesh
              geometry={new THREE.BoxGeometry(1.6, 2.5, 1.6)}
              position={[0, 1.25, 0]}
            >
              <meshBasicMaterial
                color="#ffffff"
                transparent
                opacity={0.15}
                wireframe
              />
            </mesh>
          )}
        </group>

        {/* LOD 1: Simplified Model (Solid Neon Green Glowing Box) */}
        <mesh position={[0, 1.2, 0]}>
          <boxGeometry args={[1.5, 2.4, 1.5]} />
          <meshStandardMaterial color="#39FF14" emissive="#39FF14" emissiveIntensity={0.6} />
        </mesh>
      </Detailed>

      {/* Sensor Data Overlay - Dynamic HUD Badge */}
      <Html
        position={[0, 2.65, 0]}
        center
        style={{ pointerEvents: 'none' }}
      >
        {hovered || isSelected ? (
          /* Nhãn đầy đủ chi tiết khi Hover hoặc Được Chọn */
          <div 
            className="flex items-center gap-1.5 bg-white/95 border border-slate-200/85 px-2 py-1 rounded-full shadow-md backdrop-blur-md whitespace-nowrap select-none scale-105 transition-all duration-200"
            style={{
              boxShadow: `0 4px 12px rgba(15,23,42,0.08), 0 0 0 1px ${config.color}25`,
            }}
          >
            <span 
              className="w-1.5 h-1.5 rounded-full shrink-0" 
              style={{ 
                background: config.color,
                boxShadow: config.pulseSpeed > 0 ? `0 0 6px ${config.color}` : 'none' 
              }} 
            />
            <span className="text-[9px] font-black text-slate-805 tracking-tight leading-none">
              {machine.code}
            </span>
            {machine.sensors.length > 0 && machine.sensors[0].value !== null && (
              <span className="text-[9px] font-mono text-slate-500 border-l pl-1.5 border-slate-200 h-2.5 flex items-center leading-none">
                {machine.sensors[0].value} {machine.sensors[0].unit}
              </span>
            )}
          </div>
        ) : (
          /* Nhãn tối giản mặc định để giữ không gian sạch sẽ */
          <div className="bg-slate-900/65 backdrop-blur-[1px] px-2 py-0.5 rounded-md text-[8px] font-extrabold text-white tracking-wider uppercase opacity-75 whitespace-nowrap select-none">
            {machine.code}
          </div>
        )}
      </Html>
    </group>
  );
}

class ModelErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any) {
    console.error('Error loading 3D model in Three.js:', error);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

/*
  ======================================================================
  💡 HƯỚNG DẪN TRIỂN KHAI KTX2 TEXTURE COMPRESSION (Dành cho phiên bản Production):
  
  import { useKTX2 } from '@react-three/drei';
  
  function OptimizedTextureModel() {
    // 1. Tải texture nén KTX2 siêu nhẹ giúp tiết kiệm tối đa VRAM GPU
    const texture = useKTX2('/textures/factory_floor.ktx2');
    
    // 2. Gán texture vào vật liệu của model
    return (
      <mesh>
        <boxGeometry args={[5, 5, 5]} />
        <meshStandardMaterial map={texture} />
      </mesh>
    );
  }
  ======================================================================
*/

// Định nghĩa loader KTX2 Singleton để tránh khởi tạo lại WASM decoder nhiều lần gây lỗi bộ nhớ VRAM
let ktx2LoaderInstance: KTX2Loader | null = null;

function getKTX2Loader(gl: THREE.WebGLRenderer) {
  if (!ktx2LoaderInstance) {
    ktx2LoaderInstance = new KTX2Loader();
    // Sử dụng CDN chứa bộ giải mã Basis Universal / KTX2 WASM chính thức
    ktx2LoaderInstance.setTranscoderPath('https://cdn.jsdelivr.net/gh/pmndrs/drei-assets@master/basis/');
    ktx2LoaderInstance.detectSupport(gl);
  }
  return ktx2LoaderInstance;
}

function CustomModel({ url }: { url: string }) {
  const { gl } = useThree();
  
  // Tải mô hình 3D và tự động tích hợp bộ giải mã KTX2 để giải nén GPU Texture trực tiếp trên VRAM
  const { scene } = useGLTF(url, true, true, (loader) => {
    const ktx2 = getKTX2Loader(gl);
    loader.setKTX2Loader(ktx2);
  });

  return (
    <Detailed distances={[0, 22]}>
      {/* Cự ly gần (< 22 đơn vị): Vẽ mô hình 3D thực tế chi tiết đầy đủ */}
      <primitive object={scene} dispose={null} />
      
      {/* Cự ly xa (> 22 đơn vị): Vẽ một khối hộp đặc màu xanh Neon phát sáng để dễ dàng nhận biết tính năng LOD đang hoạt động */}
      <mesh>
        <boxGeometry args={[12, 1.2, 12]} />
        <meshStandardMaterial color="#39FF14" emissive="#39FF14" emissiveIntensity={0.5} />
      </mesh>
    </Detailed>
  );
}

function FactoryFloor({ 
  machines, 
  zoneAssets, 
  onMachineClick, 
  selectedMachineId 
}: { 
  machines: Machine[]; 
  zoneAssets: TwinModel[]; 
  onMachineClick: (m: Machine) => void;
  selectedMachineId?: number;
}) {
  const active3DModel = zoneAssets.find(x => x.modelType === 'THREE_D_MODEL');
  const hasCustomModel = !!active3DModel;

  return (
    <>
      {/* Floor Grid - Luôn hiển thị để định vị */}
      <gridHelper args={[40, 40, '#94a3b8', '#cbd5e1']} position={[0, -0.01, 0]} />
      
      {/* Floor Base - Luôn hiển thị để tránh cảm giác lơ lửng */}
      <mesh position={[0, -0.1, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial 
          color="#f1f5f9" 
          roughness={0.9} 
          metalness={0.1}
        />
      </mesh>

      {/* Render mô hình 3D tùy chỉnh nếu được tải lên */}
      {active3DModel && (
        <ModelErrorBoundary fallback={null}>
          <Suspense fallback={null}>
            <CustomModel url={`${resolveAssetUrl(active3DModel.fileUrl)}?v=2`} />
          </Suspense>
        </ModelErrorBoundary>
      )}

      {/* Zone Markers */}


      {machines.map(machine => (
        <MachineModel 
          key={machine.id} 
          machine={machine} 
          onClick={onMachineClick} 
          isSelected={selectedMachineId === machine.id}
          hasCustomModel={hasCustomModel}
        />
      ))}
    </>
  );
}

function Scene({ 
  machines, 
  onMachineClick,
  zoneAssets,
  selectedMachineId
}: { 
  machines: Machine[]; 
  onMachineClick: (m: Machine) => void;
  zoneAssets: TwinModel[];
  selectedMachineId?: number;
}) {
  return (
    <>
      <PerspectiveCamera makeDefault position={[12, 10, 12]} fov={50} />
      <OrbitControls 
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minPolarAngle={0}
        maxPolarAngle={Math.PI / 2 - 0.05}
        minZoom={0.5}
        maxZoom={20}
      />
      
      {/* Lighting Setup */}
      <ambientLight intensity={0.7} color="#ffffff" />
      <directionalLight 
        position={[10, 15, 10]} 
        intensity={2.0} 
        color="#ffffff"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.5}
        shadow-camera-far={50}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
        shadow-bias={-0.001}
      />
      <pointLight position={[-5, 8, -5]} intensity={1.0} color="#22c55e" distance={30} decay={2} />
      <pointLight position={[5, 8, 5]} intensity={0.8} color="#ef4444" distance={30} decay={2} />
      <pointLight position={[0, 10, 0]} intensity={0.8} color="#f59e0b" distance={40} decay={2} />

      <FactoryFloor 
        machines={machines} 
        zoneAssets={zoneAssets} 
        onMachineClick={onMachineClick}
        selectedMachineId={selectedMachineId}
      />
    </>
  );
}

function MachineDetailPanel({ machine, onClose, serverIp }: { machine: Machine; onClose: () => void; serverIp: string }) {
  const status = normalizeStatus(machine.status);
  const config = statusConfig[status];
  const [view, setView] = useState<'sensors' | 'history'>('sensors');
  const [tickets, setTickets] = useState<any[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrTargetUrl, setQrTargetUrl] = useState('');

  useEffect(() => {
    if (showQRModal) {
      const origin = window.location.origin;
      let target = `${origin}/ar/${machine.id}`;
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        if (serverIp && serverIp !== 'localhost') {
          target = `${origin.replace('localhost', serverIp).replace('127.0.0.1', serverIp)}/ar/${machine.id}`;
        }
      }
      setQrTargetUrl(target);
    }
  }, [showQRModal, serverIp, machine.id]);
  const [ticketForm, setTicketForm] = useState({
    title: '',
    description: '',
    priority: 'MEDIUM',
  });
  const [submittingTicket, setSubmittingTicket] = useState(false);

  const handleCreateTicketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketForm.title.trim()) {
      alert('Vui lòng nhập tiêu đề phiếu!');
      return;
    }
    setSubmittingTicket(true);
    try {
      const res = await fetch(`${API_URL}/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          machineId: machine.id,
          title: ticketForm.title,
          description: ticketForm.description,
          priority: ticketForm.priority,
        }),
      });

      if (res.ok) {
        setShowCreateModal(false);
        setTicketForm({ title: '', description: '', priority: 'MEDIUM' });
        
        // Reload history tickets list
        await loadHistory();
        
        setView('history');
        alert('Tạo phiếu bảo trì thành công!');
      } else {
        const data = await res.json();
        alert(`Lỗi: ${data.error || 'Không thể tạo phiếu'}`);
      }
    } catch (err) {
      console.error(err);
      alert('Lỗi kết nối máy chủ!');
    } finally {
      setSubmittingTicket(false);
    }
  };

  const loadHistory = async () => {
    setLoadingTickets(true);
    try {
      const [ticketsRes, schedulesRes] = await Promise.all([
        fetch(`${API_URL}/tickets?machineId=${machine.id}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }),
        fetch(`${API_URL}/maintenance-schedules?machineId=${machine.id}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        })
      ]);
      
      let ticketsList: any[] = [];
      let schedulesList: any[] = [];
      
      if (ticketsRes.ok) {
        const tData = await ticketsRes.json();
        ticketsList = (tData.data || []).map((t: any) => ({
          ...t,
          isTicket: true,
          date: t.createdAt || t.created_at
        }));
      }
      
      if (schedulesRes.ok) {
        const sData = await schedulesRes.json();
        schedulesList = (sData.data || []).map((s: any) => ({
          id: `sched-${s.id}`,
          title: `Lịch bảo trì: ${s.maintenanceType === 'PREVENTIVE' ? 'Định kỳ' : 'Sửa chữa'}`,
          description: s.description || 'Không có mô tả',
          status: s.status,
          priority: 'SCHEDULED',
          isTicket: false,
          date: s.nextDueDate || s.next_due_date,
          createdAt: s.nextDueDate || s.next_due_date
        }));
      }
      
      const combined = [...ticketsList, ...schedulesList].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setTickets(combined);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingTickets(false);
    }
  };

  useEffect(() => {
    if (view === 'history') {
      loadHistory();
    }
  }, [view, machine.id]);

  return (
    <div 
      className="h-full bg-white/95 border border-slate-200/80 rounded-3xl p-6 shadow-xl backdrop-blur-md flex flex-col justify-between"
      role="dialog"
      aria-modal="true"
      aria-labelledby="detail-title"
    >
      <div>
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 id="detail-title" className="text-base font-extrabold text-slate-900 leading-tight">{machine.name}</h2>
            <p className="text-slate-400 font-mono text-[10px] mt-0.5">Mã thiết bị: {machine.code}</p>
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-600 transition-colors p-1"
            aria-label="Đóng chi tiết"
          >
            ✕
          </button>
        </div>

        <div className="mb-4 flex items-center gap-3">
          <span 
            className={`px-3 py-1 rounded-full font-mono text-[9px] uppercase tracking-[0.1em] font-bold border ${
              status === 'RUNNING' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
              status === 'ERROR' ? 'bg-red-50 text-red-800 border-red-200 animate-pulse' :
              status === 'MAINTENANCE' ? 'bg-amber-50 text-amber-800 border-amber-200' :
              'bg-slate-50 text-slate-800 border-slate-200'
            }`}
          >
            {config.label}
          </span>
          <div className="flex-1 h-px bg-slate-100" />
        </div>

        <div className="space-y-4 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
          {view === 'sensors' ? (
            <>
              <h3 className="font-bold text-[10px] text-slate-400 uppercase tracking-[0.1em]">Cảm biến thời gian thực</h3>
              {machine.sensors.length > 0 ? (
                <div className="grid grid-cols-1 gap-2.5">
                  {machine.sensors.map(sensor => {
                    const sType = sensor.sensorType || sensor.sensor_type || '';
                    return (
                      <div key={sensor.id} className="bg-slate-50 border border-slate-100 p-3.5 rounded-2xl">
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.08em] mb-1">{sType}</p>
                        <div className="flex items-baseline gap-1">
                          <span className="text-xl font-extrabold text-slate-900 font-mono tabular-nums">
                            {formatSensorValue(sensor.value, sType)}
                          </span>
                          <span className="text-[10px] text-slate-450 font-bold">{sensor.unit}</span>
                        </div>
                      <div className="mt-2 h-1 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full transition-all duration-700"
                          style={{ 
                            width: `${Math.min(Math.max(Number(sensor.value) || 0, 0), 100)}%`,
                            backgroundColor: config.color 
                          }}
                          role="progressbar"
                          aria-valuenow={sensor.value || 0}
                          aria-valuemin={0}
                          aria-valuemax={100}
                        />
                      </div>
                    </div>
                  );
                })}
                </div>
              ) : (
                <p className="text-xs text-slate-400 py-4 text-center">Không có cảm biến</p>
              )}
            </>
          ) : (
            <>
              <h3 className="font-bold text-[10px] text-slate-400 uppercase tracking-[0.1em]">Lịch sử hoạt động & bảo trì</h3>
              {loadingTickets ? (
                <div className="text-center py-6">
                  <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-[10px] font-mono text-slate-400 uppercase">Đang tải lịch sử...</p>
                </div>
              ) : tickets.length > 0 ? (
                <div className="space-y-3">
                  {tickets.map((ticket: any) => (
                    <div key={ticket.id} className="bg-slate-50 border border-slate-150 p-3.5 rounded-2xl">
                      <div className="flex justify-between items-start gap-2 mb-1.5">
                        <p className="font-bold text-[11px] text-slate-800 line-clamp-1">{ticket.title}</p>
                        <span className={`px-2 py-0.5 rounded text-[8px] font-mono font-bold shrink-0 ${
                          ticket.status === 'OPEN' ? 'bg-red-50 text-red-600 border border-red-100' :
                          ticket.status === 'IN_PROGRESS' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                          ticket.status === 'ACTIVE' ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' :
                          'bg-emerald-50 text-emerald-600 border border-emerald-100'
                        }`}>
                          {ticket.status}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 line-clamp-2 mb-2">{ticket.description}</p>
                      <div className="flex justify-between items-center text-[9px] font-mono text-slate-400 border-t border-slate-100 pt-2">
                        <span>{ticket.priority === 'SCHEDULED' ? 'LỊCH BẢO TRÌ' : `UT: ${ticket.priority}`}</span>
                        <span>{new Date(ticket.date || ticket.createdAt || ticket.created_at).toLocaleDateString('vi-VN')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 py-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  Không có dữ liệu lịch sử cho máy này
                </p>
              )}
            </>
          )}
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col gap-2 shrink-0">
        <div className="flex gap-2">
          <button 
            onClick={() => setView(prev => prev === 'sensors' ? 'history' : 'sensors')}
            className="flex-1 border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 py-2 rounded-xl font-mono text-[10px] uppercase tracking-[0.1em] transition-all font-bold"
          >
            {view === 'sensors' ? 'Xem lịch sử' : 'Xem cảm biến'}
          </button>
          <button 
            onClick={() => setShowCreateModal(true)}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-xl font-mono text-[10px] uppercase tracking-[0.1em] transition-all font-bold shadow-sm shadow-indigo-200/50"
          >
            Tạo ticket
          </button>
        </div>
        <button 
          onClick={() => setShowQRModal(true)}
          className="w-full bg-slate-900 hover:bg-slate-800 text-white py-2.5 rounded-xl font-mono text-[10px] uppercase tracking-[0.1em] transition-all font-bold flex items-center justify-center gap-1.5 shadow-md"
        >
          <span>📷</span> Xem AR di động (Mã QR)
        </button>
      </div>

      {/* Popup hiển thị Mã QR AR độc bản */}
      {showQRModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 text-slate-800">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-extrabold text-slate-950 text-sm">Mã QR - Thực tế tăng cường (AR)</h3>
              <button 
                onClick={() => setShowQRModal(false)}
                className="text-slate-400 hover:text-slate-650 p-1 font-bold text-xs"
              >
                ✕
              </button>
            </div>
            
            <div className="text-center p-5 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col items-center justify-center gap-4">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Quét nhãn để kích hoạt camera AR</p>
              
              <div className="bg-white p-3 rounded-2xl shadow-sm border border-slate-200">
                {qrTargetUrl && (
                  <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(
                      qrTargetUrl
                    )}`}
                    alt={`QR Code for ${machine.name}`}
                    className="w-40 h-40"
                  />
                )}
              </div>

              {(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && (
                <div className="w-full text-left bg-amber-50 border border-amber-200 p-3 rounded-xl text-[10px] text-amber-800 leading-relaxed font-medium">
                  <span className="font-extrabold block mb-0.5">⚠️ Lưu ý chạy Localhost:</span>
                  Điện thoại của bạn phải kết nối cùng mạng Wi-Fi và truy cập qua địa chỉ IP máy tính. IP LAN phát hiện: <code className="bg-amber-100 px-1 rounded font-bold">{serverIp}</code>.
                </div>
              )}

              <div className="w-full text-left">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block mb-1">
                  Đường dẫn QR (Có thể sửa lại IP):
                </label>
                <input
                  type="text"
                  value={qrTargetUrl}
                  onChange={(e) => setQrTargetUrl(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              
              <div className="text-left w-full mt-1 border-t border-slate-200/50 pt-3">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block">Thiết bị gắn nhãn:</span>
                <span className="text-xs font-extrabold text-slate-800 block mt-0.5">{machine.name}</span>
                <span className="text-[9px] font-mono text-slate-500 block mt-0.5">ID: #{machine.id} | CODE: {machine.code}</span>
              </div>
            </div>
            
            <div className="mt-5 grid grid-cols-3 gap-1.5">
              <button 
                onClick={() => setShowQRModal(false)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded-xl font-mono text-[9px] uppercase tracking-wider font-bold transition-all text-center"
              >
                Đóng
              </button>
              <a 
                href={qrTargetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl font-mono text-[9px] uppercase tracking-wider font-bold transition-all shadow-sm shadow-emerald-200/50 flex items-center justify-center gap-0.5 text-center"
              >
                🔗 Link AR
              </a>
              <button 
                onClick={() => window.print()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl font-mono text-[9px] uppercase tracking-wider font-bold transition-all shadow-sm shadow-indigo-200/50 text-center"
              >
                In Nhãn
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup tạo Ticket trực tiếp trên giao diện 3D */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 text-slate-800">
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-extrabold text-slate-900 text-base">Tạo phiếu bảo trì mới</h3>
              <button 
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-650 p-1"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleCreateTicketSubmit} className="space-y-4 text-left">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-1.5">Thiết bị liên kết</label>
                <div className="bg-slate-50 border border-slate-100 px-4 py-3 rounded-2xl font-semibold text-xs text-slate-700">
                  {machine.name} ({machine.code})
                </div>
              </div>
              
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-1.5">Tiêu đề sự cố</label>
                <input 
                  type="text"
                  required
                  value={ticketForm.title}
                  onChange={(e) => setTicketForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Ví dụ: Nhiệt độ tăng cao, Vỡ bạc đạn..."
                  className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white px-4 py-3 rounded-2xl text-xs outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-1.5">Mô tả chi tiết</label>
                <textarea 
                  value={ticketForm.description}
                  onChange={(e) => setTicketForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Mô tả cụ thể hiện trạng máy để kỹ thuật viên nắm rõ..."
                  rows={3}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white px-4 py-3 rounded-2xl text-xs outline-none transition-all resize-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-1.5">Mức độ ưu tiên</label>
                <select 
                  value={ticketForm.priority}
                  onChange={(e) => setTicketForm(prev => ({ ...prev, priority: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white px-4 py-3 rounded-2xl text-xs outline-none transition-all cursor-pointer"
                >
                  <option value="LOW">Thấp</option>
                  <option value="MEDIUM">Trung bình</option>
                  <option value="HIGH">Cao</option>
                  <option value="URGENT">Khẩn cấp</option>
                </select>
              </div>

              <div className="flex gap-3 pt-3">
                <button 
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-500 font-bold py-2.5 rounded-2xl text-xs transition-all"
                >
                  Hủy
                </button>
                <button 
                  type="submit"
                  disabled={submittingTicket}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold py-2.5 rounded-2xl text-xs transition-all shadow-md shadow-indigo-100"
                >
                  {submittingTicket ? 'Đang tạo...' : 'Tạo phiếu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center bg-slate-50 text-slate-700 p-8 rounded-3xl border border-slate-100/50">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="font-mono text-xs font-black uppercase tracking-[0.2em] text-slate-800">Đang tải Digital Twin...</p>
        <p className="text-[10px] text-slate-400 mt-2 font-semibold animate-pulse">Khởi tạo WebGL context & Đồng bộ cảm biến</p>
      </div>
    </div>
  );
}

export default function TwinClient() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; alert: Alert }[]>([]);
  const [showLegend, setShowLegend] = useState(true);
  const toastIdRef = useRef(0);
  const isMutedRef = useRef(isMuted);

  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [zoneAssets, setZoneAssets] = useState<TwinModel[]>([]);
  const [viewMode, setViewMode] = useState<'3D' | '360'>('3D');
  const [activePanoramaUrl, setActivePanoramaUrl] = useState<string | null>(null);
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
        console.error('Error fetching system IP in TwinClient:', err);
      }
    };
    fetchIp();
  }, []);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const currentSelectedMachine = useMemo(() => {
    if (!selectedMachine) return null;
    return machines.find(m => m.id === selectedMachine.id) || selectedMachine;
  }, [selectedMachine, machines]);

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((alert: Alert) => {
    if (isMutedRef.current) return;
    const id = ++toastIdRef.current;
    const newToast = { id, alert };
    setToasts(prev => [newToast, ...prev].slice(0, 4));
    
    // Auto dismiss after 4 seconds
    setTimeout(() => {
      dismissToast(id);
    }, 4000);
  }, [dismissToast]);

  const triggerTestError = async () => {
    const target = selectedMachine || machines[0];
    if (!target) {
      alert('Không tìm thấy thiết bị nào để tạo lỗi thử nghiệm!');
      return;
    }

    // Gửi yêu cầu trigger quá tải lên Backend API, chờ WebSocket truyền ngược cảnh báo thật về
    try {
      const res = await fetch(`${API_URL}/machines/${target.id}/trigger-overload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (!res.ok) {
        const data = await res.json();
        console.error('Lỗi khi gọi API trigger quá tải:', data.error);
        alert(`Lỗi khi kích hoạt quá tải: ${data.error || 'Không rõ nguyên nhân'}`);
      }
    } catch (err) {
      console.error('Không thể kết nối đến API để lưu trạng thái quá tải:', err);
      alert('Lỗi kết nối máy chủ API!');
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

        const assetsQuery = zoneId
          ? `${API_URL}/uploads/zone-assets/${zoneId}`
          : null;

        const [machinesRes, alertsRes, assetsRes] = await Promise.all([
          fetch(machineQuery, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(alertQuery, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          assetsQuery
            ? fetch(assetsQuery, {
                headers: { Authorization: `Bearer ${token}` },
              })
            : Promise.resolve(null),
        ]);

        if (machinesRes.ok) {
          const machinesData = await machinesRes.json();
          const fetched = machinesData.data || [];
          setMachines(fetched.length > 0 ? fetched : demoMachines);
        } else {
          setMachines(demoMachines);
        }

        if (alertsRes.ok) {
          const alertsData = await alertsRes.json();
          const newAlerts: Alert[] = (alertsData.data || []).slice(0, 10);
          setAlerts(newAlerts);
        }

        if (assetsRes && assetsRes.ok) {
          const assetsData = await assetsRes.json();
          const fetchedAssets: TwinModel[] = assetsData.models || [];
          setZoneAssets(fetchedAssets);
          
          // Auto-select first panorama if available
          const firstPhoto = fetchedAssets.find(a => a.modelType === 'PHOTO_360');
          if (firstPhoto) {
            setActivePanoramaUrl(firstPhoto.fileUrl);
          } else {
            setActivePanoramaUrl(null);
          }
        } else {
          setZoneAssets([]);
          setActivePanoramaUrl(null);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    const handleFactoryChange = () => {
      setRefreshTrigger(prev => prev + 1);
    };
    window.addEventListener('factory-changed', handleFactoryChange);

    socket.on('sensor_update', (data: { machineId: number; sensorId: number; value: number; status?: string }) => {
      setMachines(prev =>
          prev.map(machine => {
            if (machine.id !== data.machineId || !machine.sensors) {
              return machine;
            }
            return {
              ...machine,
              status: data.status || machine.status,
              sensors: machine.sensors.map(sensor =>
                  sensor.id === data.sensorId ? { ...sensor, value: data.value } : sensor,
              ),
            };
          }),
      );
    });

    socket.on('new_alert', (alert: Alert) => {
      setAlerts(prev => [alert, ...prev].slice(0, 20));
      addToast(alert);
    });

    socket.on('machine_status_change', (data: { machineId: number; status: string }) => {
      setMachines(prev =>
        prev.map(machine => (machine.id === data.machineId ? { ...machine, status: data.status } : machine)),
      );
    });

    return () => {
      socket?.disconnect();
      socket = null;
      window.removeEventListener('factory-changed', handleFactoryChange);
    };
  }, [addToast, refreshTrigger, serverIp]);

  if (loading) {
    return <LoadingFallback />;
  }

  const displayMachines = machines.length > 0 ? machines : demoMachines;

  return (
    <div className="relative w-full h-full bg-slate-100 overflow-hidden text-slate-850">
      <style jsx global>{`
        @keyframes slide-in-right {
          from { opacity: 0; transform: translateX(100%); }
          to { opacity: 1; transform: translateX(0); }
        }
        .animate-toast-in { animation: slide-in-right 0.3s ease-out; }
      `}</style>

      {/* Toolbar */}
      <div className="absolute top-4 left-4 right-4 z-20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-4">
          <h1 className="text-2xl font-black uppercase tracking-[-0.04em] text-slate-900">Digital Twin 3D</h1>
          <div className="hidden sm:flex items-center gap-3 border border-slate-200/80 bg-white/90 px-4 py-2 rounded-2xl shadow-sm backdrop-blur-md">
            <span className="font-mono text-xs uppercase tracking-[0.15em] text-emerald-600 font-bold">Live</span>
            <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse" />
            <span className="font-mono text-sm text-slate-700">WebSocket connected</span>
          </div>
        </div>

        <div className="pointer-events-auto flex items-center gap-3">
          {zoneAssets.length > 0 && (
            <div className="flex bg-white/90 border border-slate-200 p-1 rounded-2xl shadow-sm backdrop-blur-md">
              <button
                onClick={() => setViewMode('3D')}
                className={`px-4 py-1.5 rounded-xl font-bold text-xs uppercase transition-all ${
                  viewMode === '3D' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Mô hình 3D
              </button>
              <button
                onClick={() => {
                  setViewMode('360');
                  const firstPhoto = zoneAssets.find(a => a.modelType === 'PHOTO_360');
                  if (firstPhoto && !activePanoramaUrl) {
                    setActivePanoramaUrl(firstPhoto.fileUrl);
                  }
                }}
                className={`px-4 py-1.5 rounded-xl font-bold text-xs uppercase transition-all ${
                  viewMode === '360' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Không gian 360°
              </button>
            </div>
          )}

          <button
            onClick={() => setIsMuted(prev => !prev)}
            className={`border px-4 py-2 rounded-2xl font-mono text-xs uppercase tracking-[0.1em] transition-all backdrop-blur-md shadow-sm font-bold ${
              isMuted 
                ? 'border-red-200 bg-red-50 text-red-750 hover:bg-red-100' 
                : 'border-slate-200 bg-white/90 text-slate-700 hover:border-slate-300'
            }`}
          >
            {isMuted ? '🔇 Đã tắt cảnh báo' : '🔔 Nhận cảnh báo'}
          </button>

          <button
            onClick={triggerTestError}
            className="bg-red-500 hover:bg-red-650 text-white px-4 py-2 rounded-2xl font-mono text-xs uppercase tracking-[0.1em] transition-all backdrop-blur-md shadow-sm shadow-red-200 border border-red-400 font-bold focus:outline-none"
          >
            ⚠️ Tạo lỗi test
          </button>

          <button
            onClick={() => setShowLegend(prev => !prev)}
            className="border border-slate-200/80 bg-white/90 px-4 py-2 rounded-2xl font-mono text-xs uppercase tracking-[0.1em] text-slate-700 hover:border-emerald-500/50 hover:text-emerald-600 transition-all backdrop-blur-md shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/50 font-bold"
          >
            {showLegend ? 'Ẩn' : 'Hiện'} chú thích
          </button>
        </div>
      </div>

      {/* Canvas 3D */}
      <div className="w-full h-full">
        <Suspense fallback={<LoadingFallback />}>
          <Canvas 
            camera={{ position: [12, 10, 12], fov: 50 }}
            gl={{ 
              antialias: true, 
              alpha: true, 
              preserveDrawingBuffer: false,
              powerPreference: 'high-performance',
            }}
            shadows
            style={{ outline: 'none' }}
          >
            {viewMode === '360' ? (
              <PanoramaViewer
                url={activePanoramaUrl}
                machines={displayMachines}
                zoneAssets={zoneAssets}
                onChangePanorama={setActivePanoramaUrl}
              />
            ) : (
              <Scene 
                machines={displayMachines} 
                onMachineClick={setSelectedMachine}
                zoneAssets={zoneAssets}
                selectedMachineId={selectedMachine?.id}
              />
            )}
          </Canvas>
        </Suspense>
      </div>

      {/* Right Sidebar Detail Panel */}
      {currentSelectedMachine && (
        <div className="absolute top-[80px] right-4 bottom-16 w-80 z-30 pointer-events-auto">
          <MachineDetailPanel 
            machine={currentSelectedMachine} 
            onClose={() => setSelectedMachine(null)}
            serverIp={serverIp}
          />
        </div>
      )}

      {/* Legend Overlay */}
      {showLegend && (
        <div className="absolute top-[76px] left-4 z-20 pointer-events-auto mt-[20px]">
          <div className="border border-slate-200 bg-white/95 px-5 py-4 rounded-2xl backdrop-blur-md shadow-lg shadow-slate-200/50">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-3">Chú thích trạng thái</p>
            <div className="flex flex-wrap gap-3">
              {Object.entries(statusConfig).map(([status, config]) => (
                <span 
                  key={status} 
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl font-mono text-[10px] uppercase font-bold border"
                  style={{
                    background: `rgba(${parseInt(config.color.slice(1,3),16)}, ${parseInt(config.color.slice(3,5),16)}, ${parseInt(config.color.slice(5,7),16)}, 0.08)`,
                    borderColor: `${config.color}30`,
                    color: config.color,
                  }}
                >
                  <span 
                    className="h-2 w-2 rounded-full" 
                    style={{ background: config.color }}
                  />
                  {config.label}
                </span>
              ))}
            </div>

            {/* Chú thích đơn vị đo lường IoT */}
            <div className="mt-4 pt-3.5 border-t border-slate-100 space-y-1.5">
              <p className="font-mono text-[8px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-1">Đơn vị đo lường</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[9px] text-slate-500 font-medium">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-bold text-slate-700 bg-slate-100 px-1 rounded">°C</span>
                  <span>Nhiệt độ thiết bị</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-bold text-slate-700 bg-slate-100 px-1 rounded">mm/s</span>
                  <span>Vận tốc rung cơ khí</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-bold text-slate-700 bg-slate-100 px-1 rounded">RPM</span>
                  <span>Vòng quay / phút</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-bold text-slate-700 bg-slate-100 px-1 rounded">kW</span>
                  <span>Công suất điện năng</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notifications - Relocated to Bottom Left to prevent overlap with Sidebar */}
      <div className="fixed bottom-20 left-4 z-50 flex flex-col gap-2 pointer-events-none" aria-live="polite">
        {toasts.map(({ id, alert }) => {
          const severity = normalizeSeverity(alert.severity);
          const config = severityConfig[severity];
          const isCritical = severity === 'CRITICAL';
          
          return (
            <div key={id} className="pointer-events-auto animate-toast-in">
              <div 
                className="max-w-sm bg-white border border-slate-200 px-5 py-4 rounded-2xl shadow-xl shadow-slate-200/50 backdrop-blur-md transition-all"
                style={{
                  borderLeft: `4px solid ${config.color}`,
                }}
                role="alert"
                aria-live={isCritical ? 'assertive' : 'polite'}
                aria-atomic="true"
              >
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 mt-0.5 text-lg" style={{ color: config.color }}>
                    {severity === 'CRITICAL' ? '⬤' : severity === 'WARNING' ? '⚠' : 'ℹ'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold text-slate-900 text-xs">{config.label}</p>
                      <button
                        onClick={() => dismissToast(id)}
                        className="flex-shrink-0 p-1 text-slate-400 hover:text-slate-600 transition-colors"
                        aria-label="Đóng"
                      >✕</button>
                    </div>
                    {alert.machine && (
                      <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-slate-400 font-bold">
                        {alert.machine.code} - {alert.machine.name}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-slate-600 leading-normal">{alert.message}</p>
                    <p className="mt-2 font-mono text-[9px] text-slate-400">
                      {(() => {
                        const val = alert.createdAt || alert.created_at;
                        if (!val) return '';
                        const date = new Date(val);
                        return isNaN(date.getTime()) ? '' : `${date.toLocaleTimeString('vi-VN')} - ${date.toLocaleDateString('vi-VN')}`;
                      })()}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Instructions */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
        <p className="bg-white/90 border border-slate-200 px-4 py-2.5 rounded-2xl text-center font-mono text-[11px] text-slate-600 shadow-sm backdrop-blur-md">
          Click máy để xem chi tiết • Kéo chuột: xoay • Cuộn: zoom • Click phải chuột: pan
        </p>
      </div>
    </div>
  );
}