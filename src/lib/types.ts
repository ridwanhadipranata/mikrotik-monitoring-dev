export interface MikrotikDevice {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  status: "online" | "offline" | "connecting";
  lastSeen?: Date;
}

export interface SystemResource {
  cpuLoad: number;
  totalMemory: number;
  freeMemory: number;
  usedMemory: number;
  memoryPercent: number;
  totalDisk: number;
  usedDisk: number;
  freeDisk: number;
  diskPercent: number;
  uptime: number;
  boardName: string;
  version: string;
  architecture: string;
  cpuCount: number;
  cpuFrequency: number;
  temperature: number | null;
  voltage: number | null;
  name?: string;
}

export interface InterfaceInfo {
  name: string;
  type: string;
  status: "up" | "down";
  macAddress: string;
  speed?: string;
  rxRate: number; // bits per second
  txRate: number; // bits per second
  rxBytes: number;
  txBytes: number;
  rxPackets: number;
  txPackets: number;
}

export interface TrafficDataPoint {
  time: string;
  rx: number;
  tx: number;
}

export interface MonitoringData {
  device: MikrotikDevice;
  resource: SystemResource;
  interfaces: InterfaceInfo[];
  timestamp: Date;
}

export interface AlertRule {
  id: string;
  deviceId: string;
  type: "cpu" | "ram" | "disk" | "interface_down";
  threshold: number;
  enabled: boolean;
  notifyEmail: boolean;
  notifyTelegram: boolean;
}

export interface DashboardStats {
  totalDevices: number;
  onlineDevices: number;
  avgCpu: number;
  avgRam: number;
  totalTraffic: { rx: number; tx: number };
}
