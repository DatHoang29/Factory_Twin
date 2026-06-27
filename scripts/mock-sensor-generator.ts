import { prisma } from '@fdt/database';
import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });

// Mock sensor data generator - simulates sensor readings every 2-3 seconds
async function generateMockData() {
  console.log('🔄 Starting mock sensor data generator...');
  console.log(`🔌 Connecting to Redis at ${redisUrl}`);

  // Get all sensors from database
  const sensors = await prisma.sensor.findMany({
    include: {
      machine: {
        include: {
          zone: {
            include: {
              factory: true,
            },
          },
        },
      },
    },
  });

  if (sensors.length === 0) {
    console.log('⚠️  No sensors found. Please seed the database first.');
    process.exit(1);
  }

  console.log(`✅ Found ${sensors.length} sensors to simulate`);

  // Generate data every 2-3 seconds
  setInterval(async () => {
    // Select a random subset of sensors to update each tick to simulate realistic traffic
    const count = Math.min(3, sensors.length);
    const shuffled = [...sensors].sort(() => Math.random() - 0.5);
    const batch = shuffled.slice(0, count);

    for (const sensor of batch) {
      try {
        let value: number;
        const minThreshold = Number(sensor.minThreshold || 0);
        const maxThreshold = Number(sensor.maxThreshold || 100);

        // Generate value based on sensor type
        switch (sensor.sensorType) {
          case 'TEMPERATURE':
            // Normal: 20-80°C, occasionally spike to trigger alert
            value = Math.random() > 0.95 
              ? maxThreshold + Math.random() * 10  // 5% chance to exceed
              : minThreshold + Math.random() * (maxThreshold - minThreshold);
            break;

          case 'VIBRATION':
            // Normal: 0-10 Hz, occasionally spike
            value = Math.random() > 0.95
              ? maxThreshold + Math.random() * 5
              : Math.random() * maxThreshold * 0.8;
            break;

          case 'SPEED':
            // Normal: 1000-2000 RPM
            value = 1000 + Math.random() * 1000;
            if (Math.random() > 0.95) {
              value = maxThreshold + Math.random() * 200; // Occasional overspeed
            }
            break;

          case 'POWER':
            // Normal: 50-90% rated power
            value = (minThreshold + (maxThreshold - minThreshold) * (0.5 + Math.random() * 0.4));
            break;

          case 'ONOFF':
            // Binary: 0 or 1
            value = Math.random() > 0.1 ? 1 : 0; // 90% running
            break;

          case 'OUTPUT':
            // Production count: 0-100 units per period
            value = Math.floor(Math.random() * 100);
            break;

          default:
            value = minThreshold + Math.random() * (maxThreshold - minThreshold);
        }

        // Round to 2 decimals
        value = Math.round(value * 100) / 100;

        // Publish to Redis channel (ingestion service listens to 'sensor:data')
        const payload = {
          sensorId: sensor.id.toString(),
          value,
          machineId: sensor.machineId.toString(),
          factoryId: sensor.machine.zone.factoryId.toString(),
          timestamp: new Date().toISOString(),
        };

        await redis.publish('sensor:data', JSON.stringify(payload));

        console.log(
          `📊 [Telemetry] ${sensor.sensorType} (${sensor.id}) -> Máy ${sensor.machine.name}: ${value} ${sensor.unit || ''}`
        );
      } catch (error) {
        console.error(`Error generating data for sensor ${sensor.id}:`, error);
      }
    }
  }, 2500); // Fixed interval 2.5s
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n👋 Shutting down mock data generator...');
  redis.disconnect();
  await prisma.$disconnect();
  process.exit(0);
});

// Start generator
generateMockData().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});