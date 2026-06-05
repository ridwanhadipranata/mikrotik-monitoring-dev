import type { SystemResource, InterfaceInfo, TrafficDataPoint, MikrotikDevice } from "./types";
import { authFetch } from "./auth";

// Backend API URL - always use /monitoring prefix so Nginx proxy works
const API_BASE = typeof window !== "undefined"
  ? `${window.location.origin}/monitoring`
  : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3457");

export class MikrotikAPI {
  private deviceId: string;
  private trafficHistory: TrafficDataPoint[] = [];
  private maxHistory = 60;

  constructor(deviceId: string) {
    this.deviceId = deviceId;
  }

  // Fetch available devices from backend (tenant-scoped)
  static async getDevices(): Promise<MikrotikDevice[]> {
    const res = await authFetch(`${API_BASE}/api/devices`, { cache: "no-store" });
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
      tenant: d.tenant || null,
    }));
  }

  private params(): string {
    return `?device=${this.deviceId}`;
  }

  async getSystemResource(): Promise<SystemResource> {
    const res = await authFetch(`${API_BASE}/api/resource${this.params()}`, { cache: "no-store" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.details || "Failed to fetch system resource");
    }
    const data = await res.json();

    return {
      cpuLoad: data.cpuLoad,
      cpuCount: data.cpuCount || 1,
      cpuFrequency: data.cpuFrequency || 0,
      totalMemory: data.totalMemory,
      freeMemory: data.freeMemory,
      usedMemory: data.usedMemory,
      memoryPercent: data.memoryPercent,
      totalDisk: data.totalDisk,
      usedDisk: data.usedDisk,
      freeDisk: data.freeDisk,
      diskPercent: data.diskPercent,
      uptime: data.uptime,
      boardName: data.boardName,
      version: data.version,
      architecture: data.architecture,
      temperature: data.temperature,
      voltage: data.voltage,
      name: data.name,
    };
  }

  async getInterfaces(): Promise<InterfaceInfo[]> {
    const res = await authFetch(`${API_BASE}/api/interfaces${this.params()}`, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to fetch interfaces");
    const data = await res.json();
    return data.interfaces || [];
  }

  async getTraffic(): Promise<{ rx: number; tx: number }> {
    const res = await authFetch(`${API_BASE}/api/wan-traffic${this.params()}`, { cache: "no-store" });
    if (!res.ok) return { rx: 0, tx: 0 };
    const data = await res.json();

    const point: TrafficDataPoint = {
      time: new Date().toISOString(),
      rx: data.rx || 0,
      tx: data.tx || 0,
    };
    this.trafficHistory.push(point);
    if (this.trafficHistory.length > this.maxHistory) {
      this.trafficHistory.shift();
    }

    return { rx: data.rx || 0, tx: data.tx || 0 };
  }

  getTrafficHistory(): TrafficDataPoint[] {
    return [...this.trafficHistory];
  }

  addTrafficPoint(interfaces: any[]): TrafficDataPoint[] {
    const wanInterface = interfaces.find(i => i.type === "ether" && i.status === "up");
    if (!wanInterface) return this.trafficHistory;

    const point: TrafficDataPoint = {
      time: new Date().toISOString(),
      rx: wanInterface.rxBytes || 0,
      tx: wanInterface.txBytes || 0,
    };
    this.trafficHistory.push(point);
    if (this.trafficHistory.length > this.maxHistory) {
      this.trafficHistory.shift();
    }
    return [...this.trafficHistory];
  }

  async getConnectionState(): Promise<{ status: string; latency: number }> {
    const res = await authFetch(`${API_BASE}/api/connection${this.params()}`, { cache: "no-store" });
    if (!res.ok) return { status: "disconnected", latency: 0 };
    return res.json();
  }
}
