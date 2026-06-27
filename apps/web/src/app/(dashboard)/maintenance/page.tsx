'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface Technician {
  id: number;
  fullName: string;
  role: string;
}

interface Machine {
  id: number;
  code: string;
  name: string;
}

interface MaintenanceSchedule {
  id: number;
  machineId: number;
  maintenanceType: 'PREVENTIVE' | 'CORRECTIVE';
  frequencyDays: number;
  nextDueDate: string;
  assignedTechnicianId: number;
  status: string;
  description: string | null;
  machine?: Machine;
  technician?: { fullName: string };
}

const API_URL = typeof window !== 'undefined' 
  ? `${window.location.origin}/api` 
  : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api');

export default function MaintenancePage() {
  const { user } = useAuth();
  const [schedules, setSchedules] = useState<MaintenanceSchedule[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState<number | null>(null);

  // Form states
  const [createFormData, setCreateFormData] = useState({
    machineId: '',
    maintenanceType: 'PREVENTIVE',
    frequencyDays: '30',
    nextDueDate: '',
    assignedTechnicianId: '',
    description: '',
  });

  const [completeNotes, setCompleteNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      const [schedulesRes, machinesRes] = await Promise.all([
        fetch(`${API_URL}/maintenance-schedules`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_URL}/machines`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (schedulesRes.ok) {
        const schedData = await schedulesRes.json();
        setSchedules(schedData.data || []);
      }
      if (machinesRes.ok) {
        const machData = await machinesRes.json();
        setMachines(machData.data || []);
      }

      // If user is admin, fetch user list to select technicians
      if (user?.role === 'ADMIN') {
        const usersRes = await fetch(`${API_URL}/users`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (usersRes.ok) {
          const usersData = await usersRes.json();
          const techList = (usersData.data || []).filter(
            (u: any) => u.role === 'TECHNICIAN' || u.role === 'ADMIN'
          );
          setTechnicians(techList);
        }
      }
    } catch (err) {
      console.error('Error fetching maintenance data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createFormData.machineId || !createFormData.nextDueDate) {
      alert('Vui lòng điền đầy đủ các thông tin bắt buộc!');
      return;
    }
    setSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/maintenance-schedules`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          machineId: createFormData.machineId,
          maintenanceType: createFormData.maintenanceType,
          frequencyDays: createFormData.frequencyDays,
          nextDueDate: createFormData.nextDueDate,
          assignedTechnicianId: createFormData.assignedTechnicianId || undefined,
          description: createFormData.description,
        }),
      });

      if (res.ok) {
        setShowCreateModal(false);
        setCreateFormData({
          machineId: '',
          maintenanceType: 'PREVENTIVE',
          frequencyDays: '30',
          nextDueDate: '',
          assignedTechnicianId: '',
          description: '',
        });
        fetchData();
      } else {
        const data = await res.json();
        alert(`Lỗi: ${data.error || 'Không thể tạo lịch bảo trì'}`);
      }
    } catch (err) {
      console.error(err);
      alert('Lỗi kết nối máy chủ!');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showCompleteModal) return;
    setSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/maintenance-schedules/${showCompleteModal}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ notes: completeNotes }),
      });

      if (res.ok) {
        setShowCompleteModal(null);
        setCompleteNotes('');
        fetchData();
        alert('Đã xác nhận hoàn thành bảo trì định kỳ!');
      } else {
        const data = await res.json();
        alert(`Lỗi: ${data.error || 'Không thể cập nhật trạng thái'}`);
      }
    } catch (err) {
      console.error(err);
      alert('Lỗi kết nối máy chủ!');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa lịch bảo trì này không?')) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/maintenance-schedules/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        fetchData();
      } else {
        const data = await res.json();
        alert(`Lỗi: ${data.error || 'Không thể xóa'}`);
      }
    } catch (err) {
      console.error(err);
      alert('Lỗi kết nối máy chủ!');
    }
  };

  const isTodayOrOverdue = (dateStr: string) => {
    const due = new Date(dateStr);
    due.setHours(0,0,0,0);
    const today = new Date();
    today.setHours(0,0,0,0);
    return due <= today;
  };

  const getStatusColor = (status: string, nextDueDate: string) => {
    if (status === 'COMPLETED') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (isTodayOrOverdue(nextDueDate)) return 'bg-red-50 text-red-700 border-red-200 animate-pulse';
    return 'bg-amber-50 text-amber-700 border-amber-200';
  };

  const getStatusLabel = (status: string, nextDueDate: string) => {
    if (status === 'COMPLETED') return 'Hoàn thành';
    if (isTodayOrOverdue(nextDueDate)) return 'Đến hạn / Trễ';
    return 'Đang lập lịch';
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const canManage = user?.role === 'ADMIN' || user?.role === 'TECHNICIAN';

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64 text-slate-700">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="font-mono text-xs uppercase tracking-[0.1em] text-slate-400">Đang tải lịch bảo trì...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xl shadow-slate-100/50 p-6 text-slate-800">
      <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-5">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 leading-tight">Lịch bảo trì định kỳ</h1>
          <p className="text-slate-400 text-xs mt-1">Lên kế hoạch bảo trì phòng ngừa và kiểm tra định kỳ thiết bị nhà máy</p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-2xl text-xs font-bold transition-all shadow-md shadow-indigo-150 flex items-center gap-1.5"
          >
            <span>+</span> Thiết lập lịch mới
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-5 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-[0.1em]">Mã lịch</th>
                <th className="px-5 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-[0.1em]">Thiết bị</th>
                <th className="px-5 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-[0.1em]">Hình thức</th>
                <th className="px-5 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-[0.1em]">Tần suất</th>
                <th className="px-5 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-[0.1em]">Ngày bảo trì tiếp theo</th>
                <th className="px-5 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-[0.1em]">Người phụ trách</th>
                <th className="px-5 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-[0.1em]">Trạng thái</th>
                {canManage && <th className="px-5 py-4 text-center text-[10px] font-bold text-slate-400 uppercase tracking-[0.1em]">Hành động</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {schedules.length > 0 ? (
                schedules.map((schedule) => (
                  <tr key={schedule.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-4 font-mono text-xs text-slate-400">#{schedule.id}</td>
                    <td className="px-5 py-4 text-xs font-semibold text-slate-800">
                      <div>{schedule.machine?.name || '-'}</div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">{schedule.machine?.code}</div>
                    </td>
                    <td className="px-5 py-4 text-xs">
                      <span className={`whitespace-nowrap px-2.5 py-1 rounded-xl text-[9px] font-bold border ${
                        schedule.maintenanceType === 'PREVENTIVE' 
                          ? 'bg-blue-50 text-blue-700 border-blue-150' 
                          : 'bg-orange-50 text-orange-700 border-orange-150'
                      }`}>
                        {schedule.maintenanceType === 'PREVENTIVE' ? 'Phòng ngừa (Định kỳ)' : 'Khắc phục sự cố'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-xs font-medium text-slate-600">
                      Mỗi {schedule.frequencyDays} ngày
                    </td>
                    <td className="px-5 py-4 text-xs font-mono font-bold text-slate-700">
                      {formatDate(schedule.nextDueDate)}
                    </td>
                    <td className="px-5 py-4 text-xs font-medium text-slate-650">
                      {schedule.technician?.fullName || 'Chưa phân công'}
                    </td>
                    <td className="px-5 py-4 text-xs">
                      <span className={`whitespace-nowrap px-2.5 py-1 rounded-xl text-[9px] font-bold border ${getStatusColor(schedule.status, schedule.nextDueDate)}`}>
                        {getStatusLabel(schedule.status, schedule.nextDueDate)}
                      </span>
                    </td>
                    {canManage && (
                      <td className="px-5 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => setShowCompleteModal(schedule.id)}
                            className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all"
                          >
                            Hoàn thành
                          </button>
                          {user?.role === 'ADMIN' && (
                            <button
                              onClick={() => handleDelete(schedule.id)}
                              className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all"
                            >
                              Xóa
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={canManage ? 8 : 7} className="px-5 py-12 text-center text-xs text-slate-400 bg-slate-50/50">
                    Không có lịch bảo trì định kỳ nào được lên kế hoạch.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Lập lịch bảo trì mới */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200 text-slate-800">
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-extrabold text-slate-900 text-base">Thiết lập lịch bảo trì mới</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600 p-1">✕</button>
            </div>
            
            <form onSubmit={handleCreateSubmit} className="space-y-4 text-left">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-1.5">Thiết bị bảo trì *</label>
                <select 
                  required
                  value={createFormData.machineId}
                  onChange={(e) => setCreateFormData(prev => ({ ...prev, machineId: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white px-4 py-3 rounded-2xl text-xs outline-none transition-all cursor-pointer font-medium"
                >
                  <option value="">-- Chọn thiết bị --</option>
                  {machines.map(m => (
                    <option key={m.id} value={m.id}>{m.name} ({m.code})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-1.5">Hình thức bảo trì *</label>
                  <select 
                    value={createFormData.maintenanceType}
                    onChange={(e) => setCreateFormData(prev => ({ ...prev, maintenanceType: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white px-4 py-3 rounded-2xl text-xs outline-none transition-all cursor-pointer font-medium"
                  >
                    <option value="PREVENTIVE">Phòng ngừa (Định kỳ)</option>
                    <option value="CORRECTIVE">Khắc phục sự cố</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-1.5">Tần suất (ngày) *</label>
                  <input 
                    type="number"
                    required
                    min="1"
                    value={createFormData.frequencyDays}
                    onChange={(e) => setCreateFormData(prev => ({ ...prev, frequencyDays: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white px-4 py-3 rounded-2xl text-xs outline-none transition-all font-medium font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-1.5">Ngày thực hiện kế tiếp *</label>
                <input 
                  type="date"
                  required
                  value={createFormData.nextDueDate}
                  onChange={(e) => setCreateFormData(prev => ({ ...prev, nextDueDate: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white px-4 py-3 rounded-2xl text-xs outline-none transition-all font-medium font-mono"
                />
              </div>

              {user?.role === 'ADMIN' && (
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-1.5">Người chịu trách nhiệm chính</label>
                  <select 
                    value={createFormData.assignedTechnicianId}
                    onChange={(e) => setCreateFormData(prev => ({ ...prev, assignedTechnicianId: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white px-4 py-3 rounded-2xl text-xs outline-none transition-all cursor-pointer font-medium"
                  >
                    <option value="">-- Bản thân --</option>
                    {technicians.map(t => (
                      <option key={t.id} value={t.id}>{t.fullName} ({t.role})</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-1.5">Mô tả chi tiết / Ghi chú</label>
                <textarea 
                  value={createFormData.description}
                  onChange={(e) => setCreateFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Ghi chú các công việc cần kiểm tra cụ thể..."
                  rows={3}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white px-4 py-3 rounded-2xl text-xs outline-none transition-all resize-none font-medium"
                />
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
                  disabled={submitting}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold py-2.5 rounded-2xl text-xs transition-all shadow-md shadow-indigo-100"
                >
                  {submitting ? 'Đang tạo...' : 'Lưu lại'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal hoàn thành bảo trì */}
      {showCompleteModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 text-slate-800">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-extrabold text-slate-900 text-base">Xác nhận hoàn thành bảo trì</h3>
              <button onClick={() => setShowCompleteModal(null)} className="text-slate-400 hover:text-slate-650 p-1">✕</button>
            </div>
            
            <form onSubmit={handleCompleteSubmit} className="space-y-4 text-left">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-1.5">Ghi chú bảo dưỡng thực tế *</label>
                <textarea 
                  required
                  value={completeNotes}
                  onChange={(e) => setCompleteNotes(e.target.value)}
                  placeholder="Ví dụ: Đã kiểm tra động cơ, tra thêm dầu nhớt bôi trơn và thay thế gioăng cao su cũ..."
                  rows={4}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white px-4 py-3 rounded-2xl text-xs outline-none transition-all resize-none font-medium"
                />
                <p className="text-[10px] text-slate-400 mt-2">
                  * Hệ thống sẽ tự động dời lịch bảo trì tiếp theo dựa trên chu kỳ tần suất của lịch ban đầu.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  type="button" 
                  onClick={() => setShowCompleteModal(null)}
                  className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-500 font-bold py-2.5 rounded-2xl text-xs transition-all"
                >
                  Đóng
                </button>
                <button 
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-bold py-2.5 rounded-2xl text-xs transition-all shadow-md shadow-emerald-100"
                >
                  {submitting ? 'Đang gửi...' : 'Xác nhận'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
