'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import { useGameStore } from '@/stores/gameStore';
import { getWsClient } from '@/lib/ws';
import WineBackground from '@/components/WineBackground';

// Avatars - wine glass excluded (used for game cards)
const AVATARS = ['🍸', '🥂', '🍹', '🍺', '🥃', '🧉', '☕', '🍵', '🫖', '🍾', '🍻', '🥤', '🧃', '🫗', '🍶'];

export default function LobbyPage({ params }: { params: Promise<{ code: string }> }) {
    const resolvedParams = use(params);
    const router = useRouter();
    const [isReady, setIsReady] = useState(false);
    const [copied, setCopied] = useState(false);

    const {
        players,
        settings,
        hostId,
        yourPlayerId,
        roomStatus,
        isConnected,
    } = useGameStore();

    const isHost = yourPlayerId === hostId;
    const allOthersReady = players.filter(p => p.id !== hostId).every(p => p.ready);
    const canStart = players.length >= 3 && allOthersReady;

    // Connect to WebSocket
    useEffect(() => {
        const ws = getWsClient();
        const store = useGameStore.getState();

        if (!store.token || !store.playerName) {
            router.push('/');
            return;
        }

        ws.connect().then(() => {
            ws.join(store.token!, store.playerName, store.avatarId);
        }).catch((err) => {
            console.error('Failed to connect:', err);
            router.push('/');
        });
    }, [router]);

    // Navigate to game when status changes
    useEffect(() => {
        if (roomStatus === 'IN_GAME') {
            router.push(`/game/${resolvedParams.code}`);
        }
    }, [roomStatus, router, resolvedParams.code]);

    const handleReady = () => {
        const newReady = !isReady;
        setIsReady(newReady);
        getWsClient().setReady(newReady);
    };

    const handleStart = () => {
        console.log('Start clicked', { canStart, isHost, playersCount: players.length, allOthersReady });
        if (canStart && isHost) {
            console.log('Sending START_GAME');
            getWsClient().startGame();
        }
    };

    const handleCopyCode = () => {
        navigator.clipboard.writeText(resolvedParams.code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleShare = async () => {
        const shareUrl = `${window.location.origin}/lobby/${resolvedParams.code}`;
        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'Join In Vino Morte',
                    text: 'Join my game!',
                    url: shareUrl,
                });
            } catch {
                navigator.clipboard.writeText(shareUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            }
        } else {
            navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    // Commented out - cheese expansion hidden for now
    // const handleToggleCheese = () => {
    //     if (!isHost) return;
    //     getWsClient().updateSettings({
    //         cheeseEnabled: !settings?.cheeseEnabled,
    //     });
    // };

    if (!isConnected) {
        return (
            <WineBackground>
                <main className={styles.main}>
                    <div className={styles.loading}>
                        <span className={styles.loadingIcon}>🍷</span>
                        <p>Connecting...</p>
                    </div>
                </main>
            </WineBackground>
        );
    }

    return (
        <WineBackground>
            <main className={styles.main}>
                <div className={styles.lobbyContainer}>
                {/* Header */}
                <header className={styles.header}>
                    <button className={styles.roomCode} onClick={handleCopyCode}>
                        <span className={styles.codeLabel}>ROOM</span>
                        <span className={styles.codeValue}>{resolvedParams.code}</span>
                        <span className={styles.copyIcon}>{copied ? '✓' : '📋'}</span>
                    </button>
                    <button className={styles.shareBtn} onClick={handleShare}>
                        🔗
                    </button>
                </header>

                {/* Player Grid - Two columns */}
                <div className={styles.playerGrid}>
                    {players.map((player) => {
                        const isYou = player.id === yourPlayerId;
                        const isPlayerHost = player.id === hostId;

                        return (
                            <div
                                key={player.id}
                                className={`${styles.playerCard} ${isYou ? styles.playerYou : ''} ${isPlayerHost ? styles.playerHost : ''}`}
                            >
                                <div className={styles.avatar}>
                                    {AVATARS[player.avatarId] || '🍸'}
                                </div>

                                <div className={styles.playerInfo}>
                                    <span className={styles.playerName}>{player.name}</span>
                                    <div className={styles.playerTags}>
                                        {isPlayerHost && (
                                            <span className={styles.hostTag}>👑 Host</span>
                                        )}
                                        {isYou && (
                                            <span className={styles.youTag}>You</span>
                                        )}
                                    </div>
                                </div>

                                {/* Ready status/button - Right side */}
                                {!isPlayerHost && (
                                    isYou ? (
                                        <button
                                            className={`${styles.readyBtn} ${isReady ? styles.readyActive : ''}`}
                                            onClick={handleReady}
                                            title={isReady ? 'Click to unready' : 'Click to ready up'}
                                        >
                                            {isReady ? '✓ Ready' : 'Ready'}
                                        </button>
                                    ) : (
                                        <div className={`${styles.readyStatus} ${player.ready ? styles.readyActive : styles.waiting}`}>
                                            {player.ready ? '✓ Ready' : 'Waiting'}
                                        </div>
                                    )
                                )}
                            </div>
                        );
                    })}

                    {/* Empty slots indicator */}
                    {players.length < 3 && (
                        <div className={styles.emptySlots}>
                            Waiting for {3 - players.length} more player{3 - players.length > 1 ? 's' : ''}...
                        </div>
                    )}
                </div>

                {/* Settings - Hidden for now
                {isHost && (
                    <div className={styles.settings}>
                        <button
                            className={`${styles.settingItem} ${styles.settingToggle} ${settings?.cheeseEnabled ? styles.settingOn : ''}`}
                            onClick={handleToggleCheese}
                        >
                            🧀 {settings?.cheeseEnabled ? 'ON' : 'OFF'}
                        </button>
                    </div>
                )}
                */}

                {/* Footer with start */}
                <footer className={styles.footer}>
                    <span className={styles.playerCount}>
                        <strong>{players.length}</strong> / 8 players
                    </span>

                    {isHost ? (
                        <button
                            className={`${styles.startBtn} ${!canStart ? styles.startDisabled : ''}`}
                            onClick={handleStart}
                            disabled={!canStart}
                        >
                            {players.length < 3
                                ? `Need ${3 - players.length} more`
                                : !allOthersReady
                                    ? 'Waiting for players...'
                                    : '🍷 Start Game'}
                        </button>
                    ) : (
                        !isReady && (
                            <span className={styles.readyHint}>
                                Tap Ready to start the game
                            </span>
                        )
                    )}
                </footer>
                </div>
            </main>
        </WineBackground>
    );
}
