import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, authorize } from '../middleware/auth';

export const zoneRouter = Router();
zoneRouter.use(authenticate);

const serialize = (obj: any): any => JSON.parse(JSON.stringify(obj, (_k, v) => typeof v === 'bigint' ? Number(v) : v));

// GET /api/zones?factoryId=
zoneRouter.get('/', async (req: Request, res: Response) => {
  try {
    const where: any = {};
    if (req.query.factoryId) where.factoryId = BigInt(req.query.factoryId as string);
    const zones = await prisma.zone.findMany({ where, include: { factory: true }, orderBy: { name: 'asc' } });
    res.json({ success: true, data: serialize(zones) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Lỗi máy chủ' });
  }
});

// POST /api/zones
zoneRouter.post('/', authorize('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { factoryId, name, floorLevel, description } = req.body;
    const zone = await prisma.zone.create({
      data: { factoryId: BigInt(factoryId), name, floorLevel, description },
    });
    res.status(201).json({ success: true, data: serialize(zone) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Lỗi máy chủ' });
  }
});

// PUT /api/zones/:id
zoneRouter.put('/:id', authorize('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { name, floorLevel, description } = req.body;
    const zone = await prisma.zone.update({
      where: { id: BigInt(req.params.id) },
      data: { name, floorLevel, description },
    });
    res.json({ success: true, data: serialize(zone) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Lỗi máy chủ' });
  }
});

// DELETE /api/zones/:id
zoneRouter.delete('/:id', authorize('ADMIN'), async (req: Request, res: Response) => {
  try {
    await prisma.zone.delete({ where: { id: BigInt(req.params.id) } });
    res.json({ success: true, message: 'Đã xóa phân xưởng' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Lỗi máy chủ' });
  }
});