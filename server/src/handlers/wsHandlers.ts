import { WebSocket } from 'ws';
import { CLIENT_OPS, SERVER_OPS, ClientMessageSchema } from '@in-vino-morte/shared';
import { RoomManager } from '../managers/RoomManager';

export interface SocketData {
    playerId: string | null;
    roomId: string | null;
    isAlive: boolean;
}

/**
 * Send an error message to a WebSocket client.
 */
export function sendError(ws: WebSocket, code: string, message: string): void {
    ws.send(JSON.stringify({
        op: SERVER_OPS.ERROR,
        code,
        message,
    }));
}

/**
 * Create a message handler function for WebSocket messages.
 */
export function createMessageHandler(
    roomManager: RoomManager,
    socketData: WeakMap<WebSocket, SocketData>
) {
    return function handleMessage(ws: WebSocket, rawMessage: unknown): void {
        const parsed = ClientMessageSchema.safeParse(rawMessage);
        if (!parsed.success) {
            sendError(ws, 'INVALID_MESSAGE', 'Invalid message format');
            return;
        }

        const message = parsed.data;
        const info = socketData.get(ws);

        switch (message.op) {
            case CLIENT_OPS.JOIN:
                handleJoin(ws, message.token, message.name, message.avatarId, roomManager, socketData);
                break;

            case CLIENT_OPS.READY:
                if (!info?.playerId || !info?.roomId) {
                    sendError(ws, 'NOT_IN_ROOM', 'You must join first');
                    return;
                }
                handleReady(info.playerId, info.roomId, message.ready, roomManager);
                break;

            case CLIENT_OPS.START_GAME:
                if (!info?.playerId || !info?.roomId) {
                    sendError(ws, 'NOT_IN_ROOM', 'You must join first');
                    return;
                }
                handleStartGame(ws, info.playerId, info.roomId, roomManager);
                break;

            case CLIENT_OPS.UPDATE_SETTINGS:
                if (!info?.playerId || !info?.roomId) {
                    sendError(ws, 'NOT_IN_ROOM', 'You must join first');
                    return;
                }
                handleUpdateSettings(ws, info.playerId, info.roomId, message.settings, roomManager);
                break;

            case CLIENT_OPS.ACTION_DRINK:
                if (!info?.playerId || !info?.roomId) {
                    sendError(ws, 'NOT_IN_ROOM', 'You must join first');
                    return;
                }
                handleDrink(ws, info.playerId, info.roomId, roomManager);
                break;

            case CLIENT_OPS.ACTION_SWAP:
                if (!info?.playerId || !info?.roomId) {
                    sendError(ws, 'NOT_IN_ROOM', 'You must join first');
                    return;
                }
                handleSwap(ws, info.playerId, info.roomId, message.targetSeat, roomManager);
                break;

            case CLIENT_OPS.ACTION_STEAL_CHEESE:
                if (!info?.playerId || !info?.roomId) {
                    sendError(ws, 'NOT_IN_ROOM', 'You must join first');
                    return;
                }
                handleStealCheese(ws, info.playerId, info.roomId, message.targetSeat, roomManager);
                break;

            case CLIENT_OPS.DEALER_SET:
                if (!info?.playerId || !info?.roomId) {
                    sendError(ws, 'NOT_IN_ROOM', 'You must join first');
                    return;
                }
                handleDealerSet(ws, info.playerId, info.roomId, message.composition, roomManager);
                break;

            case CLIENT_OPS.DEALER_PREVIEW:
                if (!info?.playerId || !info?.roomId) {
                    sendError(ws, 'NOT_IN_ROOM', 'You must join first');
                    return;
                }
                handleDealerPreview(info.playerId, info.roomId, message.seat, message.cardType, roomManager);
                break;

            case CLIENT_OPS.START_REVEAL:
                if (!info?.playerId || !info?.roomId) {
                    sendError(ws, 'NOT_IN_ROOM', 'You must join first');
                    return;
                }
                handleStartReveal(ws, info.playerId, info.roomId, roomManager);
                break;

            case CLIENT_OPS.VOTE_REMATCH:
                if (!info?.playerId || !info?.roomId) {
                    sendError(ws, 'NOT_IN_ROOM', 'You must join first');
                    return;
                }
                handleVoteRematch(info.playerId, info.roomId, message.vote, roomManager);
                break;

            case CLIENT_OPS.LEAVE_ROOM:
                if (!info?.playerId || !info?.roomId) {
                    return;
                }
                handleLeaveRoom(ws, info.playerId, info.roomId, roomManager, socketData);
                break;

            case CLIENT_OPS.PING:
                ws.send(JSON.stringify({ op: SERVER_OPS.PONG, t: message.t }));
                break;

            default:
                sendError(ws, 'UNKNOWN_OP', 'Unknown operation');
        }
    };
}

// ==========================================
// Handler Functions
// ==========================================

function handleJoin(
    ws: WebSocket,
    token: string,
    name: string,
    avatarId: number,
    roomManager: RoomManager,
    socketData: WeakMap<WebSocket, SocketData>
): void {
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

function handleReady(playerId: string, roomId: string, ready: boolean, roomManager: RoomManager): void {
    const room = roomManager.getRoom(roomId);
    if (room) {
        room.setPlayerReady(playerId, ready);
    }
}

function handleStartGame(ws: WebSocket, playerId: string, roomId: string, roomManager: RoomManager): void {
    const room = roomManager.getRoom(roomId);
    if (!room) return;

    const check = room.canStartGame(playerId);
    if (!check.canStart) {
        sendError(ws, check.error!, check.error!);
        return;
    }

    room.startGame();
}

function handleUpdateSettings(
    ws: WebSocket,
    playerId: string,
    roomId: string,
    settings: { cheeseEnabled?: boolean; cheeseCount?: number },
    roomManager: RoomManager
): void {
    const room = roomManager.getRoom(roomId);
    if (!room) return;

    const result = room.updateSettings(playerId, settings);
    if (!result.success) {
        sendError(ws, result.error!, result.error!);
    }
}

function handleDrink(ws: WebSocket, playerId: string, roomId: string, roomManager: RoomManager): void {
    const room = roomManager.getRoom(roomId);
    if (!room) return;

    const state = room.getFullState(playerId);
    const seat = state.yourSeat;

    room.handleDrink(seat);
}

function handleSwap(ws: WebSocket, playerId: string, roomId: string, targetSeat: number, roomManager: RoomManager): void {
    const room = roomManager.getRoom(roomId);
    if (!room) return;

    const state = room.getFullState(playerId);
    const seat = state.yourSeat;

    const result = room.handleSwap(seat, targetSeat);
    if (!result.success) {
        sendError(ws, result.error!, result.error!);
    }
}

function handleStealCheese(ws: WebSocket, playerId: string, roomId: string, targetSeat: number, roomManager: RoomManager): void {
    const room = roomManager.getRoom(roomId);
    if (!room) return;

    const state = room.getFullState(playerId);
    const seat = state.yourSeat;

    const result = room.handleStealCheese(seat, targetSeat);
    if (!result.success) {
        sendError(ws, result.error!, result.error!);
    }
}

function handleDealerSet(
    ws: WebSocket,
    playerId: string,
    roomId: string,
    composition: Array<'SAFE' | 'DOOM'>,
    roomManager: RoomManager
): void {
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

/**
 * Real-time dealer preview - broadcast to non-dealers.
 * IMPORTANT: We only send whether a seat is assigned, NOT the actual card type.
 */
function handleDealerPreview(
    playerId: string,
    roomId: string,
    seat: number,
    cardType: 'SAFE' | 'DOOM' | null,
    roomManager: RoomManager
): void {
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
        assigned: cardType !== null,
    });
}

function handleStartReveal(ws: WebSocket, playerId: string, roomId: string, roomManager: RoomManager): void {
    const room = roomManager.getRoom(roomId);
    if (!room) return;

    const state = room.getFullState(playerId);
    const seat = state.yourSeat;

    const result = room.handleStartReveal(seat);
    if (!result.success) {
        sendError(ws, result.error!, result.error!);
    }
}

function handleVoteRematch(playerId: string, roomId: string, vote: boolean, roomManager: RoomManager): void {
    const room = roomManager.getRoom(roomId);
    if (!room) return;

    // Only allow voting during voting phase
    if (!room.isInVotingPhase()) return;

    const state = room.getFullState(playerId);
    room.handleRematchVote(state.yourSeat, vote);
}

function handleLeaveRoom(
    ws: WebSocket,
    playerId: string,
    roomId: string,
    roomManager: RoomManager,
    socketData: WeakMap<WebSocket, SocketData>
): void {
    const room = roomManager.getRoom(roomId);
    if (!room) return;

    room.handlePlayerLeave(playerId);

    // Clean up socket data
    socketData.delete(ws);

    // Close the connection
    ws.close(1000, 'Left room');
}
