/**
 * Background Aggregation Worker
 * Aggregates raw sensor readings into hourly values and performs cold data cleanup.
 */
import { prisma } from '../lib/prisma';

const RUN_INTERVAL_MS = 60 * 1000; // Run every 1 minute for demo visibility
const COLD_DATA_RETENTION_MS = 3 * 60 * 1000; // Keep raw readings for 3 minutes, delete older

export async function startAggregationWorker() {
  console.log('✅ Background Aggregation & Cleanup Worker initialized');

  setInterval(async () => {
    try {
      console.log('[AggregationWorker] Running aggregation and cleanup task...');
      const now = new Date();
      const oneMinuteAgo = new Date(now.getTime() - RUN_INTERVAL_MS);

      // 1. Get all sensors in database
      const sensors = await prisma.sensor.findMany();

      for (const sensor of sensors) {
        // 2. Fetch raw readings for this sensor in the last 1 minute
        const readings = await prisma.sensorReading.findMany({
          where: {
            sensorId: sensor.id,
            recordedAt: {
              gte: oneMinuteAgo,
              lt: now,
            },
          },
        });

        if (readings.length > 0) {
          const values = readings.map((r) => Number(r.value));
          const avgValue = values.reduce((sum, v) => sum + v, 0) / values.length;
          const minValue = Math.min(...values);
          const maxValue = Math.max(...values);

          // Hourly record uses the start of the current hour for database schema compatibility
          const hourStart = new Date(now);
          hourStart.setMinutes(0, 0, 0);

          console.log(`[AggregationWorker] Aggregating sensor ${sensor.id} (${sensor.sensorType}): Avg=${avgValue.toFixed(2)}, Min=${minValue}, Max=${maxValue}`);

          // Delete existing record for this hour if exists to avoid duplication
          await prisma.sensorReadingHourly.deleteMany({
            where: {
              sensorId: sensor.id,
              periodStart: hourStart,
            },
          });

          // Insert hourly aggregation in DB
          await prisma.sensorReadingHourly.create({
            data: {
              sensorId: sensor.id,
              avgValue: avgValue,
              minValue: minValue,
              maxValue: maxValue,
              periodStart: hourStart,
            },
          });
        }
      }

      // 3. Cold Data Cleanup: Delete raw readings older than COLD_DATA_RETENTION_MS
      const cleanupThreshold = new Date(now.getTime() - COLD_DATA_RETENTION_MS);
      const deleted = await prisma.sensorReading.deleteMany({
        where: {
          recordedAt: {
            lt: cleanupThreshold,
          },
        },
      });

      if (deleted.count > 0) {
        console.log(`[AggregationWorker] Cold Data Cleanup: Deleted ${deleted.count} old raw sensor readings from DB.`);
      }
    } catch (err) {
      console.error('[AggregationWorker] Error in aggregation run:', err);
    }
  }, RUN_INTERVAL_MS);
}
