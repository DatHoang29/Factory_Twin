// Shared types between frontend and backend

export type UserRole = 'ADMIN' | 'TECHNICIAN' | 'OPERATOR' | 'VIEWER';
export type MachineStatus = 'RUNNING' | 'STOPPED' | 'MAINTENANCE' | 'ERROR';
export type AlertSeverity = 'CRITICAL' | 'WARNING' | 'INFO';
export type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type SensorType = 'TEMPERATURE' | 'VIBRATION' | 'SPEED' | 'POWER' | 'ONOFF' | 'OUTPUT';

// Socket.IO event types
export interface SensorUpdateEvent {
  machineId: number;
  machineCode: string;
  sensorId: number;
  sensorType: SensorType;
  value: number;
  unit: string;
  timestamp: string;
}

export interface MachineStatusEvent {
  machineId: number;
  machineCode: string;
  previousStatus: MachineStatus;
  newStatus: MachineStatus;
  timestamp: string;
}

export interface AlertEvent {
  id: number;
  machineId: number;
  machineCode: string;
  machineName: string;
  sensorId?: number;
  alertType: string;
  severity: AlertSeverity;
  message: string;
  thresholdValue?: number;
  actualValue?: number;
  createdAt: string;
}

// API response wrapper
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Auth
export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: {
    id: number;
    email: string;
    fullName: string;
    role: UserRole;
    factoryId?: number;
  };
}

// Machine status color mapping
export const MACHINE_STATUS_COLORS: Record<MachineStatus, string> = {
  RUNNING: '#22c55e',    // green
  STOPPED: '#ef4444',    // red
  MAINTENANCE: '#f59e0b', // amber
  ERROR: '#dc2626',      // dark red
};

export const ALERT_SEVERITY_COLORS: Record<AlertSeverity, string> = {
  CRITICAL: '#dc2626',
  WARNING: '#f59e0b',
  INFO: '#3b82f6',
};