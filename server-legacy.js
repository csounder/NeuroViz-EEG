#!/usr/bin/env node
/**
 * Muse EEG → Csound OSC Bridge Server
 * Connects to Swift bridge via stdio, broadcasts EEG data via WebSocket,
 * and sends OSC messages to Csound on port 7400
 */

const express = require("express")
const WebSocket = require("ws")
const osc = require("osc")
const { spawn } = require("child_process")
const path = require("path")
require("dotenv").config()

// Configuration
const config = {
  webPort: process.env.WEB_PORT || 3000,
  wsPort: process.env.WS_PORT || 8080,
  oscHost: process.env.OSC_HOST || "127.0.0.1",
  oscPort: process.env.OSC_PORT || 7400,
  swiftBridgePath: process.env.BRIDGE_PATH || "./MuseBridge",
  maxBufferSize: 512, // Keep last 512 EEG samples per channel
}

// Express app for web UI
const app = express()
app.use(express.static(path.join(__dirname, "public")))
app.use(express.json())

// WebSocket server for frontend
const wss = new WebSocket.Server({ port: config.wsPort })

// OSC UDP port for Csound
let oscPort = null
let swiftProcess = null
let connectedDevices = []
let eegBuffer = [[], [], [], []]

// EEG smoothing buffers (moving average filter)
const smoothBufferSize = 10 // Average last 10 samples (~40ms at 256 Hz)
let eegSmoothBuffer = [[], [], [], []]
let eegSmoothed = [0, 0, 0, 0]

// Smooth EEG data with moving average
function smoothEEG(eeg) {
  eeg.forEach((value, ch) => {
    eegSmoothBuffer[ch].push(value)

    // Keep buffer size limited
    if (eegSmoothBuffer[ch].length > smoothBufferSize) {
      eegSmoothBuffer[ch].shift()
    }

    // Calculate moving average
    const sum = eegSmoothBuffer[ch].reduce((a, b) => a + b, 0)
    eegSmoothed[ch] = sum / eegSmoothBuffer[ch].length
  })

  return eegSmoothed
}

// Initialize OSC
function initOSC() {
  oscPort = new osc.UDPPort({
    localAddress: "127.0.0.1",
    localPort: 0,
    remoteAddress: config.oscHost,
    remotePort: config.oscPort,
    metadata: true,
  })

  oscPort.open()
  console.log(`✓ OSC client ready → ${config.oscHost}:${config.oscPort}`)

  oscPort.on("error", (err) => {
    console.error("❌ OSC Error:", err.message)
  })
}

// Launch Swift bridge process
function launchSwiftBridge() {
  console.log(`🚀 Launching Swift bridge: ${config.swiftBridgePath}`)

  swiftProcess = spawn(config.swiftBridgePath, [], {
    stdio: ["pipe", "pipe", "pipe"],
    detached: false,
  })

  let buffer = ""

  swiftProcess.stdout.on("data", (data) => {
    buffer += data.toString()
    const lines = buffer.split("\n")
    buffer = lines.pop() // Keep incomplete line

    lines.forEach((line) => {
      if (line.trim().length === 0) return

      try {
        const packet = JSON.parse(line)

        // Handle different packet types
        if (packet.type === "eeg") {
          handleEEGPacket(packet)
        } else if (packet.type === "device_list") {
          handleDeviceList(packet)
        } else if (packet.type === "status") {
          handleStatus(packet)
        }
      } catch (e) {
        // Regular log from Swift bridge
        console.log("[SWIFT]", line)
      }
    })
  })

  swiftProcess.stderr.on("data", (data) => {
    console.error("[SWIFT ERROR]", data.toString())
  })

  swiftProcess.on("close", (code) => {
    console.log(`⚠️  Swift bridge exited with code ${code}`)
    // Auto-restart after 2 seconds
    setTimeout(() => launchSwiftBridge(), 2000)
  })

  swiftProcess.on("error", (err) => {
    console.error("❌ Failed to launch Swift bridge:", err.message)
    console.log("📝 Make sure MuseBridge is compiled and at:", config.swiftBridgePath)
  })
}

// Handle EEG data packet
function handleEEGPacket(packet) {
  const { eeg, timestamp, deviceName } = packet

  // Buffer EEG data per channel (for visualization)
  eeg.forEach((value, ch) => {
    eegBuffer[ch].push(value)
    if (eegBuffer[ch].length > config.maxBufferSize) {
      eegBuffer[ch].shift()
    }
  })

  // Send raw EEG to all connected WebSocket clients
  const payload = {
    type: "eeg",
    timestamp,
    eeg,
    deviceName,
    timestamp_ms: Date.now(),
  }

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(payload))
    }
  })

  // Smooth EEG data before sending to Csound
  const eegSmoothedValues = smoothEEG(eeg)

  // Send SMOOTHED OSC to Csound
  sendOSCtoCSsound(eegSmoothedValues, timestamp)
}

// Send EEG data as OSC to Csound
function sendOSCtoCSsound(eeg, timestamp) {
  if (!oscPort) return

  // Format: /muse/eeg ch1 ch2 ch3 ch4
  try {
    // Debug: log EEG values periodically
    if (Math.random() < 0.01) {
      // Log ~1% of messages
      console.log(
        `📡 OSC → Csound: /muse/eeg [${eeg[0].toFixed(2)}, ${eeg[1].toFixed(2)}, ${eeg[2].toFixed(2)}, ${eeg[3].toFixed(2)}]`,
      )
    }

    oscPort.send({
      address: "/muse/eeg",
      args: [
        { type: "f", value: eeg[0] }, // EEG1 - Left Ear
        { type: "f", value: eeg[1] }, // EEG2 - Left Forehead
        { type: "f", value: eeg[2] }, // EEG3 - Right Forehead
        { type: "f", value: eeg[3] }, // EEG4 - Right Ear
      ],
    })

    // Also send per-channel addresses for flexibility
    ;["eeg1", "eeg2", "eeg3", "eeg4"].forEach((ch, i) => {
      oscPort.send({
        address: `/muse/${ch}`,
        args: [{ type: "f", value: eeg[i] }],
      })
    })
  } catch (e) {
    // Silently ignore OSC send errors
  }
}

// Handle device list update from Swift bridge
function handleDeviceList(packet) {
  connectedDevices = packet.devices || []
  console.log(`📱 Devices found: ${connectedDevices.length}`)

  // Broadcast to frontend
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(
        JSON.stringify({
          type: "device_list",
          devices: connectedDevices,
        }),
      )
    }
  })
}

// Handle status messages
function handleStatus(packet) {
  console.log(`[STATUS] ${packet.message}`)

  // Broadcast to frontend
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(packet))
    }
  })
}

// WebSocket connection handler
wss.on("connection", (ws) => {
  console.log("🔗 WebSocket client connected")

  // Send current state to new client
  ws.send(
    JSON.stringify({
      type: "init",
      config: {
        oscHost: config.oscHost,
        oscPort: config.oscPort,
      },
      devices: connectedDevices,
      eegBuffer,
    }),
  )

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data)
      handleWebSocketMessage(msg, ws)
    } catch (e) {
      console.error("WebSocket message error:", e.message)
    }
  })

  ws.on("close", () => {
    console.log("🔌 WebSocket client disconnected")
  })

  ws.on("error", (err) => {
    console.error("WebSocket error:", err.message)
  })
})

// Handle incoming WebSocket commands
function handleWebSocketMessage(msg, ws) {
  switch (msg.type) {
    case "connect_device":
      // Send command to Swift bridge to connect to device
      if (swiftProcess && swiftProcess.stdin) {
        swiftProcess.stdin.write(
          JSON.stringify({
            command: "connect",
            deviceIndex: msg.deviceIndex,
          }) + "\n",
        )
      }
      break

    case "disconnect_device":
      if (swiftProcess && swiftProcess.stdin) {
        swiftProcess.stdin.write(
          JSON.stringify({
            command: "disconnect",
          }) + "\n",
        )
      }
      break

    case "osc_test":
      // Send test OSC message
      sendOSCtoCSsound([0.1, 0.2, 0.3, 0.4], Date.now())
      ws.send(JSON.stringify({ type: "osc_test", status: "sent" }))
      break

    default:
      console.log("Unknown WebSocket message type:", msg.type)
  }
}

// API endpoints
app.get("/api/status", (req, res) => {
  res.json({
    osc_connected: !!oscPort,
    swift_running: swiftProcess && !swiftProcess.killed,
    devices: connectedDevices,
    ws_clients: wss.clients.size,
    config,
  })
})

app.get("/api/devices", (req, res) => {
  res.json({ devices: connectedDevices })
})

app.post("/api/connect/:index", (req, res) => {
  const index = parseInt(req.params.index)
  if (swiftProcess && swiftProcess.stdin) {
    swiftProcess.stdin.write(
      JSON.stringify({
        command: "connect",
        deviceIndex: index,
      }) + "\n",
    )
    res.json({ status: "connecting" })
  } else {
    res.status(500).json({ error: "Swift bridge not running" })
  }
})

app.get("/api/eeg-buffer", (req, res) => {
  res.json({
    buffer: eegBuffer,
    sizes: eegBuffer.map((ch) => ch.length),
  })
})

// Start servers
function start() {
  console.log("═══════════════════════════════════════")
  console.log("🧠 Muse EEG → Csound OSC Bridge")
  console.log("═══════════════════════════════════════\n")

  initOSC()
  launchSwiftBridge()

  app.listen(config.webPort, () => {
    console.log(`✓ Web UI: http://localhost:${config.webPort}`)
    console.log(`✓ WebSocket: ws://localhost:${config.wsPort}`)
    console.log(`✓ OSC Target: ${config.oscHost}:${config.oscPort}`)
    console.log("\nWaiting for Muse devices...\n")
  })
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down...")
  if (swiftProcess) swiftProcess.kill()
  if (oscPort) oscPort.close()
  wss.close()
  process.exit(0)
})

start()
