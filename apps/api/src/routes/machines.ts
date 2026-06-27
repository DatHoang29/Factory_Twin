import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, authorize } from '../middleware/auth';
import { redisPub } from '../lib/redis';

export const machineRouter = Router();
machineRouter.use(authenticate);

const serialize = (obj: any): any => JSON.parse(JSON.stringify(obj, (_k, v) => typeof v === 'bigint' ? Number(v) : v));

// GET /api/machines?zoneId=&factoryId=
machineRouter.get('/', authorize('ADMIN', 'TECHNICIAN', 'OPERATOR', 'VIEWER'), async (req: Request, res: Response) => {
  try {
    const where: any = {};
    if (req.query.zoneId) where.zoneId = BigInt(req.query.zoneId as string);
    if (req.query.factoryId) where.zone = { factoryId: BigInt(req.query.factoryId as string) };

    const machines = await prisma.machine.findMany({
      where,
      include: { zone: true, sensors: true },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: serialize(machines) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Lỗi máy chủ' });
  }
});

// GET /api/machines/:id
machineRouter.get('/:id', authorize('ADMIN', 'TECHNICIAN', 'OPERATOR', 'VIEWER'), async (req: Request, res: Response) => {
  try {
    const machine = await prisma.machine.findUnique({
      where: { id: BigInt(req.params.id) },
      include: { zone: true, sensors: true },
    });
    if (!machine) { res.status(404).json({ success: false, error: 'Không tìm thấy máy' }); return; }
    res.json({ success: true, data: serialize(machine) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Lỗi máy chủ' });
  }
});

// POST /api/machines
machineRouter.post('/', authorize('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { zoneId, code, name, type, manufacturer, installDate, status, positionX, positionY, positionZ, qrCode } = req.body;
    const machineData: any = {
      zoneId: BigInt(zoneId), code, name, type, manufacturer,
      status: status || 'STOPPED',
      positionX, positionY, positionZ, qrCode,
      installDate: installDate ? new Date(installDate) : new Date(),
    };

    const machine = await prisma.machine.create({
      data: machineData,
    });

    // Auto-create default sensors for the new machine
    await prisma.sensor.createMany({
      data: [
        { machineId: machine.id, sensorType: 'TEMPERATURE', unit: '°C', minThreshold: 10, maxThreshold: 85, mqttTopic: `factory/${machine.code}/temperature` },
        { machineId: machine.id, sensorType: 'VIBRATION', unit: 'mm/s', minThreshold: 0, maxThreshold: 10, mqttTopic: `factory/${machine.code}/vibration` },
        { machineId: machine.id, sensorType: 'SPEED', unit: 'RPM', minThreshold: 0, maxThreshold: 5000, mqttTopic: `factory/${machine.code}/speed` },
        { machineId: machine.id, sensorType: 'POWER', unit: 'kW', minThreshold: 0, maxThreshold: 50, mqttTopic: `factory/${machine.code}/power` },
      ],
    });

    res.status(201).json({ success: true, data: serialize(machine) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Lỗi máy chủ' });
  }
});

// PUT /api/machines/:id
machineRouter.put('/:id', authorize('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { name, type, manufacturer, status, positionX, positionY, positionZ } = req.body;
    const machine = await prisma.machine.update({
      where: { id: BigInt(req.params.id) },
      data: { name, type, manufacturer, status, positionX, positionY, positionZ },
    });
    res.json({ success: true, data: serialize(machine) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Lỗi máy chủ' });
  }
});

// POST /api/machines/:id/trigger-overload
machineRouter.post('/:id/trigger-overload', async (req: Request, res: Response) => {
  try {
    const machineId = BigInt(req.params.id);
    const machine = await prisma.machine.findUnique({
      where: { id: machineId },
      include: { sensors: true, zone: true },
    });
    if (!machine) {
      res.status(404).json({ success: false, error: 'Không tìm thấy thiết bị' });
      return;
    }

    const tempSensor = machine.sensors.find(s => s.sensorType === 'TEMPERATURE');
    if (!tempSensor) {
      res.status(400).json({ success: false, error: 'Thiết bị không có cảm biến nhiệt độ' });
      return;
    }

    const { redisClient: redis } = require('../lib/redis');
    const latestRaw = await redis.get(`sensor:${tempSensor.id}:latest`);
    let currentTemp = 65.0;
    if (latestRaw) {
      try {
        currentTemp = Number(JSON.parse(latestRaw).value);
      } catch (e) {}
    }

    // Tăng nhiệt độ thêm 10°C mỗi lần click spam
    const newTemp = parseFloat((currentTemp + 10.0).toFixed(2));
    const limit = Number(tempSensor.maxThreshold || 85);
    const breached = newTemp > limit;
    const ts = new Date().toISOString();

    // Lưu nhiệt độ mới vào Redis Cache
    await redis.setex(
      `sensor:${tempSensor.id}:latest`,
      3600,
      JSON.stringify({ value: String(newTemp), timestamp: ts })
    );

    let alert = null;
    let machineStatus = machine.status;

    if (breached) {
      machineStatus = 'ERROR';
      
      // Kiểm tra xem đã có cảnh báo đang mở nào cho cảm biến này chưa để tránh tạo trùng lặp
      const existingAlert = await prisma.alert.findFirst({
        where: {
          sensorId: tempSensor.id,
          status: 'OPEN',
        }
      });

      if (!existingAlert) {
        alert = await prisma.alert.create({
          data: {
            machineId: machine.id,
            sensorId: tempSensor.id,
            alertType: 'TEMPERATURE_MAX_THRESHOLD',
            severity: 'CRITICAL',
            message: `Thiết bị ${machine.name} - Hệ thống tự động kích hoạt trạng thái quá tải: Nhiệt độ vượt ngưỡng khẩn cấp (${newTemp}°C) (Ngưỡng: ${limit}°C)`,
            thresholdValue: limit,
            actualValue: newTemp,
            status: 'OPEN',
          },
        });

        // Cập nhật trạng thái máy thành ERROR
        await prisma.machine.update({
          where: { id: machineId },
          data: { status: 'ERROR' },
        });

        // Publish sự kiện Alert sang Redis để WebSocket Client nhận diện
        await redisPub.publish(
          'new_alert',
          JSON.stringify(serialize({
            ...alert,
            factoryId: machine.zone.factoryId,
            zoneId: machine.zoneId,
          }))
        );
      }
    }

    // Publish sự kiện sensor_update sang Redis với trạng thái mới
    await redisPub.publish(
      'sensor_update',
      JSON.stringify(serialize({
        sensorId: tempSensor.id,
        machineId: machine.id,
        value: newTemp,
        unit: tempSensor.unit,
        timestamp: ts,
        status: machineStatus,
        factoryId: machine.zone.factoryId,
        zoneId: machine.zoneId,
      }))
    );

    res.json({ success: true, message: `Đã tăng nhiệt độ thiết bị lên ${newTemp}°C` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Lỗi máy chủ' });
  }
});

// DELETE /api/machines/:id
machineRouter.delete('/:id', authorize('ADMIN'), async (req: Request, res: Response) => {
  try {
    await prisma.machine.delete({ where: { id: BigInt(req.params.id) } });
    res.json({ success: true, message: 'Đã xóa máy' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Lỗi máy chủ' });
  }
});