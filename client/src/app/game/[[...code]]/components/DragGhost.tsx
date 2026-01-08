'use client';

import type { Player } from '@in-vino-morte/shared';
import styles from '../page.module.css';

interface DragGhostProps {
    isDragging: boolean;
    dragPosition: { x: number; y: number } | null;
    dragTarget: number | null;
    dragCardType: 'SAFE' | 'DOOM' | null;
    isDealerSetup: boolean;
    players: Player[];
}

/**
 * Floating card ghost that follows the pointer during drag operations.
 * Shows target player name when hovering over a valid drop target.
 *
 * Used during both:
 * - Dealer setup (assigning SAFE/DOOM cards)
 * - Game turns (swapping cards with another player)
 */
export function DragGhost({
    isDragging,
    dragPosition,
    dragTarget,
    dragCardType,
    isDealerSetup,
    players,
}: DragGhostProps) {
    if (!isDragging || !dragPosition) return null;

    const targetPlayer = players.find(p => p.seat === dragTarget);

    return (
        <div
            className={`${styles.dragGhost} ${dragTarget !== null ? styles.dragGhostValid : ''} ${dragCardType === 'DOOM' ? styles.dragGhostDoom : ''}`}
            style={{
                left: dragPosition.x,
                top: dragPosition.y,
            }}
        >
            <span className={styles.dragGhostIcon}>
                {isDealerSetup ? (dragCardType === 'DOOM' ? '💀' : '🍷') : '🎴'}
            </span>
            <span className={styles.dragGhostCardLabel}>
                {isDealerSetup ? (dragCardType === 'DOOM' ? 'Poison' : 'Wine') : 'Your Drink'}
            </span>
            {dragTarget !== null && (
                <span className={styles.dragGhostLabel}>
                    → {targetPlayer?.name}
                </span>
            )}
        </div>
    );
}
