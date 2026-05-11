# Intelligent Lab Safety System

A real-time PPE (Personal Protective Equipment) monitoring system for chemistry
laboratories. The system uses computer vision (YOLOv11) to detect lab coats,
gloves, goggles, and masks on a live webcam feed, automatically logs every
violation, and exposes a dashboard for supervisors to review activity, gas and
temperature readings, and event history.

The project was developed for the College of Computer Sciences and Information
Technology at King Faisal University.

---

## Architecture

The system consists of three layers:

1. **Frontend dashboard** — React + TypeScript + Vite + Tailwind CSS.
   Captures the webcam feed, sends frames to the backend over WebSocket, and
   renders the live overlay, PPE status, gas valve, environmental sensors,
   alerts, and event logs.
2. **Detection backend** — `server.py`. A Python server that:
   - Runs a YOLOv11 model for PPE detection.
   - Exposes a WebSocket on `ws://localhost:8765` for the camera stream.
   - Exposes an HTTP API on `http://localhost:8766` for login, registration,
     profile updates, sensor data, and event logs.
   - Persists everything to a SQLite database (`lab_safety.db`).
3. **Hardware (optional)** — Raspberry Pi 4 with DHT11 (temperature/humidity)
   and MQ-2 (gas) sensors, plus a relay module that controls the gas valve.
   The Pi posts readings to the backend via `POST /api/sensor-data`.

---

## Project layout

```
lab_safety_system3/
├── server.py              # Python backend (WebSocket + HTTP API + YOLO)
├── model_test.py          # Standalone YOLO evaluation script (Colab-friendly)
├── models/                # Place trained YOLO weights here (see below)
├── src/                   # React + TypeScript frontend
│   ├── App.tsx
│   ├── main.tsx
│   ├── index.css
│   ├── styles/
│   └── components/
│       ├── ActivityLog.tsx
│       ├── ConfirmActionModal.tsx
│       ├── Login.tsx
│       ├── PasswordRecovery.tsx
│       ├── Registration.tsx
│       └── ViolationTracker.tsx
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
└── tsconfig*.json
```

The following are generated automatically when you run the project and are not
included in this submission:
- `node_modules/` — created by `npm install`
- `build/` — created by `npm run build`
- `__pycache__/` — created by Python at runtime
- `lab_safety.db` — created by `server.py` on first run
- `violation_images/` — populated at runtime when violations are detected

---

## Requirements

- Node.js 18 or later, npm
- Python 3.10 or later
- A webcam (Logitech preferred)
- (Optional) An NVIDIA GPU for faster inference

---

## Setup

### 1. Install frontend dependencies

```
npm install
```

### 2. Install backend dependencies

```
pip install websockets ultralytics opencv-python pillow torch
```

### 3. Add the trained YOLO weight

Create a folder named `models/` next to `server.py` and place the trained
weight file inside it:

```
models/best.pt
```

If your weight file has a different name, edit `MODEL_PATH` near the top of
`server.py` to point at it.

---

## Running

Open two terminals.

**Terminal 1 — backend:**

```
python server.py
```

This starts:
- WebSocket server on `ws://localhost:8765`
- HTTP API on `http://localhost:8766`
- Creates `lab_safety.db` and `violation_images/` on first run

**Terminal 2 — frontend:**

```
npm run dev
```

Open the URL printed by Vite (usually `http://localhost:3000` or
`http://localhost:5173`) in your browser.

The first time you open the dashboard you will need to register a supervisor
account from the registration screen. After that, log in and click **Start
Camera** to begin live PPE detection.

---

## Building for production

```
npm run build
```

This produces a static bundle in the `build/` folder.

---

## Notes

- All comments and UI strings are in English.
- The database and violation images are not shipped with the project; both are
  recreated on first run.
- Default port numbers (8765 / 8766) can be changed at the top of `server.py`.
