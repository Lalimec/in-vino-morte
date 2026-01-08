'use client';

import type { Player, VotingPhase } from '@in-vino-morte/shared';
import { AVATARS } from '../constants';
import styles from '../page.module.css';

interface GameOverProps {
    winner: Player | undefined;
    isWinner: boolean;
    votingPhase: VotingPhase;
    votedSeats: number[];
    requiredVotes: number;
    yourSeat: number;
    players: Player[];
    onVoteRematch: () => void;
    onLeaveRoom: () => void;
    onExit: () => void;
}

/**
 * Game over screen with winner announcement and voting UI.
 *
 * Shows:
 * - Winner announcement (special styling if you won)
 * - Vote count and list of who voted
 * - Play Again / Leave buttons
 * - Starting message when all vote yes
 */
export function GameOver({
    winner,
    isWinner,
    votingPhase,
    votedSeats,
    requiredVotes,
    yourSeat,
    players,
    onVoteRematch,
    onLeaveRoom,
    onExit,
}: GameOverProps) {
    const hasVoted = votedSeats.includes(yourSeat);
    const isVoting = votingPhase === 'VOTING';
    const isStarting = votingPhase === 'STARTING';

    return (
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
                                onClick={onVoteRematch}
                            >
                                {hasVoted ? '✓ Voted!' : 'Play Again'}
                            </button>
                            <button
                                className={styles.leaveButton}
                                onClick={onLeaveRoom}
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
                        <button className={styles.menuButton} onClick={onExit}>
                            Return to Menu
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
