import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { Room } from './room';
import {
    JOIN_CODE_LENGTH,
    JOIN_CODE_CHARS,
    CLIENT_OPS,
    SERVER_OPS,
} from '@in-vino-morte/shared';
import {
    ClientMessageSchema,
    CreateRoomRequestSchema,
    JoinRoomRequestSchema,
} from '@in-vino-morte/shared';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

// ==========================================
// Room Manager
// ==========================================

class RoomManager {
    private rooms: Map<string, Room> = new Map();
    private roomsByCode: Map<string, string> = new Map(); // joinCode -> roomId
    private playerToRoom: Map<string, string> = new Map(); // playerId -> roomId
    private tokenToPlayer: Map<string, { playerId: string; roomId: string }> = new Map();

    public generateJoinCode(): string {
        let code = '';
        for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
            code += JOIN_CODE_CHARS[Math.floor(Math.random() * JOIN_CODE_CHARS.length)];
        }

        // Ensure uniqueness
        if (this.roomsByCode.has(code)) {
            return this.generateJoinCode();
        }

        return code;
    }

    public createRoom(hostName: string, avatarId: number): { room: Room; token: string; playerId: string } {
        const joinCode = this.generateJoinCode();
        const playerId = uuidv4();
        const token = uuidv4();

        const room = new Room(joinCode, playerId);

        this.rooms.set(room.id, room);
        this.roomsByCode.set(joinCode, room.id);
        this.playerToRoom.set(playerId, room.id);
        this.tokenToPlayer.set(token, { playerId, roomId: room.id });

        return { room, token, playerId };
    }

    public joinRoom(joinCode: string, name: string, avatarId: number): { room: Room; token: string; playerId: string } | { error: string } {
        const roomId = this.roomsByCode.get(joinCode.toUpperCase());
        if (!roomId) {
            return { error: 'ROOM_NOT_FOUND' };
        }

        const room = this.rooms.get(roomId);
        if (!room) {
            return { error: 'ROOM_NOT_FOUND' };
        }

        // Check for duplicate names before creating token
        if (room.isNameTaken(name)) {
            return { error: 'NAME_TAKEN' };
        }

        // Check if room is full
        if (room.isFull()) {
            return { error: 'ROOM_FULL' };
        }

        // Check if game already started
        if (room.isInGame()) {
            return { error: 'GAME_IN_PROGRESS' };
        }

        const playerId = uuidv4();
        const token = uuidv4();

        this.playerToRoom.set(playerId, room.id);
        this.tokenToPlayer.set(token, { playerId, roomId: room.id });

        return { room, token, playerId };
    }

    public getRoom(roomId: string): Room | undefined {
        return this.rooms.get(roomId);
    }

    public getRoomByCode(joinCode: string): Room | undefined {
        const roomId = this.roomsByCode.get(joinCode.toUpperCase());
        return roomId ? this.rooms.get(roomId) : undefined;
    }

    public getRoomForPlayer(playerId: string): Room | undefined {
        const roomId = this.playerToRoom.get(playerId);
        return roomId ? this.rooms.get(roomId) : undefined;
    }

    public getTokenInfo(token: string): { playerId: string; roomId: string } | undefined {
        return this.tokenToPlayer.get(token);
    }

    public removeRoom(roomId: string): void {
        const room = this.rooms.get(roomId);
        if (room) {
            this.roomsByCode.delete(room.joinCode);
            this.rooms.delete(roomId);
        }
    }

    public cleanupEmptyRooms(): void {
        for (const [roomId, room] of this.rooms) {
            if (room.isEmpty()) {
                this.removeRoom(roomId);
            }
        }
    }
}

const roomManager = new RoomManager();

// ==========================================
// Express App
// ==========================================

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/healthz', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});

// Create room
app.post('/api/rooms', (req, res) => {
    try {
        const parsed = CreateRoomRequestSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'INVALID_REQUEST', details: parsed.error.issues });
            return;
        }

        const { hostName, avatarId } = parsed.data;
        const { room, token, playerId } = roomManager.createRoom(hostName, avatarId);

        res.json({
            roomId: room.id,
            joinCode: room.joinCode,
            token,
        });
    } catch (error) {
        console.error('Error creating room:', error);
        res.status(500).json({ error: 'UNKNOWN_ERROR' });
    }
});

// Join room
app.post('/api/rooms/join', (req, res) => {
    try {
        const parsed = JoinRoomRequestSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'INVALID_REQUEST', details: parsed.error.issues });
            return;
        }

        const { joinCode, name, avatarId } = parsed.data;
        const result = roomManager.joinRoom(joinCode, name, avatarId);

        if ('error' in result) {
            const statusCodes: Record<string, number> = {
                'ROOM_NOT_FOUND': 404,
                'NAME_TAKEN': 409,
                'ROOM_FULL': 409,
                'GAME_IN_PROGRESS': 409,
            };
            res.status(statusCodes[result.error] || 400).json({ error: result.error });
            return;
        }

        res.json({
            roomId: result.room.id,
            token: result.token,
        });
    } catch (error) {
        console.error('Error joining room:', error);
        res.status(500).json({ error: 'UNKNOWN_ERROR' });
    }
});

// ==========================================
// HTTP + WebSocket Server
// ==========================================

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

interface SocketData {
    playerId: string | null;
    roomId: string | null;
    isAlive: boolean;
}

const socketData = new WeakMap<WebSocket, SocketData>();

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

function handleMessage(ws: WebSocket, rawMessage: unknown): void {
    const parsed = ClientMessageSchema.safeParse(rawMessage);
    if (!parsed.success) {
        sendError(ws, 'INVALID_MESSAGE', 'Invalid message format');
        return;
    }

    const message = parsed.data;
    const info = socketData.get(ws);

    switch (message.op) {
        case CLIENT_OPS.JOIN:
            handleJoin(ws, message.token, message.name, message.avatarId);
            break;

        case CLIENT_OPS.READY:
            if (!info?.playerId || !info?.roomId) {
                sendError(ws, 'NOT_IN_ROOM', 'You must join first');
                return;
            }
            handleReady(info.playerId, info.roomId, message.ready);
            break;

        case CLIENT_OPS.START_GAME:
            if (!info?.playerId || !info?.roomId) {
                sendError(ws, 'NOT_IN_ROOM', 'You must join first');
                return;
            }
            handleStartGame(ws, info.playerId, info.roomId);
            break;

        case CLIENT_OPS.UPDATE_SETTINGS:
            if (!info?.playerId || !info?.roomId) {
                sendError(ws, 'NOT_IN_ROOM', 'You must join first');
                return;
            }
            handleUpdateSettings(ws, info.playerId, info.roomId, message.settings);
            break;

        case CLIENT_OPS.ACTION_DRINK:
            if (!info?.playerId || !info?.roomId) {
                sendError(ws, 'NOT_IN_ROOM', 'You must join first');
                return;
            }
            handleDrink(ws, info.playerId, info.roomId);
            break;

        case CLIENT_OPS.ACTION_SWAP:
            if (!info?.playerId || !info?.roomId) {
                sendError(ws, 'NOT_IN_ROOM', 'You must join first');
                return;
            }
            handleSwap(ws, info.playerId, info.roomId, message.targetSeat);
            break;

        case CLIENT_OPS.ACTION_STEAL_CHEESE: // Caseus Vitae
            if (!info?.playerId || !info?.roomId) {
                sendError(ws, 'NOT_IN_ROOM', 'You must join first');
                return;
            }
            handleStealCheese(ws, info.playerId, info.roomId, message.targetSeat);
            break;

        case CLIENT_OPS.DEALER_SET:
            if (!info?.playerId || !info?.roomId) {
                sendError(ws, 'NOT_IN_ROOM', 'You must join first');
                return;
            }
            handleDealerSet(ws, info.playerId, info.roomId, message.composition);
            break;

        case CLIENT_OPS.DEALER_PREVIEW:
            if (!info?.playerId || !info?.roomId) {
                sendError(ws, 'NOT_IN_ROOM', 'You must join first');
                return;
            }
            handleDealerPreview(ws, info.playerId, info.roomId, message.seat, message.cardType);
            break;

        case CLIENT_OPS.VOTE_REMATCH:
            if (!info?.playerId || !info?.roomId) {
                sendError(ws, 'NOT_IN_ROOM', 'You must join first');
                return;
            }
            handleVoteRematch(info.playerId, info.roomId, message.vote);
            break;

        case CLIENT_OPS.LEAVE_ROOM:
            if (!info?.playerId || !info?.roomId) {
                return;
            }
            handleLeaveRoom(ws, info.playerId, info.roomId);
            break;

        case CLIENT_OPS.PING:
            ws.send(JSON.stringify({ op: SERVER_OPS.PONG, t: message.t }));
            break;

        default:
            sendError(ws, 'UNKNOWN_OP', 'Unknown operation');
    }
}

function handleJoin(ws: WebSocket, token: string, name: string, avatarId: number): void {
    const tokenInfo = roomManager.getTokenInfo(token);
    if (!tokenInfo) {
        sendError(ws, 'INVALID_TOKEN', 'Invalid token');
        return;
    }

    const room = roomManager.getRoom(tokenInfo.roomId);
    if (!room) {
        sendError(ws, 'ROOM_NOT_FOUND', 'Room not found');
        return;
    }

    // Try to reconnect first
    const reconnectResult = room.reconnectPlayer(token, ws);

    if (reconnectResult.success) {
        // Reconnected existing player
        const info = socketData.get(ws);
        if (info) {
            info.playerId = reconnectResult.playerId!;
            info.roomId = room.id;
        }

        // Send full state
        const state = room.getFullState(reconnectResult.playerId!);
        ws.send(JSON.stringify({ op: SERVER_OPS.STATE, ...state }));
        return;
    }

    // New player joining
    const result = room.addPlayer(tokenInfo.playerId, name, avatarId, token, ws);

    if (!result.success) {
        sendError(ws, result.error!, result.error!);
        return;
    }

    const info = socketData.get(ws);
    if (info) {
        info.playerId = tokenInfo.playerId;
        info.roomId = room.id;
    }

    // Send full state to new player
    const state = room.getFullState(tokenInfo.playerId);
    ws.send(JSON.stringify({ op: SERVER_OPS.STATE, ...state }));

    // Broadcast lobby update to all
    room.broadcast({
        op: SERVER_OPS.LOBBY_UPDATE,
        players: room.getRoomState().players,
        settings: room.getRoomState().settings,
    });
}

function handleReady(playerId: string, roomId: string, ready: boolean): void {
    const room = roomManager.getRoom(roomId);
    if (room) {
        room.setPlayerReady(playerId, ready);
    }
}

function handleStartGame(ws: WebSocket, playerId: string, roomId: string): void {
    const room = roomManager.getRoom(roomId);
    if (!room) return;

    const check = room.canStartGame(playerId);
    if (!check.canStart) {
        sendError(ws, check.error!, check.error!);
        return;
    }

    room.startGame();
}

function handleUpdateSettings(ws: WebSocket, playerId: string, roomId: string, settings: { cheeseEnabled?: boolean; cheeseCount?: number }): void {
    const room = roomManager.getRoom(roomId);
    if (!room) return;

    const result = room.updateSettings(playerId, settings);
    if (!result.success) {
        sendError(ws, result.error!, result.error!);
    }
}

function handleDrink(ws: WebSocket, playerId: string, roomId: string): void {
    const room = roomManager.getRoom(roomId);
    if (!room) return;

    const state = room.getFullState(playerId);
    const seat = state.yourSeat;

    room.handleDrink(seat);
}

function handleSwap(ws: WebSocket, playerId: string, roomId: string, targetSeat: number): void {
    const room = roomManager.getRoom(roomId);
    if (!room) return;

    const state = room.getFullState(playerId);
    const seat = state.yourSeat;

    const result = room.handleSwap(seat, targetSeat);
    if (!result.success) {
        sendError(ws, result.error!, result.error!);
    }
}

// Caseus Vitae: Steal cheese action
function handleStealCheese(ws: WebSocket, playerId: string, roomId: string, targetSeat: number): void {
    const room = roomManager.getRoom(roomId);
    if (!room) return;

    const state = room.getFullState(playerId);
    const seat = state.yourSeat;

    const result = room.handleStealCheese(seat, targetSeat);
    if (!result.success) {
        sendError(ws, result.error!, result.error!);
    }
}

// Dealer Mode: Handle dealer card assignments
function handleDealerSet(ws: WebSocket, playerId: string, roomId: string, composition: Array<'SAFE' | 'DOOM'>): void {
    const room = roomManager.getRoom(roomId);
    if (!room) return;

    const state = room.getFullState(playerId);
    const dealerSeat = state.yourSeat;

    // Convert array composition to seat-based assignments
    // The composition array is ordered by seat
    const roomState = room.getRoomState();
    const aliveSeats = roomState.players.filter(p => p.alive).map(p => p.seat).sort((a, b) => a - b);

    const assignments: Record<number, 'SAFE' | 'DOOM'> = {};
    for (let i = 0; i < aliveSeats.length && i < composition.length; i++) {
        assignments[aliveSeats[i]] = composition[i];
    }

    const result = room.handleDealerSet(dealerSeat, assignments);
    if (!result.success) {
        sendError(ws, result.error!, result.error!);
    }
}

// Real-time dealer preview - broadcast to non-dealers
// IMPORTANT: We only send whether a seat is assigned, NOT the actual card type
function handleDealerPreview(_ws: WebSocket, playerId: string, roomId: string, seat: number, cardType: 'SAFE' | 'DOOM' | null): void {
    const room = roomManager.getRoom(roomId);
    if (!room) return;

    const state = room.getFullState(playerId);

    // Only the dealer can send previews
    if (state.game?.dealerSeat !== state.yourSeat) {
        return;
    }

    // Broadcast preview to all OTHER players (not the dealer)
    // Only send whether assigned (true/false), NOT the actual card type!
    room.broadcastExcept(playerId, {
        op: SERVER_OPS.DEALER_PREVIEW,
        seat,
        assigned: cardType !== null, // true if assigned, false if cleared
    });
}

// Rematch voting
function handleVoteRematch(playerId: string, roomId: string, vote: boolean): void {
    const room = roomManager.getRoom(roomId);
    if (!room) return;

    // Only allow voting during voting phase
    if (!room.isInVotingPhase()) return;

    const state = room.getFullState(playerId);
    room.handleRematchVote(state.yourSeat, vote);
}

// Player leaves room voluntarily
function handleLeaveRoom(ws: WebSocket, playerId: string, roomId: string): void {
    const room = roomManager.getRoom(roomId);
    if (!room) return;

    room.handlePlayerLeave(playerId);

    // Clean up socket data
    socketData.delete(ws);

    // Close the connection
    ws.close(1000, 'Left room');
}

function sendError(ws: WebSocket, code: string, message: string): void {
    ws.send(JSON.stringify({
        op: SERVER_OPS.ERROR,
        code,
        message,
    }));
}

// Start server
server.listen(PORT, () => {
    console.log(`🍷 In Vino Morte server running on port ${PORT}`);
    console.log(`   Health check: http://localhost:${PORT}/healthz`);
    console.log(`   WebSocket: ws://localhost:${PORT}`);
});
