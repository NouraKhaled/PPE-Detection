# Setup Guide — Intelligent Lab Safety System

This guide walks a future student through every step needed to install,
configure, and run the project from a fresh Windows computer. No prior
experience with Python, Node.js, or React is required — every command is
written out and every download link is provided.

---

## 1. What you will install

| Tool | Purpose | Approximate size |
|------|---------|-----------------|
| Python 3.10+ | Runs the detection backend (`server.py`) | ~30 MB |
| Node.js 18+ (LTS) | Runs the React dashboard | ~80 MB |
| Visual Studio Code | Code editor | ~100 MB |
| Project dependencies | Installed automatically with `pip` and `npm` | ~600 MB |
| YOLO weight file (`best.pt`) | Trained PPE-detection model | ~6 MB |

Plan for around **2 GB of free disk space** and a stable internet
connection during the first install.

---

## 2. Install Python

1. Open https://www.python.org/downloads/ in a browser.
2. Click **Download Python 3.x.x** (any version 3.10 or newer is fine).
3. Run the installer.
4. **Important:** on the first installer screen, tick the box
   **"Add Python to PATH"** before clicking *Install Now*.
5. After installation finishes, open the Start menu, type `cmd`, and open
   *Command Prompt*.
6. Verify the install by typing:
   ```
   python --version
   ```
   You should see something like `Python 3.12.4`. If you get
   *"command not found"*, reinstall Python with the PATH option ticked.

---

## 3. Install Node.js + npm

1. Open https://nodejs.org/en/download.
2. Download the **LTS** version for Windows.
3. Run the installer and accept all default options. npm is installed
   automatically.
4. In a **new** Command Prompt window (open a fresh one so the PATH is
   refreshed) verify:
   ```
   node --version
   npm  --version
   ```
   Both should print a version number.

---

## 4. Install Visual Studio Code

1. Download from https://code.visualstudio.com/Download.
2. Run the installer (default options are fine).
3. After install, open VS Code and add these extensions from the
   Extensions panel (Ctrl+Shift+X):
   - **Python** (by Microsoft)
   - **Pylance** (by Microsoft)
   - **ESLint** (by Microsoft / Dirk Baeumer)
   - **Tailwind CSS IntelliSense** (by Tailwind Labs)

---

## 5. Get the project files

1. Copy the `lab_safety_system3` folder from the CD to a location on your
   computer that does **not** contain spaces or non-English characters in
   the path. A clean location like `C:\projects\lab_safety_system3` works
   well.
2. Open VS Code, then **File → Open Folder** and select that copied folder.

---

## 6. Place the trained YOLO weight

The model file (`best.pt`) is **not** stored inside the source folder
because it is large and binary. To run live detection you need to copy it
in manually.

1. Inside the project folder, create a new sub-folder called `models`
   (right-click → *New Folder* → name it `models`).
2. Copy `best.pt` into that folder.

The final path should look like:
```
lab_safety_system3\models\best.pt
```

If your weight file has a different name, open `server.py` and edit the
line near the top:
```python
MODEL_PATH = os.path.join(_MODELS_DIR, "best.pt")
```
to match your file name.

> If you want to train a brand-new model, see section 11 below
> (*Training a new YOLO model in Google Colab*).

---

## 7. Install the backend dependencies

1. In VS Code, open a terminal: **Terminal → New Terminal**.
   Make sure the prompt is inside `lab_safety_system3`.
2. Run:
   ```
   pip install websockets ultralytics opencv-python pillow torch numpy
   ```
3. Wait until installation finishes. PyTorch is the largest download
   (~400 MB). If pip prints a *"externally-managed-environment"* warning,
   add the flag `--break-system-packages` to the end of the command.

---

## 8. Install the frontend dependencies

In the same VS Code terminal run:
```
npm install
```
This downloads all React / Vite / Tailwind packages into a new
`node_modules` folder. It can take 2–5 minutes the first time.

---

## 9. Run the project

You will use **two** terminals at the same time.

**Terminal 1 — backend:**
```
python server.py
```
You should see:
```
[INFO] Using device: CPU                 (or CUDA if you have an NVIDIA GPU)
[INFO] Loaded ✓ best.pt — model ready
[DB] Database ready at: ...\lab_safety.db
[HTTP] User API running on http://localhost:8766
[WS] WebSocket server on ws://localhost:8765
```
The first time the backend runs it will automatically create:
- `lab_safety.db` — the SQLite database
- `violation_images/` — folder for captured violation snapshots

**Terminal 2 — frontend:** (open a *new* terminal in VS Code)
```
npm run dev
```
Vite will print a URL such as `http://localhost:3000` or
`http://localhost:5173`. Open that link in Chrome or Edge.

---

## 10. First-time use of the dashboard

1. The dashboard opens on the **Login** page. Click **Create account**.
2. Fill in username, full name, email, and password (minimum 6
   characters). Click **Register**.
3. Log in with the new account.
4. Click **Start Camera** (bottom-left of the camera tile) and grant
   browser permission when prompted.
5. The webcam feed should appear with green/red bounding boxes drawn
   around detected PPE items.
6. Logs and violation snapshots are saved automatically. Click
   **Export Logs** to download a CSV.

---

## 11. Training a new YOLO model on Kaggle (optional)

The YOLOv11 PPE-detection model used by this project was trained on
**Kaggle Notebooks** (free GPU). To retrain on your own dataset:

1. Open https://www.kaggle.com/ and sign in (or create a free account).
   You will need to verify your phone number once to enable the GPU/TPU
   accelerator.

2. Click **Create → New Notebook**.

3. On the right-hand side panel, open **Settings** and:
   - Under **Accelerator**, choose **GPU T4 x2** (or **GPU P100**).
   - Under **Persistence**, choose **Files only**.

4. Upload your dataset:
   - Click **Add Input → Upload → New Dataset**.
   - Upload the dataset folder (must follow the standard YOLO format,
     i.e. an `images/` folder, a `labels/` folder, and a `data.yaml`
     file). Once added, Kaggle mounts it at
     `/kaggle/input/<your-dataset-name>/`.

5. In the notebook, install Ultralytics:
   ```
   !pip install ultralytics -q
   ```

6. Train a model:
   ```python
   from ultralytics import YOLO
   model = YOLO("yolo11n.pt")          # or yolo11s.pt for higher accuracy
   model.train(
       data="/kaggle/input/<your-dataset-name>/data.yaml",
       epochs=100,
       imgsz=320,
       project="/kaggle/working/runs",
       name="ppe_train",
   )
   ```

7. After training finishes, the best weight is saved to
   `/kaggle/working/runs/ppe_train/weights/best.pt`. Download it from
   the **Output** panel on the right side of the notebook (click the
   three dots next to the file → **Download**).

8. Copy it into your project at `lab_safety_system3\models\best.pt` and
   restart `server.py`.

**Tip:** Kaggle gives every account roughly 30 GPU hours per week. Keep
an eye on the timer at the top-right of the notebook so you don't lose
progress.

---

## 12. Database setup notes

The project uses **SQLite**, which needs no separate installation —
Python ships with it. The database file (`lab_safety.db`) is created
automatically the first time `server.py` runs and contains these tables:

| Table | Purpose |
|-------|---------|
| `Users` | Registered supervisor accounts (passwords are SHA-256 hashed) |
| `Devices` | Cameras and Pi devices |
| `CameraDetections` | One row per processed frame |
| `TempReadings` | Temperature samples from the Raspberry Pi |
| `GasReadings` | Gas-sensor samples from the Raspberry Pi |
| `EventsLog` | Higher-level events linked to detections, sensors, users |

To inspect the database visually, install the free tool
**DB Browser for SQLite** from https://sqlitebrowser.org/, then open
`lab_safety.db` from inside it.

To reset all data, simply close the backend and delete `lab_safety.db`.
The next launch of `server.py` will create a fresh empty database.

---

## 13. Troubleshooting

| Symptom | Likely cause and fix |
|---------|---------------------|
| `python: command not found` | Python wasn't added to PATH. Reinstall with the PATH option ticked. |
| `npm: command not found` | Open a **new** terminal after Node install. |
| `RuntimeError: Model not found` | `best.pt` is missing. See section 6. |
| Camera shows *"Permission denied"* | Allow camera access in the browser address-bar lock icon. |
| Camera shows *"Logitech camera not found"* | Edit `src/App.tsx` `startCamera()` and remove the Logitech filter, or plug in a Logitech webcam. |
| `Cannot connect to server. Make sure server.py is running.` | The backend is not running, or it is running on a different port. Re-run `python server.py`. |
| Dashboard works but no detections appear | Verify `[INFO] Loaded ✓ best.pt` is printed by the backend, and the WebSocket badge in the camera tile says *Connected*. |
| Slow detection on CPU | Set `IMG_SIZE = 256` and increase `PROCESS_EVERY_N` near the top of `server.py`. |

---

## 14. Building a production bundle (optional)

To produce a static frontend bundle (for deployment to a web server):
```
npm run build
```
The output is written to the `build/` folder. Serve it with any static
file server (e.g. `npx serve build`).

---

## 15. Project structure reference

```
lab_safety_system3/
├── server.py                  # Backend: WebSocket + HTTP API + YOLO
├── models/                    # Place trained weights here (best.pt)
├── src/                       # React + TypeScript frontend
│   ├── App.tsx
│   ├── main.tsx
│   ├── index.css
│   ├── styles/globals.css
│   └── components/
│       ├── ActivityLog.tsx
│       ├── ConfirmActionModal.tsx
│       ├── Login.tsx
│       ├── PasswordRecovery.tsx
│       ├── Registration.tsx
│       └── ViolationTracker.tsx
├── index.html
├── package.json               # Frontend dependencies
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
├── tsconfig.node.json
└── README.md                  # Short developer-focused readme
```

Generated at runtime (not shipped on the CD):
```
node_modules/        ← created by `npm install`
build/               ← created by `npm run build`
__pycache__/         ← Python bytecode cache
lab_safety.db        ← created by server.py on first run
violation_images/    ← populated when violations are detected
```

---

*Prepared for the College of Computer Sciences and Information Technology,
King Faisal University.*
