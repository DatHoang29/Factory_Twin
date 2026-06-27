'use client';

import { useState, useEffect } from 'react';

interface Factory {
  id: number;
  name: string;
  address: string;
  description: string;
  latitude: number | null;
  longitude: number | null;
}

interface Zone {
  id: number;
  factoryId: number;
  name: string;
  floorLevel: number;
  description: string;
}

interface TwinModel {
  id: string;
  modelType: 'THREE_D_MODEL' | 'PHOTO_360';
  fileUrl: string;
  format: string;
  version: number;
  uploadedBy: string;
  uploadedAt: string;
}

const API_URL = typeof window !== 'undefined' 
  ? `${window.location.origin}/api` 
  : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api');

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'factories' | 'zones' | 'assets' | 'machines'>('factories');
  
  // Data States
  const [factories, setFactories] = useState<Factory[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [assets, setAssets] = useState<TwinModel[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  
  // Selection States
  const [selectedFactoryId, setSelectedFactoryId] = useState<number | ''>('');
  const [selectedZoneId, setSelectedZoneId] = useState<number | ''>('');
  
  // Form States
  const [factoryForm, setFactoryForm] = useState({
    name: '',
    address: '',
    description: '',
    latitude: '',
    longitude: '',
  });

  const [zoneForm, setZoneForm] = useState({
    name: '',
    floorLevel: '1',
    description: '',
  });

  const [machineForm, setMachineForm] = useState({
    code: '',
    name: '',
    type: 'CNC',
    manufacturer: '',
    positionX: '0',
    positionY: '0',
    positionZ: '0',
    rotationY: '0',
  });

  // Upload States
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadType, setUploadType] = useState<'3d-model' | '360-photo'>('3d-model');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState({ text: '', type: '' });

  // Status message
  const [message, setMessage] = useState({ text: '', type: '' });

  useEffect(() => {
    fetchFactories();
  }, []);

  useEffect(() => {
    if (selectedFactoryId) {
      fetchZones(Number(selectedFactoryId));
    } else {
      setZones([]);
      setSelectedZoneId('');
    }
  }, [selectedFactoryId]);

  useEffect(() => {
    if (selectedZoneId) {
      fetchZoneAssets(Number(selectedZoneId));
      fetchZoneMachines(Number(selectedZoneId));
    } else {
      setAssets([]);
      setMachines([]);
    }
  }, [selectedZoneId]);

  // Fetch functions
  const fetchFactories = async () => {
    try {
      const res = await fetch(`${API_URL}/factories`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (res.ok) {
        const data = await res.json();
        setFactories(data.data || []);
        if (data.data && data.data.length > 0 && !selectedFactoryId) {
          setSelectedFactoryId(data.data[0].id);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchZones = async (factoryId: number) => {
    try {
      const res = await fetch(`${API_URL}/zones?factoryId=${factoryId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (res.ok) {
        const data = await res.json();
        setZones(data.data || []);
        if (data.data && data.data.length > 0) {
          setSelectedZoneId(data.data[0].id);
        } else {
          setSelectedZoneId('');
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchZoneAssets = async (zoneId: number) => {
    try {
      const res = await fetch(`${API_URL}/uploads/zone-assets/${zoneId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAssets(data.models || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchZoneMachines = async (zoneId: number) => {
    try {
      const res = await fetch(`${API_URL}/machines?zoneId=${zoneId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMachines(data.data || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleMachineSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedZoneId) {
      setMessage({ text: 'Vui lòng chọn phân xưởng trước', type: 'error' });
      return;
    }
    try {
      const res = await fetch(`${API_URL}/machines`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          zoneId: Number(selectedZoneId),
          code: machineForm.code,
          name: machineForm.name,
          type: machineForm.type,
          manufacturer: machineForm.manufacturer,
          positionX: Number(machineForm.positionX),
          positionY: Number(machineForm.positionY),
          positionZ: Number(machineForm.positionZ),
          rotationY: Number(machineForm.rotationY),
        }),
      });
      if (res.ok) {
        setMessage({ text: 'Đăng ký thiết bị mới thành công', type: 'success' });
        setMachineForm({
          code: '',
          name: '',
          type: 'CNC',
          manufacturer: '',
          positionX: '0',
          positionY: '0',
          positionZ: '0',
          rotationY: '0',
        });
        fetchZoneMachines(Number(selectedZoneId));
      } else {
        const data = await res.json();
        setMessage({ text: data.error || 'Lỗi thêm thiết bị', type: 'error' });
      }
    } catch (err) {
      console.error(err);
      setMessage({ text: 'Lỗi máy chủ', type: 'error' });
    }
  };

  const handleMachineDelete = async (machineId: number) => {
    if (!confirm('Bạn có chắc chắn muốn xoá thiết bị này?')) return;
    try {
      const res = await fetch(`${API_URL}/machines/${machineId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (res.ok) {
        setMessage({ text: 'Xoá thiết bị thành công', type: 'success' });
        fetchZoneMachines(Number(selectedZoneId));
      } else {
        const data = await res.json();
        setMessage({ text: data.error || 'Lỗi xoá thiết bị', type: 'error' });
      }
    } catch (err) {
      console.error(err);
      setMessage({ text: 'Lỗi máy chủ', type: 'error' });
    }
  };

  // Submissions
  const handleFactorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/factories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          name: factoryForm.name,
          address: factoryForm.address,
          description: factoryForm.description,
          latitude: factoryForm.latitude ? Number(factoryForm.latitude) : null,
          longitude: factoryForm.longitude ? Number(factoryForm.longitude) : null,
        }),
      });

      if (res.ok) {
        setMessage({ text: 'Thêm nhà máy thành công!', type: 'success' });
        setFactoryForm({ name: '', address: '', description: '', latitude: '', longitude: '' });
        fetchFactories();
        window.dispatchEvent(new Event('refresh-header-dropdowns'));
      } else {
        const error = await res.json();
        setMessage({ text: `Lỗi: ${error.error || 'Không thể lưu'}`, type: 'error' });
      }
    } catch (err) {
      setMessage({ text: 'Có lỗi xảy ra kết nối server.', type: 'error' });
    }
  };

  const handleZoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFactoryId) {
      setMessage({ text: 'Vui lòng chọn nhà máy trước!', type: 'error' });
      return;
    }
    try {
      const res = await fetch(`${API_URL}/zones`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          factoryId: Number(selectedFactoryId),
          name: zoneForm.name,
          floorLevel: Number(zoneForm.floorLevel),
          description: zoneForm.description,
        }),
      });

      if (res.ok) {
        setMessage({ text: 'Thêm phân xưởng thành công!', type: 'success' });
        setZoneForm({ name: '', floorLevel: '1', description: '' });
        fetchZones(Number(selectedFactoryId));
        window.dispatchEvent(new Event('refresh-header-dropdowns'));
      } else {
        const error = await res.json();
        setMessage({ text: `Lỗi: ${error.error || 'Không thể lưu'}`, type: 'error' });
      }
    } catch (err) {
      setMessage({ text: 'Có lỗi xảy ra kết nối server.', type: 'error' });
    }
  };

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedZoneId) {
      setUploadMessage({ text: 'Vui lòng chọn phân xưởng trước!', type: 'error' });
      return;
    }
    if (!uploadFile) {
      setUploadMessage({ text: 'Vui lòng chọn tệp tin cần tải lên!', type: 'error' });
      return;
    }

    setIsUploading(true);
    setUploadMessage({ text: 'Đang tải tệp lên...', type: 'info' });

    const formData = new FormData();
    formData.append('zoneId', String(selectedZoneId));
    formData.append('file', uploadFile);

    try {
      const endpoint = uploadType === '3d-model' ? '3d-model' : '360-photo';
      const res = await fetch(`${API_URL}/uploads/${endpoint}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: formData,
      });

      if (res.ok) {
        setUploadMessage({ text: 'Tải tài sản 3D/360° lên thành công!', type: 'success' });
        setUploadFile(null);
        // Clear input file
        const fileInput = document.getElementById('file-upload-input') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
        fetchZoneAssets(Number(selectedZoneId));
      } else {
        const error = await res.json();
        setUploadMessage({ text: `Lỗi tải lên: ${error.error || 'Không xác định'}`, type: 'error' });
      }
    } catch (err) {
      setUploadMessage({ text: 'Lỗi kết nối máy chủ khi upload.', type: 'error' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteAsset = async (id: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa tài nguyên này?')) return;
    try {
      const res = await fetch(`${API_URL}/uploads/model/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (res.ok) {
        setMessage({ text: 'Đã xóa tài nguyên thành công!', type: 'success' });
        if (selectedZoneId) fetchZoneAssets(Number(selectedZoneId));
      }
    } catch (err) {
      setMessage({ text: 'Có lỗi xảy ra khi xóa tài nguyên.', type: 'error' });
    }
  };

  return (
    <div className="flex-1 w-full bg-slate-50 p-6 overflow-y-auto">
      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-[-0.04em] text-slate-900">Thiết lập hệ thống</h1>
          <p className="text-sm text-slate-500">Quản lý nhà máy, phân xưởng, cấu hình 3D & ảnh 360° toàn cảnh</p>
        </div>
      </div>

      {/* Message feedback banner */}
      {message.text && (
        <div className={`mb-6 p-4 rounded-2xl flex justify-between items-center text-sm border font-medium ${
          message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'
        }`}>
          <span>{message.text}</span>
          <button onClick={() => setMessage({ text: '', type: '' })} className="hover:opacity-75 font-bold">✕</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-6 gap-2">
        <button
          onClick={() => setActiveTab('factories')}
          className={`pb-3 px-4 font-bold text-sm tracking-tight border-b-2 transition-all ${
            activeTab === 'factories'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Nhà máy ({factories.length})
        </button>
        <button
          onClick={() => setActiveTab('zones')}
          className={`pb-3 px-4 font-bold text-sm tracking-tight border-b-2 transition-all ${
            activeTab === 'zones'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Phân xưởng ({zones.length})
        </button>
        <button
          onClick={() => setActiveTab('assets')}
          className={`pb-3 px-4 font-bold text-sm tracking-tight border-b-2 transition-all ${
            activeTab === 'assets'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Mô hình 3D & 360° ({assets.length})
        </button>
        <button
          onClick={() => setActiveTab('machines')}
          className={`pb-3 px-4 font-bold text-sm tracking-tight border-b-2 transition-all ${
            activeTab === 'machines'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Máy móc ({machines.length})
        </button>
      </div>

      {/* Tab contents */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Forms Section */}
        <div className="lg:col-span-1 space-y-6">
          {activeTab === 'factories' && (
            <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-sm">
              <h2 className="text-base font-extrabold text-slate-900 mb-4 uppercase tracking-tight">Thêm nhà máy mới</h2>
              <form onSubmit={handleFactorySubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Tên nhà máy</label>
                  <input
                    type="text"
                    required
                    value={factoryForm.name}
                    onChange={(e) => setFactoryForm({ ...factoryForm, name: e.target.value })}
                    placeholder="Nhà máy sản xuất linh kiện..."
                    className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Địa chỉ</label>
                  <input
                    type="text"
                    required
                    value={factoryForm.address}
                    onChange={(e) => setFactoryForm({ ...factoryForm, address: e.target.value })}
                    placeholder="Khu công nghiệp Biên Hòa..."
                    className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Mô tả</label>
                  <textarea
                    value={factoryForm.description}
                    onChange={(e) => setFactoryForm({ ...factoryForm, description: e.target.value })}
                    placeholder="Thông tin giới thiệu về nhà máy..."
                    rows={3}
                    className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 transition-colors resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Vĩ độ (GPS Lat)</label>
                    <input
                      type="number"
                      step="any"
                      value={factoryForm.latitude}
                      onChange={(e) => setFactoryForm({ ...factoryForm, latitude: e.target.value })}
                      placeholder="10.9577"
                      className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Kinh độ (GPS Lng)</label>
                    <input
                      type="number"
                      step="any"
                      value={factoryForm.longitude}
                      onChange={(e) => setFactoryForm({ ...factoryForm, longitude: e.target.value })}
                      placeholder="106.8426"
                      className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full mt-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm py-2.5 rounded-xl transition-all shadow-md shadow-indigo-100"
                >
                  Tạo Nhà Máy
                </button>
              </form>
            </div>
          )}

          {activeTab === 'zones' && (
            <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-sm">
              <h2 className="text-base font-extrabold text-slate-900 mb-4 uppercase tracking-tight">Thêm phân xưởng</h2>
              
              <div className="mb-4">
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Chọn nhà máy chủ</label>
                <select
                  value={selectedFactoryId}
                  onChange={(e) => setSelectedFactoryId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 transition-colors font-bold"
                >
                  <option value="">-- Chọn Nhà Máy --</option>
                  {factories.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>

              <form onSubmit={handleZoneSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Tên phân xưởng</label>
                  <input
                    type="text"
                    required
                    value={zoneForm.name}
                    onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })}
                    placeholder="Phân xưởng Lắp ráp A..."
                    className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Tầng / Tầng hầm (Floor)</label>
                  <input
                    type="number"
                    required
                    value={zoneForm.floorLevel}
                    onChange={(e) => setZoneForm({ ...zoneForm, floorLevel: e.target.value })}
                    className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 transition-colors font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Mô tả phân xưởng</label>
                  <textarea
                    value={zoneForm.description}
                    onChange={(e) => setZoneForm({ ...zoneForm, description: e.target.value })}
                    placeholder="Khu vực hoạt động và quản lý máy CNC..."
                    rows={3}
                    className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 transition-colors resize-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!selectedFactoryId}
                  className="w-full mt-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-sm py-2.5 rounded-xl transition-all shadow-md shadow-indigo-100"
                >
                  Tạo Phân Xưởng
                </button>
              </form>
            </div>
          )}

          {activeTab === 'assets' && (
            <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-sm">
              <h2 className="text-base font-extrabold text-slate-900 mb-4 uppercase tracking-tight">Tải lên mô hình / 360°</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Chọn nhà máy</label>
                  <select
                    value={selectedFactoryId}
                    onChange={(e) => setSelectedFactoryId(e.target.value ? Number(e.target.value) : '')}
                    className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 transition-colors font-bold"
                  >
                    <option value="">-- Chọn Nhà Máy --</option>
                    {factories.map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Chọn phân xưởng</label>
                  <select
                    value={selectedZoneId}
                    onChange={(e) => setSelectedZoneId(e.target.value ? Number(e.target.value) : '')}
                    disabled={!selectedFactoryId}
                    className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 transition-colors font-bold"
                  >
                    <option value="">-- Chọn Phân Xưởng --</option>
                    {zones.map(z => (
                      <option key={z.id} value={z.id}>{z.name} (Tầng {z.floorLevel})</option>
                    ))}
                  </select>
                </div>

                <form onSubmit={handleFileUpload} className="space-y-4 pt-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Loại tài sản tải lên</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setUploadType('3d-model')}
                        className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all ${
                          uploadType === '3d-model'
                            ? 'bg-indigo-50 text-indigo-600 border-indigo-200'
                            : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                        }`}
                      >
                        Mô hình 3D (.glb, .gltf)
                      </button>
                      <button
                        type="button"
                        onClick={() => setUploadType('360-photo')}
                        className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all ${
                          uploadType === '360-photo'
                            ? 'bg-indigo-50 text-indigo-600 border-indigo-200'
                            : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                        }`}
                      >
                        Ảnh Panorama 360°
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Chọn tệp tin</label>
                    <input
                      id="file-upload-input"
                      type="file"
                      required
                      accept={uploadType === '3d-model' ? '.glb,.gltf,.obj,.fbx' : 'image/*'}
                      onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                      className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100"
                    />
                  </div>

                  {uploadMessage.text && (
                    <div className={`p-3 rounded-xl text-xs font-medium border ${
                      uploadMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                      uploadMessage.type === 'info' ? 'bg-blue-50 text-blue-800 border-blue-200' :
                      'bg-red-50 text-red-800 border-red-200'
                    }`}>
                      {uploadMessage.text}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isUploading || !selectedZoneId || !uploadFile}
                    className="w-full mt-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-sm py-2.5 rounded-xl transition-all shadow-md shadow-indigo-100"
                  >
                    {isUploading ? 'Đang tải lên...' : 'Tải Lên Tài Sản'}
                  </button>
                </form>
              </div>
            </div>
          )}

          {activeTab === 'machines' && (
            <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-sm">
              <h2 className="text-base font-extrabold text-slate-900 mb-4 uppercase tracking-tight">Đăng ký thiết bị mới</h2>
              <form onSubmit={handleMachineSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Chọn Phân xưởng</label>
                  <div className="space-y-2">
                    <select
                      value={selectedFactoryId}
                      onChange={(e) => setSelectedFactoryId(e.target.value ? Number(e.target.value) : '')}
                      className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 transition-colors font-bold"
                    >
                      <option value="">-- Chọn Nhà Máy --</option>
                      {factories.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                    <select
                      value={selectedZoneId}
                      onChange={(e) => setSelectedZoneId(e.target.value ? Number(e.target.value) : '')}
                      disabled={!selectedFactoryId}
                      className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 transition-colors font-bold disabled:opacity-50"
                    >
                      <option value="">-- Chọn Phân Xưởng --</option>
                      {zones.map(z => (
                        <option key={z.id} value={z.id}>{z.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Mã thiết bị (Code)</label>
                  <input
                    type="text"
                    required
                    value={machineForm.code}
                    onChange={(e) => setMachineForm({ ...machineForm, code: e.target.value.toUpperCase() })}
                    placeholder="E.g. CNC-09"
                    className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Tên thiết bị</label>
                  <input
                    type="text"
                    required
                    value={machineForm.name}
                    onChange={(e) => setMachineForm({ ...machineForm, name: e.target.value })}
                    placeholder="E.g. Máy CNC Phay Alpha #9"
                    className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Loại máy</label>
                    <select
                      value={machineForm.type}
                      onChange={(e) => setMachineForm({ ...machineForm, type: e.target.value })}
                      className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 transition-colors font-bold"
                    >
                      <option value="CNC">CNC</option>
                      <option value="WELDING_ROBOT">ROBOT HÀN</option>
                      <option value="CONVEYOR">BĂNG TẢI</option>
                      <option value="PACKAGING">MÁY ĐÓNG GÓI</option>
                      <option value="OTHER">KHÁC</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Hãng sản xuất</label>
                    <input
                      type="text"
                      value={machineForm.manufacturer}
                      onChange={(e) => setMachineForm({ ...machineForm, manufacturer: e.target.value })}
                      placeholder="E.g. Fanuc"
                      className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">X (Tọa độ)</label>
                    <input
                      type="number"
                      step="0.1"
                      required
                      value={machineForm.positionX}
                      onChange={(e) => setMachineForm({ ...machineForm, positionX: e.target.value })}
                      className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Y (Chiều cao)</label>
                    <input
                      type="number"
                      step="0.1"
                      required
                      value={machineForm.positionY}
                      onChange={(e) => setMachineForm({ ...machineForm, positionY: e.target.value })}
                      className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Z (Tọa độ)</label>
                    <input
                      type="number"
                      step="0.1"
                      required
                      value={machineForm.positionZ}
                      onChange={(e) => setMachineForm({ ...machineForm, positionZ: e.target.value })}
                      className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={!selectedZoneId}
                  className="w-full mt-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-sm py-2.5 rounded-xl transition-all shadow-md shadow-indigo-100"
                >
                  Đăng ký thiết bị
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Right List Section */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-sm min-h-[400px]">
            <h2 className="text-base font-extrabold text-slate-900 mb-4 uppercase tracking-tight">
              {activeTab === 'factories' && 'Danh sách các nhà máy'}
              {activeTab === 'zones' && `Các phân xưởng của nhà máy`}
              {activeTab === 'assets' && `Tài sản 3D & 360° của phân xưởng`}
              {activeTab === 'machines' && `Danh sách thiết bị của phân xưởng`}
            </h2>

            {/* List Factories */}
            {activeTab === 'factories' && (
              <div className="space-y-4">
                {factories.length === 0 ? (
                  <p className="text-slate-400 text-sm">Chưa có nhà máy nào được cấu hình trong hệ thống.</p>
                ) : (
                  factories.map((factory) => (
                    <div key={factory.id} className="border border-slate-100 bg-slate-50/50 p-4 rounded-2xl flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                      <div>
                        <h3 className="font-extrabold text-slate-900 text-sm">{factory.name}</h3>
                        <p className="text-slate-500 text-xs mt-1">Địa chỉ: {factory.address}</p>
                        {factory.description && <p className="text-slate-400 text-xs mt-1.5">{factory.description}</p>}
                        {(factory.latitude || factory.longitude) && (
                          <span className="inline-block mt-2 font-mono text-[10px] text-slate-400 bg-slate-200/50 px-2 py-0.5 rounded-md">
                            GPS: {factory.latitude || '--'}, {factory.longitude || '--'}
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-mono text-slate-400 bg-white border px-3 py-1 rounded-xl self-start sm:self-center">
                        ID: {factory.id}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* List Zones */}
            {activeTab === 'zones' && (
              <div className="space-y-4">
                {!selectedFactoryId ? (
                  <p className="text-slate-400 text-sm">Vui lòng chọn một nhà máy ở ô bên trái để hiển thị danh sách các phân xưởng.</p>
                ) : zones.length === 0 ? (
                  <p className="text-slate-400 text-sm">Nhà máy này chưa có phân xưởng nào. Hãy nhập thông tin bên trái để tạo mới!</p>
                ) : (
                  zones.map((zone) => (
                    <div key={zone.id} className="border border-slate-100 bg-slate-50/50 p-4 rounded-2xl flex justify-between items-center gap-4">
                      <div>
                        <h3 className="font-extrabold text-slate-900 text-sm">{zone.name}</h3>
                        <span className="inline-block mt-1 font-bold text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full uppercase tracking-wider">
                          Tầng {zone.floorLevel}
                        </span>
                        {zone.description && <p className="text-slate-400 text-xs mt-1.5">{zone.description}</p>}
                      </div>
                      <div className="text-xs font-mono text-slate-400 bg-white border px-3 py-1 rounded-xl">
                        ID: {zone.id}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* List Assets (TwinModels) */}
            {activeTab === 'assets' && (
              <div className="space-y-4">
                {!selectedZoneId ? (
                  <p className="text-slate-400 text-sm">Vui lòng chọn một phân xưởng ở bên trái để xem các tài nguyên 3D và 360°.</p>
                ) : assets.length === 0 ? (
                  <p className="text-slate-400 text-sm">Phân xưởng này chưa có tài sản 3D hay hình ảnh 360° nào được cấu hình.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {assets.map((asset) => (
                      <div key={asset.id} className="border border-slate-155 bg-slate-50/80 p-4 rounded-2xl flex flex-col justify-between gap-3 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-3">
                          <button
                            onClick={() => handleDeleteAsset(asset.id)}
                            className="bg-red-50 hover:bg-red-100 text-red-600 p-2 rounded-xl text-xs transition-colors"
                            title="Xóa tài sản này"
                          >
                            ✕ Xóa
                          </button>
                        </div>
                        <div>
                          <span className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded-full border mb-2 uppercase tracking-wide ${
                            asset.modelType === 'THREE_D_MODEL'
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-100'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                          }`}>
                            {asset.modelType === 'THREE_D_MODEL' ? 'Mesh 3D' : 'Ảnh 360°'}
                          </span>
                          <h3 className="font-extrabold text-slate-800 text-xs mt-1 truncate pr-16" title={asset.fileUrl.split('/').pop()}>
                            Tệp: {asset.fileUrl.split('/').pop() || 'Unknown File'}
                          </h3>
                          <p className="text-[10px] text-slate-400 mt-1 font-mono break-all leading-normal">
                            Đường dẫn: {asset.fileUrl}
                          </p>
                        </div>

                        <div className="border-t border-slate-200/50 pt-2 flex items-center justify-between text-[10px] text-slate-400">
                          <span>Phiên bản: {asset.version}</span>
                          <span>{new Date(asset.uploadedAt).toLocaleDateString('vi-VN')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* List Machines */}
            {activeTab === 'machines' && (
              <div className="space-y-4">
                {!selectedZoneId ? (
                  <p className="text-slate-400 text-sm">Vui lòng chọn một phân xưởng ở bên trái để xem các thiết bị.</p>
                ) : machines.length === 0 ? (
                  <p className="text-slate-400 text-sm">Phân xưởng này chưa có máy móc hay thiết bị nào được đăng ký.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {machines.map((m) => (
                      <div key={m.id} className="border border-slate-200 bg-slate-50/50 p-4 rounded-2xl flex flex-col justify-between gap-3 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-3">
                          <button
                            onClick={() => handleMachineDelete(m.id)}
                            className="bg-red-50 hover:bg-red-100 text-red-600 p-2 rounded-xl text-xs transition-colors"
                            title="Xóa thiết bị này"
                          >
                            ✕ Xóa
                          </button>
                        </div>
                        <div>
                          <span className="inline-block text-[9px] font-bold px-2 py-0.5 rounded-full border mb-2 uppercase tracking-wide bg-indigo-50 text-indigo-700 border-indigo-100">
                            {m.type}
                          </span>
                          <h3 className="font-extrabold text-slate-800 text-sm pr-16 truncate">
                            {m.name} ({m.code})
                          </h3>
                          <p className="text-slate-500 text-xs mt-1">
                            Hãng: {m.manufacturer || 'Chưa rõ'}
                          </p>
                          <p className="text-slate-400 text-[10px] mt-0.5 font-mono">
                            Tọa độ: X={m.positionX}, Y={m.positionY}, Z={m.positionZ}
                          </p>
                        </div>

                        <div className="border-t border-slate-200/50 pt-2 flex items-center justify-between text-[10px] text-slate-400">
                          <span>Trạng thái: {m.status}</span>
                          <span>ID: {m.id}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
