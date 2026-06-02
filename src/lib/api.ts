import type { SystemResource, InterfaceInfo, TrafficDataPoint, MikrotikDevice } from "./types";

// Backend API URL - always use /monitoring prefix so Nginx proxy works
const API_BASE = typeof window !== "undefined" ? `${window.location.origin}/monitoring` : "http://localhost:3457";

export class MikrotikAPI {
  private deviceId: string;
  private trafficHistory: TrafficDataPoint[] = [];
  private maxHistory = 60;

  constructor(deviceId: string) {
    this.deviceId = deviceId;
  }

  // Fetch available devices from backend
  static async getDevices(): Promise<MikrotikDevice[]> {
    const res = await fetch(`${API_BASE}/api/devices`, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to fetch devices");
    const data = await res.json();
    return data.map((d: any) => ({
      id: d.id,
      name: d.name,
      host: d.host,
      port: d.port,
      username: "",
      password: "",
      status: d.status || "connecting",
      lastSeen: d.lastSeen ? new Date(d.lastSeen) : undefined,
    }));
  }

  private params(): string {
    return `?device=${this.deviceId}`;
  }

  async getSystemResource(): Promise<SystemResource> {
    const res = await fetch(`${API_BASE}/api/resource${this.params()}`, { cache: "no-store" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.details || "Failed to fetch system resource");
    }
    const data = await res.json();

    return {
      cpuLoad: data.cpuLoad,
      totalMemory: data.totalMemory,
      freeMemory: data.freeMemory,
      usedMemory: data.usedMemory,
      memoryPercent: data.memoryPercent,
      totalDisk: data.totalDisk,
      usedDisk: data.usedDisk,
      freeDisk: data.freeDisk,
      diskPercent: data.diskPercent,
      uptime: parseUptime(data.uptime),
      boardName: data.boardName,
      version: data.version,
      architecture: data.architecture,
      cpuCount: data.cpuCount,
      cpuFrequency: data.cpuFrequency,
      temperature: data.temperature ?? null,
      voltage: data.voltage ?? null,
      name: data.name ?? "Mikrotik",
    };
  }

  async getInterfaces(): Promise<InterfaceInfo[]> {
    const res = await fetch(`${API_BASE}/api/interfaces${this.params()}`, { cache: "no-store" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.details || "Failed to fetch interfaces");
    }
    const data = await res.json();
    return Array.isArray(data) ? data : data.interfaces || [];
  }

  async getTrafficHistory(): Promise<TrafficDataPoint[]> {
    return this.trafficHistory;
  }

  addTrafficPoint(interfaces: InterfaceInfo[]) {
    const totalRx = interfaces.reduce((s, i) => s + i.rxRate, 0);
    const totalTx = interfaces.reduce((s, i) => s + i.txRate, 0);

    const now = new Date();
    const point: TrafficDataPoint = {
      time: now.toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      rx: totalRx,
      tx: totalTx,
    };

    this.trafficHistory.push(point);
    if (this.trafficHistory.length > this.maxHistory) {
      this.trafficHistory.shift();
    }
    return this.trafficHistory;
  }

  async testConnection(): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/api/ping${this.params()}`);
      return res.ok;
    } catch {
      return false;
    }
  }
}

function parseUptime(uptime: string): number {
  if (!uptime) return 0;
  let totalSeconds = 0;
  const weekMatch = uptime.match(/(\d+)w/);
  const dayMatch = uptime.match(/(\d+)d/);
  const timeMatch = uptime.match(/(\d+):(\d+):(\d+)/);
  if (weekMatch) totalSeconds += parseInt(weekMatch[1]) * 7 * 86400;
  if (dayMatch) totalSeconds += parseInt(dayMatch[1]) * 86400;
  if (timeMatch) {
    totalSeconds += parseInt(timeMatch[1]) * 3600;
    totalSeconds += parseInt(timeMatch[2]) * 60;
    totalSeconds += parseInt(timeMatch[3]);
  }
  return totalSeconds;
}
