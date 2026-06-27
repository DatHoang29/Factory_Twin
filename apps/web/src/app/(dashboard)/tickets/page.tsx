'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface Ticket {
  id: number;
  title: string;
  description: string;
  priority: string;
  status: string;
  machine?: { name: string; code: string };
  reported_by?: { full_name: string };
  assigned_to?: { full_name: string } | null;
  created_at: string;
  resolved_at: string | null;
}

interface Machine {
  id: number;
  code: string;
  name: string;
}

const API_URL = typeof window !== 'undefined' 
  ? `${window.location.origin}/api` 
  : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api');

export default function TicketsPage() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    machine_id: '',
    title: '',
    description: '',
    priority: 'MEDIUM',
  });

  useEffect(() => {
    fetchData();
    // Pre-fill machine_id and open modal if query parameter exists
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const mId = params.get('machineId');
      if (mId) {
        setFormData(prev => ({ ...prev, machine_id: mId }));
        setShowModal(true);
      }
    }
  }, []);

  const fetchData = async () => {
    try {
      const [ticketsRes, machinesRes] = await Promise.all([
        fetch(`${API_URL}/tickets`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        }),
        fetch(`${API_URL}/machines`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        }),
      ]);

      if (ticketsRes.ok) {
        const ticketsData = await ticketsRes.json();
        setTickets(ticketsData.data || []);
      }
      if (machinesRes.ok) {
        const machinesData = await machinesRes.json();
        setMachines(machinesData.data || []);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setShowModal(false);
        setFormData({ machine_id: '', title: '', description: '', priority: 'MEDIUM' });
        fetchData();
      }
    } catch (err) {
      console.error('Error creating ticket:', err);
    }
  };

  const updateTicketStatus = async (ticketId: number, status: string) => {
    try {
      const res = await fetch(`${API_URL}/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ status }),
      });

      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error('Error updating ticket:', err);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'CRITICAL': return 'bg-red-100 text-red-800';
      case 'HIGH': return 'bg-orange-100 text-orange-800';
      case 'MEDIUM': return 'bg-yellow-100 text-yellow-800';
      case 'LOW': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN': return 'bg-gray-100 text-gray-800';
      case 'IN_PROGRESS': return 'bg-blue-100 text-blue-800';
      case 'RESOLVED': return 'bg-green-100 text-green-800';
      case 'CLOSED': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const canCreateTicket = user?.role === 'OPERATOR' || user?.role === 'ADMIN';
  const canUpdateTicket = user?.role === 'TECHNICIAN' || user?.role === 'ADMIN';

  if (loading) {
    return <div className="flex justify-center items-center h-64">Đang tải...</div>;
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Phiếu bảo trì</h1>
        {canCreateTicket && (
          <button
            onClick={() => setShowModal(true)}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            + Tạo phiếu mới
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Mã phiếu</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Máy</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Tiêu đề</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Ưu tiên</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Trạng thái</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Người phụ trách</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Hành động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {tickets.map(ticket => (
              <tr key={ticket.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-sm">#{ticket.id}</td>
                <td className="px-4 py-3 text-sm">
                  <div>{ticket.machine?.name || '-'}</div>
                  <div className="text-gray-500 text-xs">{ticket.machine?.code}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium">{ticket.title}</div>
                  <div className="text-gray-500 text-xs truncate max-w-xs">{ticket.description}</div>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${getPriorityColor(ticket.priority)}`}>
                    {ticket.priority}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(ticket.status)}`}>
                    {ticket.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm">{ticket.assigned_to?.full_name || 'Chưa phân công'}</td>
                <td className="px-4 py-3">
                  {canUpdateTicket && ticket.status !== 'CLOSED' && (
                    <select
                      value={ticket.status}
                      onChange={(e) => updateTicketStatus(ticket.id, e.target.value)}
                      className="text-sm border rounded px-2 py-1"
                    >
                      <option value="OPEN">Mở</option>
                      <option value="IN_PROGRESS">Đang xử lý</option>
                      <option value="RESOLVED">Đã giải quyết</option>
                      <option value="CLOSED">Đóng</option>
                    </select>
                  )}
                </td>
              </tr>
            ))}
            {tickets.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  Không có phiếu bảo trì nào
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>

      {/* Create Ticket Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4">Tạo phiếu bảo trì mới</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Máy</label>
                <select
                  required
                  value={formData.machine_id}
                  onChange={(e) => setFormData({ ...formData, machine_id: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="">Chọn máy</option>
                  {machines.map(m => (
                    <option key={m.id} value={m.id}>{m.code} - {m.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tiêu đề</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  placeholder="Mô tả ngắn gọn sự cố"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả chi tiết</label>
                <textarea
                  required
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  rows={3}
                  placeholder="Mô tả chi tiết sự cố"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mức ưu tiên</label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="LOW">Thấp</option>
                  <option value="MEDIUM">Trung bình</option>
                  <option value="HIGH">Cao</option>
                  <option value="CRITICAL">Nghiêm trọng</option>
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border rounded hover:bg-gray-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  Tạo phiếu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}