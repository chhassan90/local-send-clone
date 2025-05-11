// discovery.js - Device discovery functionality for local network
import io from "socket.io-client";

// Store for discovered devices
const discoveredDevices = new Map();
let socket = null;
let deviceInfo = null;

// Initialize discovery functionality
async function initializeDiscovery() {
  // Get this device's info
  deviceInfo = await window.electron.getDeviceInfo();
  console.log("This device info:", deviceInfo);

  // Set the device name in the UI
  updateDeviceNameUI(deviceInfo.name);

  // Setup scan functionality
  setupScanForDevices();

  // Start discovery server client
  await connectToDiscoveryServer();
}

// Update device name in UI
function updateDeviceNameUI(name) {
  const deviceNameElement = document.getElementById("device-name");
  if (deviceNameElement) {
    deviceNameElement.textContent = name;
  }
}

// Setup scan button functionality
function setupScanForDevices() {
  const scanButton = document.getElementById("scan-devices-btn");
  if (scanButton) {
    scanButton.addEventListener("click", async () => {
      scanForDevices();
    });
  }
}

// Connect to discovery server
async function connectToDiscoveryServer() {
  try {
    // Try to connect to discovery server on localhost first
    await connectToSocket("http://localhost:3000");

    // If successful, scan for devices
    scanForDevices();
  } catch (error) {
    console.error("Failed to connect to discovery server:", error);
    showConnectionError();
  }
}

// Connect to WebSocket server
async function connectToSocket(url) {
  return new Promise((resolve, reject) => {
    try {
      // Close existing connection if any
      if (socket) {
        socket.disconnect();
      }

      // Connect to server
      socket = io(url);

      // Handle connection events
      socket.on("connect", () => {
        console.log("Connected to discovery server");

        // Send this device's info
        socket.emit("broadcast-device", deviceInfo);

        resolve();
      });

      // Handle device discovery
      socket.on("device-discovered", (device) => {
        console.log("Device discovered:", device);

        // Skip if it's this device
        if (device.id === deviceInfo.id) return;

        // Add to discovered devices
        discoveredDevices.set(device.id, device);

        // Update UI
        updateDeviceUI(device);
      });

      // Handle server info about this device
      socket.on("device-info", (info) => {
        console.log("Device info received:", info);
        deviceInfo = info;
        updateDeviceNameUI(info.name);
      });

      // Handle disconnection
      socket.on("disconnect", () => {
        console.log("Disconnected from discovery server");
      });

      // Handle errors
      socket.on("error", (err) => {
        console.error("Socket error:", err);
        reject(err);
      });

      socket.on("connect_error", (err) => {
        console.error("Connection error:", err);
        reject(err);
      });
    } catch (err) {
      console.error("Error setting up socket:", err);
      reject(err);
    }
  });
}

// Show connection error in UI
function showConnectionError() {
  const deviceList = document.getElementById("device-list");
  if (deviceList) {
    deviceList.innerHTML = `
      <div class="p-4 text-center">
        <p class="text-red-400 mb-2">Failed to connect to discovery server</p>
        <button id="retry-connection-btn" class="px-4 py-2 rounded-lg bg-teal-600 text-white">
          Retry
        </button>
      </div>
    `;

    // Add retry button functionality
    document
      .getElementById("retry-connection-btn")
      .addEventListener("click", () => {
        connectToDiscoveryServer();
      });
  }
}

// Scan for devices on the network
function scanForDevices() {
  // Clear existing device list
  const deviceList = document.getElementById("device-list");
  if (deviceList) {
    deviceList.innerHTML = `
      <div class="p-4 text-center">
        <p class="text-gray-400">Scanning for devices...</p>
      </div>
    `;
  }

  // Broadcast this device to the network
  if (socket && socket.connected) {
    socket.emit("broadcast-device", deviceInfo);
  }

  // If no devices found after 5 seconds, show message
  setTimeout(() => {
    if (discoveredDevices.size === 0) {
      if (deviceList) {
        deviceList.innerHTML = `
          <div class="p-4 text-center">
            <p class="text-gray-400">No devices found</p>
            <button id="rescan-btn" class="mt-2 px-4 py-2 rounded-lg bg-teal-600 text-white">
              Scan Again
            </button>
          </div>
        `;

        // Add rescan button functionality
        document.getElementById("rescan-btn").addEventListener("click", () => {
          scanForDevices();
        });
      }
    }
  }, 5000);
}

// Update device list UI
function updateDeviceUI(device) {
  const deviceList = document.getElementById("device-list");

  // Clear "scanning" or "no devices" message if this is the first device
  if (
    discoveredDevices.size === 1 &&
    deviceList.querySelector("p.text-gray-400")
  ) {
    deviceList.innerHTML = "";
  }

  // Check if device already exists in the list
  const existingDevice = document.getElementById(`device-${device.id}`);
  if (existingDevice) {
    return;
  }

  // Create device element
  const deviceElement = document.createElement("div");
  deviceElement.id = `device-${device.id}`;
  deviceElement.className =
    "device-item flex items-center justify-between p-4 mb-2 rounded-lg bg-gray-700";
  deviceElement.innerHTML = `
    <div class="flex items-center">
      <div class="w-10 h-10 rounded-full flex items-center justify-center bg-teal-600 mr-3">
        <span class="text-lg font-bold text-white">${device.name
          .charAt(0)
          .toUpperCase()}</span>
      </div>
      <div>
        <h3 class="font-semibold">${device.name}</h3>
        <p class="text-sm text-gray-400">${device.ip}</p>
      </div>
    </div>
    <button data-device-id="${
      device.id
    }" class="send-to-device-btn px-4 py-2 rounded-lg bg-teal-600 text-white">
      Send
    </button>
  `;

  // Add event listener to the send button
  const sendButton = deviceElement.querySelector(".send-to-device-btn");
  sendButton.addEventListener("click", () => {
    sendToDevice(device.id);
  });

  // Add to device list
  deviceList.appendChild(deviceElement);
}

// Change device name
async function changeDeviceName(newName) {
  if (!newName || newName.trim() === "") return;

  try {
    const updatedName = await window.electron.updateDeviceName(newName);

    // Update local device info
    deviceInfo.name = updatedName;

    // Update UI
    updateDeviceNameUI(updatedName);

    // Broadcast updated info
    if (socket && socket.connected) {
      socket.emit("broadcast-device", deviceInfo);
    }

    return true;
  } catch (error) {
    console.error("Failed to update device name:", error);
    return false;
  }
}

// Send to a specific device
function sendToDevice(deviceId) {
  // This will be implemented by p2p.js
  if (typeof window.sendToDevice === "function") {
    window.sendToDevice(deviceId);
  } else {
    console.error("sendToDevice function not available");
  }
}

// Export functions
module.exports = {
  initializeDiscovery,
  changeDeviceName,
  scanForDevices,
};
