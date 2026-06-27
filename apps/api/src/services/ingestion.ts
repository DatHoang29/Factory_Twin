import { Server as SocketIOServer } from 'socket.io';
import { prisma } from '../lib/prisma';
import { redisClient as redis } from '../lib/redis';
import { broadcastSensorUpdate, broadcastAlert } from '../socket';
import { sensorQueue } from '../lib/queue';

let ingestionInitialized = false;

export function setupIngestion(io: SocketIOServer) {
  if (ingestionInitialized) {
    console.log('[Ingestion] Already initialized, skipping');
    return;
  }
  ingestionInitialized = true;

  const subscriber = redis.duplicate();
  
  subscriber.on('error', (err: Error) => {
    console.error('Redis subscriber error:', err);
  });

  // ioredis auto-connects; no need to call .connect() explicitly
  subscriber.subscribe('sensor:data').catch((error: Error) => {
    console.error('Redis subscribe error:', error);
  });

  subscriber.on('message', async (_channel: string, message: string) => {
    try {
      const data = JSON.parse(message);
      await processSensorData(data, io);
    } catch (error) {
      console.error('Error processing sensor data:', error);
    }
  });

  console.log('✅ Ingestion service subscribed to sensor data');
}

async function processSensorData(data: any, io: SocketIOServer) {
  try {
    const { sensorId, value, machineId, factoryId, timestamp } = data;

    // Store latest reading in Redis (for dashboard real-time display)
    await redis.setex(
      `sensor:${sensorId}:latest`,
      3600,
      JSON.stringify({ value, timestamp })
    );

    // Get sensor config for threshold evaluation
    const sensor = await prisma.sensor.findUnique({
      where: { id: BigInt(sensorId) },
      include: { machine: true },
    });

    if (!sensor) return;

    // Check thresholds
    let alertCreated = false;
    let alertSeverity = 'INFO';

    if (sensor.maxThreshold && value > Number(sensor.maxThreshold)) {
      alertSeverity = 'WARNING';
      alertCreated = true;
    } else if (sensor.minThreshold && value < Number(sensor.minThreshold)) {
      alertSeverity = 'WARNING';
      alertCreated = true;
    }

    // Create alert if threshold exceeded
    if (alertCreated) {
      const alert = await prisma.alert.create({
        data: {
          machineId: BigInt(machineId),
          sensorId: BigInt(sensorId),
          alertType: `${sensor.sensorType}_THRESHOLD`,
          severity: alertSeverity as 'CRITICAL' | 'WARNING' | 'INFO',
          message: `${sensor.sensorType} exceeded threshold: ${value} ${sensor.unit}`,
          thresholdValue: Number(sensor.maxThreshold || sensor.minThreshold),
          actualValue: value,
          status: 'OPEN',
        },
      });

      // Broadcast alert via Socket.IO
      broadcastAlert(io, factoryId, alert);

      // TODO: Send notification (email/SMS) to operators
    }

    // Broadcast sensor update
    broadcastSensorUpdate(io, factoryId, {
      sensorId,
      machineId,
      value,
      unit: sensor.unit,
      timestamp,
      status: sensor.machine?.status,
    });

    // Store reading in database asynchronously using BullMQ
    await sensorQueue.add('reading', {
      sensorId: String(sensorId),
      value: String(value),
      qualityFlag: 1,
      recordedAt: timestamp,
    });
  } catch (error) {
    console.error('Error in processSensorData:', error);
  }
}

// Helper to publish sensor data to Redis (for testing/mock data)
export async function publishSensorData(data: {
  sensorId: string;
  value: number;
  machineId: string;
  factoryId: string;
  timestamp?: string;
}) {
  const payload = {
    ...data,
    timestamp: data.timestamp || new Date().toISOString(),
  };

  await redis.publish('sensor:data', JSON.stringify(payload));
}
