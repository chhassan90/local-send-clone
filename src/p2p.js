// p2p.js - WebRTC peer-to-peer functionality with SimplePeer
import Peer from "simple-peer";

// Store for active peer connections
const activeConnections = new Map();
// Store for pending file transfers
const pendingTransfers = new Map();
// Store for active file transfers
const activeTransfers = new Map();

// Initialize peer functionality
function initializePeer() {
  // Setup event listeners for device discovery and file transfer requests
  window.electron.onDeviceDiscovered((deviceInfo) => {
    console.log("Device discovered:", deviceInfo);
    updateDeviceList(deviceInfo);
  });

  window.electron.onDeviceDisconnected((socketId) => {
    console.log("Device disconnected:", socketId);
    removeDeviceFromList(socketId);

    // Clean up any active connections
    if (activeConnections.has(socketId)) {
      activeConnections.get(socketId).destroy();
      activeConnections.delete(socketId);
    }
  });

  window.electron.onFileTransferRequest((request) => {
    console.log("File transfer request received:", request);
    showFileTransferRequest(request);
  });

  window.electron.onFileTransferResponse((response) => {
    console.log("File transfer response received:", response);
    handleFileTransferResponse(response);
  });
}

// Update UI with discovered device
function updateDeviceList(deviceInfo) {
  const deviceList = document.getElementById("device-list");

  // Check if device already exists in the list
  const existingDevice = document.getElementById(`device-${deviceInfo.id}`);
  if (existingDevice) {
    return;
  }

  // Create device element
  const deviceElement = document.createElement("div");
  deviceElement.id = `device-${deviceInfo.id}`;
  deviceElement.className =
    "device-item flex items-center justify-between p-4 mb-2 rounded-lg bg-gray-700";
  deviceElement.innerHTML = `
    <div class="flex items-center">
      <div class="w-10 h-10 rounded-full flex items-center justify-center bg-teal-600 mr-3">
        <span class="text-lg font-bold text-white">${deviceInfo.name
          .charAt(0)
          .toUpperCase()}</span>
      </div>
      <div>
        <h3 class="font-semibold">${deviceInfo.name}</h3>
        <p class="text-sm text-gray-400">${deviceInfo.ip}</p>
      </div>
    </div>
    <button data-device-id="${
      deviceInfo.id
    }" class="send-to-device-btn px-4 py-2 rounded-lg bg-teal-600 text-white">
      Send
    </button>
  `;

  // Add event listener to the send button
  const sendButton = deviceElement.querySelector(".send-to-device-btn");
  sendButton.addEventListener("click", () => {
    sendToDevice(deviceInfo.id);
  });

  // Add to device list
  deviceList.appendChild(deviceElement);
}

// Remove disconnected device from UI
function removeDeviceFromList(deviceId) {
  const deviceElement = document.getElementById(`device-${deviceId}`);
  if (deviceElement) {
    deviceElement.remove();
  }
}

// Send files to selected device
async function sendToDevice(deviceId) {
  // Check if we have files selected
  if (!selectedFiles.files.length && !selectedFiles.folder) {
    showMessage("Please select files or folder first.");
    return;
  }

  // Prepare file info
  const fileInfo = {
    files: selectedFiles.files.map((file) => ({
      name: file.name,
      size: file.size,
      type: file.type,
    })),
    totalSize: selectedFiles.files.reduce(
      (total, file) => total + file.size,
      0
    ),
  };

  // Store files in pending transfers
  pendingTransfers.set(deviceId, {
    files: selectedFiles.files,
    fileInfo,
  });

  // Send file transfer request
  await window.electron.sendFileTransferRequest(deviceId, fileInfo);

  showMessage(`Transfer request sent to device ${deviceId}`);
}

// Show file transfer request in UI
function showFileTransferRequest(request) {
  const { from, fromName, fileInfo, socketId } = request;

  // Create modal for transfer request
  const modal = document.createElement("div");
  modal.className =
    "fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50";
  modal.id = `transfer-request-${from}`;

  const totalSize = formatFileSize(fileInfo.totalSize);
  const fileCount = fileInfo.files.length;

  modal.innerHTML = `
    <div class="bg-gray-800 p-6 rounded-lg w-96">
      <h3 class="text-xl font-semibold mb-4">Transfer Request</h3>
      <p class="mb-2">${fromName} wants to send you ${fileCount} file(s)</p>
      <p class="mb-4">Total size: ${totalSize}</p>
      <div class="flex justify-end gap-3">
        <button id="reject-transfer-${from}" class="px-4 py-2 rounded-lg bg-red-500 text-white">
          Reject
        </button>
        <button id="accept-transfer-${from}" class="px-4 py-2 rounded-lg bg-teal-600 text-white">
          Accept
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Add event listeners
  document
    .getElementById(`accept-transfer-${from}`)
    .addEventListener("click", () => {
      acceptFileTransfer(from, socketId);
      modal.remove();
    });

  document
    .getElementById(`reject-transfer-${from}`)
    .addEventListener("click", () => {
      rejectFileTransfer(from);
      modal.remove();
    });
}

// Accept file transfer
async function acceptFileTransfer(from, socketId) {
  // Create peer connection as receiver (not initiator)
  const peer = new Peer({
    initiator: false,
    trickle: false,
  });

  // Set up peer events
  setupPeerEvents(peer, from, "receiver");

  // Store connection
  activeConnections.set(from, peer);

  // When signal data is generated, send it to the other peer
  peer.on("signal", async (data) => {
    console.log("Generated answer signal data", data);
    await window.electron.sendFileTransferResponse(from, true, data);
  });
}

// Reject file transfer
async function rejectFileTransfer(from) {
  await window.electron.sendFileTransferResponse(from, false);
}

// Handle file transfer response
function handleFileTransferResponse(response) {
  const { from, accepted, signalData } = response;

  if (!accepted) {
    showMessage("Transfer request was rejected.");
    pendingTransfers.delete(from);
    return;
  }

  // If accepted and we have pending transfer, initiate peer connection
  if (pendingTransfers.has(from)) {
    const { files, fileInfo } = pendingTransfers.get(from);
    initiatePeerConnection(from, files, signalData);
  }
}

// Initialize peer connection as sender
function initiatePeerConnection(peerId, files, signalData) {
  // Create peer connection as initiator
  const peer = new Peer({
    initiator: true,
    trickle: false,
  });

  // Set up peer events
  setupPeerEvents(peer, peerId, "sender", files);

  // Store connection
  activeConnections.set(peerId, peer);

  // Connect using the received signal data
  if (signalData) {
    peer.signal(signalData);
  }
}

// Set up peer events for both sender and receiver
function setupPeerEvents(peer, peerId, role, files) {
  // When peer is connected
  peer.on("connect", () => {
    console.log(`Peer connection established as ${role}`);

    if (role === "sender" && files) {
      // Start sending files
      startFileSending(peer, files);
    }
  });

  // Handle incoming data if receiver
  if (role === "receiver") {
    setupFileReceiving(peer, peerId);
  }

  // Handle errors
  peer.on("error", (err) => {
    console.error("Peer connection error:", err);
    showMessage(`Connection error: ${err.message}`);

    // Clean up
    if (activeConnections.has(peerId)) {
      activeConnections.delete(peerId);
    }
  });

  // Handle connection closed
  peer.on("close", () => {
    console.log("Peer connection closed");

    // Clean up
    if (activeConnections.has(peerId)) {
      activeConnections.delete(peerId);
    }
  });
}

// Start sending files to connected peer
async function startFileSending(peer, files) {
  // Show progress UI
  const transferId = Math.random().toString(36).substring(2, 10);
  createTransferProgressUI(transferId, files, "Sending");

  let totalSent = 0;
  const totalSize = files.reduce((total, file) => total + file.size, 0);

  // Process each file
  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    // Send file metadata first
    peer.send(
      JSON.stringify({
        type: "file-start",
        name: file.name,
        size: file.size,
        index: i,
        total: files.length,
      })
    );

    // Read file and send in chunks
    const arrayBuffer = await readFileAsArrayBuffer(file);
    const chunkSize = 16384; // 16KB chunks
    let offset = 0;

    while (offset < arrayBuffer.byteLength) {
      const chunk = arrayBuffer.slice(offset, offset + chunkSize);
      peer.send(chunk);
      offset += chunk.byteLength;
      totalSent += chunk.byteLength;

      // Update progress
      updateTransferProgress(transferId, totalSent, totalSize);

      // Small delay to prevent overwhelming the connection
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    // Signal end of file
    peer.send(
      JSON.stringify({
        type: "file-end",
        index: i,
      })
    );
  }

  // Signal end of transfer
  peer.send(
    JSON.stringify({
      type: "transfer-complete",
    })
  );

  // Complete the progress UI
  completeTransferProgress(transferId);
}

// Setup file receiving from connected peer
function setupFileReceiving(peer, peerId) {
  let currentFile = null;
  let currentFileChunks = [];
  let currentFileSize = 0;
  let currentFileIndex = 0;
  let totalFiles = 0;
  let receivedFiles = [];
  let transferId = null;

  peer.on("data", async (data) => {
    // Check if data is a string message (metadata)
    if (typeof data === "string") {
      try {
        const message = JSON.parse(data);

        if (message.type === "file-start") {
          // New file starting
          currentFile = {
            name: message.name,
            size: message.size,
            index: message.index,
          };
          currentFileChunks = [];
          currentFileSize = 0;
          currentFileIndex = message.index;
          totalFiles = message.total;

          // Create or update progress UI
          if (!transferId) {
            transferId = `receive-${peerId}-${Math.random()
              .toString(36)
              .substring(2, 10)}`;
            createTransferProgressUI(
              transferId,
              [{ name: message.name, size: message.size }],
              "Receiving"
            );
          }
        } else if (message.type === "file-end") {
          // File completed, reconstruct the file
          const fileBlob = new Blob(currentFileChunks);
          receivedFiles.push({
            name: currentFile.name,
            data: fileBlob,
          });

          // Ask user where to save the file
          const savePath = await showSaveDialog(currentFile.name);
          if (savePath) {
            // Convert blob to array buffer
            const arrayBuffer = await fileBlob.arrayBuffer();

            // Save the file
            await window.electron.saveReceivedFile(savePath, arrayBuffer);
            showMessage(`File saved: ${currentFile.name}`);
          }

          // Reset for next file
          currentFile = null;
          currentFileChunks = [];
          currentFileSize = 0;
        } else if (message.type === "transfer-complete") {
          // All files received
          completeTransferProgress(transferId);
          transferId = null;
          receivedFiles = [];
        }
      } catch (err) {
        console.error("Error processing message:", err);
      }
    } else {
      // Binary data chunk for current file
      if (currentFile) {
        currentFileChunks.push(data);
        currentFileSize += data.byteLength;

        // Update progress
        if (transferId) {
          updateTransferProgress(transferId, currentFileSize, currentFile.size);
        }
      }
    }
  });
}

// Create UI for transfer progress
function createTransferProgressUI(id, files, action) {
  const container =
    document.getElementById("transfer-progress") ||
    document.createElement("div");
  if (!document.getElementById("transfer-progress")) {
    container.id = "transfer-progress";
    container.className =
      "fixed bottom-5 right-5 w-80 bg-gray-800 rounded-lg shadow-lg overflow-hidden";
    document.body.appendChild(container);
  }

  const fileNames = files.map((f) => f.name).join(", ");
  const totalSize = formatFileSize(
    files.reduce((total, file) => total + file.size, 0)
  );

  const transferElement = document.createElement("div");
  transferElement.id = `transfer-${id}`;
  transferElement.className = "p-4 border-b border-gray-700";
  transferElement.innerHTML = `
    <div class="flex justify-between mb-2">
      <div>
        <h4 class="font-semibold">${action} ${files.length} file(s)</h4>
        <p class="text-sm text-gray-400 truncate" title="${fileNames}">${fileNames}</p>
      </div>
      <span class="text-sm text-gray-400">${totalSize}</span>
    </div>
    <div class="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
      <div id="transfer-progress-${id}" class="h-full bg-teal-600" style="width: 0%"></div>
    </div>
    <div class="mt-1 text-right text-sm text-gray-400">
      <span id="transfer-percent-${id}">0%</span> - 
      <span id="transfer-speed-${id}">0 KB/s</span>
    </div>
  `;

  container.appendChild(transferElement);

  // Store start time for speed calculation
  activeTransfers.set(id, {
    startTime: Date.now(),
    lastUpdate: Date.now(),
    bytesLast: 0,
    bytesTotal: 0,
    size: files.reduce((total, file) => total + file.size, 0),
  });
}

// Update transfer progress in UI
function updateTransferProgress(id, bytesTransferred, totalBytes) {
  const progressBar = document.getElementById(`transfer-progress-${id}`);
  const percentElement = document.getElementById(`transfer-percent-${id}`);
  const speedElement = document.getElementById(`transfer-speed-${id}`);

  if (!progressBar || !percentElement || !speedElement) return;

  const percent = Math.round((bytesTransferred / totalBytes) * 100);
  progressBar.style.width = `${percent}%`;
  percentElement.textContent = `${percent}%`;

  // Calculate speed
  const transfer = activeTransfers.get(id);
  if (transfer) {
    const now = Date.now();
    const elapsed = now - transfer.lastUpdate;

    if (elapsed > 1000) {
      // Update speed every second
      const bytesPerSecond =
        (bytesTransferred - transfer.bytesLast) * (1000 / elapsed);
      speedElement.textContent = `${formatFileSize(bytesPerSecond)}/s`;

      // Update tracking values
      transfer.lastUpdate = now;
      transfer.bytesLast = bytesTransferred;
    }

    // Update total bytes
    transfer.bytesTotal = bytesTransferred;
  }
}

// Complete transfer progress in UI
function completeTransferProgress(id) {
  const transferElement = document.getElementById(`transfer-${id}`);
  if (!transferElement) return;

  const progressBar = document.getElementById(`transfer-progress-${id}`);
  const percentElement = document.getElementById(`transfer-percent-${id}`);

  if (progressBar) progressBar.style.width = "100%";
  if (percentElement) percentElement.textContent = "100%";

  // Add complete indicator
  const speedElement = document.getElementById(`transfer-speed-${id}`);
  if (speedElement) speedElement.textContent = "Complete";

  // Clean up after 5 seconds
  setTimeout(() => {
    transferElement.remove();
    activeTransfers.delete(id);

    // Remove container if empty
    const container = document.getElementById("transfer-progress");
    if (container && container.children.length === 0) {
      container.remove();
    }
  }, 5000);
}

// Show save dialog for receiving files
async function showSaveDialog(filename) {
  // Get desktop path as default location
  const savePath = await window.electron.showDirectoryDialog();
  if (!savePath) return null;

  return `${savePath}/${filename}`;
}

// Utility: Read file as ArrayBuffer
function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// Utility: Show a message toast
function showMessage(message) {
  const toast = document.createElement("div");
  toast.className =
    "fixed bottom-5 left-5 bg-gray-800 text-white px-4 py-2 rounded-lg shadow-lg transition-opacity duration-300";
  toast.textContent = message;

  document.body.appendChild(toast);

  // Auto remove after 3 seconds
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Utility: Format file size
function formatFileSize(bytes) {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// Export functions
module.exports = {
  initializePeer,
  updateDeviceList,
  sendToDevice,
};
