// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from "electron";

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electron", {
  node: () => process.versions.node,
  chrome: () => process.versions.chrome,
  electron: () => process.versions.electron,

  // File dialog handlers
  showFileDialog: () => ipcRenderer.invoke("show-file-dialog"),
  showDirectoryDialog: () => ipcRenderer.invoke("show-directory-dialog"),

  // Device discovery and networking
  getDeviceInfo: () => ipcRenderer.invoke("get-device-info"),
  updateDeviceName: (name) => ipcRenderer.invoke("update-device-name", name),

  // WebSocket communication
  broadcastMessage: (message) =>
    ipcRenderer.invoke("broadcast-message", message),
  sendDirectMessage: (to, message) =>
    ipcRenderer.invoke("send-direct-message", { to, message }),

  // File transfer
  sendFileTransferRequest: (to, fileInfo) =>
    ipcRenderer.invoke("send-file-transfer-request", { to, fileInfo }),
  sendFileTransferResponse: (to, accepted, signalData) =>
    ipcRenderer.invoke("send-file-transfer-response", {
      to,
      accepted,
      signalData,
    }),
  readFileForTransfer: (filePath) =>
    ipcRenderer.invoke("read-file-for-transfer", filePath),
  saveReceivedFile: (filePath, fileData) =>
    ipcRenderer.invoke("save-received-file", { filePath, fileData }),

  // Event listeners
  onDeviceDiscovered: (callback) =>
    ipcRenderer.on("device-discovered", (event, deviceInfo) =>
      callback(deviceInfo)
    ),
  onDeviceDisconnected: (callback) =>
    ipcRenderer.on("device-disconnected", (event, socketId) =>
      callback(socketId)
    ),
  onFileTransferRequest: (callback) =>
    ipcRenderer.on("file-transfer-request", (event, request) =>
      callback(request)
    ),
  onFileTransferResponse: (callback) =>
    ipcRenderer.on("file-transfer-response", (event, response) =>
      callback(response)
    ),
  onDirectMessage: (callback) =>
    ipcRenderer.on("direct-message", (event, message) => callback(message)),

  // Clean up event listeners
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
});
