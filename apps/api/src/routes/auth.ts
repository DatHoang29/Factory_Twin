import { Router, Request, Response } from 'express';
import { AuthRequest, Role, signToken, authenticate } from '../middleware/auth';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';

export const authRouter = Router();

// POST /api/auth/login
authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ success: false, error: 'Email và mật khẩu là bắt buộc' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      res.status(401).json({ success: false, error: 'Email hoặc mật khẩu không đúng' });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ success: false, error: 'Email hoặc mật khẩu không đúng' });
      return;
    }

    const token = signToken({
      userId: Number(user.id),
      email: user.email,
      role: user.role as Role,
      factoryId: user.factoryId ? Number(user.factoryId) : undefined,
    });

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: Number(user.id),
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          factoryId: user.factoryId ? Number(user.factoryId) : null,
        },
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, error: 'Lỗi máy chủ' });
  }
});

// GET /api/auth/me
authRouter.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: BigInt(req.user!.userId) } });
    if (!user) {
      res.status(404).json({ success: false, error: 'Không tìm thấy người dùng' });
      return;
    }
    res.json({
      success: true,
      data: {
        id: Number(user.id),
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        phone: user.phone,
        factoryId: user.factoryId ? Number(user.factoryId) : null,
      },
    });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ success: false, error: 'Lỗi máy chủ' });
  }
});