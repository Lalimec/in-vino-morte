// Game constants
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 60;
export const DEFAULT_TURN_TIMER = 30; // seconds (was 8, increased for playability)
export const DEALER_SETUP_TIMER = 15; // seconds
export const RECONNECT_TIMEOUT = 60; // seconds
export const JOIN_CODE_LENGTH = 6;
export const JOIN_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1 for clarity
export const DEFAULT_CHEESE_COUNT = 2; // Caseus Vitae expansion
export const MAX_CHEESE_COUNT = 3;

// WebSocket message types
export const CLIENT_OPS = {
    JOIN: 'JOIN',
    READY: 'READY',
    START_GAME: 'START_GAME',
    UPDATE_SETTINGS: 'UPDATE_SETTINGS',
    ACTION_DRINK: 'ACTION_DRINK',
    ACTION_SWAP: 'ACTION_SWAP',
    ACTION_STEAL_CHEESE: 'ACTION_STEAL_CHEESE', // Caseus Vitae
    DEALER_SET: 'DEALER_SET',
    DEALER_PREVIEW: 'DEALER_PREVIEW', // Real-time dealer assignment preview
    START_REVEAL: 'START_REVEAL', // Dealer triggers the reveal sequence
    VOTE_REMATCH: 'VOTE_REMATCH', // Player votes for rematch
    LEAVE_ROOM: 'LEAVE_ROOM', // Player voluntarily leaves
    EMOTE: 'EMOTE',
    PING: 'PING',
} as const;

export const SERVER_OPS = {
    STATE: 'STATE',
    LOBBY_UPDATE: 'LOBBY_UPDATE',
    PHASE: 'PHASE',
    DEALT: 'DEALT',
    SWAP: 'SWAP',
    REVEAL: 'REVEAL',
    ELIM: 'ELIM',
    CHEESE_STOLEN: 'CHEESE_STOLEN', // Caseus Vitae
    CHEESE_UPDATE: 'CHEESE_UPDATE', // Caseus Vitae
    DEALER_PREVIEW: 'DEALER_PREVIEW', // Real-time dealer assignment preview
    VOTE_UPDATE: 'VOTE_UPDATE', // Broadcast rematch vote status
    PLAYER_LEFT: 'PLAYER_LEFT', // Player left the room
    ROUND_END: 'ROUND_END',
    GAME_END: 'GAME_END',
    ERROR: 'ERROR',
    PONG: 'PONG',
} as const;

// Animation timings (for client reference)
export const ANIMATION = {
    DRAG_PICKUP_SCALE: 1.06,
    DRAG_MAX_ROTATION: 6, // degrees
    DRAG_SMOOTHING_MS: 100,
    MAGNET_DISTANCE: 24, // pixels
    DROP_SUCCESS_MS: 370,
    DROP_SUCCESS_OVERSHOOT: 0.1, // 10%
    DROP_INVALID_MS: 450,
    FLIP_ANTICIPATION_MS: 120,
    FLIP_DURATION_MS: 320,
    DOOM_SHAKE_MS: 180,
    DOOM_VIGNETTE_MS: 120,
    ELIMINATION_MS: 525,
    TURN_RING_PULSE_MS: 900,
} as const;

// Reveal timings - same for all reveals (turn reveals and final reveals)
// Player focuses to center, card shakes with suspense, then flips to show result
export const REVEAL = {
    INITIAL_DELAY_MS: 100,        // Brief delay before first reveal in sequence
    FOCUS_DURATION_MS: 400,       // Player info flies to center spotlight
    SHAKE_DURATION_MS: 1000,      // Escalating shake before reveal
    HOLD_RESULT_MS: 1200,         // Show the result
    // Total per reveal: 400 + 1000 + 1200 = 2600ms
    PER_REVEAL_DURATION_MS: 2600,
    BUFFER_MS: 300,               // Buffer before phase transition
} as const;

// Keep FINAL_REVEAL as alias for backwards compatibility (server uses it)
export const FINAL_REVEAL = REVEAL;

// Drink action timings - must match client animation durations
export const DRINK = {
    ANIMATION_DELAY_MS: 100,      // Delay before sending action (for visual feedback)
    ANIMATION_CLEAR_MS: 600,      // When to clear the drinking animation state
} as const;
