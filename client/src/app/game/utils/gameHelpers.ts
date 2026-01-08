/**
 * Game helper utilities - pure functions for game logic.
 */

import type { Player, GamePhase } from '@in-vino-morte/shared';

/**
 * Shuffle an array using Fisher-Yates algorithm.
 * Returns a new shuffled array (does not mutate original).
 */
export function shuffleArray<T>(arr: T[]): T[] {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

/**
 * Get valid swap targets for a player during their turn.
 * Valid targets are alive players (not self) who still have facedown cards.
 */
export function getValidSwapTargets(
    players: Player[],
    yourSeat: number,
    facedownSeats: number[]
): Player[] {
    return players.filter(p =>
        p.alive &&
        p.seat !== yourSeat &&
        facedownSeats.includes(p.seat)
    );
}

/**
 * Get valid cheese steal targets for Caseus Vitae variant.
 * Valid targets are alive players (not self) who have cheese.
 */
export function getValidCheeseTargets(
    players: Player[],
    yourSeat: number,
    cheeseEnabled: boolean,
    hasCheese: boolean
): Player[] {
    // Can't steal cheese if disabled, or if you already have it
    if (!cheeseEnabled || hasCheese) return [];

    return players.filter(p =>
        p.alive &&
        p.seat !== yourSeat &&
        p.hasCheese
    );
}

/**
 * Get the phase label to display in the UI header.
 */
export function getPhaseLabel(
    phase: GamePhase | undefined,
    isDealer: boolean,
    isYourTurn: boolean,
    dealerSeat: number | undefined,
    turnSeat: number | undefined,
    players: Player[]
): string {
    switch (phase) {
        case 'DEALER_SETUP': {
            if (isDealer) return '👑 You Deal';
            const dealer = players.find(p => p.seat === dealerSeat);
            return `👑 ${dealer?.name || 'Dealer'}`;
        }
        case 'DEALING':
            return 'Dealing Cards...';
        case 'TURNS': {
            if (isYourTurn) return 'Your Turn!';
            const turnPlayer = players.find(p => p.seat === turnSeat);
            return `${turnPlayer?.name}'s Turn`;
        }
        case 'AWAITING_REVEAL':
            return isDealer ? '👑 Reveal Time!' : 'Waiting for Reveal...';
        case 'FINAL_REVEAL':
            return 'Revealing...';
        case 'ROUND_END':
            return 'Round Over';
        case 'GAME_END':
            return 'Game Over';
        default:
            return '';
    }
}

/**
 * Get hint text for dealer during card assignment.
 * Returns null when no hint is needed (all requirements met).
 */
export function getDealerHint(
    hasAtLeastOneSafe: boolean,
    hasAtLeastOneDoom: boolean,
    allAssigned: boolean
): string | null {
    if (!hasAtLeastOneSafe && !hasAtLeastOneDoom) return 'Need 1+ Wine AND 1+ Poison';
    if (hasAtLeastOneSafe && !hasAtLeastOneDoom) return 'Need at least 1 Poison 💀';
    if (!hasAtLeastOneSafe && hasAtLeastOneDoom) return 'Need at least 1 Wine 🍷';
    if (hasAtLeastOneSafe && hasAtLeastOneDoom && !allAssigned) return 'Assign all players';
    return null;
}
