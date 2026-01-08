import { z } from 'zod';
import { CLIENT_OPS, SERVER_OPS } from './constants';

// ============================================
// Client -> Server Schemas
// ============================================

export const JoinMessageSchema = z.object({
    op: z.literal(CLIENT_OPS.JOIN),
    token: z.string(),
    name: z.string().min(1).max(20),
    avatarId: z.number().int().min(0).max(15),
});

export const ReadyMessageSchema = z.object({
    op: z.literal(CLIENT_OPS.READY),
    ready: z.boolean(),
});

export const StartGameMessageSchema = z.object({
    op: z.literal(CLIENT_OPS.START_GAME),
});

export const UpdateSettingsMessageSchema = z.object({
    op: z.literal(CLIENT_OPS.UPDATE_SETTINGS),
    settings: z.object({
        cheeseEnabled: z.boolean().optional(),
        cheeseCount: z.number().optional(),
    }),
});

export const ActionDrinkMessageSchema = z.object({
    op: z.literal(CLIENT_OPS.ACTION_DRINK),
});

export const ActionSwapMessageSchema = z.object({
    op: z.literal(CLIENT_OPS.ACTION_SWAP),
    targetSeat: z.number().int().min(0),
});

// Caseus Vitae: Steal cheese from another player
export const ActionStealCheeseMessageSchema = z.object({
    op: z.literal(CLIENT_OPS.ACTION_STEAL_CHEESE),
    targetSeat: z.number().int().min(0),
});

export const DealerSetMessageSchema = z.object({
    op: z.literal(CLIENT_OPS.DEALER_SET),
    composition: z.array(z.enum(['SAFE', 'DOOM'])),
});

// Real-time preview of dealer assignment
export const DealerPreviewMessageSchema = z.object({
    op: z.literal(CLIENT_OPS.DEALER_PREVIEW),
    seat: z.number().int().min(0),
    cardType: z.enum(['SAFE', 'DOOM']).nullable(), // null means cleared
});

export const EmoteMessageSchema = z.object({
    op: z.literal(CLIENT_OPS.EMOTE),
    emoteId: z.string(),
});

export const PingMessageSchema = z.object({
    op: z.literal(CLIENT_OPS.PING),
    t: z.number(),
});

// Rematch voting
export const VoteRematchMessageSchema = z.object({
    op: z.literal(CLIENT_OPS.VOTE_REMATCH),
    vote: z.boolean(), // true = yes, false = retract vote
});

export const LeaveRoomMessageSchema = z.object({
    op: z.literal(CLIENT_OPS.LEAVE_ROOM),
});

// Union of all client messages
export const ClientMessageSchema = z.discriminatedUnion('op', [
    JoinMessageSchema,
    ReadyMessageSchema,
    StartGameMessageSchema,
    UpdateSettingsMessageSchema,
    ActionDrinkMessageSchema,
    ActionSwapMessageSchema,
    ActionStealCheeseMessageSchema, // Caseus Vitae
    DealerSetMessageSchema,
    DealerPreviewMessageSchema,
    VoteRematchMessageSchema,
    LeaveRoomMessageSchema,
    EmoteMessageSchema,
    PingMessageSchema,
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// ============================================
// Server -> Client Schemas
// ============================================

const PlayerSchema = z.object({
    id: z.string(),
    name: z.string(),
    avatarId: z.number(),
    seat: z.number(),
    alive: z.boolean(),
    connected: z.boolean(),
    ready: z.boolean(),
    hasCheese: z.boolean(), // Caseus Vitae
});

const RoomSettingsSchema = z.object({
    turnTimer: z.number(),
    cheeseEnabled: z.boolean(), // Caseus Vitae
    cheeseCount: z.number(), // Caseus Vitae
});

const RoomStateSchema = z.object({
    id: z.string(),
    joinCode: z.string(),
    hostId: z.string(),
    settings: RoomSettingsSchema,
    players: z.array(PlayerSchema),
    status: z.enum(['LOBBY', 'IN_GAME']),
    createdAt: z.number(),
});

const GameStateSchema = z.object({
    phase: z.enum(['LOBBY', 'DEALER_SETUP', 'DEALING', 'TURNS', 'FINAL_REVEAL', 'ROUND_END', 'GAME_END']),
    dealerSeat: z.number(),
    turnSeat: z.number(),
    roundIndex: z.number(),
    aliveSeats: z.array(z.number()),
    facedownSeats: z.array(z.number()),
    actedSeats: z.array(z.number()),
    deadlineTs: z.number().nullable(),
    cheeseSeats: z.array(z.number()), // Caseus Vitae
});

export const StateMessageSchema = z.object({
    op: z.literal(SERVER_OPS.STATE),
    room: RoomStateSchema,
    game: GameStateSchema.nullable(),
    yourSeat: z.number(),
    yourPlayerId: z.string(),
});

export const LobbyUpdateMessageSchema = z.object({
    op: z.literal(SERVER_OPS.LOBBY_UPDATE),
    players: z.array(PlayerSchema),
    settings: RoomSettingsSchema,
});

export const PhaseMessageSchema = z.object({
    op: z.literal(SERVER_OPS.PHASE),
    phase: z.enum(['LOBBY', 'DEALER_SETUP', 'DEALING', 'TURNS', 'FINAL_REVEAL', 'ROUND_END', 'GAME_END']),
    dealerSeat: z.number(),
    turnSeat: z.number(),
    deadlineTs: z.number().nullable(),
    aliveSeats: z.array(z.number()), // Include alive seats for game restart sync
});

export const DealtMessageSchema = z.object({
    op: z.literal(SERVER_OPS.DEALT),
    aliveSeats: z.array(z.number()),
});

export const SwapMessageSchema = z.object({
    op: z.literal(SERVER_OPS.SWAP),
    fromSeat: z.number(),
    toSeat: z.number(),
});

export const RevealMessageSchema = z.object({
    op: z.literal(SERVER_OPS.REVEAL),
    seat: z.number(),
    cardType: z.enum(['SAFE', 'DOOM']),
});

export const ElimMessageSchema = z.object({
    op: z.literal(SERVER_OPS.ELIM),
    seat: z.number(),
});

export const RoundEndMessageSchema = z.object({
    op: z.literal(SERVER_OPS.ROUND_END),
    nextDealerSeat: z.number(),
});

export const GameEndMessageSchema = z.object({
    op: z.literal(SERVER_OPS.GAME_END),
    winnerSeat: z.number(),
});

export const ErrorMessageSchema = z.object({
    op: z.literal(SERVER_OPS.ERROR),
    code: z.string(),
    message: z.string(),
});

export const PongMessageSchema = z.object({
    op: z.literal(SERVER_OPS.PONG),
    t: z.number(),
});

// Caseus Vitae: Cheese stolen event
export const CheeseStolenMessageSchema = z.object({
    op: z.literal(SERVER_OPS.CHEESE_STOLEN),
    fromSeat: z.number(),
    toSeat: z.number(),
});

// Caseus Vitae: Cheese positions update
export const CheeseUpdateMessageSchema = z.object({
    op: z.literal(SERVER_OPS.CHEESE_UPDATE),
    cheeseSeats: z.array(z.number()),
});

// Real-time dealer assignment preview (broadcast to non-dealers)
// NOTE: We only send whether a seat is assigned, NOT the card type (that would break the game!)
export const DealerPreviewServerMessageSchema = z.object({
    op: z.literal(SERVER_OPS.DEALER_PREVIEW),
    seat: z.number(),
    assigned: z.boolean(), // true = drink assigned, false = cleared
});

// Rematch voting status broadcast
export const VoteUpdateMessageSchema = z.object({
    op: z.literal(SERVER_OPS.VOTE_UPDATE),
    votedYes: z.array(z.number()), // Seats that voted yes
    requiredVotes: z.number(), // Total connected players needed
    phase: z.enum(['VOTING', 'STARTING', 'CANCELLED']),
});

// Player left notification
export const PlayerLeftMessageSchema = z.object({
    op: z.literal(SERVER_OPS.PLAYER_LEFT),
    seat: z.number(),
    reason: z.enum(['disconnected', 'left']),
});

// Union of all server messages
export const ServerMessageSchema = z.discriminatedUnion('op', [
    StateMessageSchema,
    LobbyUpdateMessageSchema,
    PhaseMessageSchema,
    DealtMessageSchema,
    SwapMessageSchema,
    RevealMessageSchema,
    ElimMessageSchema,
    CheeseStolenMessageSchema, // Caseus Vitae
    CheeseUpdateMessageSchema, // Caseus Vitae
    DealerPreviewServerMessageSchema, // Real-time dealer assignment
    VoteUpdateMessageSchema, // Rematch voting
    PlayerLeftMessageSchema, // Player left room
    RoundEndMessageSchema,
    GameEndMessageSchema,
    ErrorMessageSchema,
    PongMessageSchema,
]);

export type ServerMessage = z.infer<typeof ServerMessageSchema>;

// ============================================
// REST API Schemas
// ============================================

export const CreateRoomRequestSchema = z.object({
    hostName: z.string().min(1).max(20),
    avatarId: z.number().int().min(0).max(15),
});

export const CreateRoomResponseSchema = z.object({
    roomId: z.string(),
    joinCode: z.string(),
    token: z.string(),
});

export const JoinRoomRequestSchema = z.object({
    joinCode: z.string().length(6),
    name: z.string().min(1).max(20),
    avatarId: z.number().int().min(0).max(15),
});

export const JoinRoomResponseSchema = z.object({
    roomId: z.string(),
    token: z.string(),
});

export type CreateRoomRequest = z.infer<typeof CreateRoomRequestSchema>;
export type CreateRoomResponse = z.infer<typeof CreateRoomResponseSchema>;
export type JoinRoomRequest = z.infer<typeof JoinRoomRequestSchema>;
export type JoinRoomResponse = z.infer<typeof JoinRoomResponseSchema>;
