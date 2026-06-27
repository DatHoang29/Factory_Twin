import { Router, Request, Response } from 'express';
import { AuthRequest, authenticate, authorize } from '../middleware/auth';
import { prisma } from '../lib/prisma';

export const ticketRouter = Router();
ticketRouter.use(authenticate);

const serialize = (obj: any): any => JSON.parse(JSON.stringify(obj, (_k, v) => typeof v === 'bigint' ? Number(v) : v));

// GET /api/tickets
ticketRouter.get('/', authorize('ADMIN', 'TECHNICIAN', 'OPERATOR', 'VIEWER'), async (req: Request, res: Response) => {
  try {
    const where: any = {};
    if (req.query.machineId) {
      where.machineId = BigInt(req.query.machineId as string);
    }

    const tickets = await prisma.maintenanceTicket.findMany({
      where,
      include: {
        machine: true,
        reporter: { select: { id: true, fullName: true, role: true } },
        assignee: { select: { id: true, fullName: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: serialize(tickets) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Lỗi máy chủ' });
  }
});

// POST /api/tickets
ticketRouter.post('/', authorize('ADMIN', 'TECHNICIAN', 'OPERATOR'), async (req: AuthRequest, res: Response) => {
  try {
    const { machineId, machine_id, title, description, priority } = req.body;
    const rawMachineId = machineId !== undefined ? machineId : machine_id;
    if (!rawMachineId) {
      res.status(400).json({ success: false, error: 'Thiếu machineId/machine_id' });
      return;
    }

    const mId = BigInt(rawMachineId);

    const ticket = await prisma.maintenanceTicket.create({
      data: {
        machineId: mId,
        reportedBy: BigInt(req.user!.userId),
        title,
        description,
        priority: priority || 'MEDIUM',
        status: 'OPEN',
      },
    });

    // Write machine activity log
    await prisma.machineActivityLog.create({
      data: {
        machineId: mId,
        relatedTicketId: ticket.id,
        eventType: 'MAINTENANCE',
        description: `Phiếu yêu cầu sửa chữa mới được tạo: ${title}`,
      },
    });

    res.status(201).json({ success: true, data: serialize(ticket) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Lỗi máy chủ' });
  }
});

const updateTicketHandler = async (req: Request, res: Response) => {
  try {
    const { assignedTo, status, resolution_notes, resolutionNotes } = req.body;
    const finalResolutionNotes = resolutionNotes !== undefined ? resolutionNotes : resolution_notes;
    const ticketId = BigInt(req.params.id);

    const oldTicket = await prisma.maintenanceTicket.findUnique({ where: { id: ticketId } });
    if (!oldTicket) {
      res.status(404).json({ success: false, error: 'Không tìm thấy phiếu yêu cầu' });
      return;
    }

    const updatedData: any = {};
    if (assignedTo !== undefined) updatedData.assignedTo = assignedTo ? BigInt(assignedTo) : null;
    if (status !== undefined) {
      updatedData.status = status;
      if (status === 'RESOLVED' || status === 'CLOSED') {
        updatedData.resolvedAt = new Date();
      }
    }
    if (finalResolutionNotes !== undefined) updatedData.resolutionNotes = finalResolutionNotes;

    const ticket = await prisma.maintenanceTicket.update({
      where: { id: ticketId },
      data: updatedData,
    });

    // Write activity log if status changed
    if (status && status !== oldTicket.status) {
      await prisma.machineActivityLog.create({
        data: {
          machineId: ticket.machineId,
          relatedTicketId: ticket.id,
          eventType: 'STATUS_CHANGE',
          description: `Trạng thái phiếu sửa chữa cập nhật thành: ${status}. Ghi chú: ${finalResolutionNotes || ''}`,
        },
      });

      // Update machine status based on ticket status if appropriate
      if (status === 'IN_PROGRESS') {
        await prisma.machine.update({
          where: { id: ticket.machineId },
          data: { status: 'MAINTENANCE' },
        });
      } else if (status === 'RESOLVED' || status === 'CLOSED') {
        await prisma.machine.update({
          where: { id: ticket.machineId },
          data: { status: 'RUNNING' },
        });
      }
    }

    res.json({ success: true, data: serialize(ticket) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Lỗi máy chủ' });
  }
};

// Map both PUT and PATCH to the same handler
ticketRouter.put('/:id', authorize('ADMIN', 'TECHNICIAN'), updateTicketHandler);
ticketRouter.patch('/:id', authorize('ADMIN', 'TECHNICIAN'), updateTicketHandler);