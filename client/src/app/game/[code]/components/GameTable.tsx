'use client';

import { forwardRef } from 'react';
import type { Player, RevealInfo, CardType } from '@in-vino-morte/shared';
import { PlayerSeat } from './PlayerSeat';
import { getSeatPosition } from '../utils';
import { EMITTER_ANGLES } from '../constants';
import styles from '../page.module.css';

interface FlyingCard {
    id: string;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
}

interface GameTableProps {
    players: Player[];
    yourSeat: number;
    game: {
        turnSeat: number;
        dealerSeat: number;
        facedownSeats: number[];
        phase: string;
    } | null;
    isDealerSetup: boolean;
    isDealer: boolean;
    isYourTurn: boolean;
    // Swap state
    swapTarget: number | null;
    validSwapTargets: Player[];
    onSwapTargetSelect: (seat: number) => void;
    // Reveal state
    recentlyRevealed: number | null;
    revealData: RevealInfo | null;
    // Animation states
    drinkingAnimation: number | null;
    swappingSeats: number[] | null;
    flyingCards: FlyingCard[];
    // Drag state
    isDragging: boolean;
    dragTarget: number | null;
    // Dealer setup state
    dealerAssignments: Record<number, CardType | null>;
    assignedSeats: Set<number>;
    recentlyAssigned: number | null;
    selectedCard: CardType | null;
    onDealerSeatClick: (seat: number) => void;
    // Emoji emitter (for waiting players)
    emitterEmojis: string[];
    emitterDelays: number[];
    onEmojiAnimationIteration: (slotIndex: number) => void;
}

/**
 * The circular game table with all player seats.
 *
 * Contains:
 * - Center decoration (wine logo or animated emoji emitter)
 * - Flying cards during swap animations
 * - All player seats positioned in a circle
 */
export const GameTable = forwardRef<HTMLDivElement, GameTableProps>(function GameTable({
    players,
    yourSeat,
    game,
    isDealerSetup,
    isDealer,
    isYourTurn,
    swapTarget,
    validSwapTargets,
    onSwapTargetSelect,
    recentlyRevealed,
    revealData,
    drinkingAnimation,
    swappingSeats,
    flyingCards,
    isDragging,
    dragTarget,
    dealerAssignments,
    assignedSeats,
    recentlyAssigned,
    selectedCard,
    onDealerSeatClick,
    emitterEmojis,
    emitterDelays,
    onEmojiAnimationIteration,
}, ref) {
    return (
        <div className={styles.tableContainer}>
            <div className={styles.table} ref={ref}>
                {/* Center decoration - animated emoji emitter for waiting players */}
                {isDealerSetup && !isDealer ? (
                    <div className={styles.tableCenterAnimated}>
                        <div className={styles.emojiEmitter}>
                            {emitterEmojis.map((emoji, i) => (
                                <span
                                    key={i}
                                    className={styles.emittedEmoji}
                                    style={{ '--delay': `${emitterDelays[i]}ms`, '--angle': `${EMITTER_ANGLES[i]}deg` } as React.CSSProperties}
                                    onAnimationIteration={() => onEmojiAnimationIteration(i)}
                                >
                                    {emoji}
                                </span>
                            ))}
                        </div>
                        <div className={styles.centerGlow}></div>
                    </div>
                ) : (
                    <div className={styles.tableCenter}>
                        <span className={styles.tableLogo}>{'\uD83C\uDF77'}</span>
                    </div>
                )}

                {/* Flying cards during swap */}
                {flyingCards.map((card) => (
                    <div
                        key={card.id}
                        className={styles.flyingCard}
                        style={{
                            '--start-x': `${card.startX}px`,
                            '--start-y': `${card.startY}px`,
                            '--end-x': `${card.endX}px`,
                            '--end-y': `${card.endY}px`,
                        } as React.CSSProperties}
                    >
                        {'\uD83C\uDFB4'}
                    </div>
                ))}

                {/* Player seats */}
                {players.map((player) => {
                    const position = getSeatPosition(player.seat, players.length);
                    const isCurrentTurn = game?.turnSeat === player.seat;
                    const isPlayerDealer = game?.dealerSeat === player.seat;
                    const hasFacedown = game?.facedownSeats.includes(player.seat) ?? false;
                    const hasRevealed = player.alive && !hasFacedown && !isDealerSetup && game?.phase !== 'DEALING';
                    const isValidSwapTarget = swapTarget === null && validSwapTargets.some(p => p.seat === player.seat);
                    const isSelected = swapTarget === player.seat;
                    const isRevealing = recentlyRevealed === player.seat;
                    const revealedDoom = isRevealing && revealData?.cardType === 'DOOM';
                    const isDrinking = drinkingAnimation === player.seat;
                    const isSwapping = swappingSeats?.includes(player.seat) ?? false;
                    const isDisconnected = !player.connected;
                    const isCurrentDragTarget = dragTarget === player.seat;
                    const isDragValidTarget = isDragging && isValidSwapTarget;
                    const isDragInvalidTarget = isDragging && !isDealerSetup && player.alive && player.seat !== yourSeat && hasRevealed;

                    // Dealer setup specific states
                    const dealerAssignment = dealerAssignments[player.seat];
                    const hasPreviewAssignment = assignedSeats.has(player.seat);
                    const isJustAssigned = recentlyAssigned === player.seat;
                    const isDealerDragTargetSeat = isDealerSetup && isDealer && isCurrentDragTarget;

                    return (
                        <PlayerSeat
                            key={player.id}
                            player={player}
                            position={position}
                            yourSeat={yourSeat}
                            isCurrentTurn={isCurrentTurn}
                            isPlayerDealer={isPlayerDealer}
                            hasFacedown={hasFacedown}
                            hasRevealed={hasRevealed}
                            isValidSwapTarget={isValidSwapTarget}
                            isSelected={isSelected}
                            isRevealing={isRevealing}
                            revealedDoom={revealedDoom}
                            isDrinking={isDrinking}
                            isSwapping={isSwapping}
                            isDisconnected={isDisconnected}
                            isCurrentDragTarget={isCurrentDragTarget}
                            isDragValidTarget={isDragValidTarget}
                            isDragInvalidTarget={isDragInvalidTarget}
                            isDealerSetup={isDealerSetup}
                            isDealer={isDealer}
                            dealerAssignment={dealerAssignment}
                            hasPreviewAssignment={hasPreviewAssignment}
                            isJustAssigned={isJustAssigned}
                            isDealerDragTargetSeat={isDealerDragTargetSeat}
                            selectedCard={selectedCard}
                            isDragging={isDragging}
                            onClick={() => {
                                if (isDealerSetup && isDealer && player.alive) {
                                    onDealerSeatClick(player.seat);
                                } else if (isYourTurn && isValidSwapTarget) {
                                    onSwapTargetSelect(player.seat);
                                }
                            }}
                        />
                    );
                })}
            </div>
        </div>
    );
});
