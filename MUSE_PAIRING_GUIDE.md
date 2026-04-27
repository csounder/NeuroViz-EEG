# NeuroVis EEG + Muse Hardware - Pairing Guide

## 🚨 LED Status Indicator

The Muse S Athena LED tells you the pairing status:

| LED State                | Meaning                               | Action                     |
| ------------------------ | ------------------------------------- | -------------------------- |
| 🔴 **Flashing Red/Blue** | Device is NOT paired to your Mac      | Pair in Bluetooth Settings |
| 🟢 **Solid/Steady**      | Device IS paired and connected        | NeuroVis can connect       |
| ⚫ **Off**               | Device is powered off or out of range | Power on + bring closer    |

---

## Step-by-Step Pairing Instructions

### 1️⃣ **Power On Your Muse Device**

- Press the button on the device
- LED should start **flashing** (unpaired state)
- Keep device close to your Mac (within 10 meters / 33 feet)

### 2️⃣ **Open System Preferences → Bluetooth**

```
Mac Menu Bar → System Preferences/Settings
→ Bluetooth
```

### 3️⃣ **Wait for Device to Appear**

- Look for **"MuseS-FDE6"** or **"Muse-XXXX"** (your device name)
- It should appear in the available devices list
- If it doesn't show up:
  - Make sure Bluetooth is ON
  - Move device closer to Mac
  - Wait 10-15 seconds
  - Restart MuseBridge (kill and restart)

### 4️⃣ **Click "Connect" (or "Pair" if shown)**

- Click the device name in Bluetooth list
- Enter pairing code if prompted (usually **0000**)
- Wait for confirmation - LED should become **solid**

### 5️⃣ **Now Open NeuroVis Dashboard**

```
http://localhost:3000
```

### 6️⃣ **Select Device and Click Connect**

- Device should appear in NeuroVis device list
- Click the device card to select it
- LED remains solid = data streaming ✅

---

## Troubleshooting

### ❌ Device doesn't appear in Bluetooth list?

1. **Is MuseBridge running?**

   ```bash
   ps aux | grep MuseBridge
   # Should show: MuseBridge running
   ```

   If not, restart the server:

   ```bash
   cd /Users/richardboulanger/dB-Studio/NeuroVis
   npm start
   ```

2. **Is the device powered on?**
   - Press the button once to wake it
   - LED should flash
   - Device needs to be in pairing mode

3. **Is Bluetooth on?**
   - Menu Bar → Bluetooth icon → "Turn Bluetooth On"

4. **Still not showing?**
   - Forget the device from Bluetooth (if it's already there)
   - Restart the Muse device
   - Wait 30 seconds and try again

### ⚠️ LED keeps flashing (won't pair)?

1. **Forget device from Bluetooth settings**
   - Bluetooth Preferences → Your Muse → "Forget"

2. **Restart Muse device**
   - Hold button for 5 seconds to power off
   - Wait 3 seconds
   - Press button once to power on
   - LED should flash

3. **Try pairing again**
   - System Preferences → Bluetooth
   - Select device
   - Click "Pair"
   - Accept code **0000**

### 📊 Device is paired but NeuroVis says "not connected"?

This is normal! Pairing in Bluetooth ≠ NeuroVis connection.

1. **Make sure NeuroVis is running:**

   ```bash
   # Terminal
   cd /Users/richardboulanger/dB-Studio/NeuroVis
   npm start
   ```

2. **Watch the server logs for CONNECT REQUEST:**

   ```
   🔗 CONNECT REQUEST: deviceIndex=0
      Device: MuseS-FDE6 (Muse S Athena (2025))
      → Sending to MuseBridge...
   ```

3. **Click the device in dashboard to connect**

### 🔊 No data flowing even though it says "streaming"?

1. **Check MuseBridge logs** for errors
2. **Verify device is within range** (10m / 33 feet)
3. **Try disconnecting and reconnecting**
   - NeuroVis: Click device → "Disconnect"
   - Bluetooth: Click device → "Disconnect"
   - Bluetooth: Click device → "Connect"
   - NeuroVis: Click device → "Connect"

---

## Data Flow After Pairing

```
1. Muse Paired in Bluetooth ✓
   ↓
2. NeuroVis Dashboard loads (http://localhost:3000) ✓
   ↓
3. Dashboard shows device in selector ✓
   ↓
4. User clicks device → WebSocket "connect_device" message ✓
   ↓
5. MuseBridge receives message and connects ✓
   ↓
6. EEG data flows @ 256 Hz ✓
   ↓
7. All visualizations animate ✓
```

---

## Expected Behavior

### ✅ When Everything Works

- **Muse Device LED:** Solid/steady (paired)
- **NeuroVis Dashboard:** Shows device name "MuseS-FDE6"
- **Browser Console:** No errors
- **Server Logs:** Shows "CONNECT REQUEST" + "Sending to MuseBridge"
- **Displays:** All 12 visualizations animate with EEG data
- **Status Bar:** Shows packet count incrementing

### 🚨 If Something's Wrong

Check in this order:

1. LED status (flashing = not paired)
2. System Bluetooth settings (device listed?)
3. NeuroVis running (`npm start`)
4. Browser console (F12 → Console tab)
5. Server logs (`tail -f /tmp/neurovis*.log`)

---

## Quick Reference Commands

```bash
# Check if MuseBridge is running
ps aux | grep MuseBridge

# Start NeuroVis
cd /Users/richardboulanger/dB-Studio/NeuroVis
npm start

# Watch server logs in real-time
tail -f /tmp/neurovis*.log

# Kill and restart (if stuck)
pkill -f "node.*server-enhanced"
sleep 2
npm start
```

---

## Still Not Working?

1. **Open browser DevTools:** F12 → Console tab
2. **Check for red errors** in console
3. **Watch server logs** for "ERROR" messages
4. **Restart everything:**
   ```bash
   pkill -f MuseBridge
   pkill -f "node.*server"
   # Wait 3 seconds
   cd /Users/richardboulanger/dB-Studio/NeuroVis
   npm start
   ```

---

**Key Point:** The Muse device MUST be paired in System Preferences Bluetooth FIRST, before NeuroVis can connect to it. The LED will be solid when paired. Only then can MuseBridge (and NeuroVis) talk to the device.

---

**Status:** Ready to stream! 🧠✨
