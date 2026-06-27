import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, authenticate, authorize } from '../middleware/auth';

export const alertRouter = Router();
alertRouter.use(authenticate);

const serialize = (obj: any): any => JSON.parse(JSON.stringify(obj, (_k, v) => typeof v === 'bigint' ? Number(v) : v));

// GET /api/alerts
alertRouter.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const where: any = {};
    if (req.query.zoneId) {
      where.machine = { zoneId: BigInt(req.query.zoneId as string) };
    } else if (req.query.factoryId) {
      where.machine = { zone: { factoryId: BigInt(req.query.factoryId as string) } };
    }

    const alerts = await prisma.alert.findMany({
      where,
      include: { machine: true, sensor: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ success: true, data: serialize(alerts) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Lỗi máy chủ' });
  }
});

// POST /api/alerts/:id/acknowledge (Admin, Technician, Operator có thể acknowledge)
alertRouter.post('/:id/acknowledge', authorize('ADMIN', 'TECHNICIAN', 'OPERATOR'), async (req: AuthRequest, res: Response) => {
  try {
    const alertId = BigInt(req.params.id);
    const userId = BigInt(req.user!.userId);

    const alert = await prisma.alert.update({
      where: { id: alertId },
      data: {
        status: 'ACKNOWLEDGED',
        acknowledgedBy: userId,
      },
    });

    res.json({ success: true, data: serialize(alert) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Lỗi máy chủ' });
  }
});

// POST /api/alerts/:id/resolve (Admin, Technician có thể resolve)
alertRouter.post('/:id/resolve', authorize('ADMIN', 'TECHNICIAN'), async (req: AuthRequest, res: Response) => {
  try {
    const alertId = BigInt(req.params.id);
    const alert = await prisma.alert.update({
      where: { id: alertId },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
      },
      include: {
        machine: {
          include: { zone: true }
        }
      }
    });

    // Check if there are other open critical alerts for this machine
    const otherOpenCritical = await prisma.alert.findFirst({
      where: {
        machineId: alert.machineId,
        status: 'OPEN',
        severity: 'CRITICAL',
      },
    });

    if (!otherOpenCritical && alert.machine.status === 'ERROR') {
      // Update machine status back to RUNNING
      await prisma.machine.update({
        where: { id: alert.machineId },
        data: { status: 'RUNNING' },
      });

      const { redisPub } = require('../lib/redis');
      // Publish status change to Redis so WebSocket server broadcasts it to the UI
      await redisPub.publish(
        'machine_status_change',
        JSON.stringify(serialize({
          machineId: alert.machineId,
          status: 'RUNNING',
          factoryId: alert.machine.zone.factoryId,
          zoneId: alert.machine.zoneId,
        }))
      );
    }

    res.json({ success: true, data: serialize(alert) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Lỗi máy chủ' });
  }
});