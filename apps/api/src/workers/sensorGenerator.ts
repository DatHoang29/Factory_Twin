/**
 * Mock Sensor Data Generator
 * Simulates PLC/Sensor data publishing via MQTT (or directly via HTTP for v1 MVP)
 * Runs as a standalone Node.js process: `npx ts-node src/workers/sensorGenerator.ts`
 */
import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { redisClient as redis } from '../lib/redis';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

// Robust manual .env loader
const loadEnv = () => {
  const searchPaths = [
    path.join(__dirname, '../../../../.env'), // root relative to src/workers/sensorGenerator.ts
    path.join(process.cwd(), '../../.env'),   // root relative to process.cwd() if run from apps/api
    path.join(process.cwd(), '.env'),         // local .env
  ];
  for (const p of searchPaths) {
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, 'utf-8');
        content.split('\n').forEach(line => {
          const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
          if (match) {
            const key = match[1];
            let val = match[2] || '';
            if (val.startsWith('"') && val.endsWith('"')) {
              val = val.slice(1, -1);
            }
            if (val.startsWith("'") && val.endsWith("'")) {
              val = val.slice(1, -1);
            }
            process.env[key] = val;
          }
        });
        console.log(`[SensorGenerator] Environment loaded from ${p}`);
        break;
      } catch (e) {
        console.error(`[SensorGenerator] Error loading env from ${p}`, e);
      }
    }
  }
};
loadEnv();

const API_URL = (process.env.API_URL || 'http://localhost:3001') + '/api';
const PUBLISH_INTERVAL_MS = 2500;
const jwtSecret = process.env.JWT_SECRET || 'dev-secret-change-me';

const token = jwt.sign(
  { userId: 999, email: 'generator@factory.local', role: 'OPERATOR' },
  jwtSecret,
  { expiresIn: '24h' }
);

const prisma = new PrismaClient();

interface SensorConfig {
  id: bigint;
  machineId: bigint;
  type: string;
  unit: string;
  baseValue: number;
  variance: number;
  minThreshold: number;
  maxThreshold: number;
  factoryId: number;
  zoneId: number;
  machineStatus: string;
}

async function loadSensorConfigs(): Promise<SensorConfig[]> {
  const sensors = await prisma.sensor.findMany({
    include: {
      machine: { include: { zone: true } },
    },
  });

  return sensors.map((sensor: any) => ({
    id: sensor.id,
    machineId: sensor.machineId,
    type: sensor.sensorType,
    unit: sensor.unit || '',
    baseValue: getBaseValue(sensor.sensorType),
    variance: getVariance(sensor.sensorType),
    minThreshold: Number(sensor.minThreshold) || 0,
    maxThreshold: Number(sensor.maxThreshold) || 999,
    factoryId: Number(sensor.machine.zone.factoryId),
    zoneId: Number(sensor.machine.zone.id),
    machineStatus: sensor.machine.status,
  }));
}

function getBaseValue(sensorType: string): number {
  switch (sensorType) {
    case 'TEMPERATURE': return 65;
    case 'VIBRATION': return 2.5;
    case 'SPEED': return 1450;
    case 'POWER': return 45;
    case 'OUTPUT': return 98;
    default: return 50;
  }
}

function getVariance(sensorType: string): number {
  switch (sensorType) {
    case 'TEMPERATURE': return 12;
    case 'VIBRATION': return 1.0;
    case 'SPEED': return 20;
    case 'POWER': return 3;
    case 'OUTPUT': return 5;
    default: return 5;
  }
}

function generateValue(config: SensorConfig): number {
  // Nếu máy bị Dừng (STOPPED) hoặc đang gặp Sự cố (ERROR), tốc độ vòng quay (RPM) và công suất tiêu thụ (POWER) phải giảm về ~0
  if (config.machineStatus === 'STOPPED' || config.machineStatus === 'ERROR') {
    if (config.type === 'SPEED' || config.type === 'POWER') {
      return parseFloat((Math.random() * 2).toFixed(2)); // Giá trị rất nhỏ nhiễu quanh 0
    }
  }

  // 5% cơ hội xảy ra đột biến giá trị (để demo vượt ngưỡng)
  const spike = Math.random() < 0.05;
  const multiplier = spike ? 1.3 + Math.random() * 0.2 : 1;
  return parseFloat((config.baseValue + (Math.random() - 0.5) * config.variance * 2 * multiplier).toFixed(2));
}

async function publishReading(config: SensorConfig): Promise<void> {
  // Đọc giá trị mới nhất từ Redis Cache để có sự chuyển tiếp mượt mà
  let latestValue = config.baseValue;
  const cached = await redis.get(`sensor:${config.id}:latest`);
  if (cached) {
    try {
      latestValue = Number(JSON.parse(cached).value);
    } catch (e) {}
  }

  let value = latestValue;

  if (config.type === 'TEMPERATURE') {
    // Nếu nhiệt độ cao hơn mức mặc định (do người dùng spam click), nó sẽ hạ nhiệt từ từ về lại baseValue (65°C) theo thời gian (giảm 2.5°C mỗi chu kỳ)
    if (latestValue > config.baseValue) {
      value = Math.max(config.baseValue, parseFloat((latestValue - 2.5 + (Math.random() - 0.5) * 0.8).toFixed(2)));
    } else {
      value = generateValue(config);
    }
  } else {
    // Các cảm biến khác sinh số ngẫu nhiên bình thường
    value = generateValue(config);
  }

  const qualityFlag = value > config.maxThreshold || value < config.minThreshold ? 0 : 1;

  try {
    await axios.post(`${API_URL}/ingestion/reading`, {
      sensorId: Number(config.id),
      value,
      qualityFlag: qualityFlag,
      factoryId: config.factoryId,
      zoneId: config.zoneId,
      machineId: Number(config.machineId),
    }, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  } catch (err) {
    console.error(`[Generator] Failed to publish for sensor ${config.id}:`, err);
  }
}

async function generateMockHistoryData() {
  console.log('[SensorGenerator] Checking and generating mock history reports data (Production & Energy)...');
  try {
    const machines = await prisma.machine.findMany();
    const now = new Date();

    for (const machine of machines) {
      const prodCount = await prisma.productionRecord.count({
        where: { machineId: machine.id }
      });

      if (prodCount === 0) {
        console.log(`[SensorGenerator] Generating 7-day history for Machine: ${machine.name} (${machine.code})`);
        
        const prodData = [];
        const energyData = [];

        for (let i = 7; i >= 1; i--) {
          const start = new Date(now);
          start.setDate(now.getDate() - i);
          start.setHours(0, 0, 0, 0);

          const end = new Date(start);
          end.setDate(start.getDate() + 1);

          const target = 100;
          const output = Math.round(75 + Math.random() * 23); // OEE 75% - 98%
          prodData.push({
            machineId: machine.id,
            outputQuantity: output,
            targetQuantity: target,
            unit: 'pcs',
            periodStart: start,
            periodEnd: end,
          });

          const kwh = parseFloat((120 + Math.random() * 80).toFixed(2)); // 120-200 kWh
          const cost = parseFloat((kwh * 2500).toFixed(2));
          energyData.push({
            machineId: machine.id,
            consumptionKwh: kwh,
            cost: cost,
            periodStart: start,
            periodEnd: end,
          });
        }

        await prisma.productionRecord.createMany({ data: prodData });
        await prisma.energyConsumption.createMany({ data: energyData });
      }

      // Check activity logs
      const activityCount = await prisma.machineActivityLog.count({
        where: { machineId: machine.id }
      });

      if (activityCount === 0) {
        console.log(`[SensorGenerator] Generating mock activity logs for Machine: ${machine.name} (${machine.code})`);
        
        const activityTypes = [
          { eventType: 'START' as const, description: 'Thiết lập máy, căn chỉnh cảm biến và khởi động chạy thử nghiệm thành công.' },
          { eventType: 'MAINTENANCE' as const, description: 'Bảo trì định kỳ: Thay dầu bôi trơn hệ thống cơ khí và làm sạch bụi đầu trục.' },
          { eventType: 'START' as const, description: 'Khởi động ca sản xuất ban ngày, bắt đầu nạp phôi nguyên liệu.' },
          { eventType: 'ALERT' as const, description: 'Cảnh báo: Phát hiện nhiệt độ tăng nhẹ vượt ngưỡng cảnh báo 75°C, hệ thống làm mát đã tự động tăng công suất.' },
          { eventType: 'STATUS_CHANGE' as const, description: 'Trạng thái nhiệt độ ổn định trở lại ở mức 64.5°C, tự động đóng cảnh báo.' }
        ];

        const logData = activityTypes.map((act, index) => {
          const logTime = new Date(now);
          logTime.setHours(now.getHours() - (index * 6 + 2));
          return {
            machineId: machine.id,
            eventType: act.eventType,
            description: act.description,
            createdAt: logTime,
          };
        });

        await prisma.machineActivityLog.createMany({ data: logData });
      }
    }
    console.log('[SensorGenerator] Mock history data generation completed.');
  } catch (err) {
    console.error('[SensorGenerator] Failed to generate mock history data:', err);
  }
}

async function main() {
  console.log('[SensorGenerator] Starting mock sensor data generator...');
  console.log(`[SensorGenerator] Target API: ${API_URL}`);
  console.log(`[SensorGenerator] Publish interval: ${PUBLISH_INTERVAL_MS}ms`);

  // Generate mock production & energy data if not exists
  await generateMockHistoryData();

  let configs = await loadSensorConfigs();
  console.log(`[SensorGenerator] Initially loaded ${configs.length} sensors`);

  // Publish initial readings immediately on startup to avoid delay
  try {
    if (configs.length > 0) {
      await Promise.all(configs.map((cfg) => publishReading(cfg)));
      console.log('[SensorGenerator] Published initial readings successfully');
    }
  } catch (err) {
    console.error('[SensorGenerator] Error in initial publish:', err);
  }

  setInterval(async () => {
    try {
      // Reload configs every tick to pick up newly registered machines and sensors
      configs = await loadSensorConfigs();
      if (configs.length === 0) return;

      // Publish readings for all sensors on every tick to ensure all machines have data immediately
      await Promise.all(configs.map((cfg) => publishReading(cfg)));
    } catch (err) {
      console.error('[SensorGenerator] Error in simulation loop:', err);
    }
  }, PUBLISH_INTERVAL_MS);

  console.log('[SensorGenerator] Publishing sensor data with dynamic reloading...');
}

main().catch(console.error);