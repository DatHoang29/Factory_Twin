import { Server as SocketIOServer } from 'socket.io';
import { prisma } from './lib/prisma';

export function setupSocketIO(io: SocketIOServer) {
  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Join room for factory updates
    socket.on('join_factory', (factoryId: string) => {
      socket.join(`factory:${factoryId}`);
      console.log(`Client ${socket.id} joined factory room: ${factoryId}`);
    });

    // Join room for machine updates
    socket.on('join_machine', (machineId: string) => {
      socket.join(`machine:${machineId}`);
      console.log(`Client ${socket.id} joined machine room: ${machineId}`);
    });

    // Acknowledge alert
    socket.on('acknowledge_alert', async (alertId: string, userId: string) => {
      try {
        await prisma.alert.update({
          where: { id: BigInt(alertId) },
          data: {
            status: 'ACKNOWLEDGED',
            acknowledgedBy: BigInt(userId),
          },
        });

        const alert = await prisma.alert.findUnique({
          where: { id: BigInt(alertId) },
        });

        if (alert) {
          io.to(`factory:${alert.machineId}`).emit('alert_acknowledged', alert);
        }
      } catch (error) {
        console.error('Error acknowledging alert:', error);
      }
    });

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });
}

const serialize = (obj: any): any => 
  JSON.parse(
    JSON.stringify(obj, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    )
  );

// Broadcast sensor update to all clients in a factory
export function broadcastSensorUpdate(
  io: SocketIOServer,
  factoryId: string | bigint,
  data: any
) {
  io.to(`factory:${factoryId}`).emit('sensor_update', serialize(data));
}

// Broadcast alert to all clients in a factory
export function broadcastAlert(
  io: SocketIOServer,
  factoryId: string | bigint,
  alert: any
) {
  io.to(`factory:${factoryId}`).emit('new_alert', serialize(alert));
}

// Broadcast machine status change
export function broadcastMachineStatus(
  io: SocketIOServer,
  machineId: string | bigint,
  status: string
) {
  io.to(`machine:${machineId}`).emit('machine_status_change', serialize({
    machineId,
    status,
    timestamp: new Date(),
  }));
}