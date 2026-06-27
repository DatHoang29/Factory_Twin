import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

declare const console: {
  log: (...data: unknown[]) => void;
  error: (...data: unknown[]) => void;
};

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  await prisma.$transaction([
    prisma.notification.deleteMany(),
    prisma.attachment.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.report.deleteMany(),
    prisma.machineActivityLog.deleteMany(),
    prisma.maintenanceTicket.deleteMany(),
    prisma.maintenanceSchedule.deleteMany(),
    prisma.alert.deleteMany(),
    prisma.sensorReadingHourly.deleteMany(),
    prisma.sensorReading.deleteMany(),
    prisma.productionRecord.deleteMany(),
    prisma.energyConsumption.deleteMany(),
    prisma.navigationPoint.deleteMany(),
    prisma.twinModel.deleteMany(),
    prisma.sensor.deleteMany(),
    prisma.machine.deleteMany(),
    prisma.zone.deleteMany(),
    prisma.user.deleteMany(),
    prisma.factory.deleteMany(),
  ]);

  // Create Factory 1
  const factory1 = await prisma.factory.create({
    data: {
      name: 'Nhà máy 1',
      address: 'Khu công nghiệp Amata, Biên Hòa, Đồng Nai',
      description: 'Nhà máy chế tạo cơ khí và linh kiện số 1',
      latitude: 10.9577,
      longitude: 106.8426,
    },
  });

  // Create Factory 2
  const factory2 = await prisma.factory.create({
    data: {
      name: 'Nhà máy 2',
      address: 'Khu công nghiệp VSIP, Thuận An, Bình Dương',
      description: 'Nhà máy lắp ráp điện tử số 2',
      latitude: 10.9500,
      longitude: 106.8000,
    },
  });

  // Create zones for Factory 1
  const zone1 = await prisma.zone.create({
    data: { factoryId: factory1.id, name: 'Phân xưởng Lắp ráp A', floorLevel: 1, description: 'Khu vực lắp ráp chính' },
  });
  const zone2 = await prisma.zone.create({
    data: { factoryId: factory1.id, name: 'Phân xưởng Đóng gói B', floorLevel: 1, description: 'Khu vực đóng gói thành phẩm' },
  });

  // Create zones for Factory 2
  const zone3 = await prisma.zone.create({
    data: { factoryId: factory2.id, name: 'Phân xưởng CNC C', floorLevel: 1, description: 'Khu gia công CNC chính xác' },
  });

  // Hash password for all demo users
  const hash = await bcrypt.hash('password123', 10);

  // Create users (assigned to Factory 1)
  const admin = await prisma.user.create({
    data: { factoryId: factory1.id, fullName: 'Nguyễn Văn Admin', email: 'admin@factory.local', passwordHash: hash, role: 'ADMIN', phone: '0901000001' },
  });
  const tech = await prisma.user.create({
    data: { factoryId: factory1.id, fullName: 'Trần Văn Kỹ Thuật', email: 'tech@factory.local', passwordHash: hash, role: 'TECHNICIAN', phone: '0901000002' },
  });
  const operator = await prisma.user.create({
    data: { factoryId: factory1.id, fullName: 'Lê Thị Vận Hành', email: 'operator@factory.local', passwordHash: hash, role: 'OPERATOR', phone: '0901000003' },
  });
  const viewer = await prisma.user.create({
    data: { factoryId: factory1.id, fullName: 'Phạm Văn Khách', email: 'viewer@factory.local', passwordHash: hash, role: 'VIEWER', phone: '0901000004' },
  });

  // Create machines for Factory 1
  const machines = await Promise.all([
    prisma.machine.create({
      data: { zoneId: zone1.id, code: 'MCH-001', name: 'Máy CNC Phay #1', type: 'CNC', manufacturer: 'Fanuc', installDate: new Date('2023-01-15'), status: 'RUNNING', positionX: -4, positionY: 0, positionZ: -2 },
    }),
    prisma.machine.create({
      data: { zoneId: zone1.id, code: 'MCH-002', name: 'Máy CNC Tiện #2', type: 'CNC', manufacturer: 'Mazak', installDate: new Date('2023-03-20'), status: 'RUNNING', positionX: 0, positionY: 0, positionZ: -2 },
    }),
    prisma.machine.create({
      data: { zoneId: zone1.id, code: 'MCH-003', name: 'Robot Hàn #3', type: 'WELDING_ROBOT', manufacturer: 'ABB', installDate: new Date('2023-06-10'), status: 'STOPPED', positionX: 4, positionY: 0, positionZ: -2 },
    }),
    prisma.machine.create({
      data: { zoneId: zone2.id, code: 'MCH-004', name: 'Máy Đóng gói #4', type: 'PACKAGING', manufacturer: 'Bosch', installDate: new Date('2022-11-01'), status: 'RUNNING', positionX: -4, positionY: 0, positionZ: 3 },
    }),
    prisma.machine.create({
      data: { zoneId: zone2.id, code: 'MCH-005', name: 'Băng tải #5', type: 'CONVEYOR', manufacturer: 'Siemens', installDate: new Date('2022-08-15'), status: 'MAINTENANCE', positionX: 0, positionY: 0, positionZ: 3 },
    }),
    // Create machine for Factory 2
    prisma.machine.create({
      data: { zoneId: zone3.id, code: 'MCH-006', name: 'Máy Phay CNC #6', type: 'CNC', manufacturer: 'Fanuc', installDate: new Date('2024-02-18'), status: 'RUNNING', positionX: -2, positionY: 0, positionZ: -1 },
    }),
  ]);

  // Create sensors for each machine
  for (const machine of machines) {
    await prisma.sensor.createMany({
      data: [
        { machineId: machine.id, sensorType: 'TEMPERATURE', unit: '°C', minThreshold: 10, maxThreshold: 85, mqttTopic: `factory/${machine.code}/temperature` },
        { machineId: machine.id, sensorType: 'VIBRATION', unit: 'mm/s', minThreshold: 0, maxThreshold: 10, mqttTopic: `factory/${machine.code}/vibration` },
        { machineId: machine.id, sensorType: 'SPEED', unit: 'RPM', minThreshold: 0, maxThreshold: 5000, mqttTopic: `factory/${machine.code}/speed` },
        { machineId: machine.id, sensorType: 'POWER', unit: 'kW', minThreshold: 0, maxThreshold: 50, mqttTopic: `factory/${machine.code}/power` },
      ],
    });
  }

  // Create a sample maintenance ticket
  await prisma.maintenanceTicket.create({
    data: {
      machineId: machines[4].id, // Băng tải đang bảo trì
      reportedBy: operator.id,
      assignedTo: tech.id,
      title: 'Băng tải kẹt - cần kiểm tra motor',
      description: 'Băng tải hoạt động chậm và phát tiếng ồn bất thường từ motor chính.',
      priority: 'HIGH',
      status: 'IN_PROGRESS',
    },
  });

  // Create a sample alert
  await prisma.alert.create({
    data: {
      machineId: machines[2].id,
      alertType: 'MACHINE_STOPPED',
      severity: 'WARNING',
      message: 'Robot Hàn #3 đã dừng hoạt động ngoài lịch trình',
      status: 'OPEN',
    },
  });

  console.log('✅ Seeded successfully!');
  console.log('📋 Demo accounts (password: password123):');
  console.log('   ADMIN:      admin@factory.local');
  console.log('   TECHNICIAN: tech@factory.local');
  console.log('   OPERATOR:   operator@factory.local');
  console.log('   VIEWER:     viewer@factory.local');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });