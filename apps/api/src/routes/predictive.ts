import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { runPredictiveAnalysis } from '../services/predictiveService';
import { authenticate, authorize } from '../middleware/auth';

export const predictiveRouter = Router();
predictiveRouter.use(authenticate);

// GET /api/predictive/insights?zoneId=&factoryId=
predictiveRouter.get('/insights', authorize('ADMIN', 'TECHNICIAN', 'OPERATOR', 'VIEWER'), async (req: Request, res: Response) => {
  try {
    const where: any = {};
    if (req.query.zoneId) where.zoneId = BigInt(req.query.zoneId as string);
    if (req.query.factoryId) where.zone = { factoryId: BigInt(req.query.factoryId as string) };

    const machines = await prisma.machine.findMany({
      where,
      select: { id: true }
    });

    const insights = await Promise.all(
      machines.map(m => runPredictiveAnalysis(Number(m.id)).catch(err => {
        console.error(`Failed predictive for machine ${m.id}:`, err);
        return null;
      }))
    );

    res.json({
      success: true,
      data: insights.filter(x => x !== null)
    });
  } catch (err) {
    console.error('[PredictiveRouter] GET insights error:', err);
    res.status(550).json({ success: false, error: 'Lỗi máy chủ' });
  }
});

// POST /api/predictive/analyze/:machineId
predictiveRouter.post('/analyze/:machineId', authorize('ADMIN', 'TECHNICIAN'), async (req: Request, res: Response) => {
  try {
    const machineId = Number(req.params.machineId);
    const insight = await runPredictiveAnalysis(machineId);
    res.json({
      success: true,
      data: insight
    });
  } catch (err: any) {
    console.error('[PredictiveRouter] POST analyze error:', err);
    res.status(500).json({ success: false, error: err.message || 'Lỗi máy chủ' });
  }
});

export default predictiveRouter;
