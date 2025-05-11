// renderer.js - Main renderer process script
const discovery = require("./discovery");
const p2p = require("./p2p");
const fileHandler = require("./fileHandler");

// DOM elements
const receiveBtn = document.getElementById("receive-btn");
const sendBtn = document.getElementById("send-btn");
const settingsBtn = document.getElementById("settings-btn");
const receiveScreen = document.getElementById("receive-screen");
const sendScreen = document.getElementById("send-screen");
const settingsScreen = document.getElementById("settings-screen");
const scanDevicesBtn = document.getElementById("scan-devices-btn");
const fileSelectBtn = document.getElementById("file-select-btn");
const folderSelectBtn = document.getElementById("folder-select-btn");

// Initialize the application
function initializeApp() {
  // Initialize device discovery
  discovery.initializeDiscovery().catch((err) => {
    console.error("Failed to initialize discovery:", err);
  });

  // Initialize peer-to-peer functionality
  p2p.initializePeer();

  // Set up UI navigation
  setupNavigation();

  // Set up file selection
  setupFileSelection();

  // Make p2p functions available to discovery.js
  window.sendToDevice = p2p.sendToDevice;
}

// Setup navigation between screens
function setupNavigation() {
  const screens = [receiveScreen, sendScreen, settingsScreen];
  const menuItems = [receiveBtn, sendBtn, settingsBtn];

  // Function to activate a specific screen
  function activateScreen(index) {
    // Hide all screens
    screens.forEach((screen) => {
      if (screen) screen.style.display = "none";
    });

    // Remove active class from all menu items
    menuItems.forEach((item) => {
      if (item) item.classList.remove("active");
    });

    // Show selected screen and activate menu item
    if (screens[index]) {
      screens[index].style.display = "flex";
      if (menuItems[index]) menuItems[index].classList.add("active");
    }
  }

  // Add click event listeners to menu items
  if (receiveBtn) {
    receiveBtn.addEventListener("click", () => activateScreen(0));
  }

  if (sendBtn) {
    sendBtn.addEventListener("click", () => activateScreen(1));
  }

  if (settingsBtn) {
    settingsBtn.addEventListener("click", () => activateScreen(2));
  }

  // Start with the send screen active
  activateScreen(1);
}

// Setup file selection functionality
function setupFileSelection() {
  // File select button
  if (fileSelectBtn) {
    fileSelectBtn.addEventListener("click", () => {
      window.electron.showFileDialog().then((filePaths) => {
        if (filePaths && filePaths.length > 0) {
          const files = filePaths.map((path) => {
            const name = path.split(/[\\/]/).pop();
            // We can't use fs in the renderer process, so we'll use file properties from the path
            return {
              path,
              name,
              size: 0, // We'll get this from the main process if needed
              type: getFileType(name),
            };
          });

          fileHandler.selectedFiles.files = files;
          fileHandler.updateSelectionDisplay();
        }
      });
    });
  }

  // Folder select button
  if (folderSelectBtn) {
    folderSelectBtn.addEventListener("click", () => {
      window.electron.showDirectoryDialog().then((dirPath) => {
        if (dirPath) {
          // Process folder selection
          // This would involve scanning the folder for files
          // For simplicity, we'll just show it's selected
          fileHandler.selectedFiles.folder = dirPath;
          fileHandler.updateSelectionDisplay();
        }
      });
    });
  }

  // Setup scan devices button
  if (scanDevicesBtn) {
    scanDevicesBtn.addEventListener("click", () => {
      discovery.scanForDevices();
    });
  }
}

// Utility function to get file type from extension
function getFileType(filename) {
  const ext = filename.split(".").pop().toLowerCase();

  // Image types
  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) {
    return "image/" + ext;
  }

  // Video types
  if (["mp4", "webm", "ogg", "mov"].includes(ext)) {
    return "video/" + ext;
  }

  // Audio types
  if (["mp3", "wav", "ogg", "aac"].includes(ext)) {
    return "audio/" + ext;
  }

  // Document types
  if (ext === "pdf") return "application/pdf";
  if (["doc", "docx"].includes(ext)) return "application/msword";
  if (["xls", "xlsx"].includes(ext)) return "application/vnd.ms-excel";
  if (["ppt", "pptx"].includes(ext)) return "application/vnd.ms-powerpoint";

  // Default
  return "application/octet-stream";
}

// Setup event listener to change device name
function setupDeviceNameChange() {
  const deviceNameElement = document.getElementById("device-name");
  const changeNameButton = document.getElementById("change-name-btn");

  if (changeNameButton && deviceNameElement) {
    changeNameButton.addEventListener("click", () => {
      const newName = prompt(
        "Enter new device name:",
        deviceNameElement.textContent
      );
      if (newName && newName.trim() !== "") {
        discovery.changeDeviceName(newName.trim());
      }
    });
  }
}

// Initialize the application when the DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  initializeApp();
  setupDeviceNameChange();
});
