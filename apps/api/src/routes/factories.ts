import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, authorize } from '../middleware/auth';

export const factoryRouter = Router();
factoryRouter.use(authenticate);

// Helper to serialize BigInt
const serialize = (obj: any): any => JSON.parse(JSON.stringify(obj, (_k, v) => typeof v === 'bigint' ? Number(v) : v));

// GET /api/factories
factoryRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const factories = await prisma.factory.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ success: true, data: serialize(factories) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Lỗi máy chủ' });
  }
});

// GET /api/factories/:id
factoryRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const factory = await prisma.factory.findUnique({
      where: { id: BigInt(req.params.id) },
      include: { zones: { include: { machines: true } } },
    });
    if (!factory) { res.status(404).json({ success: false, error: 'Không tìm thấy nhà máy' }); return; }
    res.json({ success: true, data: serialize(factory) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Lỗi máy chủ' });
  }
});

// POST /api/factories
factoryRouter.post('/', authorize('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { name, address, description, latitude, longitude } = req.body;
    const factory = await prisma.factory.create({
      data: { name, address, description, latitude, longitude },
    });
    res.status(201).json({ success: true, data: serialize(factory) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Lỗi máy chủ' });
  }
});

// PUT /api/factories/:id
factoryRouter.put('/:id', authorize('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { name, address, description, latitude, longitude } = req.body;
    const factory = await prisma.factory.update({
      where: { id: BigInt(req.params.id) },
      data: { name, address, description, latitude, longitude },
    });
    res.json({ success: true, data: serialize(factory) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Lỗi máy chủ' });
  }
});

// DELETE /api/factories/:id
factoryRouter.delete('/:id', authorize('ADMIN'), async (req: Request, res: Response) => {
  try {
    await prisma.factory.delete({ where: { id: BigInt(req.params.id) } });
    res.json({ success: true, message: 'Đã xóa nhà máy' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Lỗi máy chủ' });
  }
});