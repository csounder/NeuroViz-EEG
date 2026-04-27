#!/usr/bin/env python3
"""
NeuroVis Muse S Athena BLE bridge.

Experimental direct BLE bridge for **Muse S Athena** (273e0013 sensor notify +
tagged EEG/IMU/optical frames). **Muse 2** uses different GATT (LibMuse): you
will see 273e0001 control and many 273e00xx chars but often **no 273e0013** —
those headsets must use the **default Swift bridge** (do not set BRIDGE_MODE=athena).

Emits the same newline-delimited JSON packet types as the Swift/LibMuse bridge.

Install dependencies:
  python3 -m pip install -r requirements-athena.txt

Run through NeuroVis:
  BRIDGE_MODE=athena npm start
"""

from __future__ import annotations

import asyncio
import json
import math
import re
import signal
import struct
import sys
import time
from dataclasses import dataclass
from typing import Any, Callable

# When set, JSON lines go through the asyncio queue (non-blocking for BLE callbacks).
_emit_hook: Callable[[dict[str, Any]], None] | None = None

try:
    from bleak import BleakClient, BleakScanner
except Exception as exc:  # pragma: no cover - clear runtime error for users
    print(
        json.dumps(
            {
                "type": "error",
                "message": f"Missing Python BLE dependency: {exc}. Run: python3 -m pip install -r requirements-athena.txt",
            }
        ),
        flush=True,
    )
    raise


CONTROL_CHAR = "273e0001-4c4d-454d-96be-f03bac821358"
SENSOR_CHAR = "273e0013-4c4d-454d-96be-f03bac821358"


def _compact_uuid(u: str) -> str:
    return str(u).lower().replace("-", "")


def _has_athena_sensor_characteristic(char_uuids: list[str]) -> bool:
    """True if the peripheral lists the Athena combined-sensor notify UUID."""
    want = _compact_uuid(SENSOR_CHAR)
    for c in char_uuids:
        cu = _compact_uuid(c)
        if cu == want:
            return True
        cl = str(c).lower()
        if cl.startswith("273e0013-"):
            return True
        if cu.startswith("273e0013") and len(cu) >= 28:
            return True
    return False


def _name_suggests_muse_3(name: str) -> bool:
    lower = name.lower()
    return (
        "muse 3" in lower
        or re.search(r"\bmuse3\b", lower) is not None
        or re.search(r"\bmuse[-_\s]?3\b", lower) is not None
    )


def is_muse_two_serial_ble_name(name: str) -> bool:
    """Matches server-enhanced.js isMuseTwoBleSerialName — Muse 2 BLE ads, not Athena."""
    t = (name or "").strip()
    if not re.match(r"^muse[-_]", t, re.I):
        return False
    lower = t.lower()
    if "athena" in lower:
        return False
    if _name_suggests_muse_3(lower):
        return False
    if (
        re.search(r"\bmuse\s*s\b", lower)
        or "muse-s" in lower
        or "muse_s" in lower
    ):
        return False
    if (
        re.search(r"\bmuse\s*2\b", lower)
        or "muse2" in lower
        or "muse-2" in lower
    ):
        return True
    return bool(re.match(r"^muse[-_][a-z0-9]{3,}$", t, re.I))


EEG_UV_PER_LSB = 1450.0 / 16383.0
ACC_G_PER_LSB = 0.0000610352
GYRO_DPS_PER_LSB = -0.0074768

TAG_PAYLOAD_BYTES = {
    0x11: 28,  # EEG 4ch, 4 samples/channel, 14-bit LE packed
    0x12: 28,  # EEG 8ch, 2 samples/channel, 14-bit LE packed
    0x34: 30,  # Optical 4ch, 3 samples/channel, 20-bit LE packed
    0x35: 40,  # Optical 8ch, 2 samples/channel, 20-bit LE packed
    0x36: 40,  # Optical 16ch, 1 sample/channel, 20-bit LE packed
    0x47: 36,  # ACC/GYRO 6 axes, 3 samples, i16 LE
}


def emit(obj: dict[str, Any]) -> None:
    if _emit_hook is not None:
        _emit_hook(obj)
        return
    print(json.dumps(obj, separators=(",", ":")), flush=True)


def status(message: str) -> None:
    emit({"type": "status", "message": message})


def error(message: str) -> None:
    emit({"type": "error", "message": message})


def read_unsigned_bits_le(payload: bytes, bits_per_value: int, count: int) -> list[int]:
    values: list[int] = []
    bit_pos = 0
    for _ in range(count):
        value = 0
        for bit in range(bits_per_value):
            src = bit_pos + bit
            if payload[src // 8] & (1 << (src % 8)):
                value |= 1 << bit
        values.append(value)
        bit_pos += bits_per_value
    return values


def decode_eeg(payload: bytes, channels: int, samples_per_channel: int) -> list[list[float]]:
    raw_values = read_unsigned_bits_le(payload, 14, channels * samples_per_channel)
    frames: list[list[float]] = []
    for sample in range(samples_per_channel):
        frame = []
        for ch in range(channels):
            raw = raw_values[sample * channels + ch]
            frame.append((raw - 8192) * EEG_UV_PER_LSB)
        frames.append(frame)
    return frames


def decode_optical(payload: bytes, channels: int, samples_per_channel: int) -> list[list[float]]:
    raw_values = read_unsigned_bits_le(payload, 20, channels * samples_per_channel)
    frames: list[list[float]] = []
    for sample in range(samples_per_channel):
        frame = []
        for ch in range(channels):
            frame.append(float(raw_values[sample * channels + ch]))
        frames.append(frame)
    return frames


def decode_imu(payload: bytes) -> list[tuple[list[float], list[float]]]:
    ints = list(struct.unpack("<18h", payload[:36]))
    frames: list[tuple[list[float], list[float]]] = []
    for sample in range(3):
        base = sample * 6
        accel = [ints[base + i] * ACC_G_PER_LSB for i in range(3)]
        gyro = [ints[base + 3 + i] * GYRO_DPS_PER_LSB for i in range(3)]
        frames.append((accel, gyro))
    return frames


def summarize_optical(frames: list[list[float]]) -> tuple[list[float], list[float]]:
    """Return PPG-like channels and fNIRS-like slow optical features.

    Athena optical packets are raw multi-wavelength intensity values. True fNIRS
    HbO/HbR requires calibration and a modified Beer-Lambert pipeline; for now
    NeuroVis exposes normalized optical movement as fNIRS proxy values so the
    research/teaching pipeline can see and sonify the stream.
    """

    if not frames:
        return [0.0, 0.0, 0.0], [0.0, 0.0, 0.0]
    latest = frames[-1]
    ppg = latest[:3] if len(latest) >= 3 else latest + [0.0] * (3 - len(latest))
    groups = [
        latest[0::3],
        latest[1::3],
        latest[2::3],
    ]
    fnirs = []
    for group in groups:
        if group:
            fnirs.append(sum(group) / len(group) / 1_048_575.0)
        else:
            fnirs.append(0.0)
    return ppg[:3], fnirs[:3]


@dataclass
class MuseDevice:
    index: int
    name: str
    address: str


class AthenaBridge:
    def __init__(self) -> None:
        self.devices: list[MuseDevice] = []
        self.client: BleakClient | None = None
        self.active_device: MuseDevice | None = None
        self.scanning = False
        self.last_battery_at = 0.0
        self.last_sensor_at = 0.0
        self.sensor_packets = 0
        self.watchdog_task: asyncio.Task | None = None
        self.streaming_started = False
        self.optical_detected = False
        self.seen_tags: set[int] = set()
        self._sensor_rx_buf = bytearray()
        self._athena_hdr_skip: int | None = None
        self._stdout_loop: asyncio.AbstractEventLoop | None = None
        self._stdout_queue: asyncio.Queue[str] | None = None
        self._stdout_drop_count = 0

    def bind_stdout_queue(
        self, loop: asyncio.AbstractEventLoop, q: asyncio.Queue[str]
    ) -> None:
        self._stdout_loop = loop
        self._stdout_queue = q

    def emit_via_queue(self, obj: dict[str, Any]) -> None:
        line = json.dumps(obj, separators=(",", ":")) + "\n"
        loop = self._stdout_loop
        q = self._stdout_queue
        if loop is None or q is None:
            sys.stdout.write(line)
            sys.stdout.flush()
            return

        def put() -> None:
            try:
                q.put_nowait(line)
            except asyncio.QueueFull:
                self._stdout_drop_count += 1
                if self._stdout_drop_count % 1000 == 1:
                    print(
                        f"[athena_ble_bridge] stdout queue full; dropped {self._stdout_drop_count} JSON lines (raise Node drain rate or reduce load)",
                        file=sys.stderr,
                        flush=True,
                    )

        loop.call_soon_threadsafe(put)

    def _reset_sensor_parser_state(self) -> None:
        self._sensor_rx_buf.clear()
        self._athena_hdr_skip = None
        for attr in (
            "_first_sensor_packet_logged",
            "_unknown_tag_logged",
            "_no_chain_logged",
        ):
            if hasattr(self, attr):
                delattr(self, attr)

    @staticmethod
    def _count_tag_chain(payload: bytes, start: int) -> int:
        """How many consecutive known TLV subpackets fit starting at start (dry-run)."""
        offset = start
        n = 0
        while offset + 5 <= len(payload):
            tag = payload[offset]
            size = TAG_PAYLOAD_BYTES.get(tag)
            if not size or offset + 5 + size > len(payload):
                break
            n += 1
            offset += 5 + size
        return n

    def _pick_header_skip(self, payload: bytes) -> int | None:
        """Find best fixed header length before first tag byte (firmware-dependent; was hard-coded 9)."""
        best_n, best_skip = -1, 0
        limit = min(36, max(0, len(payload) - 10))
        for skip in range(0, limit + 1):
            n = self._count_tag_chain(payload, skip)
            if n > best_n or (n == best_n and n > 0 and skip < best_skip):
                best_n, best_skip = n, skip
        if best_n <= 0:
            return None
        return best_skip

    async def scan_loop(self) -> None:
        while True:
            if not self.client or not self.client.is_connected:
                await self.scan_once()
            await asyncio.sleep(6)

    async def scan_once(self) -> None:
        if self.scanning:
            return
        self.scanning = True
        try:
            found = await BleakScanner.discover(timeout=3.5)
            muses = []
            skipped_muse2: list[str] = []
            for dev in found:
                name = dev.name or ""
                if "muse" not in name.lower():
                    continue
                if is_muse_two_serial_ble_name(name):
                    skipped_muse2.append(name)
                    continue
                muses.append(MuseDevice(len(muses), name, dev.address))
            self.devices = muses
            if skipped_muse2:
                status(
                    "Skipped Muse 2 / LibMuse headset(s) (no 273e0013 on this bridge): "
                    + ", ".join(skipped_muse2)
                    + ". Use default Swift MuseBridge — unset BRIDGE_MODE or BRIDGE_MODE=swift, then restart."
                )
            emit(
                {
                    "type": "device_list",
                    "count": len(muses),
                    "devices": [
                        {
                            "index": d.index,
                            "name": d.name,
                            "address": d.address,
                            "model": "Muse S Athena",
                            "connected": self.active_device is not None
                            and self.active_device.address == d.address,
                        }
                        for d in muses
                    ],
                }
            )
            if not muses:
                if skipped_muse2:
                    status(
                        "No Muse S Athena in this scan (only Muse 2 / LibMuse-class). "
                        "Unset BRIDGE_MODE=athena and restart to use Swift MuseBridge."
                    )
                else:
                    status("No Muse BLE devices found. Power on Athena and keep it near the Mac.")
        except Exception as exc:
            error(f"Athena BLE scan failed: {exc}")
        finally:
            self.scanning = False

    async def connect(self, index: int) -> None:
        if index < 0 or index >= len(self.devices):
            error(f"Device index {index} out of range")
            return
        await self.disconnect()
        device = self.devices[index]
        if is_muse_two_serial_ble_name(device.name):
            error(
                f'"{device.name}" is Muse 2 (LibMuse GATT). This Python bridge is for Muse S Athena only '
                "(needs 273e0013). Restart NeuroVis without BRIDGE_MODE=athena so the Swift MuseBridge runs."
            )
            return
        self.active_device = device
        status(f"Connecting to Athena BLE device {device.name} ({device.address})")
        client = BleakClient(device.address)
        self.client = client
        await client.connect()
        char_uuids, gatt_273e_enumeration_ok = await self.enumerate_273e_characteristics(
            client
        )
        status(f"Athena GATT 273e characteristics: {', '.join(char_uuids) or 'none'}")
        has_sensor = _has_athena_sensor_characteristic(char_uuids)
        # Abort only when we successfully listed other 273e chars but not 273e0013 (typical Muse 2 vs Athena mismatch).
        # If enumeration failed or found no 273e rows, keep going — same as pre-guard behavior for real Athena quirks.
        if gatt_273e_enumeration_ok and char_uuids and not has_sensor:
            error(
                "273e0013 (Athena combined sensor notify) is not on this peripheral — "
                "control on 273e0001 can work while EEG never arrives. "
                "Muse 2 / classic LibMuse headsets need the Swift bridge: unset BRIDGE_MODE "
                "or use BRIDGE_MODE=swift and restart NeuroVis (do not use BRIDGE_MODE=athena)."
            )
            try:
                await client.disconnect()
            except Exception:
                pass
            self.client = None
            self.active_device = None
            return
        if gatt_273e_enumeration_ok and not char_uuids:
            status(
                "Athena: no 273e characteristics in GATT listing — trying sensor notify anyway"
            )
        elif not gatt_273e_enumeration_ok:
            status(
                "Athena: GATT listing incomplete — trying sensor notify anyway (Athena-safe fallback)"
            )
        try:
            await client.start_notify(CONTROL_CHAR, self.handle_control_packet)
            status("Athena control notifications enabled")
        except Exception as exc:
            status(f"Athena control notifications unavailable: {exc}")
        try:
            await client.start_notify(SENSOR_CHAR, self.handle_sensor_packet)
            status("Athena sensor notifications enabled")
        except Exception as exc:
            error(
                f"Athena sensor notify failed ({SENSOR_CHAR}): {exc}. "
                "If this is Muse 2, use the Swift LibMuse bridge instead of BRIDGE_MODE=athena."
            )
            try:
                await client.disconnect()
            except Exception:
                pass
            self.client = None
            self.active_device = None
            return
        self.last_sensor_at = 0.0
        self.sensor_packets = 0
        self.streaming_started = False
        self.optical_detected = False
        self.seen_tags = set()
        self.watchdog_task = asyncio.create_task(self.stream_watchdog())
        await self.start_athena_stream(client)
        status(f"Athena BLE streaming started: {device.name}")

    async def disconnect(self) -> None:
        if self.client:
            try:
                if self.watchdog_task:
                    self.watchdog_task.cancel()
                    self.watchdog_task = None
                if self.client.is_connected:
                    await self.client.stop_notify(SENSOR_CHAR)
                    await self.send_control("h")
                    await self.client.disconnect()
            except Exception as exc:
                error(f"Disconnect warning: {exc}")
        if self.active_device:
            status(f"Disconnected from {self.active_device.name}")
        self.client = None
        self.active_device = None
        self.last_sensor_at = 0.0
        self.sensor_packets = 0
        self.streaming_started = False
        self.optical_detected = False
        self.seen_tags = set()
        self._reset_sensor_parser_state()

    async def start_athena_stream(self, client: BleakClient) -> None:
        # Community Athena sequence: prime with p21, then try known optics
        # presets. EEG/IMU alone is not enough for NeuroVis: Athena's important
        # new streams are optical PPG/fNIRS, so success means optical packets.
        for cmd, pause in [
            ("v6", 0.15),
            ("s", 0.15),
            ("h", 0.2),
            ("p21", 0.25),
            ("dc001", 0.25),
            ("L1", 0.25),
            ("h", 0.25),
        ]:
            await self.write_control(client, cmd)
            await asyncio.sleep(pause)

        for preset in ["p1041", "p1034", "p1045", "p1035"]:
            if self.optical_detected:
                return
            status(f"Trying Athena optics preset {preset}")
            for cmd, pause in [
                ("h", 0.25),
                (preset, 0.45),
                ("dc001", 0.25),
                ("dc001", 0.25),
                ("L1", 0.25),
                ("d", 0.25),
            ]:
                await self.write_control(client, cmd)
                await asyncio.sleep(pause)
                if self.optical_detected:
                    status(f"Athena optical stream began on preset {preset}; holding this preset")
                    return
            await asyncio.sleep(4.0)
            if self.optical_detected:
                status(f"Athena optical stream began on preset {preset}; holding this preset")
                return
            if self.streaming_started:
                status(
                    f"Preset {preset} produced EEG/IMU but no optical packets yet; trying next optics preset"
                )

        if not self.streaming_started:
            status("Athena commands sent, but no sensor packets received yet.")
        elif not self.optical_detected:
            status(
                "Athena EEG/IMU packets detected, but no optical PPG/fNIRS packet tags were seen."
            )

    async def stream_watchdog(self) -> None:
        await asyncio.sleep(3)
        while self.client and self.client.is_connected:
            await asyncio.sleep(2)
            age = time.time() - self.last_sensor_at if self.last_sensor_at else math.inf
            if age > 2.5:
                status(
                    f"Athena stream watchdog: no sensor packets for {age:.1f}s; sending resume pulse"
                )
                for cmd, pause in [("s", 0.2), ("dc001", 0.25), ("L1", 0.25)]:
                    try:
                        await self.write_control(self.client, cmd)
                    except Exception as exc:
                        error(f"Athena watchdog command {cmd} failed: {exc}")
                    await asyncio.sleep(pause)

    async def send_control(self, command: str) -> None:
        if self.client and self.client.is_connected:
            await self.write_control(self.client, command)

    async def write_control(self, client: BleakClient, command: str) -> None:
        # Muse control commands use a one-byte length prefix followed by the
        # ASCII command and a trailing newline. Writing raw ASCII can connect
        # successfully but fail to start the sensor stream.
        body = command.encode("ascii") + b"\n"
        payload = bytes([len(body)]) + body
        status(f"Athena command -> {command}")
        try:
            await client.write_gatt_char(CONTROL_CHAR, payload, response=True)
        except Exception as exc:
            status(f"Athena response write failed for {command}; retrying without response: {exc}")
            await client.write_gatt_char(CONTROL_CHAR, payload, response=False)

    async def enumerate_273e_characteristics(
        self, client: BleakClient
    ) -> tuple[list[str], bool]:
        """Return (273e* UUID strings, True if service walk succeeded without exception)."""
        try:
            services = client.services
            if services is None:
                services = await client.get_services()
            char_uuids: list[str] = []
            for service in services:
                for char in service.characteristics:
                    uuid = str(char.uuid).lower()
                    if uuid.startswith("273e"):
                        char_uuids.append(uuid)
            return char_uuids, True
        except Exception as exc:
            status(f"Athena GATT summary unavailable: {exc}")
            return [], False

    def handle_control_packet(self, _sender: int, data: bytearray) -> None:
        try:
            text = bytes(data).decode("utf-8", errors="replace").strip()
        except Exception:
            text = repr(bytes(data))
        if text:
            status(f"Athena control <- {text}")

    def handle_sensor_packet(self, _sender: int, data: bytearray) -> None:
        now_ms = int(time.time() * 1000)
        self.last_sensor_at = time.time()
        self.sensor_packets += 1
        self.streaming_started = True
        self._sensor_rx_buf.extend(data)
        payload = bytes(self._sensor_rx_buf)
        if len(payload) < 10:
            return

        skip: int | None = None
        hdr = self._athena_hdr_skip
        if hdr is not None and self._count_tag_chain(payload, hdr) > 0:
            skip = hdr
        if skip is None:
            cand = self._pick_header_skip(payload)
            if cand is not None:
                skip = cand
                if self._athena_hdr_skip != cand:
                    self._athena_hdr_skip = cand
                if not hasattr(self, "_first_sensor_packet_logged"):
                    self._first_sensor_packet_logged = True
                    tag0 = payload[skip] if skip < len(payload) else 0
                    status(
                        f"FIRST Athena sensor packet: buf={len(payload)} header_skip={skip} first_tag=0x{tag0:02x}"
                    )
            else:
                skip = 0

        offset = skip
        last_good = 0
        while offset + 5 <= len(payload):
            tag = payload[offset]
            size = TAG_PAYLOAD_BYTES.get(tag)
            if not size:
                if not hasattr(self, "_unknown_tag_logged"):
                    self._unknown_tag_logged = True
                    status(
                        f"Unknown Athena sensor tag: 0x{tag:02x} buf={len(payload)} offset={offset} "
                        f"hex@0={payload[:min(24, len(payload))].hex()}"
                    )
                if self._sensor_rx_buf:
                    del self._sensor_rx_buf[0]
                return
            if offset + 5 + size > len(payload):
                break
            body = payload[offset + 5 : offset + 5 + size]
            if tag not in self.seen_tags:
                self.seen_tags.add(tag)
                status(f"FIRST Athena packet tag seen: 0x{tag:02x}")
            try:
                self.decode_subpacket(tag, body, now_ms)
            except Exception as exc:
                error(f"Athena decode error tag=0x{tag:02x}: {exc}")
            offset += 5 + size
            last_good = offset

        del self._sensor_rx_buf[:last_good]
        rem = bytes(self._sensor_rx_buf)
        if len(rem) == 0:
            self._athena_hdr_skip = None
        elif self._athena_hdr_skip is not None:
            h = self._athena_hdr_skip
            if self._count_tag_chain(rem, h) == 0 and self._pick_header_skip(rem) is None:
                self._athena_hdr_skip = None
        if len(self._sensor_rx_buf) > 16384:
            status("Athena sensor rx buffer overflow; clearing parser state")
            self._sensor_rx_buf.clear()
            self._athena_hdr_skip = None

    def decode_subpacket(self, tag: int, body: bytes, timestamp: int) -> None:
        name = self.active_device.name if self.active_device else "Muse S Athena"
        if tag == 0x11:
            for frame in decode_eeg(body, channels=4, samples_per_channel=4):
                emit({"type": "eeg", "timestamp": timestamp, "eeg": frame[:4], "deviceName": name})
        elif tag == 0x12:
            for frame in decode_eeg(body, channels=8, samples_per_channel=2):
                emit({"type": "eeg", "timestamp": timestamp, "eeg": frame[:4], "aux": frame[4:8], "deviceName": name})
        elif tag == 0x47:
            for accel, gyro in decode_imu(body):
                emit({"type": "accelerometer", "timestamp": timestamp, "accel": accel, "deviceName": name})
                emit({"type": "gyroscope", "timestamp": timestamp, "gyro": gyro, "deviceName": name})
        elif tag in (0x34, 0x35, 0x36):
            if not self.optical_detected:
                self.optical_detected = True
                status(f"FIRST Athena optical packet tag: 0x{tag:02x}")
            spec = {0x34: (4, 3), 0x35: (8, 2), 0x36: (16, 1)}[tag]
            frames = decode_optical(body, channels=spec[0], samples_per_channel=spec[1])
            ppg, fnirs = summarize_optical(frames)
            emit({"type": "ppg", "timestamp": timestamp, "ppg": ppg, "deviceName": name})
            emit({"type": "fnirs", "timestamp": timestamp, "fnirs": fnirs, "deviceName": name})


async def stdin_loop(bridge: AthenaBridge) -> None:
    loop = asyncio.get_running_loop()
    while True:
        line = await loop.run_in_executor(None, sys.stdin.readline)
        if not line:
            await asyncio.sleep(0.1)
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue
        command = msg.get("command")
        if command == "connect":
            await bridge.connect(int(msg.get("deviceIndex", 0)))
        elif command == "disconnect":
            await bridge.disconnect()
        elif command == "scan":
            await bridge.scan_once()


async def stdout_drain_loop(q: asyncio.Queue[str]) -> None:
    """Drain JSON lines to stdout so BLE notify callbacks never block on a full pipe."""
    try:
        while True:
            line = await q.get()
            batch = [line]
            for _ in range(400):
                try:
                    batch.append(q.get_nowait())
                except asyncio.QueueEmpty:
                    break
            sys.stdout.write("".join(batch))
            sys.stdout.flush()
    except asyncio.CancelledError:
        pass
    finally:
        while True:
            try:
                sys.stdout.write(q.get_nowait())
            except asyncio.QueueEmpty:
                break
        sys.stdout.flush()


async def main() -> None:
    global _emit_hook

    bridge = AthenaBridge()
    q: asyncio.Queue[str] = asyncio.Queue(maxsize=100_000)
    bridge.bind_stdout_queue(asyncio.get_running_loop(), q)
    _emit_hook = bridge.emit_via_queue

    status("Muse S Athena BLE bridge starting")
    await bridge.scan_once()
    stop_event = asyncio.Event()

    def stop() -> None:
        stop_event.set()

    signal.signal(signal.SIGINT, lambda *_: stop())
    signal.signal(signal.SIGTERM, lambda *_: stop())

    tasks = [
        asyncio.create_task(stdout_drain_loop(q)),
        asyncio.create_task(bridge.scan_loop()),
        asyncio.create_task(stdin_loop(bridge)),
    ]
    await stop_event.wait()
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    _emit_hook = None
    await bridge.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
