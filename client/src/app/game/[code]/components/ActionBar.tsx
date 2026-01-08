'use client';

import type { Player, CardType } from '@in-vino-morte/shared';
import styles from '../page.module.css';

interface ActionBarProps {
    // Game state
    isDealerSetup: boolean;
    isDealer: boolean;
    isYourTurn: boolean;
    isAlive: boolean;
    hasFacedownCard: boolean;
    gamePhase: string | undefined;
    players: Player[];
    // Dealer setup
    dealerHint: string | null;
    selectedCard: CardType | null;
    isDealerDragging: boolean;
    dragCardType: CardType | null;
    safeCount: number;
    doomCount: number;
    canConfirmDeal: boolean;
    onDealerConfirm: () => void;
    onDealerDragStart: (e: React.PointerEvent, cardType: CardType) => void;
    onDealerDragMove: (e: React.PointerEvent) => void;
    onDealerDragEnd: (e: React.PointerEvent) => void;
    // Game turns
    isGameDragging: boolean;
    onDragStart: (e: React.PointerEvent) => void;
    onDragMove: (e: React.PointerEvent) => void;
    onDragEnd: (e: React.PointerEvent) => void;
    // Caseus Vitae
    cheeseEnabled: boolean;
    hasCheese: boolean;
    validCheeseTargets: Player[];
    actionMode: 'none' | 'swap' | 'steal';
    onActionModeChange: (mode: 'none' | 'swap' | 'steal') => void;
    // Reveal
    dealerSeat: number | undefined;
    turnSeat: number | undefined;
    onStartReveal: () => void;
}

/**
 * Action area at the bottom of the game screen.
 *
 * Contains:
 * - Dealer setup: card picker with drag support
 * - Waiting for dealer message
 * - Draggable card during player's turn
 * - Steal cheese button (Caseus Vitae)
 * - Waiting messages
 * - Reveal button for dealer
 */
export function ActionBar({
    isDealerSetup,
    isDealer,
    isYourTurn,
    isAlive,
    hasFacedownCard,
    gamePhase,
    players,
    dealerHint,
    selectedCard,
    isDealerDragging,
    dragCardType,
    safeCount,
    doomCount,
    canConfirmDeal,
    onDealerConfirm,
    onDealerDragStart,
    onDealerDragMove,
    onDealerDragEnd,
    isGameDragging,
    onDragStart,
    onDragMove,
    onDragEnd,
    cheeseEnabled,
    hasCheese,
    validCheeseTargets,
    actionMode,
    onActionModeChange,
    dealerSeat,
    turnSeat,
    onStartReveal,
}: ActionBarProps) {
    return (
        <div className={styles.actionArea}>
            {/* Dealer Setup: Card picker for dealer */}
            {isDealerSetup && isDealer && (
                <div className={styles.dealerSetup}>
                    <span className={styles.dealerInstruction}>Drag to player, or tap to select</span>
                    <span className={styles.dealerHint}>
                        {dealerHint || '\u00A0'}
                    </span>
                    <div className={styles.cardPicker}>
                        <div
                            className={`${styles.cardOption} ${selectedCard === 'SAFE' || (isDealerDragging && dragCardType === 'SAFE') ? styles.cardSelected : ''} ${isDealerDragging && dragCardType === 'SAFE' ? styles.cardDragging : ''}`}
                            onPointerDown={(e) => onDealerDragStart(e, 'SAFE')}
                            onPointerMove={onDealerDragMove}
                            onPointerUp={onDealerDragEnd}
                            onPointerCancel={onDealerDragEnd}
                            style={{ touchAction: 'none' }}
                        >
                            <span className={styles.cardIcon}>{'\uD83C\uDF77'}</span>
                            <span className={styles.cardLabel}>Wine</span>
                            <span className={styles.cardCount}>{safeCount}</span>
                        </div>
                        <div
                            className={`${styles.cardOption} ${styles.cardDoom} ${selectedCard === 'DOOM' || (isDealerDragging && dragCardType === 'DOOM') ? styles.cardSelected : ''} ${isDealerDragging && dragCardType === 'DOOM' ? styles.cardDragging : ''}`}
                            onPointerDown={(e) => onDealerDragStart(e, 'DOOM')}
                            onPointerMove={onDealerDragMove}
                            onPointerUp={onDealerDragEnd}
                            onPointerCancel={onDealerDragEnd}
                            style={{ touchAction: 'none' }}
                        >
                            <span className={styles.cardIcon}>{'\uD83D\uDC80'}</span>
                            <span className={styles.cardLabel}>Poison</span>
                            <span className={styles.cardCount}>{doomCount}</span>
                        </div>
                    </div>
                    <div className={styles.dealerFooter}>
                        <button
                            className={`${styles.serveButton} ${!canConfirmDeal ? styles.serveDisabled : ''}`}
                            onClick={onDealerConfirm}
                            disabled={!canConfirmDeal}
                        >
                            Serve
                        </button>
                    </div>
                </div>
            )}

            {/* Dealer Setup: Waiting message for non-dealer */}
            {isDealerSetup && !isDealer && (
                <div className={styles.waitingForDealer}>
                    <div className={styles.loadingDots}>
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                    <p className={styles.waitingHint}>The dealer is deciding who gets wine and who gets poison</p>
                </div>
            )}

            {/* Game turns: Draggable card for your turn */}
            {!isDealerSetup && isAlive && isYourTurn && hasFacedownCard && (
                <div className={styles.cardWithHint}>
                    <div
                        className={`${styles.draggableCard} ${isGameDragging ? styles.draggableCardDragging : ''}`}
                        onPointerDown={onDragStart}
                        onPointerMove={onDragMove}
                        onPointerUp={onDragEnd}
                        onPointerCancel={onDragEnd}
                        style={{ touchAction: 'none' }}
                    >
                        <span className={styles.draggableCardIcon}>{'\uD83C\uDFB4'}</span>
                        <span className={styles.draggableCardLabel}>Your Drink</span>
                    </div>
                    <span className={styles.cardHint}>Tap to drink {'\u00B7'} Drag to swap</span>
                </div>
            )}

            {/* Caseus Vitae: Steal cheese button */}
            {!isDealerSetup && isYourTurn && cheeseEnabled && !hasCheese && validCheeseTargets.length > 0 && (
                <button
                    className={`${styles.stealButton} ${actionMode === 'steal' ? styles.stealActive : ''}`}
                    onClick={() => onActionModeChange(actionMode === 'steal' ? 'none' : 'steal')}
                >
                    <span className={styles.actionIcon}>{'\uD83E\uDDC0'}</span>
                    <span className={styles.actionLabel}>Steal</span>
                </button>
            )}

            {/* Waiting message when not your turn (during game) */}
            {!isDealerSetup && isAlive && !isYourTurn && gamePhase !== 'AWAITING_REVEAL' && (
                <div className={styles.waitingMessage}>
                    {gamePhase === 'TURNS' && (
                        <>Waiting for {players.find(p => p.seat === turnSeat)?.name || 'player'}...</>
                    )}
                    {gamePhase === 'ROUND_END' && <>Round ending...</>}
                </div>
            )}

            {/* AWAITING_REVEAL: Dealer reveal button */}
            {gamePhase === 'AWAITING_REVEAL' && isDealer && (
                <div className={styles.revealButtonContainer}>
                    <button
                        className={styles.revealButton}
                        onClick={onStartReveal}
                    >
                        <span className={styles.revealButtonIcon}>{'\uD83C\uDFB4'}</span>
                        <span className={styles.revealButtonLabel}>Reveal Cards</span>
                    </button>
                    <span className={styles.revealHint}>All players have made their choice</span>
                </div>
            )}

            {/* AWAITING_REVEAL: Waiting message for non-dealer */}
            {gamePhase === 'AWAITING_REVEAL' && !isDealer && (
                <div className={styles.waitingMessage}>
                    Waiting for {players.find(p => p.seat === dealerSeat)?.name || 'dealer'} to reveal...
                </div>
            )}
        </div>
    );
}
