import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, authenticate, authorize } from '../middleware/auth';

export const maintenanceScheduleRouter = Router();
maintenanceScheduleRouter.use(authenticate);

const serialize = (obj: any): any => JSON.parse(JSON.stringify(obj, (_k, v) => typeof v === 'bigint' ? Number(v) : v));

// GET /api/maintenance-schedules - Lấy tất cả lịch bảo trì định kỳ
maintenanceScheduleRouter.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { machineId, status } = req.query;
    const where: any = {};
    
    if (machineId) where.machineId = BigInt(String(machineId));
    if (status) where.status = String(status);

    const schedules = await prisma.maintenanceSchedule.findMany({
      where,
      include: {
        machine: { include: { zone: true } },
      },
      orderBy: { nextDueDate: 'asc' },
    });

    res.json({ success: true, data: serialize(schedules) });
  } catch (err) {
    console.error('[MaintenanceSchedule] GET error:', err);
    res.status(500).json({ success: false, error: 'Lỗi khi lấy lịch bảo trì' });
  }
});

// GET /api/maintenance-schedules/:id
maintenanceScheduleRouter.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const schedule = await prisma.maintenanceSchedule.findUnique({
      where: { id: BigInt(req.params.id) },
      include: {
        machine: { include: { zone: true } },
      },
    });

    if (!schedule) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy lịch bảo trì' });
    }

    res.json({ success: true, data: serialize(schedule) });
  } catch (err) {
    console.error('[MaintenanceSchedule] GET by ID error:', err);
    res.status(500).json({ success: false, error: 'Lỗi khi lấy chi tiết lịch bảo trì' });
  }
});

// POST /api/maintenance-schedules - Tạo lịch bảo trì định kỳ mới (Admin, Technician)
maintenanceScheduleRouter.post('/', authorize('ADMIN', 'TECHNICIAN'), async (req: AuthRequest, res: Response) => {
  try {
    const {
      machineId,
      description,
      maintenanceType,
      frequencyDays,
      nextDueDate,
      assignedTechnicianId,
    } = req.body;

    if (!machineId || !maintenanceType || !frequencyDays || !nextDueDate) {
      return res.status(400).json({
        success: false,
        error: 'machineId, maintenanceType, frequencyDays, nextDueDate là bắt buộc',
      });
    }

    const schedule = await prisma.maintenanceSchedule.create({
      data: {
        machineId: BigInt(machineId),
        description: description || null,
        maintenanceType,
        frequencyDays: Number(frequencyDays),
        nextDueDate: new Date(nextDueDate),
        assignedTechnicianId: assignedTechnicianId ? BigInt(assignedTechnicianId) : req.user!.id,
        status: 'ACTIVE',
      },
    });

    // Ghi log activity
    await prisma.machineActivityLog.create({
      data: {
        machineId: BigInt(machineId),
        eventType: 'MAINTENANCE',
        description: `Lịch bảo trì định kỳ mới được tạo: ${schedule.id} (mỗi ${frequencyDays} ngày)`,
        createdAt: new Date(),
      },
    });

    res.status(201).json({ success: true, data: serialize(schedule) });
  } catch (err) {
    console.error('[MaintenanceSchedule] POST error:', err);
    res.status(500).json({ success: false, error: 'Lỗi khi tạo lịch bảo trì' });
  }
});

// PUT /api/maintenance-schedules/:id - Cập nhật lịch bảo trì (Admin, Technician)
maintenanceScheduleRouter.put('/:id', authorize('ADMIN', 'TECHNICIAN'), async (req: AuthRequest, res: Response) => {
  try {
    const scheduleId = BigInt(req.params.id);
    const {
      description,
      maintenanceType,
      frequencyDays,
      nextDueDate,
      status,
      assignedTechnicianId,
    } = req.body;

    const updateData: any = {};
    if (description !== undefined) updateData.description = description;
    if (maintenanceType !== undefined) updateData.maintenanceType = maintenanceType;
    if (frequencyDays !== undefined) updateData.frequencyDays = Number(frequencyDays);
    if (nextDueDate !== undefined) updateData.nextDueDate = new Date(nextDueDate);
    if (status !== undefined) updateData.status = status;
    if (assignedTechnicianId !== undefined) updateData.assignedTechnicianId = BigInt(assignedTechnicianId);

    const schedule = await prisma.maintenanceSchedule.update({
      where: { id: scheduleId },
      data: updateData,
    });

    res.json({ success: true, data: serialize(schedule) });
  } catch (err) {
    console.error('[MaintenanceSchedule] PUT error:', err);
    res.status(500).json({ success: false, error: 'Lỗi khi cập nhật lịch bảo trì' });
  }
});

// POST /api/maintenance-schedules/:id/complete - Đánh dấu hoàn thành + tính nextDueDate tiếp theo
maintenanceScheduleRouter.post('/:id/complete', authorize('ADMIN', 'TECHNICIAN'), async (req: AuthRequest, res: Response) => {
  try {
    const scheduleId = BigInt(req.params.id);
    const { notes } = req.body;

    const schedule = await prisma.maintenanceSchedule.findUnique({
      where: { id: scheduleId },
    });

    if (!schedule) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy lịch bảo trì' });
    }

    // Tính nextDueDate mới
    const newNextDueDate = new Date(schedule.nextDueDate);
    newNextDueDate.setDate(newNextDueDate.getDate() + schedule.frequencyDays);

    const updatedSchedule = await prisma.maintenanceSchedule.update({
      where: { id: scheduleId },
      data: {
        nextDueDate: newNextDueDate,
      },
    });

    // Ghi log activity
    await prisma.machineActivityLog.create({
      data: {
        machineId: schedule.machineId,
        eventType: 'MAINTENANCE',
        description: `Hoàn thành bảo trì định kỳ: ${schedule.id}. Ghi chú: ${notes || 'Không có'}. Lịch tiếp theo: ${newNextDueDate.toISOString()}`,
        createdAt: new Date(),
      },
    });

    res.json({ success: true, data: serialize(updatedSchedule) });
  } catch (err) {
    console.error('[MaintenanceSchedule] Complete error:', err);
    res.status(500).json({ success: false, error: 'Lỗi khi hoàn thành bảo trì' });
  }
});

// DELETE /api/maintenance-schedules/:id - Xóa lịch bảo trì (Admin only)
maintenanceScheduleRouter.delete('/:id', authorize('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const scheduleId = BigInt(req.params.id);
    await prisma.maintenanceSchedule.delete({
      where: { id: scheduleId },
    });

    res.json({ success: true, message: 'Đã xóa lịch bảo trì' });
  } catch (err) {
    console.error('[MaintenanceSchedule] DELETE error:', err);
    res.status(500).json({ success: false, error: 'Lỗi khi xóa lịch bảo trì' });
  }
});