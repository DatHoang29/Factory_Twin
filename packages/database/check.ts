import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkAllMachines() {
  console.log('🔍 FETCHING ALL MACHINES FROM DATABASE...\n');
  
  const machines = await prisma.machine.findMany({
    include: {
      zone: {
        include: { factory: true }
      },
      sensors: {
        take: 2 // Chỉ lấy tối đa 2 cảm biến để log không bị quá dài
      },
      alerts: {
        orderBy: { createdAt: 'desc' },
        take: 3
      }
    }
  });

  console.log(`📊 DATABASE STATUS: FOUND ${machines.length} MACHINE(S) IN DB:\n`);

  machines.forEach((machine: any, idx: number) => {
    console.log(`--------------------------------------------------`);
    console.log(`[${idx + 1}] Machine: ${machine.name} (${machine.code})`);
    console.log(`    📍 Location: ${machine.zone.factory.name} > ${machine.zone.name}`);
    console.log(`    ⚠️ Status: ${machine.status}`);
    
    console.log(`    📡 Sensors Sample:`);
    machine.sensors.forEach((sensor: any) => {
      console.log(`      - ${sensor.sensorType}: Topic "${sensor.mqttTopic}"`);
    });

    console.log(`    🚨 Recent Alerts (Max 3):`);
    if (machine.alerts.length === 0) {
      console.log(`      (No alerts in database for this machine)`);
    } else {
      machine.alerts.forEach((alert: any) => {
        console.log(`      - [${alert.severity}] [Status: ${alert.status}] ${alert.message} (${alert.createdAt.toLocaleTimeString()})`);
      });
    }
    console.log();
  });

  await prisma.$disconnect();
}

checkAllMachines().catch(err => {
  console.error('Error executing query:', err);
  prisma.$disconnect();
});
