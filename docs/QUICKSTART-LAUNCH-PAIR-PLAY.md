# Quick start — Launch, pair, play (Muse S Athena + Mind Monitor)

Step-by-step for **two laptops** (e.g. yours and Amy’s): same steps, same repo checkout. The **modern UI** is the Next.js app; the **brain** is still `server-enhanced.js`.

---

## 0. What you need

| Item | Purpose |
|------|---------|
| **macOS** (or your supported setup) | Bluetooth for direct Muse; Node server |
| **Node.js + npm** | Backend + frontend |
| **Python 3** | Athena BLE bridge (`bleak`) |
| **Muse S Athena** | Direct path uses GATT notify `273e0013` (see repo banner when starting) |
| **Mind Monitor (iOS)** | Optional path: phone reads Muse, sends OSC to your Mac |

**Ports (defaults):**

| Service | Port |
|---------|------|
| HTTP API + legacy static | **3000** |
| WebSocket (live EEG → browser) | **8080** |
| Next.js dev UI | **3001** |
| OSC **input** (Mind Monitor → NeuroVis) | **5000** UDP |
| OSC **output** (NeuroVis → Csound/Max) | **7400** UDP |

---

## 1. One-time setup (each machine)

Replace the path with **your** clone location.

```bash
cd /Users/you/path/to/NeuroVis

# Root: Node server + OSC
npm install

# Frontend
cd web
npm install
cd ..

# Python deps for Muse S Athena bridge
python3 -m pip install -r requirements-athena.txt
```

If `pip` complains, use `python3 -m pip install bleak` (that is all `requirements-athena.txt` lists today).

---

## 2. Every session — two terminals

### Terminal A — backend (keep running)

**Muse S Athena (direct BLE via Python):**

```bash
cd /Users/you/path/to/NeuroVis
npm run start:athena
```

Wait until the log shows WebSocket listening and the **BLE bridge: ATHENA** banner.

**If you use Muse 2 / Muse 3 (LibMuse) instead:** use `npm run start:swift` or plain `npm start` (Swift is the default in `server-enhanced.js`). Athena mode is **only** for headsets that expose the Athena sensor characteristic — see startup banner.

### Terminal B — Next.js UI

```bash
cd /Users/you/path/to/NeuroVis/web
npm run dev
```

Default: **http://localhost:3001**

---

## 3. Open the dashboard

1. In the browser, open **http://localhost:3001**
2. Confirm the **TopBar** shows WebSocket **connected** (live). If it says disconnected, Terminal A must be running and nothing else should block port **8080**.

---

## 4. Path A — Direct Muse (Athena on your Mac)

Use this when the **headset talks to the Mac over Bluetooth** (NeuroVis drives the stream).

### 4.1 Pair the Muse to macOS

1. Power on the headset; LED behavior is described in **`MUSE_PAIRING_GUIDE.md`** at the repo root.
2. **System Settings → Bluetooth** → connect your **Muse-…** / **MuseS-…** device until it shows connected / solid behavior per the guide.

### 4.2 Tell NeuroVis to use the Athena bridge

1. In the app, go to **Settings** (sidebar).
2. Under **Muse BLE backend**, choose **Python (Athena) — Muse S Athena direct BLE** (if you started with `npm run start:athena`, this should already match).
3. Turn **Simulator** **off** when using real hardware (simulator ignores real packets on the server).

### 4.3 Connect inside NeuroVis

1. Still on **Settings**, in **Devices**, click **Rescan**.
2. Click your Muse in the list to **connect**.
3. Navigate to **Raw**, **Bands**, **Concert**, etc. You should see live data and device name in the UI.

### 4.4 If something fails

- **No devices:** power cycle Muse, confirm Bluetooth on Mac, **Rescan** again.
- **Wrong bridge:** Muse 2 often needs **Swift**, not Athena — switch in Settings and let the server respawn the bridge (or restart Terminal A with `npm run start:swift`).
- **Stuck:** quit Terminal A, power cycle headset, run `npm run start:athena` again.

---

## 5. Path B — Mind Monitor on the phone (OSC into NeuroVis)

Use this when the **Muse is paired to the phone** and **Mind Monitor** streams data to the **Mac running NeuroVis** (no Mac Bluetooth EEG required for that path, though you can still run the bridge for other devices).

### 5.1 Start the stack (same as §2)

Terminal A: `npm run start:athena` **or** `npm start` — the important part is that **Node is running**, because **OSC input on port 5000** is opened by `server-enhanced.js`.

Terminal B: `cd web && npm run dev` → open **http://localhost:3001**

### 5.2 Find the Mac’s IP address

On the Mac:

- **System Settings → Network → Wi-Fi → Details → IP address**, or  
- Terminal: `ipconfig getifaddr en0` (Wi‑Fi; interface name may vary)

Example: `192.168.1.42`

### 5.3 Mind Monitor OSC settings (on the iPhone)

In **Mind Monitor** (exact menus depend on app version):

1. Enable **OSC**.
2. Set **host** to the Mac’s IP (**not** `127.0.0.1` — that would mean “the phone itself”).
3. Set **port** to **5000** (NeuroVis default Mind Monitor listener).
4. Use **UDP**.

### 5.4 macOS firewall

If no data arrives, allow **incoming UDP 5000** for **Node** (or temporarily disable the firewall to test).

### 5.5 Match NeuroVis to Mind Monitor (optional but useful)

- **Research / baseline:** set **band edge preset** to **Mind Monitor (full)** when you want charts and band integration to align with Mind Monitor’s published band limits.
- **Mind Monitor** page in the sidebar: toggles **Mind Monitor mode** in the browser (Hamming FFT / MuseIO-style `raw_fft` behavior for compatible views). Hardware coming from OSC still flows through the server.

You should see **`mindMonitorOsc`** traffic in tooling like **OSC** page / monitor when packets arrive.

### 5.6 Important limitation (two people, one server)

If **Amy** sends Mind Monitor OSC to **your** Mac while **you** also use **direct BLE** on the same `server-enhanced.js`, both streams currently **share** one internal pipeline (see **`docs/CONCERT-SONIFICATION-DUAL-SOURCE.md`** §12). For clean **two-person** mixes, prefer **two laptops** + **hardware mixer**, or one stream at a time into one server.

---

## 6. Play — Concert, Csound, OSC

- **Concert** route: full-screen visuals + **V12** browser Csound panel.
- **OSC output** (to Csound, Max, etc.): host **127.0.0.1**, port **7400**, prefix **`/muse`** by default — enable streams in settings as needed.
- **Share a mapping** with Amy: on **Concert**, use **Share performance preset** → download JSON; she **Imports** on her Mac (see **`docs/CONCERT-SONIFICATION-DUAL-SOURCE.md`** §10).

---

## 7. Checklist (copy for Amy)

```
[ ] cd to NeuroVis clone
[ ] npm install (once) && cd web && npm install (once)
[ ] python3 -m pip install -r requirements-athena.txt (once)
[ ] Terminal A: npm run start:athena   (or start:swift for Muse 2 / LibMuse path)
[ ] Terminal B: cd web && npm run dev
[ ] Browser: http://localhost:3001 — WS connected
[ ] Settings: simulator OFF for real EEG
[ ] Settings: Athena vs Swift matches your headset
[ ] Pair Muse (Mac for direct, or iPhone for Mind Monitor)
[ ] Direct: Settings → Rescan → connect device
[ ] Mind Monitor: OSC → Mac IP, port 5000 UDP, firewall OK
```

---

## 8. Related docs

| Doc | Contents |
|-----|----------|
| **`MUSE_PAIRING_GUIDE.md`** | LED states, Bluetooth pairing, troubleshooting |
| **`docs/HANDOFF.md`** | Ports, Swift vs Athena, API bridge switch |
| **`docs/CONCERT-SONIFICATION-DUAL-SOURCE.md`** | Shared presets, hardware mixer, future dual-player |
| **`docs/RESEARCH-CAPTURE-AND-SYNC.md`** | Recording, `bandEdgePreset`, capture modes |

---

## 9. Print / PDF one-pager (no step duplication)

Use this section when you want **one printed or PDF page**: it only **points** to the numbered sections above.

### How to make a PDF

- **From the Markdown preview** (VS Code, Cursor, etc.): open preview → **Print** → **Save as PDF**. Optionally print **only pages that include §9** if your viewer allows page ranges.
- **From GitHub:** open the file on github.com → print the page (renders the Markdown) → Save as PDF.
- **Optional CLI** (if you use Pandoc):  
  `pandoc docs/QUICKSTART-LAUNCH-PAIR-PLAY.md -o NeuroVis-quickstart.pdf`

### One-page flow (reference only)

| Step | Action | Details in |
|------|--------|------------|
| 1× | `npm install` → `cd web && npm install` → `python3 -m pip install -r requirements-athena.txt` | §1 |
| A | Terminal: `cd …/NeuroVis` → `npm run start:athena` (or `start:swift` / `npm start`) | §2 |
| B | Terminal: `cd …/NeuroVis/web` → `npm run dev` | §2 |
| UI | Browser **http://localhost:3001** — WebSocket connected | §3 |
| Direct | macOS Bluetooth pair Muse → **Settings:** Athena, simulator **off** → **Rescan** → connect | §4 |
| MM | Mind Monitor OSC → Mac **LAN IP**, UDP port **5000**; allow firewall | §5 |
| Play | **Concert** / OSC **7400**; share preset JSON on **Concert** | §6 |

**Ports:** 3000 HTTP · 8080 WS · 3001 UI · **5000** MM in · **7400** OSC out — §0.

### Figure placeholders (add PNGs later)

Drop files in **`docs/images/quickstart/`** (see **`docs/images/quickstart/README.md`**). Until then, this table is the shot list.

| ID | File | Capture |
|----|------|---------|
| F1 | `01-terminal-backend-athena.png` | Terminal A: ATHENA banner + listening |
| F2 | `02-terminal-web-dev.png` | Terminal B: Next on **3001** |
| F3 | `03-browser-connected.png` | TopBar: live / connected |
| F4 | `04-settings-devices-connect.png` | **Settings → Devices** connected |
| F5 | `05-mind-monitor-osc.png` | MM OSC: host, **5000**, UDP |

**When images exist**, you can add them inline under §9 without changing the prose, for example:

```markdown
![F1 — backend](images/quickstart/01-terminal-backend-athena.png)
```

*(Paths relative to `docs/QUICKSTART-LAUNCH-PAIR-PLAY.md`.)*

---

*Last updated: 2026-04-26 — matches `server-enhanced.js` defaults and Next.js on port 3001.*
