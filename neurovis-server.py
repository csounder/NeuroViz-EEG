#!/usr/bin/env python3
"""
NeuroVis EEG Server — OpenBCI Edition
======================================
Serves the NeuroVis web app, handles BrainFlow device connection,
runs the DSP pipeline, brain state classification, and sends real
UDP OSC with device-prefixed addresses.

Supports: OpenBCI Ganglion (4-ch) and Ultracortex/Cyton-Daisy (16-ch).

USAGE:
    pip install fastapi uvicorn python-osc brainflow numpy scipy
    python neurovis-server.py

Then open http://127.0.0.1:8100 in your browser.
"""

import sys
import os
import socket
import threading
import time
import webbrowser
import json
import urllib.request
import math
import random
import struct
from pathlib import Path
from collections import deque

import numpy as np

try:
    from fastapi import FastAPI, Request
    from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
except ImportError:
    print("Install: pip install fastapi uvicorn python-osc brainflow numpy scipy")
    sys.exit(1)

try:
    from pythonosc.udp_client import SimpleUDPClient
except ImportError:
    print("Install: pip install python-osc")
    sys.exit(1)

try:
    from brainflow.board_shim import BoardShim, BrainFlowInputParams, BoardIds
    from brainflow.data_filter import DataFilter
    BRAINFLOW_AVAILABLE = True
except ImportError:
    BoardShim = None
    BrainFlowInputParams = None
    BoardIds = None
    DataFilter = None
    BRAINFLOW_AVAILABLE = False
    print("[WARN] brainflow not installed — hardware connection unavailable, simulator only")

from scipy.signal import butter, sosfilt
import uvicorn

app = FastAPI(title="NeuroVis EEG — OpenBCI")


# ═══════════════════════════════════════════════════════════════
# DSP Pipeline (ported from dsp.js)
# ═══════════════════════════════════════════════════════════════

class BiquadFilter:
    """Direct Form I biquad filter (Audio EQ Cookbook)."""

    def __init__(self, ftype, freq, sr, q=0.707):
        self.ftype = ftype
        self.freq = freq
        self.sr = sr
        self.q = q
        self.states = [{k: 0.0 for k in ("x1", "x2", "y1", "y2")} for _ in range(16)]
        self._compute()

    def _compute(self):
        w0 = 2 * math.pi * self.freq / self.sr
        sw = math.sin(w0)
        cw = math.cos(w0)
        alpha = sw / (2 * self.q)

        if self.ftype == "lowpass":
            b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2
        elif self.ftype == "highpass":
            b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2
        elif self.ftype == "bandpass":
            b0 = sw / 2; b1 = 0; b2 = -sw / 2
        elif self.ftype == "notch":
            b0 = 1; b1 = -2 * cw; b2 = 1
        else:
            b0 = 1; b1 = 0; b2 = 0

        a0 = 1 + alpha
        self.b0 = b0 / a0
        self.b1 = b1 / a0
        self.b2 = b2 / a0
        self.a1 = (-2 * cw) / a0
        self.a2 = (1 - alpha) / a0

    def apply(self, sample, ch):
        s = self.states[ch]
        y = self.b0 * sample + self.b1 * s["x1"] + self.b2 * s["x2"] - self.a1 * s["y1"] - self.a2 * s["y2"]
        s["x2"] = s["x1"]; s["x1"] = sample
        s["y2"] = s["y1"]; s["y1"] = y
        return y

    def reset(self):
        for s in self.states:
            for k in s: s[k] = 0.0


class DSPPipeline:
    """Full signal processing pipeline: notch → bandpass → detrend → CAR → artifact → smooth."""

    def __init__(self, sr=200, nch=4, notch_hz=60, bp_low=1, bp_high=45):
        self.sr = sr
        self.nch = nch
        # 4th-order notch (2× cascade, Q=30)
        self.notch = [BiquadFilter("notch", notch_hz, sr, q=30) for _ in range(2)]
        # 4th-order Butterworth bandpass (2× HP cascade + 2× LP cascade)
        self.hp = [BiquadFilter("highpass", bp_low, sr, q=0.707) for _ in range(2)]
        self.lp = [BiquadFilter("lowpass", bp_high, sr, q=0.707) for _ in range(2)]
        # EMA smoother
        dt = 1000.0 / sr
        tau = 100.0  # ms
        self.ema_alpha = dt / (tau + dt)
        self.smoothed = [0.0] * nch
        # Artifact detection
        self.prev = [0.0] * nch
        self.windows = [deque(maxlen=sr) for _ in range(nch)]
        self.artifact_thresh = 100.0  # µV amplitude
        self.gradient_thresh = 50.0   # µV/sample
        self.flatline_thresh = 0.001  # µV std

    def process(self, samples):
        """Process one sample set (list of nch floats). Returns processed values + artifact info."""
        n = min(len(samples), self.nch)
        out = list(samples[:n])
        artifacts = {"detected": False, "channels": []}

        # Detrend (linear across channels)
        if n > 1:
            mean = sum(out) / n
            sx = sum(range(n))
            sx2 = sum(i * i for i in range(n))
            sxy = sum(i * out[i] for i in range(n))
            sy = sum(out)
            denom = n * sx2 - sx * sx
            if abs(denom) > 1e-12:
                slope = (n * sxy - sx * sy) / denom
                intercept = (sy - slope * sx) / n
                out = [out[i] - (slope * i + intercept) for i in range(n)]

        # Notch 60Hz (4th order)
        for ch in range(n):
            for f in self.notch:
                out[ch] = f.apply(out[ch], ch)

        # Bandpass 1-45Hz (4th order)
        for ch in range(n):
            for f in self.hp:
                out[ch] = f.apply(out[ch], ch)
            for f in self.lp:
                out[ch] = f.apply(out[ch], ch)

        # CAR (common average reference)
        if n > 1:
            avg = sum(out) / n
            out = [v - avg for v in out]

        # Artifact detection
        for ch in range(n):
            is_artifact = False
            if abs(out[ch]) > self.artifact_thresh:
                is_artifact = True
            if abs(out[ch] - self.prev[ch]) > self.gradient_thresh:
                is_artifact = True
            self.windows[ch].append(out[ch])
            if len(self.windows[ch]) > 10:
                wstd = np.std(list(self.windows[ch]))
                if wstd < self.flatline_thresh:
                    is_artifact = True
            if is_artifact:
                out[ch] = 0.0
                artifacts["detected"] = True
                artifacts["channels"].append(ch)
            self.prev[ch] = out[ch]

        # EMA smoothing
        for ch in range(n):
            self.smoothed[ch] = self.ema_alpha * out[ch] + (1 - self.ema_alpha) * self.smoothed[ch]
            out[ch] = self.smoothed[ch]

        return out, artifacts


# ═══════════════════════════════════════════════════════════════
# Brain State Calculator (ported from dsp.js)
# ═══════════════════════════════════════════════════════════════

class BrainStateCalculator:
    """Computes 5 neurofeedback indices from band powers with EMA smoothing."""

    EPS = 0.001

    def __init__(self, ema_alpha=0.1):
        self.ema = ema_alpha
        self.engagement = 0.0
        self.relaxation = 0.0
        self.arousal = 0.0
        self.theta_alpha = 0.0
        self.faa = 0.0

    def calculate(self, bands, eeg_channels=None):
        """bands = dict with keys delta,theta,alpha,beta,gamma (relative 0-1).
           eeg_channels = list of per-channel alpha values for FAA (needs ≥2 channels)."""
        e = self.EPS
        raw_eng = bands["beta"] / (bands["alpha"] + bands["theta"] + e)
        raw_rel = bands["alpha"] / (bands["beta"] + e)
        raw_aro = (bands["beta"] + bands["gamma"]) / (bands["alpha"] + bands["theta"] + e)
        raw_ta = bands["theta"] / (bands["alpha"] + e)

        self.engagement = self.ema * raw_eng + (1 - self.ema) * self.engagement
        self.relaxation = self.ema * raw_rel + (1 - self.ema) * self.relaxation
        self.arousal = self.ema * raw_aro + (1 - self.ema) * self.arousal
        self.theta_alpha = self.ema * raw_ta + (1 - self.ema) * self.theta_alpha

        if eeg_channels and len(eeg_channels) >= 2:
            right = max(abs(eeg_channels[1]), 0.001)
            left = max(abs(eeg_channels[0]), 0.001)
            raw_faa = math.log(right) - math.log(left)
            self.faa = self.ema * raw_faa + (1 - self.ema) * self.faa

        return {
            "engagement": round(self.engagement, 4),
            "relaxation": round(self.relaxation, 4),
            "arousal": round(self.arousal, 4),
            "thetaAlphaRatio": round(self.theta_alpha, 4),
            "faa": round(self.faa, 4),
        }


# ═══════════════════════════════════════════════════════════════
# Calibration (Welford's online algorithm, ported from dsp.js)
# ═══════════════════════════════════════════════════════════════

FEATURE_KEYS = ["delta", "theta", "alpha", "beta", "gamma",
                "engagement", "relaxation", "arousal", "thetaAlphaRatio", "faa"]

class BrainBaseline:
    """90-second calibration using Welford's online algorithm for z-scoring."""

    def __init__(self, duration_ms=90000):
        self.duration_ms = duration_ms
        self.is_calibrating = False
        self.is_locked = False
        self.count = 0
        self.mean = {k: 0.0 for k in FEATURE_KEYS}
        self.m2 = {k: 0.0 for k in FEATURE_KEYS}
        self.variance = {k: 0.0 for k in FEATURE_KEYS}
        self.std_dev = {k: 0.0 for k in FEATURE_KEYS}
        self.start_time = 0

    def start(self):
        self.is_calibrating = True
        self.is_locked = False
        self.count = 0
        self.mean = {k: 0.0 for k in FEATURE_KEYS}
        self.m2 = {k: 0.0 for k in FEATURE_KEYS}
        self.variance = {k: 0.0 for k in FEATURE_KEYS}
        self.std_dev = {k: 0.0 for k in FEATURE_KEYS}
        self.start_time = time.time() * 1000

    def update(self, bands, indices):
        """Update calibration with current values. Auto-locks after duration_ms."""
        if not self.is_calibrating:
            return
        features = {**bands, **indices}
        self.count += 1
        for k in FEATURE_KEYS:
            x = features.get(k, 0.0)
            old_mean = self.mean[k]
            self.mean[k] = old_mean + (x - old_mean) / self.count
            self.m2[k] += (x - old_mean) * (x - self.mean[k])
            if self.count > 1:
                self.variance[k] = self.m2[k] / (self.count - 1)
                self.std_dev[k] = math.sqrt(max(0, self.variance[k]))

        elapsed = time.time() * 1000 - self.start_time
        if elapsed >= self.duration_ms:
            self.lock()

    def lock(self):
        self.is_calibrating = False
        self.is_locked = True

    def reset(self):
        self.is_calibrating = False
        self.is_locked = False
        self.count = 0
        self.mean = {k: 0.0 for k in FEATURE_KEYS}

    def zscore(self, key, value):
        if not self.is_locked or self.std_dev.get(key, 0) < 0.001:
            return 0.0
        return (value - self.mean[key]) / self.std_dev[key]

    def all_zscores(self, bands, indices):
        features = {**bands, **indices}
        return {k: round(self.zscore(k, features.get(k, 0)), 4) for k in FEATURE_KEYS}

    def progress(self):
        if not self.is_calibrating:
            return 1.0 if self.is_locked else 0.0
        elapsed = time.time() * 1000 - self.start_time
        return min(1.0, elapsed / self.duration_ms)

    def status(self):
        return {
            "isCalibrating": self.is_calibrating,
            "isLocked": self.is_locked,
            "progress": round(self.progress(), 3),
            "samplesCollected": self.count,
            "mean": {k: round(v, 4) for k, v in self.mean.items()},
            "stdDev": {k: round(v, 4) for k, v in self.std_dev.items()},
        }


# ═══════════════════════════════════════════════════════════════
# Brain State Classifier (5-state + hysteresis, ported from dsp.js)
# ═══════════════════════════════════════════════════════════════

STATES = ["Aroused", "Focused", "Relaxed", "Drowsy", "Neutral"]

class BrainStateClassifier:
    """5-state classifier with 2-second hysteresis."""

    def __init__(self, hysteresis_ms=2000):
        self.hysteresis_ms = hysteresis_ms
        self.current_state = "Neutral"
        self.candidate = "Neutral"
        self.candidate_since = 0

    def classify(self, zscores):
        """Classify brain state from z-scores. Returns state string."""
        z = zscores
        candidate = "Neutral"

        if z.get("arousal", 0) > 1.0 or z.get("gamma", 0) > 1.5:
            candidate = "Aroused"
        elif z.get("engagement", 0) > 1.0 and z.get("thetaAlphaRatio", 0) < 0:
            candidate = "Focused"
        elif z.get("relaxation", 0) > 1.0 and z.get("arousal", 0) < 0:
            candidate = "Relaxed"
        elif z.get("theta", 0) > 1.0 and z.get("beta", 0) < 0:
            candidate = "Drowsy"

        now = time.time() * 1000
        if candidate != self.candidate:
            self.candidate = candidate
            self.candidate_since = now

        if candidate != self.current_state and (now - self.candidate_since) >= self.hysteresis_ms:
            self.current_state = candidate

        return self.current_state

    def reset(self):
        self.current_state = "Neutral"
        self.candidate = "Neutral"
        self.candidate_since = 0


# ═══════════════════════════════════════════════════════════════
# Event Detector (band surges + dominant flips, ported from dsp.js)
# ═══════════════════════════════════════════════════════════════

class BrainFeatureExtractor:
    """Detects band surges and dominant band flips."""

    def __init__(self, surge_thresh=0.12, cooldown_ms=1000, max_history=5):
        self.surge_thresh = surge_thresh
        self.cooldown_ms = cooldown_ms
        self.max_history = max_history
        self.prev_bands = {}
        self.prev_dominant = None
        self.cooldowns = {}
        self.history = deque(maxlen=max_history)

    def extract(self, bands):
        """Extract events from current band powers. Returns list of new events."""
        events = []
        now = time.time() * 1000
        band_names = ["delta", "theta", "alpha", "beta", "gamma"]

        # Band surge detection
        for bn in band_names:
            cur = bands.get(bn, 0)
            prev = self.prev_bands.get(bn, cur)
            delta = cur - prev
            cd_key = f"surge_{bn}"
            if abs(delta) > self.surge_thresh and (now - self.cooldowns.get(cd_key, 0)) > self.cooldown_ms:
                direction = "up" if delta > 0 else "down"
                evt = {
                    "type": "band_surge",
                    "timestamp": now,
                    "band": bn.upper(),
                    "delta": round(delta, 4),
                    "direction": direction,
                    "description": f"{direction} {bn.upper()} surge: {prev:.3f} -> {cur:.3f}",
                }
                events.append(evt)
                self.cooldowns[cd_key] = now

        # Dominant band flip
        dominant = max(band_names, key=lambda b: bands.get(b, 0))
        if self.prev_dominant and dominant != self.prev_dominant:
            cd_key = "flip"
            if (now - self.cooldowns.get(cd_key, 0)) > self.cooldown_ms:
                evt = {
                    "type": "dominant_flip",
                    "timestamp": now,
                    "previousBand": self.prev_dominant.upper(),
                    "currentBand": dominant.upper(),
                    "description": f"Dominant flip: {self.prev_dominant.upper()} -> {dominant.upper()}",
                }
                events.append(evt)
                self.cooldowns[cd_key] = now

        self.prev_bands = dict(bands)
        self.prev_dominant = dominant

        for e in events:
            self.history.append(e)

        return events


# ═══════════════════════════════════════════════════════════════
# Device & Channel Configuration
# ═══════════════════════════════════════════════════════════════

DEVICE_PROFILES = {
    "muse_s": {
        "name": "Muse S (Athena)",
        "board_id": 21,   # BoardIds.MUSE_S_BOARD
        "channels": 4,
        "sample_rate": 256,
        "electrodes": ["TP9", "AF7", "AF8", "TP10"],
        "osc_prefix": "/muse_s",
        "has_ppg": True,
        "has_imu": True,
    },
    "muse_2": {
        "name": "Muse 2",
        "board_id": 22,   # BoardIds.MUSE_2_BOARD
        "channels": 4,
        "sample_rate": 256,
        "electrodes": ["TP9", "AF7", "AF8", "TP10"],
        "osc_prefix": "/muse_2",
        "has_ppg": True,
        "has_imu": True,
    },
    "ganglion": {
        "name": "OpenBCI Ganglion",
        "board_id": 1,    # BoardIds.GANGLION_BOARD
        "channels": 4,
        "sample_rate": 200,
        "electrodes": ["Ch1", "Ch2", "Ch3", "Ch4"],
        "osc_prefix": "/ganglion",
        "has_ppg": False,
        "has_imu": False,
    },
    "cyton_daisy": {
        "name": "OpenBCI Ultracortex (Cyton+Daisy)",
        "board_id": 6,    # BoardIds.CYTON_DAISY_BOARD
        "channels": 16,
        "sample_rate": 125,
        "electrodes": ["Fp1", "Fp2", "F7", "F3", "F4", "F8", "T3", "C3",
                        "C4", "T4", "P3", "P4", "T5", "T6", "O1", "O2"],
        "osc_prefix": "/ultracortex",
        "has_ppg": False,
        "has_imu": False,
    },
    "synthetic": {
        "name": "BrainFlow Synthetic Board",
        "board_id": -1,   # BoardIds.SYNTHETIC_BOARD
        "channels": 4,
        "sample_rate": 250,
        "electrodes": ["Ch1", "Ch2", "Ch3", "Ch4"],
        "osc_prefix": "/synthetic",
        "has_ppg": False,
        "has_imu": False,
    },
}

# ═══════════════════════════════════════════════════════════════
# MuseBridge — Swift subprocess for Muse devices
# ═══════════════════════════════════════════════════════════════

MUSE_DEVICE_TYPES = {"muse_s", "muse_2"}
BRIDGE_PATH = str(Path(__file__).parent / "MuseBridge")

class MuseBridgeManager:
    """Manages the MuseBridge Swift subprocess for Muse device communication."""

    def __init__(self):
        self.process = None
        self.reader_thread = None
        self.running = False
        self.discovered_devices = []
        self.connected = False

    def start(self):
        """Launch MuseBridge and start reading JSON lines from stdout."""
        if self.process and self.process.poll() is None:
            return  # already running

        if not os.path.isfile(BRIDGE_PATH):
            print(f"[MuseBridge] ✗ Binary not found at {BRIDGE_PATH}")
            return

        import subprocess as sp
        self.process = sp.Popen(
            [BRIDGE_PATH],
            stdin=sp.PIPE,
            stdout=sp.PIPE,
            stderr=sp.PIPE,
            bufsize=1,
            text=True,
        )
        self.running = True
        self.reader_thread = threading.Thread(target=self._read_loop, daemon=True)
        self.reader_thread.start()
        print(f"[MuseBridge] ▶ Launched — scanning for Muse devices")

    def stop(self):
        """Kill MuseBridge subprocess."""
        self.running = False
        if self.process:
            try:
                self.process.terminate()
                self.process.wait(timeout=3)
            except Exception:
                try:
                    self.process.kill()
                except Exception:
                    pass
        self.process = None
        self.connected = False
        self.discovered_devices = []
        print("[MuseBridge] ⏹ Stopped")

    def send_command(self, cmd):
        """Send JSON command to MuseBridge stdin."""
        if self.process and self.process.stdin:
            try:
                self.process.stdin.write(json.dumps(cmd) + "\n")
                self.process.stdin.flush()
            except Exception as e:
                print(f"[MuseBridge] stdin write error: {e}")

    def connect_device(self, index=0):
        """Tell MuseBridge to connect to device at index."""
        self.send_command({"command": "connect", "deviceIndex": index})

    def disconnect_device(self):
        """Tell MuseBridge to disconnect."""
        self.send_command({"command": "disconnect"})
        self.connected = False

    def _read_loop(self):
        """Read JSON lines from MuseBridge stdout and route to handlers."""
        while self.running and self.process and self.process.poll() is None:
            try:
                line = self.process.stdout.readline()
                if not line:
                    break
                line = line.strip()
                if not line:
                    continue
                try:
                    packet = json.loads(line)
                    self._handle_packet(packet)
                except json.JSONDecodeError:
                    print(f"[MuseBridge] {line}")
            except Exception as e:
                if self.running:
                    print(f"[MuseBridge] read error: {e}")
                break

        if self.running:
            print("[MuseBridge] ⚠ Process exited — will restart in 2s")
            time.sleep(2)
            self.start()

    def _handle_packet(self, packet):
        """Route incoming MuseBridge JSON packets."""
        ptype = packet.get("type")

        if ptype == "device_list":
            self.discovered_devices = packet.get("devices", [])
            count = len(self.discovered_devices)
            names = [d.get("name", "?") for d in self.discovered_devices]
            print(f"[MuseBridge] 📱 {count} device(s) found: {', '.join(names)}")

        elif ptype == "status":
            msg = packet.get("message", "")
            print(f"[MuseBridge] {msg}")
            if "Connecting" in msg:
                self.connected = True

        elif ptype == "eeg":
            # Route EEG to latest_state (will be picked up by OSC loop)
            latest_state["eeg"] = packet.get("eeg", [])

        elif ptype == "bandPowers":
            # Route band powers to brain state pipeline
            abs_bands = packet.get("absolute", {})
            rel_bands = packet.get("relative", {})
            if rel_bands:
                latest_state["bands"] = {
                    "delta": rel_bands.get("delta", 0),
                    "theta": rel_bands.get("theta", 0),
                    "alpha": rel_bands.get("alpha", 0),
                    "beta": rel_bands.get("beta", 0),
                    "gamma": rel_bands.get("gamma", 0),
                }
                # Run brain state pipeline
                indices = brain_calc.calculate(latest_state["bands"])
                brain_baseline.update(latest_state["bands"], indices)
                zscores = brain_baseline.all_zscores(latest_state["bands"], indices)
                state = brain_classifier.classify(zscores)
                events = brain_events.extract(latest_state["bands"])
                latest_state["indices"] = indices
                latest_state["zscores"] = zscores
                latest_state["state"] = state
                latest_state["events"] = events
                latest_state["event_history"] = list(brain_events.history)

        elif ptype == "accelerometer":
            latest_state["accel"] = packet.get("accel", [])

        elif ptype == "gyroscope":
            latest_state["gyro"] = packet.get("gyro", [])

        elif ptype == "ppg":
            latest_state["ppg"] = packet.get("ppg", [])

        elif ptype == "battery":
            latest_state["battery"] = packet.get("percentage", 0)

        elif ptype == "error":
            print(f"[MuseBridge] ✗ {packet.get('message', '')}")


muse_bridge = MuseBridgeManager()


# Active device state
active_device = {
    "type": None,
    "profile": None,
    "board": None,
    "connected": False,
    "streaming": False,
}


# ═══════════════════════════════════════════════════════════════
# Processing State (instantiated per-session)
# ═══════════════════════════════════════════════════════════════

dsp_pipeline = None
brain_calc = BrainStateCalculator()
brain_baseline = BrainBaseline()
brain_classifier = BrainStateClassifier()
brain_events = BrainFeatureExtractor()

# Latest processed state (read by API + OSC loop)
latest_state = {
    "bands": {"delta": 0, "theta": 0, "alpha": 0, "beta": 0, "gamma": 0},
    "indices": {},
    "zscores": {},
    "state": "Neutral",
    "events": [],
    "event_history": [],
    "eeg": [],
    "artifacts": {"detected": False, "channels": []},
}


# ═══════════════════════════════════════════════════════════════
# OSC State
# ═══════════════════════════════════════════════════════════════

osc_clients = {}
osc_config = {
    "enabled": False,
    "targets": [
        {"name": "Max/MSP", "host": "127.0.0.1", "port": 7400, "enabled": True, "mode": "B"},
        {"name": "Csound", "host": "127.0.0.1", "port": 7400, "enabled": False, "mode": "A"},
        {"name": "TouchDesigner", "host": "127.0.0.1", "port": 7400, "enabled": False, "mode": "B"},
        {"name": "Unity", "host": "127.0.0.1", "port": 7400, "enabled": False, "mode": "B"},
        {"name": "Ableton", "host": "127.0.0.1", "port": 7400, "enabled": False, "mode": "B"},
    ],
    "bands": ["Alpha", "Beta", "Theta"],
    "extras": [],
    "rate_hz": 20,
    "filtered": True,
    "smooth": 0.1,
}
osc_sending = False
osc_thread = None
message_count = 0
last_report = time.time()

# Simulator state
use_simulator = False
sim_mode = "normal"
sim_time = 0.0


def get_client(host, port):
    key = f"{host}:{port}"
    if key not in osc_clients:
        osc_clients[key] = SimpleUDPClient(host, int(port))
        print(f"[OSC] Created UDP client → {host}:{port}")
    return osc_clients[key]


# ═══════════════════════════════════════════════════════════════
# Simulated EEG (enhanced with brain state modes)
# ═══════════════════════════════════════════════════════════════

def sim_eeg_band_power(t, electrode_id, band_name):
    """Generate simulated band power for testing."""
    s = sum(ord(c) for c in electrode_id) * 137
    freqs = {"Delta": 2, "Theta": 6, "Alpha": 10, "Beta": 20, "Gamma": 45}
    amps = {"Delta": 0.8, "Theta": 0.4, "Alpha": 0.55, "Beta": 0.25, "Gamma": 0.12}

    # Adjust amplitudes based on sim_mode
    if sim_mode == "meditation":
        amps = {"Delta": 0.3, "Theta": 0.6, "Alpha": 0.9, "Beta": 0.1, "Gamma": 0.05}
    elif sim_mode == "focused":
        amps = {"Delta": 0.2, "Theta": 0.15, "Alpha": 0.3, "Beta": 0.8, "Gamma": 0.4}
    elif sim_mode == "drowsy":
        amps = {"Delta": 0.9, "Theta": 0.7, "Alpha": 0.2, "Beta": 0.1, "Gamma": 0.05}

    f = freqs.get(band_name, 10)
    a = amps.get(band_name, 0.3)
    p = (s % 100) / 15
    val = a * math.sin(2 * math.pi * f * 0.01 * t + p) * (0.7 + 0.3 * math.sin(t * 0.005 + s))
    val += (a / 3) * math.sin(2 * math.pi * f * 1.3 * 0.01 * t + p * 2)
    val += (random.random() - 0.5) * a * 0.3
    return abs(val)


def get_electrodes():
    """Get electrode list for current device (or default)."""
    if active_device["profile"]:
        return active_device["profile"]["electrodes"]
    return ["Ch1", "Ch2", "Ch3", "Ch4"]


def get_osc_prefix():
    """Get OSC address prefix for current device."""
    if active_device["profile"]:
        return active_device["profile"]["osc_prefix"]
    return "/ganglion"


# ═══════════════════════════════════════════════════════════════
# OSC Send Loop (background thread)
# ═══════════════════════════════════════════════════════════════

def osc_send_loop():
    """Background thread: sends OSC at configured rate."""
    global osc_sending, sim_time, message_count, last_report

    while osc_sending:
        interval = 1.0 / max(1, osc_config["rate_hz"])
        sim_time += interval
        electrodes = get_electrodes()
        prefix = get_osc_prefix()

        enabled_targets = [t for t in osc_config["targets"] if t["enabled"]]
        if not enabled_targets:
            time.sleep(interval)
            continue

        # Compute band powers (from BrainFlow or simulator)
        band_names_all = ["Delta", "Theta", "Alpha", "Beta", "Gamma"]
        band_powers = {}
        for bn in band_names_all:
            band_powers[bn] = [sim_eeg_band_power(sim_time, el, bn) for el in electrodes]

        # Compute relative powers for brain state
        avg_bands = {}
        for bn in band_names_all:
            avg_bands[bn.lower()] = sum(band_powers[bn]) / max(1, len(band_powers[bn]))
        total = sum(avg_bands.values()) + 0.001
        rel_bands = {k: v / total for k, v in avg_bands.items()}

        # Brain state processing
        indices = brain_calc.calculate(rel_bands)
        brain_baseline.update(rel_bands, indices)
        zscores = brain_baseline.all_zscores(rel_bands, indices)
        state = brain_classifier.classify(zscores)
        events = brain_events.extract(rel_bands)

        # Update latest state for API
        latest_state["bands"] = rel_bands
        latest_state["indices"] = indices
        latest_state["zscores"] = zscores
        latest_state["state"] = state
        latest_state["events"] = events
        latest_state["event_history"] = list(brain_events.history)

        # Send OSC to each target
        for target in enabled_targets:
            try:
                client = get_client(target["host"], target["port"])

                for bn in osc_config["bands"]:
                    values = band_powers.get(bn, [0.0] * len(electrodes))

                    if target["mode"] == "A":
                        addr = f"{prefix}/bands/{bn.lower()}_absolute"
                        client.send_message(addr, values)
                        message_count += 1
                    else:
                        for i, el in enumerate(electrodes):
                            addr = f"/eeg/{el}/{bn.lower()}"
                            client.send_message(addr, values[i] if i < len(values) else 0.0)
                            message_count += 1

                # Extras
                profile = active_device.get("profile") or DEVICE_PROFILES.get("synthetic", {})
                for extra in osc_config.get("extras", []):
                    if extra == "quality":
                        for el in electrodes:
                            q = 0.6 + 0.35 * math.sin(sim_time * 0.02 + ord(el[0]) * 0.3)
                            client.send_message(f"/eeg/{el}/quality", max(0, min(1, q)))
                            message_count += 1
                    if extra == "acc" and profile.get("has_imu", False):
                        client.send_message(f"{prefix}/acc", [
                            random.gauss(0, 0.1),
                            random.gauss(0, 0.1),
                            9.8 + random.gauss(0, 0.05),
                        ])
                        message_count += 1
                    if extra == "gyro" and profile.get("has_imu", False):
                        client.send_message(f"{prefix}/gyro", [
                            random.gauss(0, 1),
                            random.gauss(0, 1),
                            random.gauss(0, 1),
                        ])
                        message_count += 1
                    if extra == "ppg" and profile.get("has_ppg", False):
                        client.send_message(f"{prefix}/ppg", [
                            0.5 + 0.3 * math.sin(sim_time * 1.2),
                            0.4 + 0.2 * math.sin(sim_time * 1.2 + 0.5),
                            0.6 + 0.25 * math.sin(sim_time * 1.2 + 1.0),
                        ])
                        message_count += 1

                # Brain state OSC (always send if calibrated)
                if brain_baseline.is_locked:
                    client.send_message(f"{prefix}/brain/engagement", float(zscores.get("engagement", 0)))
                    client.send_message(f"{prefix}/brain/relaxation", float(zscores.get("relaxation", 0)))
                    client.send_message(f"{prefix}/brain/arousal", float(zscores.get("arousal", 0)))
                    client.send_message(f"{prefix}/brain/thetaAlpha", float(zscores.get("thetaAlphaRatio", 0)))
                    message_count += 4

                # Event OSC
                for evt in events:
                    if evt["type"] == "band_surge":
                        client.send_message(f"{prefix}/events/surge", [evt["band"], float(evt["delta"])])
                    elif evt["type"] == "dominant_flip":
                        client.send_message(f"{prefix}/events/flip", [evt["previousBand"], evt["currentBand"]])
                    message_count += 1

            except Exception as e:
                print(f"[OSC] Send error to {target['name']}: {e}")

        # Rate report
        now = time.time()
        if now - last_report > 3.0:
            rate = message_count / (now - last_report)
            print(f"[OSC] {rate:.0f} msg/sec → {', '.join(t['name']+':'+str(t['port']) for t in enabled_targets)}")
            message_count = 0
            last_report = now

        time.sleep(interval)


# ═══════════════════════════════════════════════════════════════
# REST API
# ═══════════════════════════════════════════════════════════════

@app.get("/", response_class=HTMLResponse)
async def index():
    html_path = Path(__file__).parent / "neurovis.html"
    if html_path.exists():
        return FileResponse(str(html_path), media_type="text/html")
    return HTMLResponse("<h1>neurovis.html not found</h1>")


# ── Device Connection ──

@app.get("/api/ports")
async def scan_ports():
    """Scan for serial ports, Bluetooth devices, and Muse headsets."""
    ports = []
    bluetooth = []
    try:
        import serial.tools.list_ports
        for p in serial.tools.list_ports.comports():
            ports.append({"port": p.device, "desc": p.description})
    except ImportError:
        pass

    # Include Muse devices discovered by MuseBridge
    muse_devices = []
    if muse_bridge.running:
        muse_devices = muse_bridge.discovered_devices

    return {
        "ports": [p["port"] for p in ports],
        "bluetooth": bluetooth,
        "details": ports,
        "muse_devices": muse_devices,
    }


@app.post("/api/connect")
async def connect_device(payload: dict):
    """Connect to a device. Uses MuseBridge for Muse, BrainFlow for OpenBCI."""
    global dsp_pipeline

    dev_type = payload.get("device_type", "ganglion")
    profile = DEVICE_PROFILES.get(dev_type)
    if not profile:
        return JSONResponse({"status": "error", "message": f"Unknown device: {dev_type}"}, status_code=400)

    # ── Muse devices: use Swift bridge ──
    if dev_type in MUSE_DEVICE_TYPES:
        if not os.path.isfile(BRIDGE_PATH):
            return JSONResponse({"status": "error", "message": f"MuseBridge binary not found at {BRIDGE_PATH}. Build it with Xcode first."}, status_code=500)

        # Start bridge if not running
        if not muse_bridge.running or not muse_bridge.process or muse_bridge.process.poll() is not None:
            muse_bridge.start()
            # Wait for device discovery
            for _ in range(20):
                time.sleep(0.5)
                if muse_bridge.discovered_devices:
                    break

        if not muse_bridge.discovered_devices:
            return JSONResponse({"status": "error", "message": "No Muse devices found. Make sure Bluetooth is on and device is in pairing mode (hold power button until light flashes)."}, status_code=404)

        # Connect to the first discovered Muse (or specified index)
        device_index = int(payload.get("device_index", 0))
        muse_bridge.connect_device(device_index)

        active_device["type"] = dev_type
        active_device["profile"] = profile
        active_device["board"] = None  # No BrainFlow board for Muse
        active_device["connected"] = True
        active_device["streaming"] = True  # MuseBridge streams immediately on connect

        dsp_pipeline = DSPPipeline(sr=profile["sample_rate"], nch=profile["channels"])

        dev_name = muse_bridge.discovered_devices[device_index].get("name", profile["name"]) if device_index < len(muse_bridge.discovered_devices) else profile["name"]
        print(f"[MuseBridge] Connected to {dev_name} ({profile['channels']}ch @ {profile['sample_rate']}Hz)")
        return {"status": "ok", "device": dev_name, "channels": profile["channels"], "connection": "muse_bridge"}

    # ── OpenBCI devices: use BrainFlow ──
    if not BRAINFLOW_AVAILABLE:
        return JSONResponse({"status": "error", "message": "brainflow not installed — needed for OpenBCI devices"}, status_code=500)

    serial_port = payload.get("serial_port", "")
    mac_address = payload.get("mac_address", "")

    try:
        params = BrainFlowInputParams()
        if serial_port:
            params.serial_port = serial_port
        if mac_address:
            params.mac_address = mac_address
        params.timeout = int(payload.get("timeout", 15))

        board = BoardShim(profile["board_id"], params)
        board.prepare_session()

        active_device["type"] = dev_type
        active_device["profile"] = profile
        active_device["board"] = board
        active_device["connected"] = True

        dsp_pipeline = DSPPipeline(sr=profile["sample_rate"], nch=profile["channels"])

        print(f"[BrainFlow] Connected to {profile['name']} ({profile['channels']}ch @ {profile['sample_rate']}Hz)")
        return {"status": "ok", "device": profile["name"], "channels": profile["channels"], "connection": "brainflow"}

    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


@app.post("/api/start")
async def start_streaming(payload: dict = {}):
    """Start streaming. Muse devices stream automatically; OpenBCI needs explicit start."""
    # Muse: already streaming from MuseBridge
    if active_device.get("type") in MUSE_DEVICE_TYPES:
        active_device["streaming"] = True
        return {"status": "ok", "note": "Muse streams automatically on connect"}

    if not active_device["board"]:
        return JSONResponse({"status": "error", "message": "No device connected"}, status_code=400)
    try:
        active_device["board"].start_stream(int(payload.get("buffer_size", 45000)))
        active_device["streaming"] = True
        print("[BrainFlow] Streaming started")
        return {"status": "ok"}
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


@app.post("/api/stop")
async def stop_streaming(payload: dict = {}):
    """Stop streaming."""
    # Muse: stop via bridge
    if active_device.get("type") in MUSE_DEVICE_TYPES:
        muse_bridge.disconnect_device()
        active_device["streaming"] = False
        return {"status": "ok"}

    if active_device["board"] and active_device["streaming"]:
        try:
            active_device["board"].stop_stream()
            active_device["streaming"] = False
            print("[BrainFlow] Streaming stopped")
        except Exception:
            pass
    return {"status": "ok"}


@app.post("/api/disconnect")
async def disconnect_device(payload: dict = {}):
    """Disconnect BrainFlow device."""
    if active_device["board"]:
        try:
            if active_device["streaming"]:
                active_device["board"].stop_stream()
            active_device["board"].release_session()
        except Exception:
            pass
    active_device["type"] = None
    active_device["profile"] = None
    active_device["board"] = None
    active_device["connected"] = False
    active_device["streaming"] = False
    print("[BrainFlow] Disconnected")
    return {"status": "ok"}


@app.post("/api/use_simulator")
async def toggle_simulator(payload: dict):
    global use_simulator
    use_simulator = payload.get("enabled", True)
    return {"status": "ok", "simulator": use_simulator}


@app.post("/api/simulator/mode")
async def set_sim_mode(payload: dict):
    global sim_mode
    sim_mode = payload.get("mode", "normal")
    return {"status": "ok", "mode": sim_mode}


# ── OSC Control ──

@app.get("/api/osc/status")
async def osc_status():
    return {"sending": osc_sending, "config": osc_config, "message_count": message_count}


@app.post("/api/osc/start")
async def osc_start():
    global osc_sending, osc_thread
    if osc_sending:
        return {"status": "already_sending"}
    osc_sending = True
    osc_thread = threading.Thread(target=osc_send_loop, daemon=True)
    osc_thread.start()
    print("[OSC] ▶ Started sending")
    return {"status": "ok", "sending": True}


@app.post("/api/osc/stop")
async def osc_stop():
    global osc_sending
    osc_sending = False
    print("[OSC] ⏹ Stopped sending")
    return {"status": "ok", "sending": False}


@app.post("/api/osc/config")
async def osc_configure(payload: dict):
    if "targets" in payload:
        osc_config["targets"] = payload["targets"]
    if "bands" in payload:
        osc_config["bands"] = payload["bands"]
    if "extras" in payload:
        osc_config["extras"] = payload["extras"]
    if "rate_hz" in payload:
        osc_config["rate_hz"] = int(payload["rate_hz"])
    if "filtered" in payload:
        osc_config["filtered"] = bool(payload["filtered"])
    if "smooth" in payload:
        osc_config["smooth"] = float(payload["smooth"])
    for target in osc_config["targets"]:
        if target["enabled"]:
            get_client(target["host"], target["port"])
    return {"status": "ok", "config": osc_config}


@app.post("/api/osc/send")
async def osc_send_single(payload: dict):
    address = payload.get("address", "/test")
    args = payload.get("args", [0.0])
    port = int(payload.get("port", 7400))
    host = payload.get("host", "127.0.0.1")
    try:
        client = get_client(host, port)
        client.send_message(address, args if isinstance(args, list) else float(args))
        return {"status": "ok", "address": address, "args": args}
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


# ── Brain State & Calibration ──

@app.get("/api/brain/state")
async def get_brain_state():
    """Get current brain state snapshot."""
    return {
        "state": latest_state["state"],
        "indices": latest_state["indices"],
        "zscores": latest_state["zscores"],
        "bands": latest_state["bands"],
        "events": latest_state["events"],
        "eventHistory": latest_state["event_history"],
        "calibration": brain_baseline.status(),
    }


@app.post("/api/calibration/start")
async def calibration_start():
    brain_baseline.start()
    brain_classifier.reset()
    print("[Calibration] Started (90 seconds)")
    return {"status": "ok", "duration_ms": brain_baseline.duration_ms}


@app.post("/api/calibration/stop")
async def calibration_stop():
    brain_baseline.lock()
    print(f"[Calibration] Locked with {brain_baseline.count} samples")
    return {"status": "ok", "baseline": brain_baseline.status()}


@app.post("/api/calibration/reset")
async def calibration_reset():
    brain_baseline.reset()
    brain_classifier.reset()
    print("[Calibration] Reset")
    return {"status": "ok"}


@app.get("/api/calibration/status")
async def calibration_status():
    return brain_baseline.status()


@app.post("/api/research-event")
async def research_event(payload: dict):
    """Log a research marker: OSC to enabled targets, optional HTTP relay to NeuroVis Node bridge.

    Body: { "label": str, "detail": str optional, "audioPositionMs": number optional }

    Environment:
      NEUROVIS_RESEARCH_EVENT_URL — e.g. http://127.0.0.1:3000/api/research-event
        forwards to server-enhanced.js so the Next/Web UI WebSocket clients ingest the marker.
    """
    label = str(payload.get("label", "")).strip()[:240]
    if not label:
        return JSONResponse({"ok": False, "error": "label required"}, status_code=400)
    detail_raw = payload.get("detail")
    detail_s = str(detail_raw).strip()[:600] if detail_raw is not None else ""
    audio_pos_raw = payload.get("audioPositionMs")
    audio_position_ms = None
    if audio_pos_raw is not None:
        try:
            ap = float(audio_pos_raw)
            if ap == ap:  # not NaN
                audio_position_ms = ap
        except (TypeError, ValueError):
            audio_position_ms = None
    wall_ms = int(time.time() * 1000)
    osc_args = [label, detail_s, float(wall_ms)] if detail_s else [label, float(wall_ms)]

    n_osc = 0
    osc_errors = []
    enabled = [t for t in osc_config["targets"] if t.get("enabled")]
    targets = enabled if enabled else [osc_config["targets"][0]]
    for t in targets:
        try:
            get_client(t["host"], int(t["port"])).send_message("/neurovis/research_event", osc_args)
            n_osc += 1
        except Exception as e:
            osc_errors.append(f"{t.get('name', '?')}: {e}")

    relay_url = (os.environ.get("NEUROVIS_RESEARCH_EVENT_URL") or "").strip()
    relay_ok = None
    relay_err = None
    if relay_url:
        try:
            relay_obj = {"label": label, "detail": detail_s or None}
            if audio_position_ms is not None:
                relay_obj["audioPositionMs"] = audio_position_ms
            body = json.dumps(relay_obj).encode("utf-8")
            req = urllib.request.Request(
                relay_url,
                data=body,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            token = os.environ.get("RESEARCH_EVENT_SECRET")
            if token:
                req.add_header("X-NeuroVis-Research-Token", token)
            with urllib.request.urlopen(req, timeout=3.0) as resp:
                relay_ok = 200 <= resp.status < 300
        except Exception as e:
            relay_ok = False
            relay_err = str(e)

    return {
        "ok": True,
        "wall_ms": wall_ms,
        "osc_targets_sent": n_osc,
        "osc_errors": osc_errors or None,
        "relay_url": relay_url or None,
        "relay_ok": relay_ok,
        "relay_error": relay_err,
    }


# ═══════════════════════════════════════════════════════════════
# Launcher
# ═══════════════════════════════════════════════════════════════

def find_free_port(start=8100, end=8200):
    for port in range(start, end):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(("127.0.0.1", port))
                return port
        except OSError:
            continue
    return start


def open_browser(port, retries=10):
    for _ in range(retries):
        time.sleep(0.5)
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(0.5)
                s.connect(("127.0.0.1", port))
                webbrowser.open(f"http://127.0.0.1:{port}")
                return
        except (ConnectionRefusedError, OSError):
            continue
    webbrowser.open(f"http://127.0.0.1:{port}")


if __name__ == "__main__":
    port = find_free_port()

    bf_status = "✓ Available" if BRAINFLOW_AVAILABLE else "✗ Not installed (simulator only)"

    print(f"""
    ╔══════════════════════════════════════════════════╗
    ║       NeuroVis EEG Server — OpenBCI              ║
    ╠══════════════════════════════════════════════════╣
    ║  Running at  http://127.0.0.1:{port:<5}              ║
    ║                                                  ║
    ║  Muse 2/S | Ganglion (4-ch) | Ultracortex (16-ch) ║
    ║  BrainFlow: {bf_status:<36}║
    ║  OSC:      python-osc → 127.0.0.1:7400          ║
    ║                                                  ║
    ║  Features: DSP Pipeline | Brain State | Z-Score  ║
    ║           Calibration | Event Detection          ║
    ║                                                  ║
    ║  Opening in your browser...                      ║
    ║  Press Ctrl+C to quit.                           ║
    ╚══════════════════════════════════════════════════╝
    """)

    threading.Thread(target=open_browser, args=(port,), daemon=True).start()

    try:
        uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")
    except KeyboardInterrupt:
        print("\nNeuroVis stopped.")
