'use client';

import { useEffect, useCallback, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import { useGameStore } from '@/stores/gameStore';
import { getWsClient, resetWsClient } from '@/lib/ws';
import { audioManager } from '@/lib/audio';
import { hapticManager } from '@/lib/haptics';
import WineBackground from '@/components/WineBackground';
import { DRINK } from '@in-vino-morte/shared';

// Import extracted hooks
import { useRevealSequence } from './hooks/useRevealSequence';
import { useSwapAnimation } from './hooks/useSwapAnimation';
import { useDealerRoulette } from './hooks/useDealerRoulette';
import { useDealerSetup } from './hooks/useDealerSetup';
import { useGameDragDrop } from './hooks/useGameDragDrop';

// Import extracted components
import {
    DragGhost,
    RevealOverlay,
    DealerRoulette,
    DealerAnnouncement,
    DeadOverlay,
    ExitModal,
    GameOver,
    GameTable,
    ActionBar,
    StealCheeseTargets,
} from './components';

// Import extracted utilities and constants
import { EMITTER_EMOJIS, EMITTER_ANGLES, EMITTER_STAGGER } from './constants';
import { getValidSwapTargets, getValidCheeseTargets, shuffleArray, getPhaseLabel, getDealerHint } from './utils';

export default function GameClient() {
    const router = useRouter();
    const tableRef = useRef<HTMLDivElement>(null);

    // Local UI state
    const [swapTarget, setSwapTarget] = useState<number | null>(null);
    const [actionMode, setActionMode] = useState<'none' | 'swap' | 'steal'>('none');
    const [showExitModal, setShowExitModal] = useState(false);
    const [drinkingAnimation, setDrinkingAnimation] = useState<number | null>(null);

    // Emoji emitter state
    const [emitterEmojis, setEmitterEmojis] = useState<string[]>(() =>
        EMITTER_ANGLES.map(() => EMITTER_EMOJIS[Math.floor(Math.random() * EMITTER_EMOJIS.length)])
    );
    const [emitterDelays] = useState<number[]>(() =>
        shuffleArray([0, 1, 2, 3, 4, 5, 6, 7].map(i => i * EMITTER_STAGGER))
    );

    // Game store state
    const {
        players,
        game,
        yourSeat,
        yourPlayerId,
        isConnected,
        roomStatus,
        joinCode,
        soundEnabled,
        motionEnabled,
        votingPhase,
        votedSeats,
        requiredVotes,
    } = useGameStore();

    // Computed values
    const isYourTurn = game?.turnSeat === yourSeat && game?.phase === 'TURNS';
    const yourPlayer = players.find(p => p.seat === yourSeat);
    const isAlive = yourPlayer?.alive ?? true;
    const hasFacedownCard = game?.facedownSeats.includes(yourSeat) ?? false;
    const hasCheese = yourPlayer?.hasCheese ?? false;
    const cheeseEnabled = useGameStore.getState().settings?.cheeseEnabled ?? false;
    const isDealer = game?.dealerSeat === yourSeat;
    const isDealerSetup = game?.phase === 'DEALER_SETUP';

    // Use extracted hooks
    const { showReveal, revealData, revealPhase, recentlyRevealed } = useRevealSequence({ soundEnabled, motionEnabled });
    const { flyingCards, swappingSeats } = useSwapAnimation({ tableRef, totalSeats: players.length, soundEnabled, motionEnabled });
    const { showDealerRoulette, rouletteIndex, roulettePhase, showDealerAnnouncement, alivePlayers: rouletteAlivePlayers } = useDealerRoulette({ isDealerSetup, isDealer, dealerSeat: game?.dealerSeat, players, soundEnabled, motionEnabled });

    const {
        dealerAssignments, selectedCard, assignedSeats, recentlyAssigned,
        isDragging: isDealerDragging, dragPosition: dealerDragPosition, dragTarget: dealerDragTarget, dragCardType,
        safeCount, doomCount, allAssigned, hasAtLeastOneSafe, hasAtLeastOneDoom, canConfirmDeal,
        handleDealerConfirm, handleDealerSeatClick, handleDealerDragStart, handleDealerDragMove, handleDealerDragEnd,
    } = useDealerSetup({ isDealerSetup, isDealer, players, tableRef });

    // Handle drink action
    const handleDrink = useCallback(() => {
        if (!isYourTurn || !isAlive) return;
        setDrinkingAnimation(yourSeat);
        if (soundEnabled) audioManager.play('flip');
        if (motionEnabled) hapticManager.medium();
        setTimeout(() => {
            getWsClient().drink();
            setTimeout(() => setDrinkingAnimation(null), DRINK.ANIMATION_CLEAR_MS);
        }, DRINK.ANIMATION_DELAY_MS);
    }, [isYourTurn, isAlive, yourSeat, soundEnabled, motionEnabled]);

    // Handle swap action
    const handleSwap = useCallback((targetSeat: number) => {
        if (!isYourTurn || !isAlive) return;
        getWsClient().swap(targetSeat);
        setSwapTarget(null);
        setActionMode('none');
    }, [isYourTurn, isAlive]);

    // Use game drag-drop hook
    const {
        isDragging: isGameDragging, dragPosition: gameDragPosition, dragTarget: gameDragTarget,
        handleDragStart, handleDragMove, handleDragEnd,
    } = useGameDragDrop({ isYourTurn, isAlive, hasFacedownCard, yourSeat, players, facedownSeats: game?.facedownSeats ?? [], tableRef, motionEnabled, onDrink: handleDrink, onSwap: handleSwap });

    // Combined drag state
    const isDragging = isDealerDragging || isGameDragging;
    const dragPosition = isDealerDragging ? dealerDragPosition : gameDragPosition;
    const dragTarget = isDealerDragging ? dealerDragTarget : gameDragTarget;

    // Initialize audio
    useEffect(() => {
        audioManager.init();
        audioManager.setEnabled(soundEnabled);
        hapticManager.setEnabled(motionEnabled);
    }, [soundEnabled, motionEnabled]);

    // Handle animation iteration for emoji emitter
    const handleEmojiAnimationIteration = useCallback((slotIndex: number) => {
        setEmitterEmojis(prev => {
            const next = [...prev];
            next[slotIndex] = EMITTER_EMOJIS[Math.floor(Math.random() * EMITTER_EMOJIS.length)];
            return next;
        });
    }, []);

    // Caseus Vitae: Handle steal cheese action
    const handleStealCheese = useCallback((targetSeat: number) => {
        if (!isYourTurn || !isAlive || hasCheese) return;
        if (soundEnabled) audioManager.play('swap');
        if (motionEnabled) hapticManager.medium();
        getWsClient().stealCheese(targetSeat);
        setActionMode('none');
    }, [isYourTurn, isAlive, hasCheese, soundEnabled, motionEnabled]);

    // Navigation handlers
    const handleExit = useCallback(() => {
        resetWsClient();
        useGameStore.getState().reset();
        router.push('/');
    }, [router]);

    const handleStartReveal = useCallback(() => {
        if (!isDealer || game?.phase !== 'AWAITING_REVEAL') return;
        getWsClient().startReveal();
        if (soundEnabled) audioManager.play('flip');
        if (motionEnabled) hapticManager.medium();
    }, [isDealer, game?.phase, soundEnabled, motionEnabled]);

    const handleVoteRematch = useCallback(() => {
        const hasVoted = votedSeats.includes(yourSeat);
        getWsClient().voteRematch(!hasVoted);
        if (soundEnabled) audioManager.play('flip');
        if (motionEnabled) hapticManager.light();
    }, [votedSeats, yourSeat, soundEnabled, motionEnabled]);

    const handleLeaveRoom = useCallback(() => {
        getWsClient().leaveRoom();
        resetWsClient();
        useGameStore.getState().reset();
        router.push('/');
    }, [router]);

    // Redirect effects
    useEffect(() => {
        if (!isConnected) {
            const timer = setTimeout(() => useGameStore.getState().reset(), 100);
            if (roomStatus !== 'IN_GAME') router.push('/');
            return () => clearTimeout(timer);
        }
    }, [isConnected, router, roomStatus]);

    useEffect(() => {
        if (roomStatus === 'LOBBY') router.push('/lobby');
    }, [roomStatus, router]);

    // Computed helper values
    const validSwapTargets = getValidSwapTargets(players, yourSeat, game?.facedownSeats ?? []);
    const validCheeseTargets = getValidCheeseTargets(players, yourSeat, cheeseEnabled, hasCheese);
    const phaseLabel = getPhaseLabel(game?.phase, isDealer, isYourTurn, game?.dealerSeat, game?.turnSeat, players);
    const dealerHint = getDealerHint(hasAtLeastOneSafe, hasAtLeastOneDoom, allAssigned);

    // Game Over screen
    if (game?.phase === 'GAME_END') {
        const winner = players.find(p => p.seat === game.aliveSeats[0]);
        const isWinner = winner?.id === yourPlayerId;
        return (
            <WineBackground>
                <main className={styles.main}>
                    <GameOver winner={winner} isWinner={isWinner} votingPhase={votingPhase} votedSeats={votedSeats} requiredVotes={requiredVotes} yourSeat={yourSeat} players={players} onVoteRematch={handleVoteRematch} onLeaveRoom={handleLeaveRoom} onExit={handleExit} />
                </main>
            </WineBackground>
        );
    }

    return (
        <WineBackground>
            <main className={styles.main}>
                {/* Exit Button */}
                <button className={styles.exitButton} onClick={() => setShowExitModal(true)} title="Leave game">{'\u2715'}</button>

                {/* Phase Banner */}
                <header className={styles.header}>
                    <div className={styles.phaseBanner}>
                        <span className={styles.phaseLabel}>{phaseLabel}</span>
                        {isDealerSetup && !isDealer && <span className={styles.phaseSubtitle}>is preparing the drinks...</span>}
                    </div>
                </header>

                {/* Game Table */}
                <GameTable
                    ref={tableRef}
                    players={players}
                    yourSeat={yourSeat}
                    game={game}
                    isDealerSetup={isDealerSetup}
                    isDealer={isDealer}
                    isYourTurn={isYourTurn}
                    swapTarget={swapTarget}
                    validSwapTargets={validSwapTargets}
                    onSwapTargetSelect={setSwapTarget}
                    recentlyRevealed={recentlyRevealed}
                    revealData={revealData}
                    drinkingAnimation={drinkingAnimation}
                    swappingSeats={swappingSeats}
                    flyingCards={flyingCards}
                    isDragging={isDragging}
                    dragTarget={dragTarget}
                    dealerAssignments={dealerAssignments}
                    assignedSeats={assignedSeats}
                    recentlyAssigned={recentlyAssigned}
                    selectedCard={selectedCard}
                    onDealerSeatClick={handleDealerSeatClick}
                    emitterEmojis={emitterEmojis}
                    emitterDelays={emitterDelays}
                    onEmojiAnimationIteration={handleEmojiAnimationIteration}
                />

                {/* Bottom glows */}
                {isDealerSetup && isDealer && <div className={styles.dealerBottomGlow} />}
                {!isAlive && <div className={styles.deadBottomGlow} />}

                {/* Action Area */}
                <ActionBar
                    isDealerSetup={isDealerSetup}
                    isDealer={isDealer}
                    isYourTurn={isYourTurn}
                    isAlive={isAlive}
                    hasFacedownCard={hasFacedownCard}
                    gamePhase={game?.phase}
                    players={players}
                    dealerHint={dealerHint}
                    selectedCard={selectedCard}
                    isDealerDragging={isDealerDragging}
                    dragCardType={dragCardType}
                    safeCount={safeCount}
                    doomCount={doomCount}
                    canConfirmDeal={canConfirmDeal}
                    onDealerConfirm={handleDealerConfirm}
                    onDealerDragStart={handleDealerDragStart}
                    onDealerDragMove={handleDealerDragMove}
                    onDealerDragEnd={handleDealerDragEnd}
                    isGameDragging={isGameDragging}
                    onDragStart={handleDragStart}
                    onDragMove={handleDragMove}
                    onDragEnd={handleDragEnd}
                    cheeseEnabled={cheeseEnabled}
                    hasCheese={hasCheese}
                    validCheeseTargets={validCheeseTargets}
                    actionMode={actionMode}
                    onActionModeChange={setActionMode}
                    dealerSeat={game?.dealerSeat}
                    turnSeat={game?.turnSeat}
                    onStartReveal={handleStartReveal}
                />

                {/* Steal Cheese Target Selection */}
                {actionMode === 'steal' && (
                    <StealCheeseTargets
                        validCheeseTargets={validCheeseTargets}
                        onStealCheese={handleStealCheese}
                        onCancel={() => setActionMode('none')}
                    />
                )}

                {/* Overlays */}
                <DragGhost isDragging={isDragging} dragPosition={dragPosition} dragTarget={dragTarget} dragCardType={dragCardType} isDealerSetup={isDealerSetup} players={players} />
                <RevealOverlay showReveal={showReveal} revealData={revealData} revealPhase={revealPhase} players={players} />
                <DealerRoulette showDealerRoulette={showDealerRoulette} rouletteIndex={rouletteIndex} roulettePhase={roulettePhase} alivePlayers={rouletteAlivePlayers} />
                <DealerAnnouncement showDealerAnnouncement={showDealerAnnouncement} />
                <DeadOverlay isAlive={isAlive} />
                <ExitModal showExitModal={showExitModal} onClose={() => setShowExitModal(false)} onExit={handleExit} />
            </main>
        </WineBackground>
    );
}
