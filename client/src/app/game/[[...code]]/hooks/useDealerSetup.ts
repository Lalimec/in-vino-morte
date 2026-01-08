'use client';

import { useState, useEffect, useCallback, useRef, RefObject } from 'react';
import { getWsClient } from '@/lib/ws';
import type { Player } from '@in-vino-morte/shared';

// Drag threshold in pixels - must move this far to count as drag
const DRAG_THRESHOLD = 10;

// Hit detection radius for dealer drag (50px - different from game drag which is 60px)
const DEALER_HIT_RADIUS = 50;

// Seat position radius - CRITICAL: must match CSS (42% of container)
const SEAT_RADIUS = 0.42;

interface UseDealerSetupOptions {
    isDealerSetup: boolean;
    isDealer: boolean;
    players: Player[];
    tableRef: RefObject<HTMLDivElement | null>;
}

interface UseDealerSetupReturn {
    // State
    dealerAssignments: Record<number, 'SAFE' | 'DOOM' | null>;
    selectedCard: 'SAFE' | 'DOOM' | null;
    assignedSeats: Set<number>;
    recentlyAssigned: number | null;

    // Drag state
    isDragging: boolean;
    dragPosition: { x: number; y: number } | null;
    dragTarget: number | null;
    dragCardType: 'SAFE' | 'DOOM' | null;

    // Computed values
    alivePlayers: Player[];
    safeCount: number;
    doomCount: number;
    allAssigned: boolean;
    hasAtLeastOneSafe: boolean;
    hasAtLeastOneDoom: boolean;
    canConfirmDeal: boolean;

    // Handlers
    handleDealerConfirm: () => void;
    handleDealerSeatClick: (seat: number) => void;
    handleDealerDragStart: (e: React.PointerEvent, cardType: 'SAFE' | 'DOOM') => void;
    handleDealerDragMove: (e: React.PointerEvent) => void;
    handleDealerDragEnd: (e: React.PointerEvent) => void;
}

/**
 * Hook to manage dealer setup phase - card assignments and drag-drop.
 *
 * Features:
 * - Drag-drop card assignment OR tap to select + tap seat
 * - Real-time preview to non-dealers via WebSocket
 * - Validation: all alive players assigned, at least 1 SAFE and 1 DOOM
 */
export function useDealerSetup({
    isDealerSetup,
    isDealer,
    players,
    tableRef,
}: UseDealerSetupOptions): UseDealerSetupReturn {
    // Assignment state
    const [dealerAssignments, setDealerAssignments] = useState<Record<number, 'SAFE' | 'DOOM' | null>>({});
    const [selectedCard, setSelectedCard] = useState<'SAFE' | 'DOOM' | null>(null);
    const [assignedSeats, setAssignedSeats] = useState<Set<number>>(new Set());
    const [recentlyAssigned, setRecentlyAssigned] = useState<number | null>(null);

    // Drag state
    const [isDragging, setIsDragging] = useState(false);
    const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
    const [dragTarget, setDragTarget] = useState<number | null>(null);
    const [dragCardType, setDragCardType] = useState<'SAFE' | 'DOOM' | null>(null);
    const dragStartRef = useRef<{ x: number; y: number } | null>(null);
    const isDraggedRef = useRef(false);

    // Computed values
    const alivePlayers = players.filter(p => p.alive);
    const dealerAssignedSeats = Object.entries(dealerAssignments).filter(([, v]) => v !== null);
    const safeCount = dealerAssignedSeats.filter(([, v]) => v === 'SAFE').length;
    const doomCount = dealerAssignedSeats.filter(([, v]) => v === 'DOOM').length;
    const allAssigned = dealerAssignedSeats.length === alivePlayers.length;
    const hasAtLeastOneSafe = safeCount >= 1;
    const hasAtLeastOneDoom = doomCount >= 1;
    const canConfirmDeal = allAssigned && hasAtLeastOneSafe && hasAtLeastOneDoom;

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

    // Clear assignedSeats when entering dealer setup (for non-dealers)
    useEffect(() => {
        if (isDealerSetup && !isDealer) {
            setAssignedSeats(new Set());
        }
    }, [isDealerSetup, isDealer]);

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
                let foundTarget: number | null = null;

                for (let i = 0; i < alivePlayers.length; i++) {
                    const player = alivePlayers[i];
                    const angle = (player.seat / players.length) * 2 * Math.PI - Math.PI / 2;
                    const seatX = tableRect.left + tableRect.width * (0.5 + SEAT_RADIUS * Math.cos(angle));
                    const seatY = tableRect.top + tableRect.height * (0.5 + SEAT_RADIUS * Math.sin(angle));

                    const hitDistance = Math.sqrt(
                        Math.pow(e.clientX - seatX, 2) + Math.pow(e.clientY - seatY, 2)
                    );

                    if (hitDistance < DEALER_HIT_RADIUS) {
                        foundTarget = player.seat;
                        break;
                    }
                }

                setDragTarget(foundTarget);
            }
        }
    }, [dragCardType, alivePlayers, players.length, tableRef]);

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

    return {
        dealerAssignments,
        selectedCard,
        assignedSeats,
        recentlyAssigned,
        isDragging,
        dragPosition,
        dragTarget,
        dragCardType,
        alivePlayers,
        safeCount,
        doomCount,
        allAssigned,
        hasAtLeastOneSafe,
        hasAtLeastOneDoom,
        canConfirmDeal,
        handleDealerConfirm,
        handleDealerSeatClick,
        handleDealerDragStart,
        handleDealerDragMove,
        handleDealerDragEnd,
    };
}
