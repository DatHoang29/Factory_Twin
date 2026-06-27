import express from 'express';
import cors from 'cors';
import { authRouter } from './routes/auth';
import { factoryRouter } from './routes/factories';
import { zoneRouter } from './routes/zones';
import { machineRouter } from './routes/machines';
import { sensorRouter } from './routes/sensors';
import { userRouter } from './routes/users';
import { alertRouter } from './routes/alerts';
import { ticketRouter } from './routes/tickets';
import { ingestionRouter } from './routes/ingestion';
import { reportRouter } from './routes/reports';
import { maintenanceScheduleRouter } from './routes/maintenance-schedule';
import { uploadRouter } from './routes/uploads';

const app = express();

app.use(cors());
app.use(express.json({ limit: '25mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'factory-digital-twin-api' });
});

app.use('/api/auth', authRouter);
app.use('/api/factories', factoryRouter);
app.use('/api/zones', zoneRouter);
app.use('/api/machines', machineRouter);
app.use('/api/sensors', sensorRouter);
app.use('/api/users', userRouter);
app.use('/api/alerts', alertRouter);
app.use('/api/tickets', ticketRouter);
app.use('/api/ingestion', ingestionRouter);
app.use('/api/reports', reportRouter);
app.use('/api/maintenance-schedules', maintenanceScheduleRouter);
app.use('/api/uploads', uploadRouter);

export default app;
