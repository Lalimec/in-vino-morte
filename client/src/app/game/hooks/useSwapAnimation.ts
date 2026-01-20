'use client';

import { useState, useEffect, RefObject } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { audioManager } from '@/lib/audio';
import { hapticManager } from '@/lib/haptics';

// Flying card state for animation
export interface FlyingCard {
    id: string;
    fromSeat: number;
    toSeat: number;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
}

interface UseSwapAnimationOptions {
    tableRef: RefObject<HTMLDivElement | null>;
    totalSeats: number;
    soundEnabled: boolean;
    motionEnabled: boolean;
}

interface UseSwapAnimationReturn {
    flyingCards: FlyingCard[];
    swappingSeats: [number, number] | null;
}

// Seat position radius - CRITICAL: must match CSS (42% of container)
const SEAT_RADIUS = 0.42;

// Animation duration - must match CSS
const SWAP_ANIMATION_DURATION_MS = 800;

/**
 * Hook to manage flying card animations during swaps.
 *
 * When a swap occurs:
 * 1. Two cards fly across the table (one from each seat)
 * 2. Cards cross paths with CSS animation
 * 3. Animation clears after 800ms (matches CSS duration)
 */
export function useSwapAnimation({
    tableRef,
    totalSeats,
    soundEnabled,
    motionEnabled,
}: UseSwapAnimationOptions): UseSwapAnimationReturn {
    const [flyingCards, setFlyingCards] = useState<FlyingCard[]>([]);
    const [swappingSeats, setSwappingSeats] = useState<[number, number] | null>(null);

    const pendingSwaps = useGameStore(state => state.pendingSwaps);
    const consumeSwap = useGameStore(state => state.consumeSwap);

    // Calculate pixel position for a seat (matching getSeatPosition logic)
    const getPixelPosition = (seat: number, tableRect: DOMRect) => {
        // Safety check: ensure valid dimensions to prevent NaN
        if (!tableRect.width || !tableRect.height || tableRect.width === 0 || tableRect.height === 0) {
            return { x: 0, y: 0 };
        }
        const angle = (seat / totalSeats) * 2 * Math.PI - Math.PI / 2;
        return {
            x: tableRect.width * (0.5 + SEAT_RADIUS * Math.cos(angle)),
            y: tableRect.height * (0.5 + SEAT_RADIUS * Math.sin(angle)),
        };
    };

    // Process swap queue - flying card animation
    useEffect(() => {
        if (pendingSwaps.length > 0 && flyingCards.length === 0) {
            const swap = consumeSwap();
            if (swap && tableRef.current) {
                const tableRect = tableRef.current.getBoundingClientRect();

                const fromPos = getPixelPosition(swap.fromSeat, tableRect);
                const toPos = getPixelPosition(swap.toSeat, tableRect);

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
                }, SWAP_ANIMATION_DURATION_MS);
            }
        }
    }, [pendingSwaps, flyingCards.length, consumeSwap, totalSeats, soundEnabled, motionEnabled, tableRef]);

    return {
        flyingCards,
        swappingSeats,
    };
}
