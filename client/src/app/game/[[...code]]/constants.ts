/**
 * Game page constants - single source of truth for client-side game values.
 *
 * Animation timing constants are imported from @in-vino-morte/shared
 * to ensure server and client stay in sync.
 */

// Avatar emojis for players (indexed by avatarId)
export const AVATARS = [
    '🍸', '🥂', '🍹', '🍺', '🥃', '🧉', '☕', '🍵', '🫖', '🍾',
    '🍻', '🥤', '🧃', '🫗', '🍶'
];

// Emoji emitter configuration for waiting animations
export const EMITTER_EMOJIS = [
    '🍷', '💀', '✨', '🍷', '💀', '✨', '🍷', '💀', '✨',
    '🍷', '💀', '✨', '🍸', '🧀', '🥂', '🍹', '🥃', '🍺', '🍾', '☕', '🫖'
];

// Angles (in degrees) for emoji emitter positions around the table
export const EMITTER_ANGLES = [22, 67, 112, 157, 202, 247, 292, 337];

// Stagger delay between emoji emissions (ms)
export const EMITTER_STAGGER = 300;

// Seat position radius - CRITICAL: must match CSS (42% of container)
export const SEAT_RADIUS_PERCENT = 42;
export const SEAT_RADIUS = 0.42;

// Drag thresholds for detecting tap vs drag
export const DRAG_THRESHOLD = 10; // pixels

// Hit detection radii for drag-drop targeting
export const DEALER_HIT_RADIUS = 50; // pixels - for dealer card assignment
export const GAME_HIT_RADIUS = 60; // pixels - for game turn swaps
