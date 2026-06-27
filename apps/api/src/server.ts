import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import app from './app';
import { redisSub } from './lib/redis';

const PORT = process.env.PORT || 3001;

const httpServer = createServer(app);

// Socket.IO with CORS for Next.js dev server
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`[Socket.IO] Client connected: ${socket.id}`);

  // Join factory-specific room for targeted broadcasts
  socket.on('join-factory', (factoryId: string) => {
    socket.join(`factory:${factoryId}`);
    console.log(`[Socket.IO] ${socket.id} joined factory:${factoryId}`);
  });

  // Join zone-specific room
  socket.on('join-zone', (zoneId: string) => {
    socket.join(`zone:${zoneId}`);
    console.log(`[Socket.IO] ${socket.id} joined zone:${zoneId}`);
  });

  socket.on('disconnect', () => {
    console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
  });
});

const SENSOR_UPDATE_EVENT = 'sensor_update';
const NEW_ALERT_EVENT = 'new_alert';

// Redis pub/sub for real-time events from ingestion service
redisSub.subscribe(SENSOR_UPDATE_EVENT, NEW_ALERT_EVENT, (err: any) => {
  if (err) console.error('[Redis] Subscribe error:', err);
  else console.log('[Redis] Subscribed to sensor_update and new_alert channels');
});

redisSub.on('message', (channel, message) => {
  try {
    const payload = JSON.parse(message);
    
    if (channel === SENSOR_UPDATE_EVENT) {
      // Broadcast sensor update to all connected clients
      io.emit(SENSOR_UPDATE_EVENT, payload);
      
      // Also send to specific factory/zone rooms if included
      if (payload.factoryId) {
        io.to(`factory:${payload.factoryId}`).emit(SENSOR_UPDATE_EVENT, payload);
      }
      if (payload.zoneId) {
        io.to(`zone:${payload.zoneId}`).emit(SENSOR_UPDATE_EVENT, payload);
      }
    } else if (channel === NEW_ALERT_EVENT) {
      // Broadcast new alert to all connected clients
      io.emit(NEW_ALERT_EVENT, payload);
      
      if (payload.factoryId) {
        io.to(`factory:${payload.factoryId}`).emit(NEW_ALERT_EVENT, payload);
      }
    }
  } catch (err) {
    console.error('[Redis] Failed to parse message:', err);
  }
});

httpServer.listen(PORT, () => {
  console.log(`[API] Server running on http://localhost:${PORT}`);
  console.log(`[Socket.IO] WebSocket gateway ready`);
});

export { io };