'use client';

import type { Player } from '@in-vino-morte/shared';
import type { RevealData, RevealPhase } from '../hooks/useRevealSequence';
import { AVATARS } from '../constants';
import styles from '../page.module.css';

interface RevealOverlayProps {
    showReveal: boolean;
    revealData: RevealData | null;
    revealPhase: RevealPhase;
    players: Player[];
}

/**
 * Full-screen overlay for the three-phase reveal animation.
 *
 * Phases:
 * 1. Focusing (400ms) - Player info flies to center spotlight
 * 2. Building (1000ms) - Card shakes with escalating intensity
 * 3. Showing (1200ms) - Card flips to reveal result (SAFE or DOOM)
 */
export function RevealOverlay({
    showReveal,
    revealData,
    revealPhase,
    players,
}: RevealOverlayProps) {
    if (!showReveal || !revealData) return null;

    const revealedPlayer = players.find(p => p.seat === revealData.seat);
    const isFocusing = revealPhase === 'focusing';
    const isBuilding = revealPhase === 'building';
    const isShowing = revealPhase === 'showing';

    return (
        <div className={`${styles.revealOverlay} ${isFocusing ? styles.revealFocusing : ''} ${isShowing ? (revealData.cardType === 'DOOM' ? styles.revealDoom : styles.revealSafe) : styles.revealBuilding}`}>
            <div className={`${styles.revealCard} ${isFocusing ? styles.revealCardFocusing : ''} ${isBuilding ? styles.revealCardBuilding : ''} ${isShowing ? styles.revealCardShowing : ''}`}>
                <div className={`${styles.revealPlayerAvatar} ${isFocusing ? styles.revealAvatarFocusing : ''}`}>
                    {AVATARS[revealedPlayer?.avatarId ?? 0]}
                </div>
                <div className={`${styles.revealPlayerName} ${isFocusing ? styles.revealNameFocusing : ''}`}>
                    {revealedPlayer?.name}
                </div>

                {/* Focusing phase: Just player info, building anticipation */}
                {isFocusing && (
                    <div className={styles.revealFocusHint}>
                        ???
                    </div>
                )}

                {/* Building phase: Show facedown card shaking */}
                {isBuilding && (
                    <div className={styles.revealIconBuilding}>
                        🎴
                    </div>
                )}

                {/* Showing phase: Show the actual result */}
                {isShowing && (
                    <>
                        <div className={styles.revealIcon}>
                            {revealData.cardType === 'DOOM' ? '💀' : '🍷'}
                        </div>
                        <div className={styles.revealType}>
                            {revealData.cardType === 'DOOM' ? 'POISONED!' : 'SAFE!'}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
