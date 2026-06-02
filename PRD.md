# Product Requirements Document (PRD)
# Mikrotik Monitoring Dashboard

**Version:** 1.0
**Date:** 2026-05-22
**Status:** Draft

---

## 1. Overview

### 1.1 Problem Statement
Network administrator membutuhkan cara yang mudah dan real-time untuk memantau performa perangkat Mikrotik tanpa harus login ke Winbox/SSH setiap saat. Monitoring yang tidak terpusat menyulitkan identifikasi masalah secara cepat.

### 1.2 Solution
Web dashboard yang terkoneksi ke Mikrotik melalui API, menampilkan metrik sistem dan trafik secara real-time dalam satu halaman yang clean dan informatif.

### 1.3 Target User
- Network Administrator
- IT Support
- NOC (Network Operations Center)

---

## 2. Core Features

### 2.1 Device Management
| Feature | Description | Priority |
|---------|-------------|----------|
| Add Mikrotik Device | Input IP, port API (default 8728), username, password | P0 |
| Multi-Device Support | Monitor lebih dari 1 Mikrotik dalam satu dashboard | P1 |
| Connection Status | Indikator online/offline per device | P0 |
| Edit / Delete Device | CRUD device | P0 |

### 2.2 System Monitoring (Real-time)
| Metric | Description | Refresh Rate | Priority |
|--------|-------------|--------------|----------|
| **CPU Usage** | Persentase pemakaian CPU (%), grafik line real-time | 1-2 detik | P0 |
| **RAM Usage** | Used vs Total RAM (MB/GB), progress bar + grafik | 1-2 detik | P0 |
| **Disk/Storage** | Used vs Total storage (MB/GB) | 5 detik | P0 |
| **Uptime** | Lama device aktif | 10 detik | P0 |
| **Board Name** | Model perangkat | sekali load | P0 |
| **RouterOS Version** | Versi firmware | sekali load | P1 |
| **Temperature** | Suhu perangkat (jika tersedia) | 5 detik | P2 |

### 2.3 Traffic Monitoring (Real-time)
| Feature | Description | Priority |
|---------|-------------|----------|
| Interface List | Semua interface dengan status (up/down) | P0 |
| Traffic per Interface | RX/TX bytes per detik, grafik real-time | P0 |
| Total Traffic | Aggregate traffic seluruh interface | P1 |
| Traffic History | Grafik trafik per jam/hari/minggu (stored locally) | P1 |
| Bandwidth Utilization | Persentase bandwidth terhadap max speed | P2 |

### 2.4 Alerts & Notifications (P2)
| Feature | Description |
|---------|-------------|
| CPU Threshold | Alert jika CPU > X% selama Y menit |
| RAM Threshold | Alert jika RAM > X% |
| Interface Down | Alert saat interface down |
| Notification Channel | Web notification, Email, Telegram, WhatsApp |

---

## 3. Technical Architecture

```
┌─────────────────────────────────────────────────┐
│                   Frontend (Browser)              │
│  React / Next.js  +  TailwindCSS  +  Chart.js    │
│                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ CPU Card │  │ RAM Card │  │ Disk Card│       │
│  └──────────┘  └──────────┘  └──────────┘       │
│  ┌──────────────────────────────────────┐       │
│  │     Traffic Chart (per interface)     │       │
│  └──────────────────────────────────────┘       │
│           │ WebSocket / SSE                       │
└───────────┼─────────────────────────────────────┘
            │
┌───────────┼─────────────────────────────────────┐
│           ▼        Backend (Node.js)              │
│  ┌────────────────────────────────┐              │
│  │    Express / Fastify Server    │              │
│  │    + WebSocket Server          │              │
│  └────────────────────────────────┘              │
│           │                                      │
│  ┌────────▼───────────────────────┐              │
│  │   Mikrotik API Client          │              │
│  │   (mikrotik-node / routeros-api)│              │
│  │   Port: 8728 (API default)     │              │
│  └────────────────────────────────┘              │
│           │                                      │
│  ┌────────▼───────────────────────┐              │
│  │   Data Store (SQLite / JSON)   │              │
│  │   - Device configs             │              │
│  │   - Historical data            │              │
│  │   - Alert rules                │              │
│  └────────────────────────────────┘              │
└──────────────────────────────────────────────────┘
            │
            │  TCP 8728 (Mikrotik API)
            ▼
┌──────────────────────────────────────────────────┐
│              Mikrotik Router                      │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐ │
│  │ /system    │  │ /interface │  │ /disk      │ │
│  │ /resource  │  │ /monitor   │  │ /health    │ │
│  └────────────┘  └────────────┘  └────────────┘ │
└──────────────────────────────────────────────────┘
```

---

## 4. Mikrotik API Endpoints Used

### 4.1 System Resource
```
GET /system/resource
→ cpu-load, total-memory, free-memory, uptime, board-name, version

GET /system/resource/print
→ Detailed system info
```

### 4.2 Disk/Storage
```
GET /disk/print
→ total, used, free

GET /system/resource (sebagian)
→ write-sect-total, write-sect-since-reboot
```

### 4.3 Interface Traffic
```
GET /interface/print
→ List semua interface, status (up/down), type

/interface/monitor-traffic interface=ether1 once
→ rx-bits-per-second, tx-bits-per-second, rx-packets-per-second, tx-packets-per-second
```

### 4.4 Health (jika didukung)
```
GET /system/health
→ temperature, voltage, cpu-frequency
```

---

## 5. Tech Stack

| Layer | Technology | Reason |
|-------|-----------|--------|
| **Frontend** | Next.js 14 (App Router) | SSR, fast refresh, good DX |
| **Styling** | TailwindCSS + shadcn/ui | Clean, fast UI development |
| **Charts** | Chart.js / Recharts | Real-time line charts |
| **Backend** | Node.js + Express/Fastify | Same language, async-friendly |
| **Mikrotik API** | `mikrotik-node` (npm) | Mature Mikrotik API lib |
| **Real-time** | WebSocket (ws) | Low-latency data push |
| **Database** | SQLite (better-sqlite3) | Lightweight, no setup |
| **Auth** | JWT + bcrypt | Simple, secure |

---

## 6. Data Flow

### 6.1 Real-time Polling Flow
```
1. Frontend connects via WebSocket
2. Backend starts polling loop per connected device:
   - Every 1s: CPU, RAM, interface traffic
   - Every 5s: Disk, temperature
   - Every 10s: uptime, connection status
3. Backend pushes data to all connected WebSocket clients
4. Frontend updates charts & cards in real-time
```

### 6.2 Historical Data
```
1. Backend stores snapshots every 1 minute to SQLite
2. Frontend can request historical data for charts
3. Auto-cleanup: keep 7 days of minute data, 30 days of hourly aggregates
```

---

## 7. UI/UX Design

### 7.1 Dashboard Layout
```
┌─────────────────────────────────────────────────────┐
│  Mikrotik Monitor    [Device: RB450G ▼]  [⚙ Settings]│
├─────────┬─────────┬─────────┬──────────────────────┤
│  CPU    │  RAM    │  Disk   │  Uptime              │
│  23%    │  45%    │  12%    │  45d 12h 30m         │
│ [chart] │ [chart] │ [bar]   │  v7.12               │
├─────────┴─────────┴─────────┴──────────────────────┤
│                                                      │
│  Traffic Monitor - All Interfaces                    │
│  ┌──────────────────────────────────────────────┐  │
│  │  ether1:   ▲ 45.2 Mbps  ▼ 12.8 Mbps        │  │
│  │  ether2:   ▲ 1.2 Mbps   ▼ 0.8 Mbps         │  │
│  │  wlan1:    ▲ 22.1 Mbps  ▼ 15.4 Mbps        │  │
│  │                                               │  │
│  │  [Real-time line chart - last 5 minutes]      │  │
│  │  ─────────────────────────────────────        │  │
│  │  ╱╲  ╱╲                                      │  │
│  │ ╱  ╲╱  ╲╱╲   ╱╲                             │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
│  Interface Status                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │  ether1   │ up   │ 1Gbps │ RX: 1.2GB │ TX: 3.4GB│
│  │  ether2   │ up   │ 1Gbps │ RX: 450MB │ TX: 120MB│
│  │  wlan1    │ up   │ auto  │ RX: 2.1GB │ TX: 890MB│
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 7.2 Pages
| Page | URL | Description |
|------|-----|-------------|
| Dashboard | `/` | Main monitoring view |
| Device List | `/devices` | CRUD devices |
| Device Detail | `/devices/:id` | Single device full view |
| Alerts | `/alerts` | Alert rules & history |
| Settings | `/settings` | General settings |
| Login | `/login` | Authentication |

### 7.3 Design Principles
- **Dark mode first** (admin tools identik dengan dark theme)
- **Color coding:** Green (< 60%), Yellow (60-80%), Red (> 80%)
- **Mobile responsive** (admin sering cek dari HP)
- **Minimal clicks** — semua info utama visible di dashboard

---

## 8. Security

| Aspect | Implementation |
|--------|---------------|
| Mikrotik Credentials | Encrypted at rest (AES-256), never exposed to frontend |
| API Authentication | JWT token with expiry |
| HTTPS | Enforced in production |
| CORS | Restricted to known origins |
| Rate Limiting | API rate limit to prevent Mikrotik overload |
| Input Validation | All device inputs sanitized |
| Mikrotik User | Recommend read-only API user on Mikrotik side |

---

## 9. Configuration

### 9.1 Environment Variables
```env
# Server
PORT=3000
NODE_ENV=production
JWT_SECRET=<random-secret>

# Database
DB_PATH=./data/monitor.db

# Polling
POLL_INTERVAL_MS=2000
TRAFFIC_POLL_INTERVAL_MS=1000

# Security
CORS_ORIGIN=https://your-domain.com
```

### 9.2 Mikrotik Setup Requirements
```
# On Mikrotik, create read-only API user:
/user group add name=api-read policy=read,api,test
/user add name=monitoring password=<strong-password> group=api-read

# Enable API service:
/ip service enable api
/ip service set api port=8728

# Optional: restrict API access to monitoring server IP only
/ip service set api address=192.168.1.100/32
```

---

## 10. Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Dashboard load time | < 2 detik |
| Data latency | < 3 detik dari aktual |
| Concurrent devices | Minimal 10 device |
| Concurrent users | Minimal 50 user |
| Uptime | 99.5% |
| Browser support | Chrome, Firefox, Safari, Edge (latest 2 versions) |
| Responsive | Desktop + Tablet + Mobile |

---

## 11. Project Structure

```
mikrotik-monitoring/
├── PRD.md                    # This file
├── package.json
├── docker-compose.yml
├── .env.example
│
├── src/
│   ├── server/
│   │   ├── index.js              # Entry point
│   │   ├── config.js             # Configuration
│   │   ├── routes/
│   │   │   ├── auth.js           # Login/register
│   │   │   ├── devices.js        # Device CRUD
│   │   │   ├── monitoring.js     # Historical data API
│   │   │   └── alerts.js         # Alert management
│   │   ├── services/
│   │   │   ├── mikrotik.js       # Mikrotik API wrapper
│   │   │   ├── poller.js         # Background polling service
│   │   │   ├── websocket.js      # WebSocket handler
│   │   │   └── alert.js          # Alert engine
│   │   ├── db/
│   │   │   ├── schema.js         # SQLite schema
│   │   │   └── store.js          # DB operations
│   │   └── middleware/
│   │       ├── auth.js           # JWT middleware
│   │       └── rateLimit.js      # Rate limiter
│   │
│   └── client/
│       ├── app/
│       │   ├── layout.tsx
│       │   ├── page.tsx          # Dashboard
│       │   ├── devices/
│       │   │   ├── page.tsx      # Device list
│       │   │   └── [id]/page.tsx # Device detail
│       │   ├── alerts/page.tsx
│       │   ├── settings/page.tsx
│       │   └── login/page.tsx
│       ├── components/
│       │   ├── dashboard/
│       │   │   ├── CpuCard.tsx
│       │   │   ├── RamCard.tsx
│       │   │   ├── DiskCard.tsx
│       │   │   ├── TrafficChart.tsx
│       │   │   ├── InterfaceTable.tsx
│       │   │   └── DeviceSelector.tsx
│       │   ├── ui/               # shadcn components
│       │   └── shared/
│       └── lib/
│           ├── api.ts            # API client
│           ├── websocket.ts      # WS client
│           └── utils.ts
│
├── data/                         # SQLite DB (gitignored)
└── docs/
    ├── setup.md
    └── mikrotik-setup.md
```

---

## 12. Development Phases

### Phase 1 — MVP (2-3 minggu)
- [ ] Project setup (Next.js + Express + SQLite)
- [ ] Mikrotik API connection & basic polling
- [ ] Single device monitoring (CPU, RAM, Disk, Uptime)
- [ ] Traffic monitoring per interface with real-time chart
- [ ] Dark theme dashboard UI
- [ ] Basic authentication

### Phase 2 — Multi-Device & Polish (1-2 minggu)
- [ ] Multi-device support
- [ ] Device CRUD management page
- [ ] Historical data storage & charts
- [ ] Mobile responsive
- [ ] Error handling & connection retry

### Phase 3 — Advanced Features (1-2 minggu)
- [ ] Alert system with thresholds
- [ ] Notification channels (Email, Telegram)
- [ ] Dashboard customization (drag & drop widgets)
- [ ] Export data (CSV)
- [ ] Docker deployment

---

## 13. Success Metrics

| Metric | Target |
|--------|--------|
| Time to first data | < 5 detik setelah add device |
| Dashboard refresh rate | 1-2 detik |
| Alert delivery time | < 30 detik dari threshold breach |
| User satisfaction | Admin bisa detect masalah < 1 menit |
| System resource usage | Backend < 100MB RAM |

---

## 14. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Mikrotik API rate limit | Data tidak real-time | Optimize polling, batch requests |
| API connection drop | Dashboard blank | Auto-reconnect with exponential backoff |
| Different RouterOS versions | API response berbeda | Version detection, graceful degradation |
| Memory leak dari polling | Server crash | Connection pool, proper cleanup |
| Credential exposure | Security breach | Encryption at rest, read-only user |

---

## 15. Open Questions

1. **Hosting:** Self-hosted atau cloud? (affects deployment strategy)
2. **Multi-user:** Perlu role-based access (admin/viewer)?
3. **Notifications:** Channel mana yang priority? (Telegram paling umum untuk NOC)
4. **Historical data retention:** Berapa lama simpan data?
5. **Branding:** Custom logo / nama untuk dashboard?

---

_Next steps: Review PRD → Approve → Start Phase 1 Development_
