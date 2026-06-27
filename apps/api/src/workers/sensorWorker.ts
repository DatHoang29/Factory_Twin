import { Worker } from 'bullmq';
import { prisma } from '../lib/prisma';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT || 6379),
};

// Batch insert buffer configuration
let batchBuffer: any[] = [];
let resolves: (() => void)[] = [];
let rejects: ((err: any) => void)[] = [];
let flushTimeout: NodeJS.Timeout | null = null;
const BATCH_SIZE_LIMIT = 50;
const FLUSH_INTERVAL_MS = 1500; // Force flush every 1.5 seconds

async function flushBatch() {
  if (flushTimeout) {
    clearTimeout(flushTimeout);
    flushTimeout = null;
  }

  if (batchBuffer.length === 0) return;

  const currentBuffer = [...batchBuffer];
  const currentResolves = [...resolves];
  const currentRejects = [...rejects];

  // Reset buffers
  batchBuffer = [];
  resolves = [];
  rejects = [];

  try {
    // console.log(`[SensorWorker] Batch inserting ${currentBuffer.length} sensor readings...`);
    await prisma.sensorReading.createMany({
      data: currentBuffer,
      skipDuplicates: true,
    });
    
    // Resolve all waiting jobs
    currentResolves.forEach(resolve => resolve());
  } catch (err) {
    console.error('[SensorWorker] Failed to execute batch insert:', err);
    // Reject jobs to trigger automatic BullMQ retries
    currentRejects.forEach(reject => reject(err));
  }
}

export const sensorWorker = new Worker(
  'sensor-aggregation',
  async (job) => {
    const { sensorId, value, qualityFlag, recordedAt } = job.data;
    
    return new Promise<void>((resolve, reject) => {
      batchBuffer.push({
        sensorId: BigInt(sensorId),
        value: String(value),
        qualityFlag: qualityFlag !== undefined ? Number(qualityFlag) : 1,
        recordedAt: new Date(recordedAt),
      });

      resolves.push(resolve);
      rejects.push(reject);

      if (batchBuffer.length >= BATCH_SIZE_LIMIT) {
        flushBatch();
      } else if (!flushTimeout) {
        flushTimeout = setTimeout(flushBatch, FLUSH_INTERVAL_MS);
      }
    });
  },
  { connection }
);

console.log('✅ BullMQ sensor-aggregation worker with Batch Inserting (createMany) is ready');
