/**
 * Muse EEG Dashboard - Frontend Client
 */

// Configuration
const CONFIG = {
  maxDataPoints: 256,
  updateInterval: 100, // ms
  wsUrl: `ws://${window.location.hostname}:8080`,
}

// Application State
let state = {
  connected: false,
  deviceConnected: false,
  devices: [],
  eegData: [[], [], [], []],
  charts: [null, null, null, null],
  packets: 0,
  startTime: Date.now(),
}

// Chart colors
const COLORS = ["#ff6b6b", "#4ecdc4", "#45b7d1", "#f9ca24"]

// Initialize charts
function initCharts() {
  const canvases = ["chart1", "chart2", "chart3", "chart4"]
  const labels = ["Left Ear", "Left Forehead", "Right Forehead", "Right Ear"]

  canvases.forEach((id, idx) => {
    const ctx = document.getElementById(id).getContext("2d")
    state.charts[idx] = new Chart(ctx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: labels[idx],
            data: [],
            borderColor: COLORS[idx],
            backgroundColor: `${COLORS[idx]}20`,
            borderWidth: 2,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 4,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            titleColor: "#00ff88",
            bodyColor: "#fff",
            borderColor: "#00ff88",
            borderWidth: 1,
            callbacks: {
              label: (context) => {
                return `${context.raw.toFixed(2)} µV`
              },
            },
          },
        },
        scales: {
          x: {
            display: true,
            grid: { color: "#2a2a3e" },
            ticks: { color: "#b0b0b0", maxTicksLimit: 5 },
          },
          y: {
            display: true,
            grid: { color: "#2a2a3e" },
            ticks: { color: "#b0b0b0" },
            title: { display: true, text: "µV" },
          },
        },
      },
    })
  })
}

// Update chart data
function updateChart(chartIndex, value) {
  const chart = state.charts[chartIndex]
  if (!chart) return

  const data = chart.data.datasets[0].data
  data.push(value)

  if (data.length > CONFIG.maxDataPoints) {
    data.shift()
    chart.data.labels.shift()
  }

  chart.data.labels.push(data.length - 1)
  chart.update("none")
}

// Connect to WebSocket
function connectWebSocket() {
  const ws = new WebSocket(CONFIG.wsUrl)

  ws.onopen = () => {
    state.connected = true
    updateStatus("ws", true)
    log("✓ Connected to server", "success")
  }

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data)
      handleServerMessage(msg)
    } catch (e) {
      log(`✗ Parse error: ${e.message}`, "error")
    }
  }

  ws.onerror = (error) => {
    log(`✗ WebSocket error: ${error}`, "error")
    updateStatus("ws", false)
  }

  ws.onclose = () => {
    state.connected = false
    updateStatus("ws", false)
    log("⚠ Disconnected. Reconnecting in 3s...", "warning")
    setTimeout(connectWebSocket, 3000)
  }

  window.ws = ws
}

// Handle server messages
function handleServerMessage(msg) {
  switch (msg.type) {
    case "eeg":
      handleEEGPacket(msg)
      break
    case "device_list":
      handleDeviceList(msg.devices)
      break
    case "status":
      log(`[${msg.level || "INFO"}] ${msg.message}`)
      break
    case "init":
      log(`✓ Init received. OSC: ${msg.config.oscHost}:${msg.config.oscPort}`)
      if (msg.eegBuffer) {
        msg.eegBuffer.forEach((ch, i) => {
          state.eegData[i] = [...ch]
        })
      }
      break
    case "osc_test":
      log("📡 Test OSC sent!", "success")
      break
  }
}

// Handle EEG packet from Muse
function handleEEGPacket(packet) {
  const { eeg, deviceName } = packet

  state.packets++
  state.deviceConnected = true
  updateStatus("device", true)

  // Update EEG buffers
  eeg.forEach((value, idx) => {
    state.eegData[idx].push(value)
    if (state.eegData[idx].length > CONFIG.maxDataPoints) {
      state.eegData[idx].shift()
    }
    updateChart(idx, value)
  })
}

// Handle device list update
function handleDeviceList(devices) {
  state.devices = devices
  renderDeviceList()
  log(`📱 Found ${devices.length} device(s)`)
}

// Render device list
function renderDeviceList() {
  const container = document.getElementById("deviceList")

  if (state.devices.length === 0) {
    container.innerHTML =
      '<p class="loading">No devices found. Make sure Bluetooth is on and devices are in discovery mode.</p>'
    return
  }

  container.innerHTML = state.devices
    .map(
      (device, idx) =>
        `
    <div class="device-card" onclick="selectDevice(${idx})">
      <div class="device-name">${device.name}</div>
      <div class="device-model">${device.model || "Unknown Model"}</div>
      <div class="device-signal">🔋 ${device.battery || "?"}%</div>
      <button class="btn btn-primary" onclick="connectDevice(${idx}, event)">
        ${device.connected ? "Disconnect" : "Connect"}
      </button>
    </div>
  `,
    )
    .join("")
}

// Connect to selected device
function connectDevice(index, event) {
  event.stopPropagation()

  if (!window.ws || window.ws.readyState !== WebSocket.OPEN) {
    log("✗ Not connected to server", "error")
    return
  }

  window.ws.send(
    JSON.stringify({
      type: "connect_device",
      deviceIndex: index,
    }),
  )

  log(`🔗 Connecting to ${state.devices[index].name}...`)
}

// Select device
function selectDevice(index) {
  document.querySelectorAll(".device-card").forEach((card) => {
    card.classList.remove("selected")
  })
  document.querySelectorAll(".device-card")[index]?.classList.add("selected")
}

// Send test OSC
function testOSC() {
  if (!window.ws || window.ws.readyState !== WebSocket.OPEN) {
    log("✗ Not connected to server", "error")
    return
  }

  window.ws.send(JSON.stringify({ type: "osc_test" }))
}

// Update status indicator
function updateStatus(type, connected) {
  const statusEl = document.getElementById(`${type}Status`)
  if (statusEl) {
    const dot = statusEl.querySelector(".dot")
    if (connected) {
      statusEl.classList.add("connected")
      dot.style.background = "#00ff88"
    } else {
      statusEl.classList.remove("connected")
      dot.style.background = "#ff4444"
    }
  }
}

// Update statistics
function updateStats() {
  const now = Date.now()
  const uptime = Math.floor((now - state.startTime) / 1000)

  const pps = state.packets // packets per update interval
  document.getElementById("packetsPerSec").textContent = (pps * (1000 / CONFIG.updateInterval)).toFixed(1)
  document.getElementById("bufferSize").textContent = state.eegData[0].length
  document.getElementById("uptime").textContent = formatUptime(uptime)

  state.packets = 0

  fetch("/api/status")
    .then((r) => r.json())
    .then((data) => {
      document.getElementById("wsClients").textContent = data.ws_clients
    })
    .catch(() => {})
}

// Format uptime
function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60

  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

// Log to console
function log(message, level = "info") {
  const consoleEl = document.getElementById("console")
  const p = document.createElement("p")
  p.textContent = message
  if (level !== "info") p.className = level

  consoleEl.appendChild(p)
  consoleEl.scrollTop = consoleEl.scrollHeight

  // Keep last 100 messages
  while (consoleEl.children.length > 100) {
    consoleEl.removeChild(consoleEl.firstChild)
  }
}

// Initialize on load
document.addEventListener("DOMContentLoaded", () => {
  log("🚀 Initializing dashboard...")

  initCharts()
  connectWebSocket()

  // Update stats periodically
  setInterval(updateStats, CONFIG.updateInterval)

  // Update device list periodically
  setInterval(() => {
    fetch("/api/devices")
      .then((r) => r.json())
      .then((data) => {
        if (JSON.stringify(data.devices) !== JSON.stringify(state.devices)) {
          handleDeviceList(data.devices)
        }
      })
      .catch(() => {})
  }, 2000)

  // Buttons
  document.getElementById("testOscBtn")?.addEventListener("click", testOSC)

  // Check OSC status
  fetch("/api/status")
    .then((r) => r.json())
    .then((data) => {
      updateStatus("osc", data.osc_connected)
      updateStatus("ws", data.swift_running)
      log(`✓ Server status received`)
    })
    .catch((err) => {
      log(`✗ Cannot reach server: ${err.message}`, "error")
    })
})

// Handle page visibility to pause/resume
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    log("⏸ Dashboard paused")
  } else {
    log("▶ Dashboard resumed")
  }
})
