const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("node:path");
const os = require("os");
const fs = require("fs");
const http = require("http");
const { Server } = require("socket.io");
const { networkInterfaces } = require("os");

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require("electron-squirrel-startup")) {
  app.quit();
}

// Global variables
let mainWindow;
let io;
let httpServer;
let discoveryPort = 3000;

// Function to get local IP address
function getLocalIpAddress() {
  const interfaces = networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal and non-ipv4 addresses
      if (!iface.internal && iface.family === "IPv4") {
        return iface.address;
      }
    }
  }
  return "127.0.0.1"; // Fallback to localhost
}

// Setup WebSocket server for device discovery
function setupDiscoveryServer() {
  httpServer = http.createServer();
  io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log("New device connected:", socket.id);

    // Send this device's info to the new connection
    socket.emit("device-info", {
      id: app.deviceId,
      name: app.deviceName,
      ip: getLocalIpAddress(),
    });

    // Broadcast to all clients when a new device connects
    socket.broadcast.emit("device-discovered", {
      id: app.deviceId,
      name: app.deviceName,
      ip: getLocalIpAddress(),
    });

    // When a device broadcasts itself
    socket.on("broadcast-device", (deviceInfo) => {
      console.log("Device broadcasting:", deviceInfo);
      // Forward the broadcast to the renderer process
      if (mainWindow) {
        mainWindow.webContents.send("device-discovered", deviceInfo);
      }
    });

    // Handle file transfer request
    socket.on("file-transfer-request", (request) => {
      if (mainWindow) {
        mainWindow.webContents.send("file-transfer-request", {
          ...request,
          socketId: socket.id,
        });
      }
    });

    // Handle file transfer response
    socket.on("file-transfer-response", (response) => {
      io.to(response.to).emit("file-transfer-response", response);
    });

    // Handle disconnection
    socket.on("disconnect", () => {
      console.log("Device disconnected:", socket.id);
      if (mainWindow) {
        mainWindow.webContents.send("device-disconnected", socket.id);
      }
    });
  });

  // Start listening
  httpServer.listen(discoveryPort, () => {
    console.log(`Discovery server running on port ${discoveryPort}`);
  });
}

const createWindow = () => {
  // Generate a unique device ID and name if not already set
  if (!app.deviceId) {
    app.deviceId = Math.random().toString(36).substring(2, 10);
    app.deviceName = `User-${app.deviceId.substring(0, 4)}`;
  }

  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 900,
    height: 590,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
  });

  // and load the index.html of the app.
  mainWindow.loadFile(path.join(__dirname, "index.html"));

  // Open the DevTools only in development mode
  if (true) {
    mainWindow.webContents.openDevTools();
  }
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindow();
  setupDiscoveryServer();

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // Setup file dialog handler
  ipcMain.handle("show-file-dialog", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ["openFile", "multiSelections"],
    });
    if (canceled) {
      return [];
    } else {
      return filePaths;
    }
  });

  // Setup directory dialog handler
  ipcMain.handle("show-directory-dialog", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ["openDirectory"],
    });
    if (canceled) {
      return null;
    } else {
      return filePaths[0];
    }
  });

  // Get device info
  ipcMain.handle("get-device-info", () => {
    return {
      id: app.deviceId,
      name: app.deviceName,
      ip: getLocalIpAddress(),
    };
  });

  // Update device name
  ipcMain.handle("update-device-name", (event, name) => {
    app.deviceName = name;
    return app.deviceName;
  });

  // Broadcast a message to all connected devices
  ipcMain.handle("broadcast-message", (event, message) => {
    if (io) {
      io.emit("broadcast-message", message);
      return true;
    }
    return false;
  });

  // Send a direct message to a specific device
  ipcMain.handle("send-direct-message", (event, { to, message }) => {
    if (io) {
      io.to(to).emit("direct-message", {
        from: app.deviceId,
        message,
      });
      return true;
    }
    return false;
  });

  // Send a file transfer request
  ipcMain.handle("send-file-transfer-request", (event, { to, fileInfo }) => {
    if (io) {
      io.to(to).emit("file-transfer-request", {
        from: app.deviceId,
        fromName: app.deviceName,
        fileInfo,
      });
      return true;
    }
    return false;
  });

  // Send a file transfer response
  ipcMain.handle(
    "send-file-transfer-response",
    (event, { to, accepted, signalData }) => {
      if (io) {
        io.to(to).emit("file-transfer-response", {
          from: app.deviceId,
          accepted,
          signalData,
        });
        return true;
      }
      return false;
    }
  );

  // Read file data for transfer
  ipcMain.handle("read-file-for-transfer", async (event, filePath) => {
    try {
      const fileBuffer = await fs.promises.readFile(filePath);
      return fileBuffer.buffer;
    } catch (error) {
      console.error("Error reading file:", error);
      return null;
    }
  });

  // Save received file
  ipcMain.handle(
    "save-received-file",
    async (event, { filePath, fileData }) => {
      try {
        await fs.promises.writeFile(filePath, Buffer.from(fileData));
        return true;
      } catch (error) {
        console.error("Error saving file:", error);
        return false;
      }
    }
  );
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Clean up when the app is quitting
app.on("quit", () => {
  if (httpServer) {
    httpServer.close();
  }
});
