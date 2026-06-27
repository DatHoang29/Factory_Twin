import { Router, Request, Response } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { redisClient as redis, redisPub } from '../lib/redis';
import { sensorQueue } from '../lib/queue';

export const ingestionRouter = Router();

// Helper to serialize BigInt
const serialize = (obj: any): any => 
  JSON.parse(JSON.stringify(obj, (_k, v) => typeof v === 'bigint' ? Number(v) : v));

/**
 * Endpoint nhận dữ liệu telemetry từ sensor (hỗ trợ cả /sensor-data và /reading)
 */
const handleIngestion = async (req: Request, res: Response) => {
  try {
    const { sensorId, sensorCode, value, qualityFlag, timestamp } = req.body;

    // Chấp nhận sensorId hoặc sensorCode (đều coi là ID của Sensor)
    const rawId = sensorId !== undefined ? sensorId : sensorCode;
    if (rawId === undefined || value === undefined) {
      return res.status(400).json({ error: 'sensorId/sensorCode and value are required' });
    }

    const sId = BigInt(rawId);

    // Tìm kiếm sensor kèm theo thông tin máy móc và phân xưởng để lấy factoryId/zoneId
    const sensor = await prisma.sensor.findUnique({
      where: { id: sId },
      include: {
        machine: {
          include: {
            zone: true,
          },
        },
      },
    });

    if (!sensor) {
      return res.status(404).json({ error: `Sensor with ID ${sId.toString()} not found` });
    }

    // 1. Đưa số đo vào hàng đợi BullMQ để ghi DB bất đồng bộ (giảm tải I/O cho cơ sở dữ liệu chính)
    const ts = timestamp || new Date().toISOString();
    const job = await sensorQueue.add('reading', {
      sensorId: sensor.id.toString(),
      value: String(value),
      qualityFlag: qualityFlag !== undefined ? Number(qualityFlag) : 1,
      recordedAt: ts,
    });

    // 2. Lưu giá trị mới nhất vào Redis Cache (để Dashboard tải nhanh)
    await redis.setex(
      `sensor:${sensor.id}:latest`,
      3600,
      JSON.stringify({ value: String(value), timestamp: ts })
    );

    // 3. Kiểm tra ngưỡng & Tạo Alert nếu vượt ngưỡng
    const numValue = Number(value);
    let breached = false;
    let alertType = 'THRESHOLD_BREACH';
    let severity: 'CRITICAL' | 'WARNING' | 'INFO' = 'WARNING';
    let thresholdValue: number | undefined;

    if (sensor.maxThreshold && numValue > Number(sensor.maxThreshold)) {
      breached = true;
      alertType = `${sensor.sensorType}_MAX_THRESHOLD`;
      thresholdValue = Number(sensor.maxThreshold);
      severity = numValue > thresholdValue * 1.5 ? 'CRITICAL' : 'WARNING';
    } else if (sensor.minThreshold && numValue < Number(sensor.minThreshold)) {
      breached = true;
      alertType = `${sensor.sensorType}_MIN_THRESHOLD`;
      thresholdValue = Number(sensor.minThreshold);
      severity = numValue < thresholdValue * 0.5 ? 'CRITICAL' : 'WARNING';
    }

    if (breached && thresholdValue !== undefined) {
      const alert = await prisma.alert.create({
        data: {
          machineId: sensor.machineId,
          sensorId: sensor.id,
          alertType,
          severity,
          message: `Thiết bị ${sensor.machine.name} - Cảm biến ${sensor.sensorType} vượt ngưỡng: ${value} ${sensor.unit} (Ngưỡng: ${thresholdValue} ${sensor.unit})`,
          thresholdValue: thresholdValue,
          actualValue: numValue,
          status: 'OPEN',
        },
      });
      // Publish Alert sự kiện sang Redis để Server WebSocket broadcast
      await redisPub.publish(
        'new_alert',
        JSON.stringify(serialize({
          ...alert,
          factoryId: sensor.machine.zone.factoryId,
          zoneId: sensor.machine.zoneId,
        }))
      );
    }

    // Cập nhật trạng thái máy dựa trên tính chất dữ liệu telemetry nhận được
    if (breached && severity === 'CRITICAL') {
      if (sensor.machine.status !== 'ERROR') {
        await prisma.machine.update({
          where: { id: sensor.machineId },
          data: { status: 'ERROR' },
        });
        sensor.machine.status = 'ERROR';
      }
    } else {
      // Nếu giá trị đã ổn định (không breached)
      if (!breached) {
        // Tự động đóng (Resolve) các cảnh báo đang mở (OPEN) của riêng cảm biến này
        const openAlerts = await prisma.alert.findMany({
          where: { sensorId: sensor.id, status: 'OPEN' }
        });
        
        if (openAlerts.length > 0) {
          await prisma.alert.updateMany({
            where: { sensorId: sensor.id, status: 'OPEN' },
            data: { status: 'RESOLVED', resolvedAt: new Date() }
          });
        }
      }

      // Kiểm tra xem máy này còn bất kỳ cảnh báo CRITICAL nào đang mở (OPEN) không
      const otherOpenCritical = await prisma.alert.findFirst({
        where: {
          machineId: sensor.machineId,
          status: 'OPEN',
          severity: 'CRITICAL',
        },
      });

      if (!otherOpenCritical && sensor.machine.status === 'ERROR') {
        // Phục hồi trạng thái máy về RUNNING
        await prisma.machine.update({
          where: { id: sensor.machineId },
          data: { status: 'RUNNING' },
        });
        sensor.machine.status = 'RUNNING';

        // Phát sự kiện cập nhật trạng thái máy qua socket để client biết
        await redisPub.publish(
          'machine_status_change',
          JSON.stringify(serialize({
            machineId: sensor.machineId,
            status: 'RUNNING',
            factoryId: sensor.machine.zone.factoryId,
            zoneId: sensor.machine.zoneId,
          }))
        );
      } else if (sensor.machine.status === 'STOPPED') {
        await prisma.machine.update({
          where: { id: sensor.machineId },
          data: { status: 'RUNNING' },
        });
        sensor.machine.status = 'RUNNING';
      }
    }

    // 4. Publish luồng dữ liệu sensor cập nhật thời gian thực
    await redisPub.publish(
      'sensor_update',
      JSON.stringify(serialize({
        sensorId: sensor.id,
        machineId: sensor.machineId,
        value: numValue,
        unit: sensor.unit,
        timestamp: ts,
        status: sensor.machine.status,
        factoryId: sensor.machine.zone.factoryId,
        zoneId: sensor.machine.zoneId,
      }))
    );

    res.status(201).json({ id: job.id, recordedAt: ts });
  } catch (error: any) {
    console.error('Ingestion error:', error);
    res.status(500).json({ error: 'Failed to ingest sensor data', details: error.message });
  }
};

ingestionRouter.post('/sensor-data', authenticate, authorize('ADMIN', 'OPERATOR'), handleIngestion);
ingestionRouter.post('/reading', authenticate, authorize('ADMIN', 'OPERATOR'), handleIngestion);

/**
 * Batch ingestion — nhận danh sách số đo
 */
ingestionRouter.post('/batch', authenticate, authorize('ADMIN', 'OPERATOR'), async (req: Request, res: Response) => {
  try {
    const { readings } = req.body;
    if (!Array.isArray(readings) || readings.length === 0) {
      return res.status(400).json({ error: 'readings array is required' });
    }

    const results: { sensorId: string; id: string; error?: string }[] = [];
    
    for (const r of readings) {
      const rawId = r.sensorId !== undefined ? r.sensorId : r.sensorCode;
      if (rawId === undefined || r.value === undefined) {
        results.push({ sensorId: String(rawId), id: '', error: 'sensorId and value are required' });
        continue;
      }

      try {
        const sId = BigInt(rawId);
        const sensor = await prisma.sensor.findUnique({
          where: { id: sId },
          include: {
            machine: {
              include: {
                zone: true,
              },
            },
          },
        });

        if (!sensor) {
          results.push({ sensorId: sId.toString(), id: '', error: 'Sensor not found' });
          continue;
        }

        const ts = r.timestamp || new Date().toISOString();
        const job = await sensorQueue.add('reading', {
          sensorId: sensor.id.toString(),
          value: String(r.value),
          qualityFlag: r.qualityFlag !== undefined ? Number(r.qualityFlag) : 1,
          recordedAt: ts,
        });

        await redis.setex(
          `sensor:${sensor.id}:latest`,
          3600,
          JSON.stringify({ value: String(r.value), timestamp: ts })
        );

        // Publish sensor update event
        await redisPub.publish(
          'sensor_update',
          JSON.stringify(serialize({
            sensorId: sensor.id,
            machineId: sensor.machineId,
            value: Number(r.value),
            unit: sensor.unit,
            timestamp: ts,
            status: sensor.machine.status,
            factoryId: sensor.machine.zone.factoryId,
            zoneId: sensor.machine.zoneId,
          }))
        );

        results.push({ sensorId: sensor.id.toString(), id: job.id ? job.id.toString() : '' });
      } catch (e: any) {
        results.push({ sensorId: String(rawId), id: '', error: e.message });
      }
    }

    res.status(201).json({ results });
  } catch (error) {
    console.error('Batch ingestion error:', error);
    res.status(500).json({ error: 'Failed to process batch ingestion' });
  }
});