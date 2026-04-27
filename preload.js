// preload.js - Bridges Electron main process (UDP) with renderer (browser)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('neurovisOSC', {
  // Send a single OSC message
  send: (host, port, address, args) => {
    return ipcRenderer.invoke('osc-send', { host, port, address, args });
  },
  // Send a batch of OSC messages (more efficient)
  sendBatch: (messages, host, port) => {
    return ipcRenderer.invoke('osc-send-batch', { messages, host, port });
  },
  // Check if we're running in Electron
  isElectron: true
});
