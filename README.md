# Cloud-Based Website Performance Monitor (PulseWatch)

> **PulseWatch** is a lightweight, real-time website observability console and performance monitoring application built with Python Flask, Vanilla JavaScript, and SQLite.

---

## 1. Project Title
**Cloud-Based Website Performance Monitor** (Codename: *PulseWatch*)

---

## 2. Problem Statement
Web applications and API services can suffer from sudden downtime, network latency degradation, or server configuration errors (such as 404/500 HTTP status codes). System administrators and web developers need an efficient, centralized observability tool to perform real HTTP checks, track response times in milliseconds, measure HTTP payload sizes, and analyze historical performance trends without relying on complex, over-engineered enterprise APM platforms.

---

## 3. Objective
To build a practical, visually impressive, and academically presentable Web Technology & Cloud Computing project that:
* Performs real, synchronous HTTP GET monitoring checks against user-defined web targets.
* Measures actual availability status (ONLINE, DEGRADED, OFFLINE), HTTP status codes, response time (ms), and response payload size.
* Stores every check result in a local SQLite database (`data/monitor.db`) without using any static or fake metrics.
* Provides a interactive dashboard with live overview counters, search, status filtering, sorting, performance line charts (Chart.js), and configurable automated browser-side monitoring.

---

## 4. Main Features
1. **Add Website**: Modal form with automatic `https://` protocol prepend and strict SSRF security validation.
2. **Real HTTP Check**: Performs live GET requests with 10-second timeout enforcement.
3. **Status Classification**:
   * **ONLINE**: HTTP 2xx/3xx response with response time $\le 1000\text{ ms}$.
   * **DEGRADED**: HTTP 2xx/3xx response with response time $> 1000\text{ ms}$.
   * **OFFLINE**: Connection failure, DNS resolution failure, timeout, or HTTP 4xx/5xx errors.
4. **Response Time Measurement**: High-precision response time calculation in milliseconds (`ms`).
5. **Response Payload Size**: Reads `Content-Length` or raw byte length formatted in `B`, `KB`, or `MB`.
6. **Monitoring History**: Complete historical log of all manual and automated checks saved in SQLite.
7. **Performance Charts**: Interactive Chart.js line graphs illustrating historical response speeds.
8. **Search & Filter**: Search websites by name/URL, filter by status (All, Online, Degraded, Offline), and sort by Name, Speed, or Check Time.
9. **Manual Recheck & Refresh All**: Instantly recheck individual sites or batch check all registered targets.
10. **Automated Monitoring**: Browser-side periodic auto-check trigger (Off, 30s, 60s, 5min).
11. **SSRF Security Protection**: Blocks internal hostnames (`localhost`, `127.0.0.1`, `0.0.0.0`, `::1`) and private IP subnets (`10.x`, `192.168.x`, `172.16-31.x`).

---

## 5. Technology Stack
* **Frontend**: HTML5, CSS3 (Modern Flexbox/Grid), Vanilla JavaScript (ES6+), Chart.js via CDN.
* **Backend**: Python 3.9+, Flask Web Framework.
* **HTTP Client**: Python `requests` library.
* **Storage**: SQLite3 database (`data/monitor.db`).

---

## 6. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        User Browser                         │
│   (HTML5 / CSS3 Console UI + Vanilla JS + Chart.js CDN)     │
└──────────────────────────────┬──────────────────────────────┘
                               │ Fetch API (JSON)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    Cloud-Hosted Backend                     │
│                 (Flask REST API Application)                │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
               │ HTTP GET Check               │ SQLite Queries
               ▼                              ▼
┌─────────────────────────────┐  ┌────────────────────────────┐
│      Target Websites        │  │     SQLite Database        │
│   (External Web Servers)    │  │     (data/monitor.db)      │
└─────────────────────────────┘  └────────────────────────────┘
```

---

## 7. Cloud Computing Concepts Demonstrated
* **Centralized Observability Service**: Demonstrates how cloud monitoring agents run centrally to poll web endpoints across different geographic regions.
* **Stateless RESTful Architecture**: Backend endpoints (`/api/websites`, `/api/check-all`) maintain stateless client-server interaction over HTTP/JSON.
* **Resource Optimization & Security**: Enforces timeout limits and Server-Side Request Forgery (SSRF) filters to prevent resource exhaustion and cloud internal network probing.
* **Persistent Telemetry Storage**: Decouples monitoring telemetry from transient browser state by storing check metrics in a relational database.

---

## 8. Web Technology Concepts Demonstrated
* **DOM Manipulation**: Dynamic creation and updates of website monitoring cards, modals, and status badges.
* **Fetch API & Asynchronous Operations**: `async/await` network requests communicating seamlessly with Flask JSON endpoints.
* **Responsive Layout Design**: CSS Grid and Flexbox with CSS custom properties (`var(--color-*)`) providing a responsive dark-indigo sidebar console design.
* **Data Visualization**: Dynamic Chart.js canvas rendering showing time-series response time metrics.

---

## 9. Database Design

### `websites` Table
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique website ID |
| `name` | TEXT | NOT NULL | Friendly display name |
| `url` | TEXT | NOT NULL UNIQUE | Validated target URL |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Registration timestamp |

### `checks` Table
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique check record ID |
| `website_id` | INTEGER | FOREIGN KEY REFERENCES `websites(id)` ON DELETE CASCADE | Associated website ID |
| `status` | TEXT | NOT NULL | `ONLINE`, `DEGRADED`, or `OFFLINE` |
| `http_status` | INTEGER | NULLABLE | HTTP status code (e.g., 200, 404, 500) |
| `response_time` | REAL | NULLABLE | Measured latency in milliseconds |
| `response_size` | TEXT | NULLABLE | Formatted payload size (e.g., `42.5 KB`) |
| `checked_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Timestamp of execution |
| `error_message` | TEXT | NULLABLE | Error description if request failed |

---

## 10. Installation & Setup

1. **Clone or navigate to the project folder**:
   ```bash
   cd CloudBasedWebsitePerformanceMonitor
   ```

2. **Install requirements**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Run the application**:
   ```bash
   python app.py
   ```

4. **Access the dashboard**:
   Open your browser and navigate to: `http://127.0.0.1:5000`

---

## 11. API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Serves main Observability Dashboard UI |
| `GET` | `/api/websites` | Returns list of websites with latest status and summary counters |
| `POST` | `/api/websites` | Validates URL, adds website, and executes initial HTTP check |
| `DELETE` | `/api/websites/<id>` | Removes website and all associated history |
| `POST` | `/api/websites/<id>/check` | Performs real-time manual HTTP check for a website |
| `GET` | `/api/websites/<id>/history` | Fetches historical check log and performance metrics |
| `POST` | `/api/check-all` | Batch checks all monitored websites |
| `GET` | `/api/summary` | Fetches global overview counters and recent check activity |

---

## 12. How Monitoring Works
1. When a check is triggered, Flask records `time.perf_counter()`.
2. Flask sends an HTTP GET request via `requests.get(url, timeout=10, allow_redirects=True)`.
3. The response time $\Delta t$ is computed in milliseconds.
4. Response headers are parsed to format byte sizes into `B`, `KB`, or `MB`.
5. The HTTP status code (e.g., `200`, `404`, `500`) is extracted.
6. A record is inserted into SQLite and returned to the browser via JSON.

---

## 13. Testing Instructions
Execute the automated test suite or verify manually:
* Add valid websites (e.g., `example.com`, `github.com`).
* Verify HTTP 200 and accurate response times.
* Test invalid/SSRF URLs (e.g., `127.0.0.1`, `http://localhost`) and verify error rejection messages.
* Test unreachable domain (e.g., `https://invalid-domain-test-999.org`) to confirm `OFFLINE` status.
* Test manual recheck, batch refresh, and website deletion.
* Check performance chart rendering in website detail modal.

---

## 14. Future Enhancements
* Email / Webhook alert notifications on status transitions (ONLINE -> OFFLINE).
* Multi-region distributed agent checking.
* SSL Certificate expiration date tracking.
