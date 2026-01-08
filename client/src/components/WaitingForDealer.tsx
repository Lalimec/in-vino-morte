'use client';

import { useState, useEffect } from 'react';
import styles from './WaitingForDealer.module.css';
import type { Player } from '@in-vino-morte/shared';
import { getWsClient } from '@/lib/ws';

interface WaitingForDealerProps {
    players: Player[];
    yourSeat: number;
    dealerSeat: number;
}

// Avatars without wine glass (index 0 is reserved for the game)
const AVATARS = ['🍸', '🥂', '🍹', '🍺', '🥃', '🧉', '☕', '🍵', '🫖', '🍾', '🍻', '🥤', '🧃', '🫗', '🍶'];

export default function WaitingForDealer({ players, yourSeat, dealerSeat }: WaitingForDealerProps) {
    const alivePlayers = players.filter(p => p.alive);
    const dealer = players.find(p => p.seat === dealerSeat);

    // Track which seats have been assigned (we don't know the card type - that's secret!)
    const [assignedSeats, setAssignedSeats] = useState<Set<number>>(new Set());
    const [recentlyAssigned, setRecentlyAssigned] = useState<number | null>(null);

    // Listen for dealer preview events
    useEffect(() => {
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

            // Trigger animation when assigned
            if (assigned) {
                setRecentlyAssigned(seat);
                setTimeout(() => setRecentlyAssigned(null), 500);
            }
        };

        ws.on('dealerPreview', handlePreview);

        return () => {
            ws.off('dealerPreview', handlePreview);
        };
    }, []);

    // Position players around a circle
    const getSeatPosition = (index: number, total: number) => {
        const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
        const radius = 38;
        return {
            left: `${50 + radius * Math.cos(angle)}%`,
            top: `${50 + radius * Math.sin(angle)}%`,
        };
    };

    return (
        <div className={styles.container}>
            {/* Title */}
            <div className={styles.header}>
                <h2 className={styles.title}>
                    <span className={styles.crown}>👑</span>
                    <span className={styles.dealerName}>{dealer?.name}</span>
                </h2>
                <p className={styles.subtitle}>is preparing the drinks...</p>
            </div>

            {/* Circular Table */}
            <div className={styles.tableContainer}>
                <div className={styles.table}>
                    {/* Center with animated bottles */}
                    <div className={styles.tableCenter}>
                        <div className={styles.centerContent}>
                            <span className={styles.wineBottle}>🍷</span>
                            <span className={styles.poisonBottle}>💀</span>
                        </div>
                        <div className={styles.centerGlow}></div>
                    </div>

                    {/* Floating particles/bubbles around dealer */}
                    <div className={styles.particles}>
                        <span className={styles.particle} style={{ '--delay': '0s', '--x': '-20px', '--y': '-30px' } as React.CSSProperties}>✨</span>
                        <span className={styles.particle} style={{ '--delay': '0.3s', '--x': '25px', '--y': '-20px' } as React.CSSProperties}>🍷</span>
                        <span className={styles.particle} style={{ '--delay': '0.6s', '--x': '-30px', '--y': '10px' } as React.CSSProperties}>💀</span>
                        <span className={styles.particle} style={{ '--delay': '0.9s', '--x': '20px', '--y': '25px' } as React.CSSProperties}>✨</span>
                    </div>

                    {/* Player seats around the table */}
                    {alivePlayers.map((player, index) => {
                        const pos = getSeatPosition(index, alivePlayers.length);
                        const isYou = player.seat === yourSeat;
                        const isDealer = player.seat === dealerSeat;
                        const hasAssignment = assignedSeats.has(player.seat);
                        const isRecentlyAssigned = recentlyAssigned === player.seat;

                        return (
                            <div
                                key={player.id}
                                className={`${styles.seat} ${isDealer ? styles.seatDealer : ''} ${isYou ? styles.seatYou : ''} ${hasAssignment ? styles.seatAssigned : ''} ${isRecentlyAssigned ? styles.seatJustAssigned : ''}`}
                                style={pos}
                            >
                                <div className={styles.seatAvatar}>
                                    {AVATARS[player.avatarId] || '🍸'}
                                    {isDealer && (
                                        <div className={styles.dealerGlow}></div>
                                    )}
                                </div>
                                <span className={styles.seatName}>
                                    {isYou ? 'You' : player.name.substring(0, 8)}
                                </span>
                                {isDealer && <span className={styles.dealerBadge}>👑</span>}
                                {/* Generic drink assigned indicator - we don't know if it's wine or poison! */}
                                {hasAssignment && (
                                    <div className={styles.assignmentBadge}>
                                        🍷
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Footer hint */}
            <div className={styles.footer}>
                <div className={styles.loadingDots}>
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
                <p className={styles.hint}>The dealer is deciding who gets wine and who gets poison</p>
            </div>
        </div>
    );
}
