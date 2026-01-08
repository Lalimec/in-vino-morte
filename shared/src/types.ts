// Card types
export type CardType = 'SAFE' | 'DOOM';

// Game phases
export type GamePhase =
    | 'LOBBY'
    | 'DEALER_SETUP'
    | 'DEALING'
    | 'TURNS'
    | 'AWAITING_REVEAL'  // Waiting for dealer to trigger reveal sequence
    | 'FINAL_REVEAL'
    | 'ROUND_END'
    | 'GAME_END';

// Dealer mode (who picks card composition)

// Player state
export interface Player {
    id: string;
    name: string;
    avatarId: number;
    seat: number;
    alive: boolean;
    connected: boolean;
    ready: boolean;
    hasCheese: boolean; // Caseus Vitae expansion
}

// Room settings
export interface RoomSettings {
    turnTimer: number; // seconds
    cheeseEnabled: boolean; // Caseus Vitae expansion
    cheeseCount: number; // Number of cheese cards (1-3)
}

// Room state (for lobby)
export interface RoomState {
    id: string;
    joinCode: string;
    hostId: string;
    settings: RoomSettings;
    players: Player[];
    status: 'LOBBY' | 'IN_GAME';
    createdAt: number;
}

// Game state (during gameplay)
export interface GameState {
    phase: GamePhase;
    dealerSeat: number;
    turnSeat: number;
    roundIndex: number;
    aliveSeats: number[];
    facedownSeats: number[];
    actedSeats: number[];
    deadlineTs: number | null;
    cheeseSeats: number[]; // Seats that have cheese (Caseus Vitae)
}

// Full state sent on join/reconnect
export interface FullState {
    room: RoomState;
    game: GameState | null;
    yourSeat: number;
    yourPlayerId: string;
}

// Reveal info (when a card is revealed)
export interface RevealInfo {
    seat: number;
    cardType: CardType;
}

// Voting phase (for rematch voting)
export type VotingPhase = 'VOTING' | 'STARTING' | 'CANCELLED';

// Error codes
export type ErrorCode =
    | 'ROOM_NOT_FOUND'
    | 'ROOM_FULL'
    | 'INVALID_CODE'
    | 'INVALID_TOKEN'
    | 'INVALID_ACTION'
    | 'NOT_YOUR_TURN'
    | 'INVALID_TARGET'
    | 'GAME_IN_PROGRESS'
    | 'NOT_ENOUGH_PLAYERS'
    | 'NOT_HOST'
    | 'ALREADY_ACTED'
    | 'NO_CHEESE_TO_STEAL'
    | 'ALREADY_HAS_CHEESE'
    | 'UNKNOWN_ERROR';
