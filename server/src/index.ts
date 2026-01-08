import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';

// Import extracted modules
import { RoomManager } from './managers/RoomManager';
import { createRoomRoutes } from './routes/roomRoutes';
import { createMessageHandler, sendError, SocketData } from './handlers/wsHandlers';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

// ==========================================
// Initialize Room Manager
// ==========================================

const roomManager = new RoomManager();

// ==========================================
// Express App
// ==========================================

const app = express();
app.use(cors());
app.use(express.json());

// Mount room routes
app.use(createRoomRoutes(roomManager));

// ==========================================
// HTTP + WebSocket Server
// ==========================================

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const socketData = new WeakMap<WebSocket, SocketData>();

// Create message handler with room manager
const handleMessage = createMessageHandler(roomManager, socketData);

wss.on('connection', (ws: WebSocket) => {
    socketData.set(ws, { playerId: null, roomId: null, isAlive: true });

    ws.on('message', (data: Buffer) => {
        try {
            const message = JSON.parse(data.toString());
            handleMessage(ws, message);
        } catch (error) {
            console.error('Failed to parse message:', error);
            sendError(ws, 'INVALID_MESSAGE', 'Failed to parse message');
        }
    });

    ws.on('close', () => {
        const info = socketData.get(ws);
        if (info?.playerId && info?.roomId) {
            const room = roomManager.getRoom(info.roomId);
            if (room) {
                room.disconnectPlayer(info.playerId);
            }
        }
    });

    ws.on('pong', () => {
        const info = socketData.get(ws);
        if (info) {
            info.isAlive = true;
        }
    });
});

// Heartbeat interval
setInterval(() => {
    wss.clients.forEach((ws) => {
        const info = socketData.get(ws);
        if (info && !info.isAlive) {
            return ws.terminate();
        }
        if (info) {
            info.isAlive = false;
        }
        ws.ping();
    });
}, 30000);

// Cleanup empty rooms periodically
setInterval(() => {
    roomManager.cleanupEmptyRooms();
}, 60000);

// Start server
server.listen(PORT, () => {
    console.log(`🍷 In Vino Morte server running on port ${PORT}`);
    console.log(`   Health check: http://localhost:${PORT}/healthz`);
    console.log(`   WebSocket: ws://localhost:${PORT}`);
});
