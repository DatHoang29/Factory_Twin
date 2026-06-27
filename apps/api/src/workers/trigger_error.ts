import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

// Load .env first
const loadEnv = () => {
  const p = path.join(__dirname, '../../../../.env');
  if (fs.existsSync(p)) {
    const content = fs.readFileSync(p, 'utf-8');
    content.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = match[2] || '';
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        process.env[key] = val;
      }
    });
  }
};
loadEnv();

const prisma = new PrismaClient();
const jwtSecret = process.env.JWT_SECRET || 'dev-secret-change-me';
const token = jwt.sign(
  { userId: 999, email: 'generator@factory.local', role: 'OPERATOR' },
  jwtSecret,
  { expiresIn: '5m' }
);

async function main() {
  // Find machine MCH-001 and its TEMPERATURE sensor
  const machine = await prisma.machine.findFirst({
    where: { code: 'MCH-001' },
    include: { sensors: true, zone: true }
  });

  if (!machine) {
    console.error('Không tìm thấy máy MCH-001 trong cơ sở dữ liệu!');
    return;
  }

  const tempSensor = machine.sensors.find(s => s.sensorType === 'TEMPERATURE');
  if (!tempSensor) {
    console.error('Không tìm thấy cảm biến TEMPERATURE của máy MCH-001!');
    return;
  }

  console.log(`Đang gửi tín hiệu lỗi (Nhiệt độ: 95°C, Vượt ngưỡng: 85°C) cho máy ${machine.name} (${machine.code})...`);

  try {
    const res = await axios.post('http://localhost:3001/api/ingestion/reading', {
      sensorId: Number(tempSensor.id),
      value: 95.0, // Vượt ngưỡng 85°C
      qualityFlag: 0, // 0 biểu thị trạng thái lỗi vượt ngưỡng
      factoryId: Number(machine.zone.factoryId),
      zoneId: Number(machine.zoneId),
      machineId: Number(machine.id),
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log('✅ Đã gửi tín hiệu lỗi thành công!', res.status);
  } catch (err: any) {
    console.error('❌ Lỗi khi gửi tín hiệu:', err.response?.status, err.response?.data);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
