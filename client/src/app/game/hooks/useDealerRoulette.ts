'use client';

import { useState, useRef, useEffect } from 'react';
import { audioManager } from '@/lib/audio';
import { hapticManager } from '@/lib/haptics';
import type { Player } from '@in-vino-morte/shared';

export type RoulettePhase = 'spinning' | 'slowing' | 'landed' | 'idle';

interface UseDealerRouletteOptions {
    isDealerSetup: boolean;
    isDealer: boolean;
    dealerSeat: number | undefined;
    players: Player[];
    soundEnabled: boolean;
    motionEnabled: boolean;
}

interface UseDealerRouletteReturn {
    showDealerRoulette: boolean;
    rouletteIndex: number;
    roulettePhase: RoulettePhase;
    showDealerAnnouncement: boolean;
    alivePlayers: Player[];
}

/**
 * Hook to manage the dealer selection roulette animation.
 *
 * Animation phases:
 * 1. Spinning (0-60% progress): Fast 60ms intervals
 * 2. Slowing (60-85% progress): Variable delay (60 + (progress - 0.6) * 400ms)
 * 3. Holding (85-100%): Variable delay (200 + (progress - 0.85) * 800ms)
 * 4. Landed: Hold for 1200ms before hiding
 *
 * Total spins = alivePlayers.length * 3 + targetIndex (3 full cycles + land on target)
 *
 * CRITICAL: Uses lastAnimatedDealerSeatRef to track which dealer has been animated.
 * Animation manages itself via ref check, no cleanup needed.
 */
export function useDealerRoulette({
    isDealerSetup,
    isDealer,
    dealerSeat,
    players,
    soundEnabled,
    motionEnabled,
}: UseDealerRouletteOptions): UseDealerRouletteReturn {
    const [showDealerRoulette, setShowDealerRoulette] = useState(false);
    const [rouletteIndex, setRouletteIndex] = useState(0);
    const [roulettePhase, setRoulettePhase] = useState<RoulettePhase>('idle');
    const [showDealerAnnouncement, setShowDealerAnnouncement] = useState(false);

    // Track which dealer we already animated for
    const lastAnimatedDealerSeatRef = useRef<number | null>(null);

    const alivePlayers = players.filter(p => p.alive);

    // Reset roulette tracking when leaving dealer setup (so it can trigger again next round)
    useEffect(() => {
        if (!isDealerSetup) {
            lastAnimatedDealerSeatRef.current = null;
            setRoulettePhase('idle');
            setShowDealerRoulette(false);
        }
    }, [isDealerSetup]);

    // Dealer selection roulette animation - runs imperatively, not in useEffect cleanup
    useEffect(() => {
        // Only trigger when we have a NEW dealer to animate
        if (!isDealerSetup || players.length === 0 || dealerSeat === undefined) return;
        if (lastAnimatedDealerSeatRef.current === dealerSeat) return; // Already animated this dealer

        if (alivePlayers.length === 0) return;

        // Mark that we're animating this dealer
        lastAnimatedDealerSeatRef.current = dealerSeat;

        // Find the target dealer index in alive players
        const dealerIndex = alivePlayers.findIndex(p => p.seat === dealerSeat);
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
            if (lastAnimatedDealerSeatRef.current !== dealerSeat) return;

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
                    if (lastAnimatedDealerSeatRef.current !== dealerSeat) return;
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
    }, [isDealerSetup, players, dealerSeat, isDealer, soundEnabled, motionEnabled, alivePlayers]);

    return {
        showDealerRoulette,
        rouletteIndex,
        roulettePhase,
        showDealerAnnouncement,
        alivePlayers,
    };
}
