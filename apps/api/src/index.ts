import fs from 'fs';
import path from 'path';

// Robust manual .env loader
const loadEnv = () => {
  const searchPaths = [
    path.join(__dirname, '../../../.env'), // root relative to src/index.ts
    path.join(process.cwd(), '.env'),      // local .env
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
        console.log(`[API Server] Environment loaded from ${p}`);
        break;
      } catch (e) {
        console.error(`[API Server] Error loading env from ${p}`, e);
      }
    }
  }
};
loadEnv();

import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { authRouter } from './routes/auth';
import { factoryRouter } from './routes/factories';
import { machineRouter } from './routes/machines';
import { sensorRouter } from './routes/sensors';
import { alertRouter } from './routes/alerts';
import { ticketRouter } from './routes/tickets';
import { userRouter } from './routes/users';
import { zoneRouter } from './routes/zones';
import { ingestionRouter } from './routes/ingestion';
import { prisma } from './lib/prisma';
import { setupSocketIO } from './socket';
import { setupIngestion } from './services/ingestion';
import './workers/sensorWorker';
import './workers/sensorGenerator';
import { startAggregationWorker } from './workers/aggregationWorker';
import { redisSub } from './lib/redis';
import { reportRouter } from './routes/reports';
import { maintenanceScheduleRouter } from './routes/maintenance-schedule';
import { uploadRouter } from './routes/uploads';
import { predictiveRouter } from './routes/predictive';

const app = express();
const server = http.createServer(app);

// Socket.IO setup
const io = new SocketIOServer(server, {
  path: '/api/socket.io',
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// Middleware
app.use(cors());
app.use(express.json());

const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Public stats for landing/login page without authentication
app.get('/api/public/stats', async (_req, res) => {
  try {
    const [machinesCount, errorCount] = await Promise.all([
      prisma.machine.count(),
      prisma.machine.count({ where: { status: 'ERROR' } }),
    ]);
    res.json({
      success: true,
      machinesCount,
      errorCount,
    });
  } catch (err) {
    console.error('Error fetching public stats:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Endpoint to fetch the LAN local IP address of this computer
app.get('/api/public/system-ip', (_req, res) => {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  let ipAddress = 'localhost';
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ipAddress = iface.address;
        break;
      }
    }
    if (ipAddress !== 'localhost') break;
  }
  res.json({ success: true, ipAddress });
});

// API routes
app.use('/api/auth', authRouter);
app.use('/api/factories', factoryRouter);
app.use('/api/zones', zoneRouter);
app.use('/api/machines', machineRouter);
app.use('/api/sensors', sensorRouter);
app.use('/api/alerts', alertRouter);
app.use('/api/tickets', ticketRouter);
app.use('/api/users', userRouter);
app.use('/api/ingestion', ingestionRouter);
app.use('/api/reports', reportRouter);
app.use('/api/maintenance-schedules', maintenanceScheduleRouter);
app.use('/api/uploads', uploadRouter);
app.use('/api/predictive', predictiveRouter);

// Socket.IO handlers
setupSocketIO(io);

// Start ingestion service (listens to Redis pub/sub for sensor data)
setupIngestion(io);

// Start periodic aggregation and clean-up worker
startAggregationWorker();

// Redis pub/sub for real-time events from ingestion service
const SENSOR_UPDATE_EVENT = 'sensor_update';
const NEW_ALERT_EVENT = 'new_alert';

redisSub.subscribe(SENSOR_UPDATE_EVENT, NEW_ALERT_EVENT, (err: any) => {
  if (err) console.error('[Redis] Subscribe error:', err);
  else console.log('✅ [Redis] Subscribed to sensor_update and new_alert channels in index.ts');
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
    console.error('[Redis] Failed to parse message in index.ts:', err);
  }
});

const PORT = process.env.API_PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 API server running on http://localhost:${PORT}`);
  console.log(`🔌 Socket.IO ready`);
});

export { io };