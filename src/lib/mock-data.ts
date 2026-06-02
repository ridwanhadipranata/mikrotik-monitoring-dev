import type { MikrotikDevice } from "./types";

export const mockDevices: MikrotikDevice[] = [
  {
    id: "1",
    name: "RO:Core Router Jtpr",
    host: "10.68.53.1",
    port: 8728,
    username: "api-monitoring",
    password: "",
    status: "online",
    lastSeen: new Date(),
  },
  {
    id: "2",
    name: "x86 INTEL BOTU-C612",
    host: "10.68.53.1",
    port: 8728,
    username: "api-monitoring",
    password: "",
    status: "online",
    lastSeen: new Date(),
  },
];
