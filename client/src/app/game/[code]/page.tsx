'use client';

import { useEffect, useCallback, useState, use, useRef } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import { useGameStore } from '@/stores/gameStore';
import { getWsClient, resetWsClient } from '@/lib/ws';
import { audioManager } from '@/lib/audio';
import { hapticManager } from '@/lib/haptics';
import WineBackground from '@/components/WineBackground';
import { REVEAL, DRINK } from '@in-vino-morte/shared';

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
    const [revealPhase, setRevealPhase] = useState<'idle' | 'focusing' | 'building' | 'showing'>('idle');
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

    // Dealer setup state
    const [dealerAssignments, setDealerAssignments] = useState<Record<number, 'SAFE' | 'DOOM' | null>>({});
    const [selectedCard, setSelectedCard] = useState<'SAFE' | 'DOOM' | null>(null);
    const [assignedSeats, setAssignedSeats] = useState<Set<number>>(new Set()); // For non-dealer preview
    const [recentlyAssigned, setRecentlyAssigned] = useState<number | null>(null);
    const [showDealerAnnouncement, setShowDealerAnnouncement] = useState(false);

    // Dealer selection roulette animation state
    const [showDealerRoulette, setShowDealerRoulette] = useState(false);
    const [rouletteIndex, setRouletteIndex] = useState(0);
    const [roulettePhase, setRoulettePhase] = useState<'spinning' | 'slowing' | 'landed' | 'idle'>('idle');
    const lastAnimatedDealerSeatRef = useRef<number | null>(null); // Track which dealer we already animated for

    // Emoji emitter constants
    const EMITTER_EMOJIS = ['🍷', '💀', '✨', '🍷', '💀', '✨', '🍷', '💀', '✨', '🍷', '💀', '✨', '🍸', '🧀', '🥂', '🍹', '🥃', '🍺', '🍾', '☕', '🫖'];
    const EMITTER_ANGLES = [22, 67, 112, 157, 202, 247, 292, 337];
    const EMITTER_STAGGER = 300; // Stagger between emissions

    // Shuffle array helper
    const shuffleArray = <T,>(arr: T[]): T[] => {
        const shuffled = [...arr];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    };

    // Each slot has its own emoji that changes only when its animation restarts
    const [emitterEmojis, setEmitterEmojis] = useState<string[]>(() =>
        EMITTER_ANGLES.map(() => EMITTER_EMOJIS[Math.floor(Math.random() * EMITTER_EMOJIS.length)])
    );

    // Randomized delay order so emissions don't spiral
    const [emitterDelays] = useState<number[]>(() =>
        shuffleArray([0, 1, 2, 3, 4, 5, 6, 7].map(i => i * EMITTER_STAGGER))
    );

    // Drag-and-drop state (used for both dealer setup and game turns)
    const [isDragging, setIsDragging] = useState(false);
    const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
    const [dragTarget, setDragTarget] = useState<number | null>(null);
    const [dragCardType, setDragCardType] = useState<'SAFE' | 'DOOM' | null>(null); // For dealer setup
    const dragStartRef = useRef<{ x: number; y: number } | null>(null);
    const isDraggedRef = useRef(false);

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
        pendingReveals,
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

    // Dealer setup computed values
    const alivePlayers = players.filter(p => p.alive);
    const dealerAssignedSeats = Object.entries(dealerAssignments).filter(([, v]) => v !== null);
    const safeCount = dealerAssignedSeats.filter(([, v]) => v === 'SAFE').length;
    const doomCount = dealerAssignedSeats.filter(([, v]) => v === 'DOOM').length;
    const allAssigned = dealerAssignedSeats.length === alivePlayers.length;
    const hasAtLeastOneSafe = safeCount >= 1;
    const hasAtLeastOneDoom = doomCount >= 1;
    const canConfirmDeal = allAssigned && hasAtLeastOneSafe && hasAtLeastOneDoom;

    // Handle dealer card assignment confirmation
    const handleDealerConfirm = useCallback(() => {
        if (!canConfirmDeal) return;

        const finalAssignments: Record<number, 'SAFE' | 'DOOM'> = {};
        for (const [seatStr, cardType] of Object.entries(dealerAssignments)) {
            if (cardType) {
                finalAssignments[parseInt(seatStr)] = cardType;
            }
        }

        const sortedSeats = Object.keys(finalAssignments).map(Number).sort((a, b) => a - b);
        const composition = sortedSeats.map(seat => finalAssignments[seat]);
        getWsClient().dealerSet(composition);
    }, [canConfirmDeal, dealerAssignments]);

    // Handle seat click during dealer setup
    const handleDealerSeatClick = useCallback((seat: number) => {
        if (!isDealerSetup || !isDealer) return;

        if (selectedCard) {
            setDealerAssignments(prev => ({ ...prev, [seat]: selectedCard }));
            getWsClient().dealerPreview(seat, selectedCard);
        } else if (dealerAssignments[seat]) {
            setDealerAssignments(prev => ({ ...prev, [seat]: null }));
            getWsClient().dealerPreview(seat, null);
        }
    }, [isDealerSetup, isDealer, selectedCard, dealerAssignments]);

    // Dealer card drag handlers
    const handleDealerDragStart = useCallback((e: React.PointerEvent, cardType: 'SAFE' | 'DOOM') => {
        dragStartRef.current = { x: e.clientX, y: e.clientY };
        isDraggedRef.current = false;
        setDragCardType(cardType);
        setDragPosition({ x: e.clientX, y: e.clientY });
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }, []);

    const handleDealerDragMove = useCallback((e: React.PointerEvent) => {
        if (!dragStartRef.current || !dragCardType) return;

        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > DRAG_THRESHOLD) {
            isDraggedRef.current = true;
            setIsDragging(true);
        }

        if (isDraggedRef.current) {
            setDragPosition({ x: e.clientX, y: e.clientY });

            if (tableRef.current) {
                const tableRect = tableRef.current.getBoundingClientRect();
                const total = alivePlayers.length;
                let foundTarget: number | null = null;

                for (let i = 0; i < alivePlayers.length; i++) {
                    const player = alivePlayers[i];
                    const angle = (player.seat / players.length) * 2 * Math.PI - Math.PI / 2;
                    const radius = 0.42;
                    const seatX = tableRect.left + tableRect.width * (0.5 + radius * Math.cos(angle));
                    const seatY = tableRect.top + tableRect.height * (0.5 + radius * Math.sin(angle));

                    const hitDistance = Math.sqrt(
                        Math.pow(e.clientX - seatX, 2) + Math.pow(e.clientY - seatY, 2)
                    );

                    if (hitDistance < 50) {
                        foundTarget = player.seat;
                        break;
                    }
                }

                setDragTarget(foundTarget);
            }
        }
    }, [dragCardType, alivePlayers, players.length]);

    const handleDealerDragEnd = useCallback((e: React.PointerEvent) => {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);

        if (isDraggedRef.current && dragTarget !== null && dragCardType) {
            setDealerAssignments(prev => ({ ...prev, [dragTarget]: dragCardType }));
            getWsClient().dealerPreview(dragTarget, dragCardType);
        } else if (!isDraggedRef.current && dragCardType) {
            setSelectedCard(prev => prev === dragCardType ? null : dragCardType);
        }

        dragStartRef.current = null;
        isDraggedRef.current = false;
        setIsDragging(false);
        setDragPosition(null);
        setDragTarget(null);
        setDragCardType(null);
    }, [dragTarget, dragCardType]);

    // Initialize audio on first interaction
    useEffect(() => {
        audioManager.init();
        audioManager.setEnabled(soundEnabled);
        hapticManager.setEnabled(motionEnabled);
    }, [soundEnabled, motionEnabled]);

    // Initialize dealer assignments when entering dealer setup phase
    useEffect(() => {
        if (isDealerSetup && isDealer) {
            const initial: Record<number, null> = {};
            players.filter(p => p.alive).forEach(p => {
                initial[p.seat] = null;
            });
            setDealerAssignments(initial);
            setSelectedCard(null);
        }
    }, [isDealerSetup, isDealer, players]);

    // Clear assignedSeats when entering dealer setup (for non-dealers) - prevents stuck icons from previous rounds
    useEffect(() => {
        if (isDealerSetup && !isDealer) {
            setAssignedSeats(new Set());
        }
    }, [isDealerSetup, isDealer]);

    // Reset roulette tracking when leaving dealer setup (so it can trigger again next round)
    useEffect(() => {
        if (!isDealerSetup) {
            lastAnimatedDealerSeatRef.current = null;
            setRoulettePhase('idle');
            setShowDealerRoulette(false);
        }
    }, [isDealerSetup]);

    // Handle animation iteration - change emoji exactly when CSS animation restarts
    const handleEmojiAnimationIteration = useCallback((slotIndex: number) => {
        setEmitterEmojis(prev => {
            const next = [...prev];
            next[slotIndex] = EMITTER_EMOJIS[Math.floor(Math.random() * EMITTER_EMOJIS.length)];
            return next;
        });
    }, []);

    // Dealer selection roulette animation - runs imperatively, not in useEffect cleanup
    useEffect(() => {
        // Only trigger when we have a NEW dealer to animate
        if (!isDealerSetup || players.length === 0 || game?.dealerSeat === undefined) return;
        if (lastAnimatedDealerSeatRef.current === game.dealerSeat) return; // Already animated this dealer

        const alivePlayers = players.filter(p => p.alive);
        if (alivePlayers.length === 0) return;

        // Mark that we're animating this dealer
        lastAnimatedDealerSeatRef.current = game.dealerSeat;

        // Find the target dealer index in alive players
        const dealerIndex = alivePlayers.findIndex(p => p.seat === game.dealerSeat);
        const targetIndex = dealerIndex >= 0 ? dealerIndex : 0;

        // Calculate total spins needed
        const totalSpins = alivePlayers.length * 3 + targetIndex; // 3 full cycles + land on target

        // Start the animation
        setShowDealerRoulette(true);
        setRoulettePhase('spinning');
        setRouletteIndex(0);

        if (soundEnabled) audioManager.play('flip');
        if (motionEnabled) hapticManager.light();

        // Run animation with recursive setTimeout
        let spinCount = 0;

        const runSpin = () => {
            // Check if we should stop (component state changed)
            if (lastAnimatedDealerSeatRef.current !== game.dealerSeat) return;

            spinCount++;
            const currentIndex = spinCount % alivePlayers.length;
            setRouletteIndex(currentIndex);

            if (soundEnabled && spinCount % 2 === 0) audioManager.play('flip');

            // Calculate progress and delay
            const progress = spinCount / totalSpins;
            let delay: number;

            if (progress < 0.6) {
                delay = 60; // Fast
            } else if (progress < 0.85) {
                setRoulettePhase('slowing');
                delay = 60 + (progress - 0.6) * 400;
            } else {
                delay = 200 + (progress - 0.85) * 800;
            }

            if (spinCount < totalSpins) {
                setTimeout(runSpin, delay);
            } else {
                // Landed!
                setRouletteIndex(targetIndex);
                setRoulettePhase('landed');

                if (soundEnabled) audioManager.play('flip');
                if (motionEnabled) hapticManager.medium();

                // Hold, then hide
                setTimeout(() => {
                    if (lastAnimatedDealerSeatRef.current !== game.dealerSeat) return;
                    setShowDealerRoulette(false);

                    if (isDealer) {
                        setShowDealerAnnouncement(true);
                        if (motionEnabled) hapticManager.medium();
                        setTimeout(() => setShowDealerAnnouncement(false), 1500);
                    }
                }, 1200);
            }
        };

        // Start after brief delay
        setTimeout(runSpin, 300);

        // No cleanup - animation manages itself via ref check
    }, [isDealerSetup, players, game?.dealerSeat, isDealer, soundEnabled, motionEnabled]);

    // Listen for dealer preview events (for non-dealers)
    useEffect(() => {
        if (!isDealerSetup || isDealer) return;

        const ws = getWsClient();

        const handlePreview = (data: Record<string, unknown>) => {
            const seat = data.seat as number;
            const assigned = data.assigned as boolean;

            setAssignedSeats(prev => {
                const newSet = new Set(prev);
                if (assigned) {
                    newSet.add(seat);
                } else {
                    newSet.delete(seat);
                }
                return newSet;
            });

            if (assigned) {
                setRecentlyAssigned(seat);
                setTimeout(() => setRecentlyAssigned(null), 500);
            }
        };

        ws.on('dealerPreview', handlePreview);

        return () => {
            ws.off('dealerPreview', handlePreview);
        };
    }, [isDealerSetup, isDealer]);

    // Process reveal queue - immediately chains reveals without React render gaps
    // Uses ref to hold process function so we can call it recursively from setTimeout
    const processRevealRef = useRef<(() => void) | undefined>(undefined);

    // Update the process function when dependencies change
    useEffect(() => {
        processRevealRef.current = () => {
            // Access store directly to avoid React batching delays
            const store = useGameStore.getState();
            if (store.pendingReveals.length === 0 || isProcessingRevealRef.current) return;

            isProcessingRevealRef.current = true;
            const reveal = store.consumeReveal();

            if (reveal) {
                // Phase 1: Player focuses to center - spotlight on who's being revealed
                setRevealData(reveal);
                setRecentlyRevealed(reveal.seat);
                setRevealPhase('focusing');
                setShowReveal(true);

                if (soundEnabled) audioManager.play('flip');
                if (motionEnabled) hapticManager.light();

                // Phase 2: After focus, start the suspenseful shake
                setTimeout(() => {
                    setRevealPhase('building');

                    // Phase 3: After shake completes, flip to reveal
                    setTimeout(() => {
                        setRevealPhase('showing');

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

                        // Hold the result, then check for next
                        setTimeout(() => {
                            setShowReveal(false);
                            setRevealPhase('idle');
                            setRevealData(null);
                            setRecentlyRevealed(null);

                            // Update elimination state after animation
                            if (reveal.cardType === 'DOOM') {
                                useGameStore.getState().consumeElimination();
                            }

                            // Unlock
                            isProcessingRevealRef.current = false;

                            // CRITICAL: Immediately process next reveal - bypass React render cycle!
                            // This eliminates the variable gap between reveals
                            processRevealRef.current?.();
                        }, REVEAL.HOLD_RESULT_MS);
                    }, REVEAL.SHAKE_DURATION_MS);
                }, REVEAL.FOCUS_DURATION_MS);
            } else {
                isProcessingRevealRef.current = false;
            }
        };
    }, [soundEnabled, motionEnabled]);

    // Trigger reveal processing when new reveals arrive (initial kick-off)
    useEffect(() => {
        if (pendingReveals.length > 0 && !isProcessingRevealRef.current) {
            processRevealRef.current?.();
        }
    }, [pendingReveals]);

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

    // Redirect back to lobby when game ends and rematch is starting
    useEffect(() => {
        if (roomStatus === 'LOBBY' && joinCode) {
            router.push(`/lobby/${joinCode}`);
        }
    }, [roomStatus, joinCode, router]);

    // Handle drink action
    const handleDrink = useCallback(() => {
        if (!isYourTurn || !isAlive) return;

        // Show drinking animation
        setDrinkingAnimation(yourSeat);

        if (soundEnabled) audioManager.play('flip');
        if (motionEnabled) hapticManager.medium();

        // Small delay for animation before sending action (uses DRINK constants from shared)
        setTimeout(() => {
            getWsClient().drink();
            setTimeout(() => setDrinkingAnimation(null), DRINK.ANIMATION_CLEAR_MS);
        }, DRINK.ANIMATION_DELAY_MS);
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

    // Handle dealer triggering reveal sequence
    const handleStartReveal = useCallback(() => {
        if (!isDealer || game?.phase !== 'AWAITING_REVEAL') return;
        getWsClient().startReveal();
        if (soundEnabled) audioManager.play('flip');
        if (motionEnabled) hapticManager.medium();
    }, [isDealer, game?.phase, soundEnabled, motionEnabled]);

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
            case 'DEALER_SETUP': {
                if (isDealer) return '👑 You Deal';
                const dealer = players.find(p => p.seat === game?.dealerSeat);
                return `👑 ${dealer?.name || 'Dealer'}`;
            }
            case 'DEALING': return 'Dealing Cards...';
            case 'TURNS': return isYourTurn ? 'Your Turn!' : `${players.find(p => p.seat === game.turnSeat)?.name}'s Turn`;
            case 'AWAITING_REVEAL': return isDealer ? '👑 Reveal Time!' : 'Waiting for Reveal...';
            case 'FINAL_REVEAL': return 'Revealing...';
            case 'ROUND_END': return 'Round Over';
            case 'GAME_END': return 'Game Over';
            default: return '';
        }
    };

    // Get dealer setup hint text
    const getDealerHint = () => {
        if (!hasAtLeastOneSafe && !hasAtLeastOneDoom) return 'Need 1+ Wine AND 1+ Poison';
        if (hasAtLeastOneSafe && !hasAtLeastOneDoom) return 'Need at least 1 Poison 💀';
        if (!hasAtLeastOneSafe && hasAtLeastOneDoom) return 'Need at least 1 Wine 🍷';
        if (hasAtLeastOneSafe && hasAtLeastOneDoom && !allAssigned) return 'Assign all players';
        return null;
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
                        {isDealerSetup && !isDealer && (
                            <span className={styles.phaseSubtitle}>is preparing the drinks...</span>
                        )}
                    </div>
                </header>

                {/* Game Table */}
                <div className={styles.tableContainer}>
                    <div className={styles.table} ref={tableRef}>
                        {/* Center decoration - animated emoji emitter for waiting players */}
                        {isDealerSetup && !isDealer ? (
                            <div className={styles.tableCenterAnimated}>
                                <div className={styles.emojiEmitter}>
                                    {/* 8 fixed angles with cycling random emojis and randomized delays */}
                                    {emitterEmojis.map((emoji, i) => (
                                        <span
                                            key={i}
                                            className={styles.emittedEmoji}
                                            style={{ '--delay': `${emitterDelays[i]}ms`, '--angle': `${EMITTER_ANGLES[i]}deg` } as React.CSSProperties}
                                            onAnimationIteration={() => handleEmojiAnimationIteration(i)}
                                        >
                                            {emoji}
                                        </span>
                                    ))}
                                </div>
                                <div className={styles.centerGlow}></div>
                            </div>
                        ) : (
                            <div className={styles.tableCenter}>
                                <span className={styles.tableLogo}>🍷</span>
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
                                🎴
                            </div>
                        ))}

                        {/* Player seats */}
                        {players.map((player) => {
                            const position = getSeatPosition(player.seat, players.length);
                            const isCurrentTurn = game?.turnSeat === player.seat;
                            const isPlayerDealer = game?.dealerSeat === player.seat;
                            const hasFacedown = game?.facedownSeats.includes(player.seat);
                            // Player has revealed their card (drank) but is still alive
                            const hasRevealed = player.alive && !hasFacedown && !isDealerSetup && game?.phase !== 'DEALING';
                            const isValidSwapTarget = swapTarget === null && getValidSwapTargets().some(p => p.seat === player.seat);
                            const isSelected = swapTarget === player.seat;
                            const isRevealing = recentlyRevealed === player.seat;
                            const revealedDoom = isRevealing && revealData?.cardType === 'DOOM';
                            const isDrinking = drinkingAnimation === player.seat;
                            const isSwapping = swappingSeats?.includes(player.seat) ?? false;
                            const isDisconnected = !player.connected;
                            const isCurrentDragTarget = dragTarget === player.seat;
                            const isDragValidTarget = isDragging && isValidSwapTarget;
                            // Show as invalid swap target when dragging (alive, not you, but already revealed)
                            const isDragInvalidTarget = isDragging && !isDealerSetup && player.alive && player.seat !== yourSeat && hasRevealed;

                            // Dealer setup specific states
                            const dealerAssignment = dealerAssignments[player.seat];
                            const hasPreviewAssignment = assignedSeats.has(player.seat);
                            const isJustAssigned = recentlyAssigned === player.seat;
                            const isDealerDragTarget = isDealerSetup && isDealer && isCurrentDragTarget;

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
                                    ${isCurrentDragTarget && !isDealerSetup ? styles.seatDragTarget : ''}
                                    ${isDragValidTarget ? styles.seatDragValid : ''}
                                    ${isDragInvalidTarget ? styles.seatDragInvalid : ''}
                                    ${hasRevealed ? styles.seatRevealed : ''}
                                    ${isDealerSetup && isDealer && dealerAssignment ? styles.seatAssigned : ''}
                                    ${isDealerSetup && isDealer && selectedCard ? styles.seatDropTarget : ''}
                                    ${isDealerDragTarget ? styles.seatDragOver : ''}
                                    ${isDealerSetup && isPlayerDealer ? styles.seatDealerHighlight : ''}
                                    ${isJustAssigned ? styles.seatJustAssigned : ''}
                                `}
                                    style={position}
                                    onClick={() => {
                                        if (isDealerSetup && isDealer && player.alive) {
                                            handleDealerSeatClick(player.seat);
                                        } else if (isYourTurn && isValidSwapTarget) {
                                            setSwapTarget(player.seat);
                                        }
                                    }}
                                >
                                    <div className={`${styles.avatar} ${isCurrentTurn ? styles.avatarPulse : ''} ${isDealerSetup && isPlayerDealer ? styles.avatarDealer : ''}`}>
                                        {AVATARS[player.avatarId] || '🍷'}
                                        {isPlayerDealer && <span className={styles.dealerBadge}>👑</span>}
                                        {player.hasCheese && <span className={styles.cheeseBadge}>🧀</span>}
                                        {isDisconnected && <span className={styles.disconnectedBadge}>⚡</span>}
                                    </div>
                                    <span className={styles.seatName}>
                                        {isDisconnected ? '...' : player.seat === yourSeat ? 'You' : player.name.substring(0, 8)}
                                    </span>

                                    {/* Dealer assignment indicator (dealer view) */}
                                    {isDealerSetup && isDealer && dealerAssignment && (
                                        <div className={`${styles.assignedCard} ${dealerAssignment === 'DOOM' ? styles.assignedDoom : styles.assignedSafe}`}>
                                            {dealerAssignment === 'DOOM' ? '💀' : '🍷'}
                                        </div>
                                    )}

                                    {/* Preview assignment indicator (non-dealer view - just shows wine, doesn't reveal type) */}
                                    {isDealerSetup && !isDealer && hasPreviewAssignment && (
                                        <div className={styles.assignmentBadge}>
                                            🍷
                                        </div>
                                    )}

                                    {/* Card indicator (during game) */}
                                    {!isDealerSetup && player.alive && (
                                        <div className={`${styles.cardSlot} ${hasFacedown ? styles.cardFacedown : styles.cardRevealed}`}>
                                            {hasFacedown ? '🎴' : '✓'}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Dealer gold glow at bottom */}
                {isDealerSetup && isDealer && <div className={styles.dealerBottomGlow} />}

                {/* Dead player red glow at bottom (spectating) */}
                {!isAlive && <div className={styles.deadBottomGlow} />}

                {/* Action Area - cards and buttons */}
                <div className={styles.actionArea}>
                    {/* Dealer Setup: Card picker for dealer */}
                    {isDealerSetup && isDealer && (
                        <div className={styles.dealerSetup}>
                            <span className={styles.dealerInstruction}>Drag to player, or tap to select</span>
                            <span className={styles.dealerHint}>
                                {getDealerHint() || '\u00A0'}
                            </span>
                            <div className={styles.cardPicker}>
                                <div
                                    className={`${styles.cardOption} ${selectedCard === 'SAFE' || (isDragging && dragCardType === 'SAFE') ? styles.cardSelected : ''} ${isDragging && dragCardType === 'SAFE' ? styles.cardDragging : ''}`}
                                    onPointerDown={(e) => handleDealerDragStart(e, 'SAFE')}
                                    onPointerMove={handleDealerDragMove}
                                    onPointerUp={handleDealerDragEnd}
                                    onPointerCancel={handleDealerDragEnd}
                                    style={{ touchAction: 'none' }}
                                >
                                    <span className={styles.cardIcon}>🍷</span>
                                    <span className={styles.cardLabel}>Wine</span>
                                    <span className={styles.cardCount}>{safeCount}</span>
                                </div>
                                <div
                                    className={`${styles.cardOption} ${styles.cardDoom} ${selectedCard === 'DOOM' || (isDragging && dragCardType === 'DOOM') ? styles.cardSelected : ''} ${isDragging && dragCardType === 'DOOM' ? styles.cardDragging : ''}`}
                                    onPointerDown={(e) => handleDealerDragStart(e, 'DOOM')}
                                    onPointerMove={handleDealerDragMove}
                                    onPointerUp={handleDealerDragEnd}
                                    onPointerCancel={handleDealerDragEnd}
                                    style={{ touchAction: 'none' }}
                                >
                                    <span className={styles.cardIcon}>💀</span>
                                    <span className={styles.cardLabel}>Poison</span>
                                    <span className={styles.cardCount}>{doomCount}</span>
                                </div>
                            </div>
                            <div className={styles.dealerFooter}>
                                <button
                                    className={`${styles.serveButton} ${!canConfirmDeal ? styles.serveDisabled : ''}`}
                                    onClick={handleDealerConfirm}
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
                    {!isDealerSetup && isYourTurn && cheeseEnabled && !hasCheese && getValidCheeseTargets().length > 0 && (
                        <button
                            className={`${styles.stealButton} ${actionMode === 'steal' ? styles.stealActive : ''}`}
                            onClick={() => setActionMode(actionMode === 'steal' ? 'none' : 'steal')}
                        >
                            <span className={styles.actionIcon}>🧀</span>
                            <span className={styles.actionLabel}>Steal</span>
                        </button>
                    )}

                    {/* Waiting message when not your turn (during game) */}
                    {!isDealerSetup && isAlive && !isYourTurn && game?.phase !== 'AWAITING_REVEAL' && (
                        <div className={styles.waitingMessage}>
                            {game?.phase === 'TURNS' && (
                                <>Waiting for {players.find(p => p.seat === game?.turnSeat)?.name || 'player'}...</>
                            )}
                            {game?.phase === 'ROUND_END' && <>Round ending...</>}
                        </div>
                    )}

                    {/* AWAITING_REVEAL: Dealer reveal button */}
                    {game?.phase === 'AWAITING_REVEAL' && isDealer && (
                        <div className={styles.revealButtonContainer}>
                            <button
                                className={styles.revealButton}
                                onClick={handleStartReveal}
                            >
                                <span className={styles.revealButtonIcon}>🎴</span>
                                <span className={styles.revealButtonLabel}>Reveal Cards</span>
                            </button>
                            <span className={styles.revealHint}>All players have made their choice</span>
                        </div>
                    )}

                    {/* AWAITING_REVEAL: Waiting message for non-dealer */}
                    {game?.phase === 'AWAITING_REVEAL' && !isDealer && (
                        <div className={styles.waitingMessage}>
                            Waiting for {players.find(p => p.seat === game?.dealerSeat)?.name || 'dealer'} to reveal...
                        </div>
                    )}
                </div>

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
                                → {players.find(p => p.seat === dragTarget)?.name}
                            </span>
                        )}
                    </div>
                )}

                {/* Reveal Overlay - Three phase animation: focus → shake → reveal */}
                {showReveal && revealData && (() => {
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
                })()}

                {/* Dealer Selection Roulette */}
                {showDealerRoulette && (() => {
                    const alivePlayers = players.filter(p => p.alive);
                    const currentPlayer = alivePlayers[rouletteIndex];
                    const isLanded = roulettePhase === 'landed';

                    return (
                        <div className={`${styles.dealerRoulette} ${isLanded ? styles.dealerRouletteLanded : ''}`}>
                            <div className={styles.rouletteContent}>
                                <div className={styles.rouletteTitle}>
                                    {isLanded ? '👑 Dealer Selected! 👑' : '🎰 Selecting Dealer...'}
                                </div>

                                {/* Player avatars carousel - shows all players with current one highlighted */}
                                <div className={styles.rouletteCarousel}>
                                    {alivePlayers.map((player, idx) => (
                                        <div
                                            key={player.id}
                                            className={`${styles.rouletteAvatar} ${idx === rouletteIndex ? styles.rouletteAvatarActive : ''} ${isLanded && idx === rouletteIndex ? styles.rouletteAvatarWinner : ''}`}
                                        >
                                            {AVATARS[player.avatarId]}
                                        </div>
                                    ))}
                                </div>

                                {/* Current selected player spotlight */}
                                <div className={`${styles.rouletteSpotlight} ${isLanded ? styles.rouletteSpotlightWinner : ''}`}>
                                    <div className={`${styles.rouletteMainAvatar} ${roulettePhase === 'spinning' ? styles.rouletteMainAvatarSpin : ''} ${roulettePhase === 'slowing' ? styles.rouletteMainAvatarSlow : ''}`}>
                                        {AVATARS[currentPlayer?.avatarId ?? 0]}
                                    </div>
                                    <div className={styles.roulettePlayerName}>
                                        {currentPlayer?.name || '???'}
                                    </div>
                                    {isLanded && (
                                        <div className={styles.rouletteCrown}>👑</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* You are the Dealer announcement */}
                {showDealerAnnouncement && (
                    <div className={styles.dealerAnnouncement}>
                        <div className={styles.dealerAnnouncementContent}>
                            <span className={styles.dealerAnnouncementIcon}>👑</span>
                            <h2 className={styles.dealerAnnouncementTitle}>You are the Dealer!</h2>
                            <p className={styles.dealerAnnouncementSubtitle}>Assign drinks to each player</p>
                        </div>
                    </div>
                )}

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
