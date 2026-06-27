import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { authenticate, authorize } from '../middleware/auth';

export const userRouter = Router();
userRouter.use(authenticate);

const serialize = (obj: any): any => JSON.parse(JSON.stringify(obj, (_k, v) => typeof v === 'bigint' ? Number(v) : v));

// GET /api/users
userRouter.get('/', authorize('ADMIN'), async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        phone: true,
        isActive: true,
        createdAt: true,
        factoryId: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: serialize(users) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Lỗi máy chủ' });
  }
});

// POST /api/users
userRouter.post('/', authorize('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { factoryId, fullName, email, password, role, phone, isActive } = req.body;
    
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(400).json({ success: false, error: 'Email đã tồn tại' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        factoryId: factoryId ? BigInt(factoryId) : null,
        fullName,
        email,
        passwordHash,
        role,
        phone,
        isActive: isActive ?? true,
      },
      select: {
        id: true, fullName: true, email: true, role: true, phone: true, isActive: true, factoryId: true,
      }
    });
    res.status(201).json({ success: true, data: serialize(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Lỗi máy chủ' });
  }
});

// PUT /api/users/:id/status
userRouter.put('/:id/status', authorize('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { isActive } = req.body;
    const user = await prisma.user.update({
      where: { id: BigInt(req.params.id) },
      data: { isActive },
      select: { id: true, fullName: true, isActive: true }
    });
    res.json({ success: true, data: serialize(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Lỗi máy chủ' });
  }
});