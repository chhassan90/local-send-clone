import { networkInterfaces } from "os";

export function getLocalIpAddress() {
  const interfaces = networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal and non-ipv4 addresses
      // In newer Node.js, family can be a number (4 for IPv4) or a string ("IPv4")
      if (!iface.internal && (iface.family === "IPv4" || iface.family === 4)) {
        return iface.address;
      }
    }
  }
  return "127.0.0.1"; // Fallback to localhost
}
