// NeuroVis Electron App - main.js
// Provides native UDP OSC sending via Node.js dgram
// Run: npm install && npm start

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const dgram = require('dgram');

// ── OSC Binary Encoding ──
// Implements OSC 1.0 spec: address + type tag + float args
function encodeOSCString(str) {
  const len = str.length + 1; // null terminator
  const padded = Math.ceil(len / 4) * 4; // pad to 4-byte boundary
  const buf = Buffer.alloc(padded);
  buf.write(str, 0, 'ascii');
  return buf;
}

function encodeOSCFloat(val) {
  const buf = Buffer.alloc(4);
  buf.writeFloatBE(val, 0);
  return buf;
}

function buildOSCMessage(address, args) {
  // Address string
  const addrBuf = encodeOSCString(address);
  
  // Type tag string: comma + 'f' for each float arg
  const typeTag = ',' + args.map(() => 'f').join('');
  const typeBuf = encodeOSCString(typeTag);
  
  // Float arguments
  const argBufs = args.map(a => encodeOSCFloat(parseFloat(a)));
  
  return Buffer.concat([addrBuf, typeBuf, ...argBufs]);
}

// ── UDP Socket ──
let udpSocket = null;

function ensureSocket() {
  if (!udpSocket) {
    udpSocket = dgram.createSocket('udp4');
    udpSocket.on('error', (err) => {
      console.error('[OSC] UDP error:', err.message);
    });
    console.log('[OSC] UDP socket created');
  }
  return udpSocket;
}

function sendOSC(host, port, address, args) {
  const socket = ensureSocket();
  const packet = buildOSCMessage(address, Array.isArray(args) ? args : [args]);
  socket.send(packet, 0, packet.length, port, host, (err) => {
    if (err) console.error('[OSC] Send error:', err.message);
  });
}

// ── IPC handlers for renderer → main ──
ipcMain.handle('osc-send', (event, { host, port, address, args }) => {
  sendOSC(host || '127.0.0.1', port || 7400, address, args);
  return { ok: true };
});

ipcMain.handle('osc-send-batch', (event, { messages, host, port }) => {
  const h = host || '127.0.0.1';
  const p = port || 7400;
  messages.forEach(m => {
    sendOSC(h, p, m.address, m.args);
  });
  return { ok: true, count: messages.length };
});

// ── Window ──
function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'NeuroVis EEG',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  win.loadFile('neurovis.html');
  
  // Uncomment to open DevTools:
  // win.webContents.openDevTools();
  
  console.log(`
  ╔══════════════════════════════════════════╗
  ║       NeuroVis EEG                       ║
  ║       Electron App with Native UDP OSC   ║
  ╠══════════════════════════════════════════╣
  ║  OSC output via Node.js dgram (real UDP) ║
  ║  No bridge or server needed!             ║
  ║  Default target: 127.0.0.1:7400          ║
  ╚══════════════════════════════════════════╝
  `);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (udpSocket) {
    udpSocket.close();
    udpSocket = null;
  }
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
