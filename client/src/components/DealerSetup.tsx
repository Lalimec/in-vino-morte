'use client';

import { useState, useRef, useCallback } from 'react';
import styles from './DealerSetup.module.css';
import type { Player } from '@in-vino-morte/shared';
import { getWsClient } from '@/lib/ws';

interface DealerSetupProps {
    players: Player[];
    yourSeat: number;
    onConfirm: (assignments: Record<number, 'SAFE' | 'DOOM'>) => void;
}

// Avatars without wine glass (index 0 is reserved for the game)
const AVATARS = ['🍸', '🥂', '🍹', '🍺', '🥃', '🧉', '☕', '🍵', '🫖', '🍾', '🍻', '🥤', '🧃', '🫗', '🍶'];

export default function DealerSetup({ players, yourSeat, onConfirm }: DealerSetupProps) {
    const [assignments, setAssignments] = useState<Record<number, 'SAFE' | 'DOOM' | null>>(() => {
        const initial: Record<number, null> = {};
        players.forEach(p => {
            if (p.alive) initial[p.seat] = null;
        });
        return initial;
    });

    const [selectedCard, setSelectedCard] = useState<'SAFE' | 'DOOM' | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const tableRef = useRef<HTMLDivElement>(null);

    // Drag state for pointer-based dragging
    const [isDragging, setIsDragging] = useState(false);
    const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
    const [dragTarget, setDragTarget] = useState<number | null>(null);
    const [dragCardType, setDragCardType] = useState<'SAFE' | 'DOOM' | null>(null);
    const dragStartRef = useRef<{ x: number; y: number } | null>(null);
    const isDraggedRef = useRef(false);
    const DRAG_THRESHOLD = 10;

    const alivePlayers = players.filter(p => p.alive);
    const assignedSeats = Object.entries(assignments).filter(([, v]) => v !== null);
    const safeCount = assignedSeats.filter(([, v]) => v === 'SAFE').length;
    const doomCount = assignedSeats.filter(([, v]) => v === 'DOOM').length;
    const allAssigned = assignedSeats.length === alivePlayers.length;
    const hasAtLeastOneSafe = safeCount >= 1;
    const hasAtLeastOneDoom = doomCount >= 1;
    const canConfirm = allAssigned && hasAtLeastOneSafe && hasAtLeastOneDoom;

    // Position players around a circle
    const getSeatPosition = useCallback((index: number, total: number) => {
        const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
        const radius = 38;
        return {
            left: `${50 + radius * Math.cos(angle)}%`,
            top: `${50 + radius * Math.sin(angle)}%`,
        };
    }, []);

    // Pointer-based drag start
    const handleDragStart = useCallback((e: React.PointerEvent, cardType: 'SAFE' | 'DOOM') => {
        dragStartRef.current = { x: e.clientX, y: e.clientY };
        isDraggedRef.current = false;
        setDragCardType(cardType);
        setDragPosition({ x: e.clientX, y: e.clientY });
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }, []);

    // Pointer-based drag move
    const handleDragMove = useCallback((e: React.PointerEvent) => {
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

            // Check if over a valid target seat
            if (tableRef.current) {
                const tableRect = tableRef.current.getBoundingClientRect();
                const total = alivePlayers.length;
                let foundTarget: number | null = null;

                for (let i = 0; i < alivePlayers.length; i++) {
                    const player = alivePlayers[i];
                    const angle = (i / total) * 2 * Math.PI - Math.PI / 2;
                    const radius = 0.38;
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
    }, [dragCardType, alivePlayers]);

    // Pointer-based drag end
    const handleDragEnd = useCallback((e: React.PointerEvent) => {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);

        if (isDraggedRef.current && dragTarget !== null && dragCardType) {
            // Dropped on a valid target - assign the card
            setAssignments(prev => ({ ...prev, [dragTarget]: dragCardType }));
            getWsClient().dealerPreview(dragTarget, dragCardType);
        } else if (!isDraggedRef.current && dragCardType) {
            // Was a tap/click - toggle selection
            setSelectedCard(prev => prev === dragCardType ? null : dragCardType);
        }

        // Reset drag state
        dragStartRef.current = null;
        isDraggedRef.current = false;
        setIsDragging(false);
        setDragPosition(null);
        setDragTarget(null);
        setDragCardType(null);
    }, [dragTarget, dragCardType]);

    // Handle seat click - assign if card selected, clear if already assigned
    const handleSeatClick = useCallback((seat: number) => {
        if (selectedCard) {
            // Assign the selected card to this seat
            setAssignments(prev => ({ ...prev, [seat]: selectedCard }));
            getWsClient().dealerPreview(seat, selectedCard);
            // Keep the card selected for faster assignment
        } else if (assignments[seat]) {
            // Clear assignment if no card selected and seat has assignment
            setAssignments(prev => ({ ...prev, [seat]: null }));
            getWsClient().dealerPreview(seat, null);
        }
    }, [selectedCard, assignments]);

    const handleConfirm = useCallback(() => {
        if (!canConfirm) return;

        const finalAssignments: Record<number, 'SAFE' | 'DOOM'> = {};
        for (const [seatStr, cardType] of Object.entries(assignments)) {
            if (cardType) {
                finalAssignments[parseInt(seatStr)] = cardType;
            }
        }
        onConfirm(finalAssignments);
    }, [canConfirm, assignments, onConfirm]);

    return (
        <div className={styles.container} ref={containerRef}>
            {/* Title */}
            <div className={styles.header}>
                <h2 className={styles.title}>👑 You Deal</h2>
                <p className={styles.subtitle}>Drag card to player, or tap to select</p>
            </div>

            {/* Circular Table */}
            <div className={styles.tableContainer}>
                <div className={styles.table} ref={tableRef}>
                    {/* Center */}
                    <div className={styles.tableCenter}>
                        <span>🍷</span>
                    </div>

                    {/* Player seats around the table */}
                    {alivePlayers.map((player, index) => {
                        const pos = getSeatPosition(index, alivePlayers.length);
                        const assignment = assignments[player.seat];
                        const isYou = player.seat === yourSeat;
                        const isCurrentDragTarget = dragTarget === player.seat;

                        const seatClasses = [
                            styles.seat,
                            assignment ? styles.seatAssigned : '',
                            assignment === 'SAFE' ? styles.seatHasSafe : '',
                            assignment === 'DOOM' ? styles.seatHasDoom : '',
                            selectedCard ? styles.seatDropTarget : '',
                            isCurrentDragTarget ? styles.seatDragOver : '',
                        ].filter(Boolean).join(' ');

                        return (
                            <div
                                key={player.id}
                                className={seatClasses}
                                style={pos}
                                onClick={() => handleSeatClick(player.seat)}
                            >
                                <div className={`${styles.seatAvatar} ${isYou ? styles.seatYou : ''}`}>
                                    {AVATARS[player.avatarId] || '🍸'}
                                </div>
                                <span className={styles.seatName}>
                                    {isYou ? 'You' : player.name.substring(0, 8)}
                                </span>
                                {/* Card assignment indicator */}
                                {assignment && (
                                    <div className={`${styles.assignedCard} ${assignment === 'DOOM' ? styles.assignedDoom : styles.assignedSafe}`}>
                                        {assignment === 'DOOM' ? '💀' : '🍷'}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Draggable Cards - Wine or Poison (at bottom) */}
            <div className={styles.cardPicker}>
                <div
                    className={`${styles.cardOption} ${selectedCard === 'SAFE' || (isDragging && dragCardType === 'SAFE') ? styles.cardSelected : ''} ${isDragging && dragCardType === 'SAFE' ? styles.cardDragging : ''}`}
                    onPointerDown={(e) => handleDragStart(e, 'SAFE')}
                    onPointerMove={handleDragMove}
                    onPointerUp={handleDragEnd}
                    onPointerCancel={handleDragEnd}
                    style={{ touchAction: 'none' }}
                >
                    <span className={styles.cardIcon}>🍷</span>
                    <span className={styles.cardLabel}>Wine</span>
                    <span className={styles.cardCount}>{safeCount}</span>
                </div>
                <div
                    className={`${styles.cardOption} ${styles.cardDoom} ${selectedCard === 'DOOM' || (isDragging && dragCardType === 'DOOM') ? styles.cardSelected : ''} ${isDragging && dragCardType === 'DOOM' ? styles.cardDragging : ''}`}
                    onPointerDown={(e) => handleDragStart(e, 'DOOM')}
                    onPointerMove={handleDragMove}
                    onPointerUp={handleDragEnd}
                    onPointerCancel={handleDragEnd}
                    style={{ touchAction: 'none' }}
                >
                    <span className={styles.cardIcon}>💀</span>
                    <span className={styles.cardLabel}>Poison</span>
                    <span className={styles.cardCount}>{doomCount}</span>
                </div>
            </div>

            {/* Drag ghost - follows pointer when dragging (full card with wobbly physics) */}
            {isDragging && dragPosition && (
                <div
                    className={`${styles.dragGhost} ${dragTarget !== null ? styles.dragGhostValid : ''} ${dragCardType === 'DOOM' ? styles.dragGhostDoom : ''}`}
                    style={{
                        left: dragPosition.x,
                        top: dragPosition.y,
                    }}
                >
                    <span className={styles.dragGhostIcon}>{dragCardType === 'DOOM' ? '💀' : '🍷'}</span>
                    <span className={styles.dragGhostCardLabel}>{dragCardType === 'DOOM' ? 'Poison' : 'Wine'}</span>
                    {dragTarget !== null && (
                        <span className={styles.dragGhostLabel}>
                            → {alivePlayers.find(p => p.seat === dragTarget)?.name}
                        </span>
                    )}
                </div>
            )}

            {/* Status & Confirm */}
            <div className={styles.footer}>
                {/* Always render hint area to prevent layout shift */}
                <span className={styles.hint}>
                    {!hasAtLeastOneSafe && !hasAtLeastOneDoom && 'Need 1+ Wine AND 1+ Poison'}
                    {hasAtLeastOneSafe && !hasAtLeastOneDoom && 'Need at least 1 Poison 💀'}
                    {!hasAtLeastOneSafe && hasAtLeastOneDoom && 'Need at least 1 Wine 🍷'}
                    {hasAtLeastOneSafe && hasAtLeastOneDoom && !allAssigned && 'Assign all players'}
                    {/* Empty space when canConfirm is true to maintain height */}
                    {canConfirm && '\u00A0'}
                </span>

                <button
                    className={`${styles.confirmButton} ${!canConfirm ? styles.confirmDisabled : ''}`}
                    onClick={handleConfirm}
                    disabled={!canConfirm}
                >
                    Serve
                </button>
            </div>
        </div>
    );
}
