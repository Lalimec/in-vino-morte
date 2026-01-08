'use client';

import { useState, useRef, useEffect } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { audioManager } from '@/lib/audio';
import { hapticManager } from '@/lib/haptics';
import { REVEAL } from '@in-vino-morte/shared';

export interface RevealData {
    seat: number;
    cardType: 'SAFE' | 'DOOM';
}

export type RevealPhase = 'idle' | 'focusing' | 'building' | 'showing';

interface UseRevealSequenceOptions {
    soundEnabled: boolean;
    motionEnabled: boolean;
}

interface UseRevealSequenceReturn {
    showReveal: boolean;
    revealData: RevealData | null;
    revealPhase: RevealPhase;
    recentlyRevealed: number | null;
}

/**
 * Hook to manage the three-phase reveal animation sequence.
 *
 * Phases:
 * 1. Focusing (400ms) - Player info flies to center spotlight
 * 2. Building (1000ms) - Card shakes with escalating intensity
 * 3. Showing (1200ms) - Card flips to reveal result
 *
 * CRITICAL: Uses recursive setTimeout to bypass React render cycle gaps.
 * The isProcessingRevealRef lock prevents concurrent reveal processing.
 */
export function useRevealSequence({
    soundEnabled,
    motionEnabled,
}: UseRevealSequenceOptions): UseRevealSequenceReturn {
    const [showReveal, setShowReveal] = useState(false);
    const [revealData, setRevealData] = useState<RevealData | null>(null);
    const [recentlyRevealed, setRecentlyRevealed] = useState<number | null>(null);
    const [revealPhase, setRevealPhase] = useState<RevealPhase>('idle');

    // CRITICAL: Use ref to avoid React batching issues
    const isProcessingRevealRef = useRef(false);

    // Holds the process function so we can call it recursively from setTimeout
    const processRevealRef = useRef<(() => void) | undefined>(undefined);

    const pendingReveals = useGameStore(state => state.pendingReveals);

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

    return {
        showReveal,
        revealData,
        revealPhase,
        recentlyRevealed,
    };
}
