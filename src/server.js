// Small Hours - Server Entry Point
// Starts the HTTP server with WebSocket support.

import express from 'express';
import http from 'http';
import manager from './session/manager.js';
import { setupRoutes } from './transport/http.js';
import { setupWebSocket } from './transport/ws-adapter.js';
import { prewarmCache } from './fetcher/cached-fetcher.js';

const PORT = parseInt(process.env.PORT, 10) || 3001;

const app = express();
app.use(express.json());

const server = http.createServer(app);

// Set up HTTP routes
setupRoutes(app, manager);

// Set up WebSocket handling
const { wss, broadcastToRoom, hasActiveSockets } = setupWebSocket(server, manager);

// Tell the manager how to check for active sockets (avoids cleaning up rooms with connected displays)
manager.hasActiveSockets = (code) => hasActiveSockets(code);

// Start listening
server.listen(PORT, () => {
  console.log(`Small Hours server listening on port ${PORT}`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Health:  http://localhost:${PORT}/health`);
});

prewarmCache().catch(err => console.warn('[prewarm] startup cache warm failed:', err.message));

// Graceful shutdown
function shutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully...`);

  // Notify all rooms
  for (const [code] of manager.rooms) {
    broadcastToRoom(code, { type: 'SERVER_RESTARTING' });
  }

  // Close WebSocket server (terminates all connections)
  wss.close(() => {
    console.log('WebSocket server closed');
  });

  // Close HTTP server
  server.close(() => {
    console.log('HTTP server closed');
    manager.destroy();
    process.exit(0);
  });

  // Force exit after 5 seconds if graceful shutdown stalls
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
