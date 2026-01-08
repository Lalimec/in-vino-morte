'use client';

import { useEffect, useCallback, useState, use, useRef } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import { useGameStore } from '@/stores/gameStore';
import { getWsClient, resetWsClient } from '@/lib/ws';
import { audioManager } from '@/lib/audio';
import { hapticManager } from '@/lib/haptics';
import DealerSetup from '@/components/DealerSetup';
import WaitingForDealer from '@/components/WaitingForDealer';
import WineBackground from '@/components/WineBackground';
import { FINAL_REVEAL } from '@in-vino-morte/shared';

// Flying card state for animation
interface FlyingCard {
    id: string;
    fromSeat: number;
    toSeat: number;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
}

// Avatars - wine glass excluded (used for game cards)
const AVATARS = ['🍸', '🥂', '🍹', '🍺', '🥃', '🧉', '☕', '🍵', '🫖', '🍾', '🍻', '🥤', '🧃', '🫗', '🍶'];

export default function GamePage({ params }: { params: Promise<{ code: string }> }) {
    use(params); // Consume params promise
    const router = useRouter();
    const [showReveal, setShowReveal] = useState(false);
    const [revealData, setRevealData] = useState<{ seat: number; cardType: 'SAFE' | 'DOOM' } | null>(null);
    const [recentlyRevealed, setRecentlyRevealed] = useState<number | null>(null);
    const [revealPhase, setRevealPhase] = useState<'idle' | 'building' | 'showing'>('idle');
    const isProcessingRevealRef = useRef(false); // Use ref to avoid React batching issues
    const [swapTarget, setSwapTarget] = useState<number | null>(null);
    const [, setStealCheeseTarget] = useState<number | null>(null);
    const [timeLeft, setTimeLeft] = useState<number | null>(null);
    const [actionMode, setActionMode] = useState<'none' | 'swap' | 'steal'>('none');
    const [showExitModal, setShowExitModal] = useState(false);
    const [drinkingAnimation, setDrinkingAnimation] = useState<number | null>(null);
    const [swappingSeats, setSwappingSeats] = useState<[number, number] | null>(null);
    const [flyingCards, setFlyingCards] = useState<FlyingCard[]>([]);
    const tableRef = useRef<HTMLDivElement>(null);

    // Drag-and-drop state
    const [isDragging, setIsDragging] = useState(false);
    const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
    const [dragTarget, setDragTarget] = useState<number | null>(null);
    const dragStartRef = useRef<{ x: number; y: number } | null>(null);
    const isDraggedRef = useRef(false);

    const {
        players,
        game,
        yourSeat,
        yourPlayerId,
        isConnected,
        soundEnabled,
        motionEnabled,
        pendingReveals,
        consumeReveal,
        pendingSwaps,
        consumeSwap,
        votingPhase,
        votedSeats,
        requiredVotes,
    } = useGameStore();

    const isYourTurn = game?.turnSeat === yourSeat && game?.phase === 'TURNS';
    const yourPlayer = players.find(p => p.seat === yourSeat);
    const isAlive = yourPlayer?.alive ?? true;
    const hasFacedownCard = game?.facedownSeats.includes(yourSeat) ?? false;
    const hasCheese = yourPlayer?.hasCheese ?? false;
    const cheeseEnabled = useGameStore.getState().settings?.cheeseEnabled ?? false;
    const isDealer = game?.dealerSeat === yourSeat;
    const isDealerSetup = game?.phase === 'DEALER_SETUP';

    // Handle dealer card assignment confirmation
    const handleDealerConfirm = useCallback((assignments: Record<number, 'SAFE' | 'DOOM'>) => {
        // Convert assignments object to ordered array based on seat order
        const sortedSeats = Object.keys(assignments).map(Number).sort((a, b) => a - b);
        const composition = sortedSeats.map(seat => assignments[seat]);
        getWsClient().dealerSet(composition);
    }, []);

    // Initialize audio on first interaction
    useEffect(() => {
        audioManager.init();
        audioManager.setEnabled(soundEnabled);
        hapticManager.setEnabled(motionEnabled);
    }, [soundEnabled, motionEnabled]);

    // Process reveal queue with dramatic suspense animation
    useEffect(() => {
        // Only process if: there are reveals waiting and we're not already processing
        if (pendingReveals.length > 0 && !isProcessingRevealRef.current) {
            // Lock immediately using ref (sync, no batching issues)
            isProcessingRevealRef.current = true;

            const reveal = consumeReveal();
            if (reveal) {
                const isFinalReveal = game?.phase === 'FINAL_REVEAL';

                // Phase 1: Build-up animation (card grows with anticipation)
                setRevealData(reveal);
                setRecentlyRevealed(reveal.seat);
                setRevealPhase('building');
                setShowReveal(true);

                // Play anticipation sound
                if (soundEnabled && isFinalReveal) {
                    audioManager.play('flip'); // Suspense sound
                }
                if (motionEnabled) {
                    hapticManager.light(); // Light vibration for anticipation
                }

                // Phase 2: After build-up, show the actual result
                const buildUpDuration = isFinalReveal ? FINAL_REVEAL.BUILD_UP_MS : 400;
                setTimeout(() => {
                    setRevealPhase('showing');

                    // Play result sound
                    if (soundEnabled) {
                        audioManager.play(reveal.cardType === 'DOOM' ? 'doom' : 'safe');
                    }
                    if (motionEnabled) {
                        if (reveal.cardType === 'DOOM') {
                            hapticManager.doom();
                        } else {
                            hapticManager.success();
                        }
                    }

                    // Phase 3: Hold the result, then dismiss
                    const holdDuration = isFinalReveal ? FINAL_REVEAL.HOLD_RESULT_MS : 1500;
                    setTimeout(() => {
                        setShowReveal(false);
                        setRevealPhase('idle');
                        setRevealData(null);

                        // Gap before next reveal
                        const gapBeforeNext = isFinalReveal ? FINAL_REVEAL.GAP_BEFORE_NEXT_MS : 300;
                        setTimeout(() => {
                            setRecentlyRevealed(null);
                            // Unlock for next reveal
                            isProcessingRevealRef.current = false;
                        }, gapBeforeNext);
                    }, holdDuration);
                }, buildUpDuration);
            } else {
                // No reveal found, unlock
                isProcessingRevealRef.current = false;
            }
        }
    }, [pendingReveals, consumeReveal, soundEnabled, motionEnabled, game?.phase]);

    // Process swap queue - flying card animation
    useEffect(() => {
        if (pendingSwaps.length > 0 && flyingCards.length === 0) {
            const swap = consumeSwap();
            if (swap && tableRef.current) {
                const tableRect = tableRef.current.getBoundingClientRect();
                const totalSeats = players.length;

                // Calculate seat positions (matching getSeatPosition logic)
                const getPixelPosition = (seat: number) => {
                    const angle = (seat / totalSeats) * 2 * Math.PI - Math.PI / 2;
                    const radius = 0.42; // 42% of container
                    return {
                        x: tableRect.width * (0.5 + radius * Math.cos(angle)),
                        y: tableRect.height * (0.5 + radius * Math.sin(angle)),
                    };
                };

                const fromPos = getPixelPosition(swap.fromSeat);
                const toPos = getPixelPosition(swap.toSeat);

                // Create two flying cards that cross paths
                const newFlyingCards: FlyingCard[] = [
                    {
                        id: `card-from-${Date.now()}`,
                        fromSeat: swap.fromSeat,
                        toSeat: swap.toSeat,
                        startX: fromPos.x,
                        startY: fromPos.y,
                        endX: toPos.x,
                        endY: toPos.y,
                    },
                    {
                        id: `card-to-${Date.now()}`,
                        fromSeat: swap.toSeat,
                        toSeat: swap.fromSeat,
                        startX: toPos.x,
                        startY: toPos.y,
                        endX: fromPos.x,
                        endY: fromPos.y,
                    },
                ];

                setFlyingCards(newFlyingCards);
                setSwappingSeats([swap.fromSeat, swap.toSeat]);

                if (soundEnabled) audioManager.play('swap');
                if (motionEnabled) hapticManager.light();

                // Clear flying cards after animation completes
                setTimeout(() => {
                    setFlyingCards([]);
                    setSwappingSeats(null);
                }, 800); // Match CSS animation duration
            }
        }
    }, [pendingSwaps, flyingCards.length, consumeSwap, players.length, soundEnabled, motionEnabled]);

    // Timer countdown - DISABLED for now
    // useEffect(() => {
    //     if (!game?.deadlineTs) {
    //         setTimeLeft(null);
    //         return;
    //     }
    //
    //     const updateTimer = () => {
    //         const remaining = Math.max(0, Math.ceil((game.deadlineTs! - Date.now()) / 1000));
    //         setTimeLeft(remaining);
    //     };
    //
    //     updateTimer();
    //     const interval = setInterval(updateTimer, 100);
    //
    //     return () => clearInterval(interval);
    // }, [game?.deadlineTs]);

    // Redirect if not connected or not in game
    useEffect(() => {
        if (!isConnected) {
            // Try reconnecting
            const ws = getWsClient();
            const store = useGameStore.getState();
            if (store.token && store.playerName) {
                ws.connect().then(() => {
                    ws.join(store.token!, store.playerName, store.avatarId);
                }).catch(() => {
                    router.push('/');
                });
            } else {
                router.push('/');
            }
        }
    }, [isConnected, router]);

    // Handle drink action
    const handleDrink = useCallback(() => {
        if (!isYourTurn || !isAlive) return;

        // Show drinking animation
        setDrinkingAnimation(yourSeat);

        if (soundEnabled) audioManager.play('flip');
        if (motionEnabled) hapticManager.medium();

        // Small delay for animation before sending action
        setTimeout(() => {
            getWsClient().drink();
            setTimeout(() => setDrinkingAnimation(null), 500);
        }, 300);
    }, [isYourTurn, isAlive, yourSeat, soundEnabled, motionEnabled]);

    // Handle swap action - flying card animation is handled by server swap broadcast
    const handleSwap = useCallback((targetSeat: number) => {
        if (!isYourTurn || !isAlive) return;

        // Send action immediately - server will broadcast swap event
        // which triggers the flying card animation for all clients
        getWsClient().swap(targetSeat);
        setSwapTarget(null);
        setActionMode('none');
    }, [isYourTurn, isAlive]);

    // Drag-and-drop handlers for drink card
    const DRAG_THRESHOLD = 10; // pixels - must move this far to count as drag

    const handleDragStart = useCallback((e: React.PointerEvent) => {
        if (!isYourTurn || !isAlive || !hasFacedownCard) return;

        const clientX = e.clientX;
        const clientY = e.clientY;

        dragStartRef.current = { x: clientX, y: clientY };
        isDraggedRef.current = false;
        setDragPosition({ x: clientX, y: clientY });

        // Capture pointer for tracking outside element
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }, [isYourTurn, isAlive, hasFacedownCard]);

    const handleDragMove = useCallback((e: React.PointerEvent) => {
        if (!dragStartRef.current || !isYourTurn) return;

        const clientX = e.clientX;
        const clientY = e.clientY;

        // Check if we've moved past the drag threshold
        const dx = clientX - dragStartRef.current.x;
        const dy = clientY - dragStartRef.current.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > DRAG_THRESHOLD) {
            isDraggedRef.current = true;
            setIsDragging(true);
        }

        if (isDraggedRef.current) {
            setDragPosition({ x: clientX, y: clientY });

            // Check if dragging over a valid target seat
            if (tableRef.current) {
                const tableRect = tableRef.current.getBoundingClientRect();
                const totalSeats = players.length;
                let foundTarget: number | null = null;

                // Check each seat position
                for (const player of players) {
                    if (player.seat === yourSeat || !player.alive) continue;
                    if (!game?.facedownSeats.includes(player.seat)) continue;

                    // Calculate seat position
                    const angle = (player.seat / totalSeats) * 2 * Math.PI - Math.PI / 2;
                    const radius = 0.42;
                    const seatX = tableRect.left + tableRect.width * (0.5 + radius * Math.cos(angle));
                    const seatY = tableRect.top + tableRect.height * (0.5 + radius * Math.sin(angle));

                    // Check if within hit radius (60px)
                    const hitDistance = Math.sqrt(
                        Math.pow(clientX - seatX, 2) + Math.pow(clientY - seatY, 2)
                    );

                    if (hitDistance < 60) {
                        foundTarget = player.seat;
                        break;
                    }
                }

                setDragTarget(foundTarget);
            }
        }
    }, [isYourTurn, players, yourSeat, game?.facedownSeats]);

    const handleDragEnd = useCallback((e: React.PointerEvent) => {
        // Release pointer capture
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);

        if (isDraggedRef.current && dragTarget !== null) {
            // Dropped on a valid target - trigger swap
            handleSwap(dragTarget);
            if (motionEnabled) hapticManager.medium();
        } else if (!isDraggedRef.current && dragStartRef.current) {
            // Was a tap/click - trigger drink
            handleDrink();
        }

        // Reset drag state
        dragStartRef.current = null;
        isDraggedRef.current = false;
        setIsDragging(false);
        setDragPosition(null);
        setDragTarget(null);
    }, [dragTarget, handleSwap, handleDrink, motionEnabled]);

    // Caseus Vitae: Handle steal cheese action
    const handleStealCheese = useCallback((targetSeat: number) => {
        if (!isYourTurn || !isAlive || hasCheese) return;

        if (soundEnabled) audioManager.play('swap');
        if (motionEnabled) hapticManager.medium();

        getWsClient().stealCheese(targetSeat);
        setStealCheeseTarget(null);
        setActionMode('none');
    }, [isYourTurn, isAlive, hasCheese, soundEnabled, motionEnabled]);

    // Handle exit game
    const handleExit = useCallback(() => {
        resetWsClient();
        useGameStore.getState().reset();
        router.push('/');
    }, [router]);

    // Handle vote for rematch
    const handleVoteRematch = useCallback(() => {
        const hasVoted = votedSeats.includes(yourSeat);
        getWsClient().voteRematch(!hasVoted);
        if (soundEnabled) audioManager.play('flip');
        if (motionEnabled) hapticManager.light();
    }, [votedSeats, yourSeat, soundEnabled, motionEnabled]);

    // Handle leave room during voting
    const handleLeaveRoom = useCallback(() => {
        getWsClient().leaveRoom();
        resetWsClient();
        useGameStore.getState().reset();
        router.push('/');
    }, [router]);

    // Get position for seat around circular table
    const getSeatPosition = (seat: number, totalSeats: number) => {
        const angle = (seat / totalSeats) * 2 * Math.PI - Math.PI / 2; // Start from top
        const radius = 42; // % of container
        return {
            left: `${50 + radius * Math.cos(angle)}%`,
            top: `${50 + radius * Math.sin(angle)}%`,
        };
    };

    const getPhaseLabel = () => {
        switch (game?.phase) {
            case 'DEALING': return 'Dealing Cards...';
            case 'TURNS': return isYourTurn ? 'Your Turn!' : `${players.find(p => p.seat === game.turnSeat)?.name}'s Turn`;
            case 'FINAL_REVEAL': return 'Revealing...';
            case 'ROUND_END': return 'Round Over';
            case 'GAME_END': return 'Game Over';
            default: return '';
        }
    };

    const getValidSwapTargets = () => {
        if (!game) return [];
        return players.filter(p =>
            p.alive &&
            p.seat !== yourSeat &&
            game.facedownSeats.includes(p.seat)
        );
    };

    // Caseus Vitae: Get valid cheese steal targets
    const getValidCheeseTargets = () => {
        if (!game || !cheeseEnabled || hasCheese) return [];
        return players.filter(p =>
            p.alive &&
            p.seat !== yourSeat &&
            p.hasCheese
        );
    };

    // Render dealer setup screen (DEALER assigns cards)
    if (isDealerSetup) {
        if (isDealer) {
            // Show dealer card assignment UI
            return (
                <WineBackground>
                    <main className={styles.main}>
                        <button
                            className={styles.exitButton}
                            onClick={() => setShowExitModal(true)}
                            title="Leave game"
                        >
                            ✕
                        </button>
                        <DealerSetup
                            players={players}
                            yourSeat={yourSeat}
                            onConfirm={handleDealerConfirm}
                        />
                        {showExitModal && (
                            <div className={styles.exitModal}>
                                <div className={styles.exitModalContent}>
                                    <h2>Leave Game?</h2>
                                    <p>You will be removed from this game and returned to the main menu.</p>
                                    <div className={styles.exitModalButtons}>
                                        <button onClick={() => setShowExitModal(false)}>Stay</button>
                                        <button onClick={handleExit}>Leave</button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </main>
                </WineBackground>
            );
        } else {
            // Show waiting screen for non-dealers with animated table
            return (
                <WineBackground>
                    <main className={styles.main}>
                        <button
                            className={styles.exitButton}
                            onClick={() => setShowExitModal(true)}
                            title="Leave game"
                        >
                            ✕
                        </button>
                        <WaitingForDealer
                            players={players}
                            yourSeat={yourSeat}
                            dealerSeat={game?.dealerSeat ?? 0}
                        />
                        {showExitModal && (
                            <div className={styles.exitModal}>
                                <div className={styles.exitModalContent}>
                                    <h2>Leave Game?</h2>
                                    <p>You will be removed from this game and returned to the main menu.</p>
                                    <div className={styles.exitModalButtons}>
                                        <button onClick={() => setShowExitModal(false)}>Stay</button>
                                        <button onClick={handleExit}>Leave</button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </main>
                </WineBackground>
            );
        }
    }

    // Render game over screen with voting
    if (game?.phase === 'GAME_END') {
        const winner = players.find(p => p.seat === game.aliveSeats[0]);
        const isWinner = winner?.id === yourPlayerId;
        const hasVoted = votedSeats.includes(yourSeat);
        const isVoting = votingPhase === 'VOTING';
        const isStarting = votingPhase === 'STARTING';

        return (
            <WineBackground>
                <main className={styles.main}>
                    <div className={`${styles.gameOverlay} ${isWinner ? styles.winnerOverlay : ''}`}>
                        <div className={styles.gameOverContent}>
                            {isWinner ? (
                                <>
                                    <div className={styles.winnerIcon}>🏆</div>
                                    <h1 className={styles.winnerTitle}>You Win!</h1>
                                </>
                            ) : (
                                <>
                                    <div className={styles.winnerIcon}>{AVATARS[winner?.avatarId ?? 0]}</div>
                                    <h1 className={styles.gameOverTitle}>{winner?.name} Wins!</h1>
                                </>
                            )}

                            {/* Voting UI */}
                            {isVoting && (
                                <div className={styles.votingSection}>
                                    <div className={styles.voteStatus}>
                                        <span className={styles.voteCount}>
                                            {votedSeats.length} / {requiredVotes} voted to play again
                                        </span>
                                    </div>

                                    {/* Show who voted */}
                                    <div className={styles.voterList}>
                                        {players.filter(p => p.connected).map(player => {
                                            const playerVoted = votedSeats.includes(player.seat);
                                            return (
                                                <div
                                                    key={player.id}
                                                    className={`${styles.voterItem} ${playerVoted ? styles.voterVoted : ''}`}
                                                >
                                                    <span className={styles.voterAvatar}>{AVATARS[player.avatarId]}</span>
                                                    <span className={styles.voterName}>{player.name}</span>
                                                    {playerVoted && <span className={styles.voterCheck}>✓</span>}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Vote buttons */}
                                    <div className={styles.voteButtons}>
                                        <button
                                            className={`${styles.voteButton} ${hasVoted ? styles.voteButtonActive : ''}`}
                                            onClick={handleVoteRematch}
                                        >
                                            {hasVoted ? '✓ Voted!' : 'Play Again'}
                                        </button>
                                        <button
                                            className={styles.leaveButton}
                                            onClick={handleLeaveRoom}
                                        >
                                            Leave
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Starting message */}
                            {isStarting && (
                                <div className={styles.startingMessage}>
                                    <p>Everyone voted! Starting new game...</p>
                                </div>
                            )}

                            {/* Fallback if no voting phase yet */}
                            {!isVoting && !isStarting && (
                                <>
                                    <p className={styles.waitingText}>
                                        Waiting for vote...
                                    </p>
                                    <button className={styles.menuButton} onClick={handleExit}>
                                        Return to Menu
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </main>
            </WineBackground>
        );
    }

    return (
        <WineBackground>
            <main className={styles.main}>
                {/* Exit Button */}
            <button
                className={styles.exitButton}
                onClick={() => setShowExitModal(true)}
                title="Leave game"
            >
                ✕
            </button>

            {/* Phase Banner */}
            <header className={styles.header}>
                <div className={styles.phaseBanner}>
                    <span className={styles.phaseLabel}>{getPhaseLabel()}</span>
                    {/* Timer disabled for now
                    {timeLeft !== null && game?.phase === 'TURNS' && (
                        <div className={styles.timerRing}>
                            <svg viewBox="0 0 100 100">
                                <circle
                                    className={styles.timerTrack}
                                    cx="50"
                                    cy="50"
                                    r="45"
                                />
                                <circle
                                    className={styles.timerProgress}
                                    cx="50"
                                    cy="50"
                                    r="45"
                                    style={{
                                        strokeDasharray: 283,
                                        strokeDashoffset: 283 * (1 - timeLeft / 8),
                                    }}
                                />
                            </svg>
                            <span className={styles.timerText}>{timeLeft}</span>
                        </div>
                    )}
                    */}
                </div>
            </header>

            {/* Game Table */}
            <div className={styles.tableContainer}>
                <div className={styles.table} ref={tableRef}>
                    {/* Center decoration */}
                    <div className={styles.tableCenter}>
                        <span className={styles.tableLogo}>🍷</span>
                    </div>

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
                            🎴
                        </div>
                    ))}

                    {/* Player seats */}
                    {players.map((player) => {
                        const position = getSeatPosition(player.seat, players.length);
                        const isCurrentTurn = game?.turnSeat === player.seat;
                        const isDealer = game?.dealerSeat === player.seat;
                        const hasFacedown = game?.facedownSeats.includes(player.seat);
                        const isValidSwapTarget = swapTarget === null && getValidSwapTargets().some(p => p.seat === player.seat);
                        const isSelected = swapTarget === player.seat;
                        const isRevealing = recentlyRevealed === player.seat;
                        const revealedDoom = isRevealing && revealData?.cardType === 'DOOM';
                        const isDrinking = drinkingAnimation === player.seat;
                        const isSwapping = swappingSeats?.includes(player.seat) ?? false;
                        const isDisconnected = !player.connected;
                        const isDragTarget = dragTarget === player.seat;
                        const isDragValidTarget = isDragging && isValidSwapTarget;

                        return (
                            <div
                                key={player.id}
                                className={`
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
                  ${isDragTarget ? styles.seatDragTarget : ''}
                  ${isDragValidTarget ? styles.seatDragValid : ''}
                `}
                                style={position}
                                onClick={() => {
                                    if (isYourTurn && isValidSwapTarget) {
                                        setSwapTarget(player.seat);
                                    }
                                }}
                            >
                                <div className={`${styles.avatar} ${isCurrentTurn ? styles.avatarPulse : ''}`}>
                                    {AVATARS[player.avatarId] || '🍷'}
                                    {isDealer && <span className={styles.dealerBadge}>👑</span>}
                                    {player.hasCheese && <span className={styles.cheeseBadge}>🧀</span>}
                                    {isDisconnected && <span className={styles.disconnectedBadge}>⚡</span>}
                                </div>
                                <span className={styles.seatName}>
                                    {isDisconnected ? '...' : player.seat === yourSeat ? `${player.name} (You)` : player.name}
                                </span>

                                {/* Card indicator */}
                                {player.alive && (
                                    <div className={`${styles.cardSlot} ${hasFacedown ? styles.cardFacedown : styles.cardRevealed}`}>
                                        {hasFacedown ? '🎴' : ''}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Action Area - drink/swap card and buttons */}
            {isAlive && (
                <div className={styles.actionArea}>
                    {/* Your turn - show draggable card */}
                    {isYourTurn && hasFacedownCard && (
                        <div className={styles.cardWithHint}>
                            <div
                                className={`${styles.draggableCard} ${isDragging ? styles.draggableCardDragging : ''}`}
                                onPointerDown={handleDragStart}
                                onPointerMove={handleDragMove}
                                onPointerUp={handleDragEnd}
                                onPointerCancel={handleDragEnd}
                                style={{ touchAction: 'none' }}
                            >
                                <span className={styles.draggableCardIcon}>🎴</span>
                                <span className={styles.draggableCardLabel}>Your Drink</span>
                            </div>
                            <span className={styles.cardHint}>Tap to drink · Drag to swap</span>
                        </div>
                    )}

                    {/* Caseus Vitae: Steal cheese button */}
                    {isYourTurn && cheeseEnabled && !hasCheese && getValidCheeseTargets().length > 0 && (
                        <button
                            className={`${styles.stealButton} ${actionMode === 'steal' ? styles.stealActive : ''}`}
                            onClick={() => setActionMode(actionMode === 'steal' ? 'none' : 'steal')}
                        >
                            <span className={styles.actionIcon}>🧀</span>
                            <span className={styles.actionLabel}>Steal</span>
                        </button>
                    )}

                    {/* Waiting message when not your turn */}
                    {!isYourTurn && (
                        <div className={styles.waitingMessage}>
                            {game?.phase === 'TURNS' && (
                                <>Waiting for {players.find(p => p.seat === game?.turnSeat)?.name || 'player'}...</>
                            )}
                            {game?.phase === 'ROUND_END' && <>Round ending...</>}
                            {game?.phase === 'GAME_END' && <>Game Over</>}
                        </div>
                    )}
                </div>
            )}

            {/* Caseus Vitae: Steal Cheese Target Selection */}
            {actionMode === 'steal' && (
                <div className={styles.targetSelection}>
                    <p>Select a player to steal cheese from:</p>
                    <div className={styles.targetList}>
                        {getValidCheeseTargets().map(player => (
                            <button
                                key={player.id}
                                className={styles.targetButton}
                                onClick={() => handleStealCheese(player.seat)}
                            >
                                {AVATARS[player.avatarId]} {player.name} 🧀
                            </button>
                        ))}
                    </div>
                    <button className={styles.cancelButton} onClick={() => setActionMode('none')}>
                        Cancel
                    </button>
                </div>
            )}

            {/* Drag ghost - follows pointer when dragging (full card with wobbly physics) */}
            {isDragging && dragPosition && (
                <div
                    className={`${styles.dragGhost} ${dragTarget !== null ? styles.dragGhostValid : ''}`}
                    style={{
                        left: dragPosition.x,
                        top: dragPosition.y,
                    }}
                >
                    <span className={styles.dragGhostIcon}>🎴</span>
                    <span className={styles.dragGhostCardLabel}>Your Card</span>
                    {dragTarget !== null && (
                        <span className={styles.dragGhostLabel}>
                            → {players.find(p => p.seat === dragTarget)?.name}
                        </span>
                    )}
                </div>
            )}

            {/* Reveal Overlay - Two phase animation */}
            {showReveal && revealData && (() => {
                const revealedPlayer = players.find(p => p.seat === revealData.seat);
                const isBuilding = revealPhase === 'building';
                const isShowing = revealPhase === 'showing';

                return (
                    <div className={`${styles.revealOverlay} ${isShowing ? (revealData.cardType === 'DOOM' ? styles.revealDoom : styles.revealSafe) : styles.revealBuilding}`}>
                        <div className={`${styles.revealCard} ${isBuilding ? styles.revealCardBuilding : styles.revealCardShowing}`}>
                            <div className={styles.revealPlayerAvatar}>
                                {AVATARS[revealedPlayer?.avatarId ?? 0]}
                            </div>
                            <div className={styles.revealPlayerName}>
                                {revealedPlayer?.name}
                            </div>
                            {/* Building phase: Show facedown card flipping */}
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
            })()}

            {/* Dead overlay */}
            {!isAlive && (
                <div className={styles.deadOverlay}>
                    <div className={styles.deadContent}>
                        <span className={styles.deadIcon}>💀</span>
                        <h2>You were eliminated!</h2>
                        <p>Spectating...</p>
                    </div>
                </div>
            )}

            {/* Exit Confirmation Modal */}
            {showExitModal && (
                <div className={styles.exitModal}>
                    <div className={styles.exitModalContent}>
                        <h2>Leave Game?</h2>
                        <p>You will be removed from this game and returned to the main menu.</p>
                        <div className={styles.exitModalButtons}>
                            <button onClick={() => setShowExitModal(false)}>
                                Stay
                            </button>
                            <button onClick={handleExit}>
                                Leave
                            </button>
                        </div>
                    </div>
                </div>
            )}
            </main>
        </WineBackground>
    );
}
