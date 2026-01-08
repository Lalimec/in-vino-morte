import { Router, Request, Response } from 'express';
import { CreateRoomRequestSchema, JoinRoomRequestSchema } from '@in-vino-morte/shared';
import { RoomManager } from '../managers/RoomManager';

/**
 * Create Express router for room-related REST API endpoints.
 */
export function createRoomRoutes(roomManager: RoomManager): Router {
    const router = Router();

    // Health check
    router.get('/healthz', (_req: Request, res: Response) => {
        res.json({ status: 'ok', timestamp: Date.now() });
    });

    // Create room
    router.post('/api/rooms', (req: Request, res: Response) => {
        try {
            const parsed = CreateRoomRequestSchema.safeParse(req.body);
            if (!parsed.success) {
                res.status(400).json({ error: 'INVALID_REQUEST', details: parsed.error.issues });
                return;
            }

            const { hostName, avatarId } = parsed.data;
            const { room, token } = roomManager.createRoom(hostName, avatarId);

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
    router.post('/api/rooms/join', (req: Request, res: Response) => {
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

    return router;
}
