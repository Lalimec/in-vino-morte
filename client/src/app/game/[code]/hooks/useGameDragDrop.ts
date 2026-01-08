'use client';

import { useState, useCallback, useRef, RefObject } from 'react';
import { hapticManager } from '@/lib/haptics';
import type { Player, GameState } from '@in-vino-morte/shared';

// Drag threshold in pixels - must move this far to count as drag
const DRAG_THRESHOLD = 10;

// Hit detection radius for game drag (60px - different from dealer drag which is 50px)
const GAME_HIT_RADIUS = 60;

// Seat position radius - CRITICAL: must match CSS (42% of container)
const SEAT_RADIUS = 0.42;

interface UseGameDragDropOptions {
    isYourTurn: boolean;
    isAlive: boolean;
    hasFacedownCard: boolean;
    yourSeat: number;
    players: Player[];
    facedownSeats: number[];
    tableRef: RefObject<HTMLDivElement | null>;
    motionEnabled: boolean;
    onDrink: () => void;
    onSwap: (targetSeat: number) => void;
}

interface UseGameDragDropReturn {
    // Drag state
    isDragging: boolean;
    dragPosition: { x: number; y: number } | null;
    dragTarget: number | null;

    // Handlers
    handleDragStart: (e: React.PointerEvent) => void;
    handleDragMove: (e: React.PointerEvent) => void;
    handleDragEnd: (e: React.PointerEvent) => void;
}

/**
 * Hook to manage game turn drag-drop for drink/swap actions.
 *
 * Features:
 * - Tap card = drink your own wine
 * - Drag card to another player = swap cards
 * - Threshold detection (10px) distinguishes tap vs drag
 * - Hit detection (60px radius) for targeting seats
 *
 * CRITICAL: Uses refs (dragStartRef, isDraggedRef) to track drag state
 * because state updates would cause re-renders during drag.
 */
export function useGameDragDrop({
    isYourTurn,
    isAlive,
    hasFacedownCard,
    yourSeat,
    players,
    facedownSeats,
    tableRef,
    motionEnabled,
    onDrink,
    onSwap,
}: UseGameDragDropOptions): UseGameDragDropReturn {
    // Drag state
    const [isDragging, setIsDragging] = useState(false);
    const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
    const [dragTarget, setDragTarget] = useState<number | null>(null);

    // CRITICAL: Use refs to track drag state to avoid re-renders during drag
    const dragStartRef = useRef<{ x: number; y: number } | null>(null);
    const isDraggedRef = useRef(false);

    // Drag start handler
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

    // Drag move handler
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
                    // Skip self, dead players, and players without facedown cards
                    if (player.seat === yourSeat || !player.alive) continue;
                    if (!facedownSeats.includes(player.seat)) continue;

                    // Calculate seat position
                    const angle = (player.seat / totalSeats) * 2 * Math.PI - Math.PI / 2;
                    const seatX = tableRect.left + tableRect.width * (0.5 + SEAT_RADIUS * Math.cos(angle));
                    const seatY = tableRect.top + tableRect.height * (0.5 + SEAT_RADIUS * Math.sin(angle));

                    // Check if within hit radius
                    const hitDistance = Math.sqrt(
                        Math.pow(clientX - seatX, 2) + Math.pow(clientY - seatY, 2)
                    );

                    if (hitDistance < GAME_HIT_RADIUS) {
                        foundTarget = player.seat;
                        break;
                    }
                }

                setDragTarget(foundTarget);
            }
        }
    }, [isYourTurn, players, yourSeat, facedownSeats, tableRef]);

    // Drag end handler
    const handleDragEnd = useCallback((e: React.PointerEvent) => {
        // Release pointer capture
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);

        if (isDraggedRef.current && dragTarget !== null) {
            // Dropped on a valid target - trigger swap
            onSwap(dragTarget);
            if (motionEnabled) hapticManager.medium();
        } else if (!isDraggedRef.current && dragStartRef.current) {
            // Was a tap/click - trigger drink
            onDrink();
        }

        // Reset drag state
        dragStartRef.current = null;
        isDraggedRef.current = false;
        setIsDragging(false);
        setDragPosition(null);
        setDragTarget(null);
    }, [dragTarget, onSwap, onDrink, motionEnabled]);

    return {
        isDragging,
        dragPosition,
        dragTarget,
        handleDragStart,
        handleDragMove,
        handleDragEnd,
    };
}
