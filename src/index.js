import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "path";
import fs from "fs";
import { Server } from "socket.io";
import electronSquirrelStartup from "electron-squirrel-startup";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { getLocalIpAddress } from "./helpers.js";

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (electronSquirrelStartup) {
  app.quit();
}

// Global variables
let mainWindow;
let io;
let httpServer;
// Define IP and port variables for consistency
let discoveryPort = 3000;
let serverIp = "0.0.0.0"; // Listen on all network interfaces
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function setupDiscoveryServer() {
  // Create HTTP server first
  httpServer = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("File Transfer Discovery Server");
  });

  // Initialize Socket.IO server with CORS
  io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    // Add reliability options
    pingTimeout: 10000,
    pingInterval: 5000,
  });
  io.on("connection", (socket) => {
    console.log("New device connected:", socket.id);

    // Create a custom identifier for the device that includes socket ID
    const socketDeviceId = `${socket.id}-${Date.now()}`;

    // Send this device's info to the newly connected device
    socket.emit("device-info", {
      id: app.deviceId,
      name: app.deviceName,
      ip: getLocalIpAddress(),
      socketId: socket.id,
    });

    // Broadcast to all other clients that this device is available
    socket.broadcast.emit("device-discovered", {
      id: app.deviceId,
      name: app.deviceName,
      ip: getLocalIpAddress(),
      socketId: socket.id,
    });

    socket.on("broadcast-device", (deviceInfo) => {
      console.log("Device broadcasted:", deviceInfo);

      // Validate the data before processing
      if (!deviceInfo || !deviceInfo.id) {
        console.warn("Received invalid device broadcast data:", deviceInfo);
        return;
      }

      // Enhance device info with socket information
      const enhancedDeviceInfo = {
        ...deviceInfo,
        socketId: socket.id,
        lastSeen: Date.now(),
      };

      // Forward device info to the renderer process
      if (mainWindow) {
        mainWindow.webContents.send("device-discovered", enhancedDeviceInfo);
      }

      // Also broadcast to all other connected sockets
      socket.broadcast.emit("device-discovered", enhancedDeviceInfo);
    });

    socket.on("file-transfer-request", (request) => {
      if (mainWindow) {
        mainWindow.webContents.send("file-transfer-request", {
          ...request,
          socketId: socket.id,
        });
      }
    });

    socket.on("file-transfer-response", (response) => {
      io.to(response.to).emit("file-transfer-response", response);
    });

    socket.on("disconnect", () => {
      console.log("Device disconnected:", socket.id);
      if (mainWindow) {
        mainWindow.webContents.send("device-disconnected", socket.id);
      }
    });
  }); // Start HTTP server on the specified IP and port
  try {
    httpServer.listen(discoveryPort, serverIp, () => {
      const localIp = getLocalIpAddress();
      console.log(`Discovery server running on port ${discoveryPort}`);
      console.log(`Server IP: ${localIp}:${discoveryPort}`);
      console.log(`Device ID: ${app.deviceId}, Name: ${app.deviceName}`);
    });
  } catch (error) {
    console.error("Failed to start discovery server:", error);
    // Try fallback to localhost if binding to all interfaces fails
    httpServer.listen(discoveryPort, "127.0.0.1", () => {
      console.log(
        `Discovery server running on localhost:${discoveryPort} (fallback mode)`
      );
    });
  }
}

const createWindow = () => {
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

app.whenReady().then(() => {
  createWindow();
  setupDiscoveryServer();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

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
