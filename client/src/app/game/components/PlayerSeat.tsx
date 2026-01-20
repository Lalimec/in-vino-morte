'use client';

import { useState, useEffect } from 'react';
import type { Player } from '@in-vino-morte/shared';
import { AVATARS } from '../constants';
import styles from '../page.module.css';

interface PlayerSeatProps {
    player: Player;
    position: React.CSSProperties;
    yourSeat: number;
    isCurrentTurn: boolean;
    isPlayerDealer: boolean;
    hasFacedown: boolean;
    hasRevealed: boolean;
    isValidSwapTarget: boolean;
    isSelected: boolean;
    isRevealing: boolean;
    revealedDoom: boolean;
    isDrinking: boolean;
    isSwapping: boolean;
    isDisconnected: boolean;
    isCurrentDragTarget: boolean;
    isDragValidTarget: boolean;
    isDragInvalidTarget: boolean;
    isDealerSetup: boolean;
    isDealer: boolean;
    dealerAssignment: 'SAFE' | 'DOOM' | null | undefined;
    hasPreviewAssignment: boolean;
    isJustAssigned: boolean;
    isDealerDragTargetSeat: boolean;
    selectedCard: 'SAFE' | 'DOOM' | null;
    isDragging: boolean;
    deadlineTs: number | null;
    onClick: () => void;
}

/**
 * Individual player seat on the game table.
 *
 * Handles all visual states:
 * - Active turn, dead, selected, revealing, drinking, swapping
 * - Dealer setup states (assignments, previews)
 * - Drag-drop target highlighting
 */
export function PlayerSeat({
    player,
    position,
    yourSeat,
    isCurrentTurn,
    isPlayerDealer,
    hasFacedown,
    hasRevealed,
    isValidSwapTarget,
    isSelected,
    isRevealing,
    revealedDoom,
    isDrinking,
    isSwapping,
    isDisconnected,
    isCurrentDragTarget,
    isDragValidTarget,
    isDragInvalidTarget,
    isDealerSetup,
    isDealer,
    dealerAssignment,
    hasPreviewAssignment,
    isJustAssigned,
    isDealerDragTargetSeat,
    selectedCard,
    isDragging,
    deadlineTs,
    onClick,
}: PlayerSeatProps) {
    // Countdown timer state
    const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

    useEffect(() => {
        if (!deadlineTs) {
            setSecondsLeft(null);
            return;
        }

        const updateTimer = () => {
            const remaining = Math.max(0, Math.ceil((deadlineTs - Date.now()) / 1000));
            setSecondsLeft(remaining);
        };

        updateTimer();
        const interval = setInterval(updateTimer, 100);

        return () => clearInterval(interval);
    }, [deadlineTs]);

    const seatClasses = `
        ${styles.seat}
        ${player.seat === yourSeat ? styles.seatYou : ''}
        ${isCurrentTurn ? styles.seatActive : ''}
        ${!player.alive ? styles.seatDead : ''}
        ${isSelected ? styles.seatSelected : ''}
        ${isRevealing ? styles.seatRevealing : ''}
        ${revealedDoom ? styles.seatRevealDoom : ''}
        ${isDrinking ? styles.seatDrinking : ''}
        ${isSwapping ? styles.seatSwapping : ''}
        ${isDisconnected ? styles.seatDisconnected : ''}
        ${isCurrentDragTarget && !isDealerSetup ? styles.seatDragTarget : ''}
        ${isDragValidTarget ? styles.seatDragValid : ''}
        ${isDragInvalidTarget ? styles.seatDragInvalid : ''}
        ${hasRevealed ? styles.seatRevealed : ''}
        ${isDealerSetup && isDealer && dealerAssignment ? styles.seatAssigned : ''}
        ${isDealerSetup && isDealer && selectedCard ? styles.seatDropTarget : ''}
        ${isDealerDragTargetSeat ? styles.seatDragOver : ''}
        ${isDealerSetup && isPlayerDealer ? styles.seatDealerHighlight : ''}
        ${isJustAssigned ? styles.seatJustAssigned : ''}
    `;

    return (
        <div
            className={seatClasses}
            style={position}
            onClick={onClick}
        >
            <div className={`${styles.avatar} ${isCurrentTurn ? styles.avatarPulse : ''} ${isDealerSetup && isPlayerDealer ? styles.avatarDealer : ''}`}>
                {AVATARS[player.avatarId] || '\uD83C\uDF77'}
                {isPlayerDealer && <span className={styles.dealerBadge}>{'\uD83D\uDC51'}</span>}
                {player.hasCheese && <span className={styles.cheeseBadge}>{'\uD83E\uDDC0'}</span>}
                {isDisconnected && <span className={styles.disconnectedBadge}>{'\u26A1'}</span>}
                {/* Turn timer countdown */}
                {secondsLeft !== null && secondsLeft >= 0 && (
                    <span className={`${styles.timerBadge} ${secondsLeft <= 5 ? styles.timerUrgent : ''} ${secondsLeft <= 3 ? styles.timerCritical : ''}`}>
                        {secondsLeft}
                    </span>
                )}
            </div>
            <span className={styles.seatName}>
                {isDisconnected ? '...' : player.seat === yourSeat ? 'You' : player.name.substring(0, 8)}
            </span>

            {/* Dealer assignment indicator (dealer view) */}
            {isDealerSetup && isDealer && dealerAssignment && (
                <div className={`${styles.assignedCard} ${dealerAssignment === 'DOOM' ? styles.assignedDoom : styles.assignedSafe}`}>
                    {dealerAssignment === 'DOOM' ? '\uD83D\uDC80' : '\uD83C\uDF77'}
                </div>
            )}

            {/* Preview assignment indicator (non-dealer view) */}
            {isDealerSetup && !isDealer && hasPreviewAssignment && (
                <div className={styles.assignmentBadge}>
                    {'\uD83C\uDF77'}
                </div>
            )}

            {/* Card indicator (during game) */}
            {!isDealerSetup && player.alive && (
                <div className={`${styles.cardSlot} ${hasFacedown ? styles.cardFacedown : styles.cardRevealed}`}>
                    {hasFacedown ? '\uD83C\uDFB4' : '\u2713'}
                </div>
            )}
        </div>
    );
}
