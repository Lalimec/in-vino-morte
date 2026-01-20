import { v4 as uuidv4 } from 'uuid';
import { Room } from '../room';
import { JOIN_CODE_LENGTH, JOIN_CODE_CHARS } from '@in-vino-morte/shared';

/**
 * Manages all game rooms - creation, lookup, and cleanup.
 *
 * Maps:
 * - rooms: roomId -> Room
 * - roomsByCode: joinCode -> roomId
 * - playerToRoom: playerId -> roomId
 * - tokenToPlayer: token -> { playerId, roomId }
 */
export class RoomManager {
    private rooms: Map<string, Room> = new Map();
    private roomsByCode: Map<string, string> = new Map(); // joinCode -> roomId
    private playerToRoom: Map<string, string> = new Map(); // playerId -> roomId
    private tokenToPlayer: Map<string, { playerId: string; roomId: string; sessionId: string }> = new Map();

    /**
     * Generate a unique join code for a new room.
     */
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

    /**
     * Create a new room with the given host.
     */
    public createRoom(hostName: string, avatarId: number, sessionId: string): { room: Room; token: string; playerId: string } {
        const joinCode = this.generateJoinCode();
        const playerId = uuidv4();
        const token = uuidv4();

        const room = new Room(joinCode, playerId);

        this.rooms.set(room.id, room);
        this.roomsByCode.set(joinCode, room.id);
        this.playerToRoom.set(playerId, room.id);
        this.tokenToPlayer.set(token, { playerId, roomId: room.id, sessionId });

        return { room, token, playerId };
    }

    /**
     * Join an existing room with a join code.
     * If the same sessionId already exists in the room:
     * - If connected: reject (can't have duplicate tabs)
     * - If disconnected: return existing token for reconnection
     */
    public joinRoom(joinCode: string, name: string, avatarId: number, sessionId: string): { room: Room; token: string; playerId: string; isReconnect?: boolean } | { error: string } {
        const roomId = this.roomsByCode.get(joinCode.toUpperCase());
        if (!roomId) {
            return { error: 'ROOM_NOT_FOUND' };
        }

        const room = this.rooms.get(roomId);
        if (!room) {
            return { error: 'ROOM_NOT_FOUND' };
        }

        // Check if this sessionId already has a player in this room
        const existingPlayer = room.findPlayerBySessionId(sessionId);
        if (existingPlayer) {
            if (existingPlayer.connected) {
                // Already in room with an active connection - reject
                return { error: 'SESSION_ALREADY_IN_ROOM' };
            } else {
                // Disconnected player - allow reconnection with existing token
                return {
                    room,
                    token: existingPlayer.token,
                    playerId: existingPlayer.playerId,
                    isReconnect: true,
                };
            }
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
        this.tokenToPlayer.set(token, { playerId, roomId: room.id, sessionId });

        return { room, token, playerId };
    }

    /**
     * Get a room by its ID.
     */
    public getRoom(roomId: string): Room | undefined {
        return this.rooms.get(roomId);
    }

    /**
     * Get a room by its join code.
     */
    public getRoomByCode(joinCode: string): Room | undefined {
        const roomId = this.roomsByCode.get(joinCode.toUpperCase());
        return roomId ? this.rooms.get(roomId) : undefined;
    }

    /**
     * Get the room a player is in.
     */
    public getRoomForPlayer(playerId: string): Room | undefined {
        const roomId = this.playerToRoom.get(playerId);
        return roomId ? this.rooms.get(roomId) : undefined;
    }

    /**
     * Get player/room info from a token.
     */
    public getTokenInfo(token: string): { playerId: string; roomId: string; sessionId: string } | undefined {
        return this.tokenToPlayer.get(token);
    }

    /**
     * Remove a player's token and mapping when they leave.
     */
    public removePlayerToken(playerId: string): void {
        this.playerToRoom.delete(playerId);

        // Find and remove the token for this player
        for (const [token, info] of this.tokenToPlayer) {
            if (info.playerId === playerId) {
                this.tokenToPlayer.delete(token);
                break;
            }
        }
    }

    /**
     * Remove a room and clean up all associated mappings.
     */
    public removeRoom(roomId: string): void {
        const room = this.rooms.get(roomId);
        if (room) {
            // Clean up all tokens for players in this room
            for (const [token, info] of this.tokenToPlayer) {
                if (info.roomId === roomId) {
                    this.tokenToPlayer.delete(token);
                    this.playerToRoom.delete(info.playerId);
                }
            }

            this.roomsByCode.delete(room.joinCode);
            this.rooms.delete(roomId);
        }
    }

    /**
     * Clean up any empty rooms.
     */
    public cleanupEmptyRooms(): void {
        for (const [roomId, room] of this.rooms) {
            if (room.isEmpty()) {
                this.removeRoom(roomId);
            }
        }
    }
}
