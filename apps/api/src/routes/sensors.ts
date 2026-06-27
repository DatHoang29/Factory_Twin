import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, authorize } from '../middleware/auth';

export const sensorRouter = Router();
sensorRouter.use(authenticate);

const serialize = (obj: any): any => JSON.parse(JSON.stringify(obj, (_k, v) => typeof v === 'bigint' ? Number(v) : v));

// GET /api/sensors?machineId=
sensorRouter.get('/', async (req: Request, res: Response) => {
  try {
    const where: any = {};
    if (req.query.machineId) where.machineId = BigInt(req.query.machineId as string);
    const sensors = await prisma.sensor.findMany({ where, include: { machine: true }, orderBy: { sensorType: 'asc' } });
    res.json({ success: true, data: serialize(sensors) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Lỗi máy chủ' });
  }
});

// POST /api/sensors
sensorRouter.post('/', authorize('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { machineId, sensorType, unit, minThreshold, maxThreshold, mqtt_topic } = req.body;
    const mqttTopic = mqtt_topic;
    const sensor = await prisma.sensor.create({
      data: {
        machineId: BigInt(machineId),
        sensorType,
        unit,
        minThreshold,
        maxThreshold,
        mqttTopic,
      },
    });
    res.status(201).json({ success: true, data: serialize(sensor) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Lỗi máy chủ' });
  }
});

// PUT /api/sensors/:id
sensorRouter.put('/:id', authorize('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { minThreshold, maxThreshold, mqtt_topic } = req.body;
    const mqttTopic = mqtt_topic;
    const sensor = await prisma.sensor.update({
      where: { id: BigInt(req.params.id) },
      data: { minThreshold, maxThreshold, mqttTopic },
    });
    res.json({ success: true, data: serialize(sensor) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Lỗi máy chủ' });
  }
});

// DELETE /api/sensors/:id
sensorRouter.delete('/:id', authorize('ADMIN'), async (req: Request, res: Response) => {
  try {
    await prisma.sensor.delete({ where: { id: BigInt(req.params.id) } });
    res.json({ success: true, message: 'Đã xóa cảm biến' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Lỗi máy chủ' });
  }
});