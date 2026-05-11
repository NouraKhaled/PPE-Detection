# ============================================================
# server.py  —  Python WebSocket Server + YOLOv11 Detection
# + Auto-save violations to SQLite database
# Run:           python server.py
# Requirements:  pip install websockets ultralytics opencv-python pillow torch
# ============================================================

import asyncio
import json
import numpy as np
import cv2
import sqlite3
import os
import base64
import hashlib
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import datetime
import websockets
from ultralytics import YOLO
import torch

# ── Settings ────────────────────────────────────────────────
HOST        = "localhost"
PORT        = 8765
HTTP_PORT   = 8766   # HTTP API port for user management

# ──  model for detection  ─────
_MODELS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
MODEL_PATHS = os.path.join(_MODELS_DIR, "best.pt")
CONF_THRESH = 0.15
IOU_THRESH  = 0.45
IMG_SIZE    = 320
WBF_IOU_THR = 0.5   # WBF merge threshold

# SPEED: process every Nth frame; return cached result for skipped frames
# 1 = process every frame (slowest), 8 = process every 8th frame (faster UI responsiveness)
PROCESS_EVERY_N = 8

# SPEED: downscale incoming frames before inference to reduce transfer size & CPU load
# Browser sends 1280x720 → we downscale to this width before running YOLO
INFER_WIDTH = 640

# Project root — same folder as server.py
BASE_DIR    = os.path.dirname(os.path.abspath(__file__))

# Folder where violation images are stored (inside the project)
IMAGES_DIR  = os.path.join(BASE_DIR, "violation_images")

# SQLite database path (inside the project)
DB_PATH     = os.path.join(BASE_DIR, "lab_safety.db")

os.makedirs(IMAGES_DIR, exist_ok=True)

# ── In-memory sensor data from Pi ────────────────────────────
_pi_sensor_data = {
    "temperature":  None,
    "humidity":     None,
    "gas_level":    None,
    "gas_detected": False,
    "updated_at":   None,
}

# PPE classes required for compliance — must match model.names exactly
REQUIRED_PPE = {"labcoat", "gloves", "goggles", "mask"}


# ── Load models and auto-select device ──────────────────────
# SPEED FIX: auto-detect GPU; falls back to CPU if no GPU is available
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
print(f"[INFO] Using device: {DEVICE.upper()}")

# Load all available models
models = []
dummy  = np.zeros((IMG_SIZE, IMG_SIZE, 3), dtype=np.uint8)
for path in MODEL_PATHS:
    if os.path.exists(path):
        try:
            m = YOLO(path)
            m.to(DEVICE)
            m(dummy, conf=CONF_THRESH, iou=IOU_THRESH, imgsz=IMG_SIZE, verbose=False)
            models.append(m)
            print(f"[INFO] Loaded ✓ {os.path.basename(path)}")
        except Exception as e:
            print(f"[WARN] Could not load {os.path.basename(path)}: {e}")
    else:
        print(f"[WARN] Model not found: {path}")

if not models:
    raise RuntimeError("No models loaded! Check MODEL_PATHS in server.py")

print(f"[INFO] {len(models)} model(s) ready — using WBF ensemble")

# ── Password hashing helper ─────────────────────────────────
def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


# ── Database setup ──────────────────────────────────────────
def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("PRAGMA foreign_keys = ON;")

    # Users (ERD + username; created_at for UI sorting)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS Users (
            user_id       INTEGER PRIMARY KEY AUTOINCREMENT,
            username      TEXT UNIQUE NOT NULL,
            name          TEXT NOT NULL,
            email         TEXT UNIQUE NOT NULL,
            role          TEXT NOT NULL CHECK (role = 'supervisor'),
            password_hash TEXT NOT NULL,
            created_at    TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # ── Lightweight migrations for existing DBs ──
    # Add username column if DB was created before username was introduced.
    try:
        cursor.execute("PRAGMA table_info(Users)")
        cols = [r[1] for r in cursor.fetchall()]
        if "username" not in cols:
            cursor.execute("ALTER TABLE Users ADD COLUMN username TEXT")
            cursor.execute("UPDATE Users SET username = COALESCE(username, email) WHERE username IS NULL OR username = ''")
            cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique ON Users(username)")
    except Exception as e:
        print(f"[DB] Migration warning (Users.username): {e}")

    # Enforce single-role system: supervisor only
    try:
        cursor.execute("UPDATE Users SET role='supervisor' WHERE role IS NULL OR role != 'supervisor'")
    except Exception as e:
        print(f"[DB] Migration warning (Users.role): {e}")

    # Devices
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS Devices (
            device_id INTEGER PRIMARY KEY AUTOINCREMENT,
            location  TEXT NOT NULL,
            status    TEXT NOT NULL
        )
    """)

    # CameraDetections
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS CameraDetections (
            detection_id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp    TEXT NOT NULL,
            ppe_status   TEXT NOT NULL,
            details      TEXT,
            device_id    INTEGER,
            FOREIGN KEY (device_id) REFERENCES Devices(device_id)
        )
    """)

    # TempReadings
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS TempReadings (
            temp_id    INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp  TEXT NOT NULL,
            temp_value REAL NOT NULL,
            device_id  INTEGER,
            FOREIGN KEY (device_id) REFERENCES Devices(device_id)
        )
    """)

    # GasReadings
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS GasReadings (
            gas_id    INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            gas_value REAL NOT NULL,
            device_id INTEGER,
            FOREIGN KEY (device_id) REFERENCES Devices(device_id)
        )
    """)

    # EventsLog
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS EventsLog (
            event_id      INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp     TEXT NOT NULL,
            event_type    TEXT NOT NULL,
            action_taken  TEXT,
            device_id     INTEGER,
            user_id       INTEGER,
            temp_id       INTEGER,
            gas_id        INTEGER,
            detection_id  INTEGER,
            FOREIGN KEY (device_id) REFERENCES Devices(device_id),
            FOREIGN KEY (user_id) REFERENCES Users(user_id),
            FOREIGN KEY (temp_id) REFERENCES TempReadings(temp_id),
            FOREIGN KEY (gas_id) REFERENCES GasReadings(gas_id),
            FOREIGN KEY (detection_id) REFERENCES CameraDetections(detection_id)
        )
    """)

    # Helpful indexes
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_events_ts ON EventsLog(timestamp);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_det_ts ON CameraDetections(timestamp);")

    # Seed a default device
    cursor.execute("""
        INSERT OR IGNORE INTO Devices (device_id, location, status)
        VALUES (1, 'Main Lab Camera', 'active')
    """)

    conn.commit()
    conn.close()
    print(f"[DB] Database ready at: {DB_PATH}")

# ── HTTP API for user management ────────────────────────────
class UserAPIHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # suppress request logs from the terminal

    def _send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def do_OPTIONS(self):
        self.send_response(200)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        if self.path == '/api/status':
            try:
                conn = sqlite3.connect(DB_PATH)
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT ppe_status, details
                    FROM CameraDetections
                    ORDER BY detection_id DESC
                    LIMIT 1
                """)
                row = cursor.fetchone()
                conn.close()
                if row:
                    ppe_status = row[0]
                    compliant  = (ppe_status == 'COMPLIANT')
                    self._send_json(200, {
                        'gas_valve':  'OPEN' if compliant else 'CLOSED',
                        'ppe_status': ppe_status,
                        'compliant':  compliant,
                    })
                else:
                    self._send_json(200, {
                        'gas_valve':  'CLOSED',
                        'ppe_status': 'NO_DATA',
                        'compliant':  False,
                    })
            except Exception as e:
                self._send_json(500, {'error': str(e), 'gas_valve': 'CLOSED'})

        elif self.path == '/api/pi-status':
            # Frontend polls this for real Pi sensor data
            try:
                conn = sqlite3.connect(DB_PATH)
                cursor = conn.cursor()
                cursor.execute('SELECT ppe_status FROM CameraDetections ORDER BY detection_id DESC LIMIT 1')
                det_row = cursor.fetchone()
                conn.close()
                ppe_status = det_row[0] if det_row else 'NO_DATA'
                compliant  = (ppe_status == 'COMPLIANT')
                self._send_json(200, {
                    'gas_valve':    'OPEN' if compliant else 'CLOSED',
                    'ppe_status':   ppe_status,
                    'compliant':    compliant,
                    'temperature':  _pi_sensor_data.get('temperature'),
                    'humidity':     _pi_sensor_data.get('humidity'),
                    'gas_level':    _pi_sensor_data.get('gas_level'),
                    'gas_detected': _pi_sensor_data.get('gas_detected', False),
                    'updated_at':   _pi_sensor_data.get('updated_at'),
                })
            except Exception as e:
                self._send_json(500, {'error': str(e)})

        elif self.path == '/api/users':
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            cursor.execute("SELECT username, name, email, role, created_at FROM Users ORDER BY created_at ASC")
            rows = cursor.fetchall()
            conn.close()
            users = [
                {'username': r[0], 'fullName': r[1], 'email': r[2], 'role': r[3], 'createdAt': r[4]}
                for r in rows
            ]
            self._send_json(200, users)
        elif self.path.startswith('/api/events'):
            # Optional query param: ?limit=50
            limit = 50
            try:
                if '?' in self.path and 'limit=' in self.path:
                    limit_str = self.path.split('limit=', 1)[1].split('&', 1)[0]
                    limit = max(1, min(500, int(limit_str)))
            except Exception:
                limit = 50

            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            cursor.execute("""
                SELECT
                    e.event_id,
                    e.timestamp,
                    e.event_type,
                    e.action_taken,
                    d.location,
                    u.name,
                    cd.ppe_status,
                    cd.details
                FROM EventsLog e
                LEFT JOIN Devices d ON d.device_id = e.device_id
                LEFT JOIN Users u ON u.user_id = e.user_id
                LEFT JOIN CameraDetections cd ON cd.detection_id = e.detection_id
                ORDER BY e.event_id DESC
                LIMIT ?
            """, (limit,))
            rows = cursor.fetchall()
            conn.close()

            events = []
            for r in rows:
                events.append({
                    'eventId': r[0],
                    'timestamp': r[1],
                    'eventType': r[2],
                    'actionTaken': r[3],
                    'deviceLocation': r[4],
                    'userName': r[5],
                    'ppeStatus': r[6],
                    'details': r[7],
                })
            self._send_json(200, events)
        else:
            self._send_json(404, {'error': 'Not found'})

    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body   = self.rfile.read(length)
        try:
            data = json.loads(body)
        except Exception:
            self._send_json(400, {'error': 'Invalid JSON'})
            return

        if self.path == '/api/sensor-data':
            # Pi sends real sensor readings here every 2 seconds
            global _pi_sensor_data
            try:
                _pi_sensor_data['temperature']  = data.get('temperature')
                _pi_sensor_data['humidity']      = data.get('humidity')
                _pi_sensor_data['gas_level']     = data.get('gas_level')
                _pi_sensor_data['gas_detected']  = data.get('gas_detected', False)
                _pi_sensor_data['updated_at']    = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                # Save to DB
                ts = _pi_sensor_data['updated_at']
                conn = sqlite3.connect(DB_PATH)
                cursor = conn.cursor()
                if _pi_sensor_data['temperature'] is not None:
                    cursor.execute('INSERT INTO TempReadings (timestamp, temp_value, device_id) VALUES (?, ?, ?)', (ts, _pi_sensor_data['temperature'], 1))
                if _pi_sensor_data['gas_level'] is not None:
                    cursor.execute('INSERT INTO GasReadings (timestamp, gas_value, device_id) VALUES (?, ?, ?)', (ts, _pi_sensor_data['gas_level'], 1))
                conn.commit()
                conn.close()
                self._send_json(200, {'success': True})
            except Exception as e:
                self._send_json(500, {'error': str(e)})

        elif self.path == '/api/login':
            username = data.get('username', '').strip()
            email = data.get('email', '').strip()
            password = data.get('password', '')
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            if username:
                cursor.execute(
                    "SELECT user_id, username, name, email, role FROM Users WHERE username=? AND password_hash=?",
                    (username, hash_password(password))
                )
            else:
                cursor.execute(
                    "SELECT user_id, username, name, email, role FROM Users WHERE email=? AND password_hash=?",
                    (email, hash_password(password))
                )
            row = cursor.fetchone()
            conn.close()
            if row:
                self._send_json(200, {
                    'success': True,
                    'user': {'userId': row[0], 'username': row[1], 'fullName': row[2], 'email': row[3], 'role': row[4]}
                })
            else:
                self._send_json(401, {'success': False, 'message': 'Invalid username/email or password'})

        elif self.path == '/api/register':
            username  = data.get('username', '').strip()
            password  = data.get('password', '')
            full_name = data.get('fullName', '').strip()
            email     = data.get('email', '').strip()
            # Single-role system: supervisor only
            role      = 'supervisor'
            if not all([username, password, full_name, email]):
                self._send_json(400, {'success': False, 'message': 'All fields are required'})
                return
            try:
                conn = sqlite3.connect(DB_PATH)
                cursor = conn.cursor()
                cursor.execute(
                    "INSERT INTO Users (username, name, email, role, password_hash) VALUES (?, ?, ?, ?, ?)",
                    (username, full_name, email, role, hash_password(password))
                )
                conn.commit()
                conn.close()
                print(f"[DB] New user registered: {email} ({role})")
                self._send_json(200, {'success': True, 'message': 'Account created successfully'})
            except sqlite3.IntegrityError as e:
                msg = str(e).lower()
                if 'users.username' in msg or 'username' in msg:
                    self._send_json(409, {'success': False, 'message': 'Username already exists'})
                else:
                    self._send_json(409, {'success': False, 'message': 'Email already registered'})

        elif self.path == '/api/update-profile':
            username = data.get('username', '').strip()
            current_password = data.get('currentPassword', '')
            full_name = data.get('fullName', '').strip()
            email = data.get('email', '').strip()
            new_password = data.get('newPassword', '')
            if not username or not current_password:
                self._send_json(400, {'success': False, 'message': 'Username and current password are required'})
                return
            if not full_name or not email:
                self._send_json(400, {'success': False, 'message': 'Name and email are required'})
                return
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            cursor.execute(
                "SELECT user_id FROM Users WHERE username=? AND password_hash=?",
                (username, hash_password(current_password)),
            )
            row = cursor.fetchone()
            if not row:
                conn.close()
                self._send_json(401, {'success': False, 'message': 'Current password is incorrect'})
                return
            user_id = row[0]
            try:
                if new_password and len(new_password) < 6:
                    conn.close()
                    self._send_json(400, {'success': False, 'message': 'New password must be at least 6 characters'})
                    return
                if new_password:
                    cursor.execute(
                        "UPDATE Users SET name=?, email=?, password_hash=? WHERE user_id=?",
                        (full_name, email, hash_password(new_password), user_id),
                    )
                else:
                    cursor.execute(
                        "UPDATE Users SET name=?, email=? WHERE user_id=?",
                        (full_name, email, user_id),
                    )
                conn.commit()
                conn.close()
                self._send_json(200, {
                    'success': True,
                    'message': 'Profile updated',
                    'user': {'username': username, 'fullName': full_name, 'email': email, 'role': 'supervisor'},
                })
            except sqlite3.IntegrityError:
                conn.close()
                self._send_json(409, {'success': False, 'message': 'That email is already used by another account'})
            except Exception as e:
                conn.close()
                self._send_json(500, {'success': False, 'message': str(e)})
        else:
            self._send_json(404, {'error': 'Not found'})

    def _send_json(self, status: int, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self._send_cors_headers()
        self.end_headers()
        self.wfile.write(body)

def start_http_server():
    server = HTTPServer((HOST, HTTP_PORT), UserAPIHandler)
    print(f"[HTTP] User API running on http://{HOST}:{HTTP_PORT}")
    server.serve_forever()

# ── Save detection result to the database ──────────────────
def save_to_db(image_bytes: bytes, result: dict):
    try:
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # Save the image only when there is a violation
        image_path = "None"
        if not result["compliant"] and result.get("violations"):
            filename  = f"violation_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"
            image_path = os.path.join(IMAGES_DIR, filename)
            with open(image_path, "wb") as f:
                f.write(image_bytes)

        detected_items = ", ".join(result.get("detected",  [])) or "None"
        missing_ppe    = ", ".join(result.get("missing",   [])) or "None"
        unknown_ppe    = ", ".join(result.get("unknown",   [])) or "None"
        violations     = ", ".join(result.get("violations",[])) or "None"
        compliant      = 1 if result["compliant"] else 0

        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("PRAGMA foreign_keys = ON;")

        # Save camera detection (device_id=1 default)
        ppe_status = "COMPLIANT" if compliant else "VIOLATION"
        details_obj = {
            "image_path": image_path,
            "detected_items": detected_items,
            "missing_ppe": missing_ppe,
            "unknown_ppe": unknown_ppe,
            "violations": violations,
        }
        cursor.execute("""
            INSERT INTO CameraDetections (timestamp, ppe_status, details, device_id)
            VALUES (?, ?, ?, ?)
        """, (timestamp, ppe_status, json.dumps(details_obj, ensure_ascii=False), 1))
        detection_id = cursor.lastrowid

        # Log event referencing the detection
        event_type = "PPE_VIOLATION" if not compliant else "PPE_CHECK"
        action_taken = "Alert shown in UI" if not compliant else "No action"
        cursor.execute("""
            INSERT INTO EventsLog (timestamp, event_type, action_taken, device_id, detection_id)
            VALUES (?, ?, ?, ?, ?)
        """, (timestamp, event_type, action_taken, 1, detection_id))

        conn.commit()
        conn.close()

        status = "✅ COMPLIANT" if compliant else f"❌ VIOLATION — missing: {missing_ppe}"
        if unknown_ppe != "None":
            status += f"  ❓ unknown: {unknown_ppe}"
        print(f"[DB] Saved → {status}")

    except Exception as e:
        print(f"[DB] Error saving: {e}")

# ── Detection helpers ───────────────────────────────────────
def wbf_merge(all_boxes, all_scores, all_labels, img_w, img_h):
    """Simple WBF: merge boxes with high IoU overlap across models."""
    if not all_boxes:
        return []

    def iou(a, b):
        ax1,ay1,ax2,ay2 = a
        bx1,by1,bx2,by2 = b
        ix1,iy1 = max(ax1,bx1), max(ay1,by1)
        ix2,iy2 = min(ax2,bx2), min(ay2,by2)
        inter = max(0, ix2-ix1) * max(0, iy2-iy1)
        area_a = (ax2-ax1)*(ay2-ay1)
        area_b = (bx2-bx1)*(by2-by1)
        union  = area_a + area_b - inter
        return inter / union if union > 0 else 0

    merged = []
    used   = [False] * len(all_boxes)

    for i in range(len(all_boxes)):
        if used[i]:
            continue
        group_boxes  = [all_boxes[i]]
        group_scores = [all_scores[i]]
        group_labels = [all_labels[i]]
        used[i] = True
        for j in range(i+1, len(all_boxes)):
            if used[j]:
                continue
            if all_labels[j] == all_labels[i] and iou(all_boxes[i], all_boxes[j]) > WBF_IOU_THR:
                group_boxes.append(all_boxes[j])
                group_scores.append(all_scores[j])
                group_labels.append(all_labels[j])
                used[j] = True
        # Average the boxes, take max score
        x1 = sum(b[0] for b in group_boxes) / len(group_boxes)
        y1 = sum(b[1] for b in group_boxes) / len(group_boxes)
        x2 = sum(b[2] for b in group_boxes) / len(group_boxes)
        y2 = sum(b[3] for b in group_boxes) / len(group_boxes)
        merged.append({
            "label":      group_labels[0],
            "confidence": max(group_scores),
            "x1": x1, "y1": y1, "x2": x2, "y2": y2,
            "compliant":  group_labels[0] in REQUIRED_PPE,
        })
    return merged


def run_detection(frame_bytes: bytes) -> dict:
    nparr = np.frombuffer(frame_bytes, np.uint8)
    img   = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return {"detections": [], "detected": [], "missing": list(REQUIRED_PPE),
                "violations": list(REQUIRED_PPE), "unknown": [], "compliant": False}

    # Downscale for faster inference
    h, w = img.shape[:2]
    if w > INFER_WIDTH:
        scale = INFER_WIDTH / w
        img   = cv2.resize(img, (int(w * scale), int(h * scale)))
    img_h, img_w = img.shape[:2]

    # Run all models and collect boxes
    all_boxes  = []
    all_scores = []
    all_labels = []

    for m in models:
        results = m(img, conf=CONF_THRESH, iou=IOU_THRESH, imgsz=IMG_SIZE, verbose=False)
        for r in results:
            for box in r.boxes:
                cls_id = int(box.cls[0])
                label  = m.names[cls_id].lower()
                conf   = float(box.conf[0])
                x1, y1, x2, y2 = [float(v) for v in box.xyxy[0]]
                all_boxes.append((x1, y1, x2, y2))
                all_scores.append(conf)
                all_labels.append(label)

    # Merge with WBF
    detections   = wbf_merge(all_boxes, all_scores, all_labels, img_w, img_h)
    # Build detected set — only the four PPE classes count
    detected_set = {d["label"] for d in detections if d["label"] in REQUIRED_PPE}

    missing    = [p for p in REQUIRED_PPE if p not in detected_set]
    violations = missing[:]
    unknown    = [d["label"] for d in detections if d["label"] not in REQUIRED_PPE]
    compliant  = len(missing) == 0
    print(f"[DET] detected={detected_set} missing={missing} compliant={compliant}")
    
    return {
        "detections": detections,
        "detected":   list(detected_set),
        "missing":    missing,
        "violations": violations,
        "unknown":    unknown,
        "compliant":  compliant,
    }

# ── Frame-skip state ─────────────────────────────────────────
_frame_counter = 0
_last_result   = {
    "detections": [], "detected": [], "missing": list(REQUIRED_PPE),
    "violations": list(REQUIRED_PPE), "unknown": [], "compliant": False,
}

# ── WebSocket handler ────────────────────────────────────────
async def ws_handler(websocket):
    global _frame_counter, _last_result
    print(f"[WS] Client connected: {websocket.remote_address}")
    try:
        async for message in websocket:
            _frame_counter += 1
            frame_bytes = bytes(message) if not isinstance(message, bytes) else message

            if _frame_counter % PROCESS_EVERY_N == 0:
                result       = run_detection(frame_bytes)
                _last_result = result
                # Save to DB without blocking the WebSocket loop
                threading.Thread(
                    target=save_to_db, args=(frame_bytes, result), daemon=True
                ).start()
            else:
                result = _last_result

            await websocket.send(json.dumps(result))

    except websockets.exceptions.ConnectionClosed:
        pass
    except Exception as e:
        print(f"[WS] Error: {e}")
    finally:
        print(f"[WS] Client disconnected")

# ── Main entry point ─────────────────────────────────────────
async def main():
    # HTTP API in background thread
    http_thread = threading.Thread(target=start_http_server, daemon=True)
    http_thread.start()

    print(f"[WS] WebSocket server on ws://{HOST}:{PORT}")
    async with websockets.serve(ws_handler, HOST, PORT):
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    init_db()
    asyncio.run(main())
