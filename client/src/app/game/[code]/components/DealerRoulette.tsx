'use client';

import type { Player } from '@in-vino-morte/shared';
import type { RoulettePhase } from '../hooks/useDealerRoulette';
import { AVATARS } from '../constants';
import styles from '../page.module.css';

interface DealerRouletteProps {
    showDealerRoulette: boolean;
    rouletteIndex: number;
    roulettePhase: RoulettePhase;
    alivePlayers: Player[];
}

/**
 * Full-screen roulette overlay for dealer selection animation.
 *
 * Animation phases:
 * 1. Spinning (0-60% progress): Fast 60ms intervals
 * 2. Slowing (60-85% progress): Variable delay (60 + (progress - 0.6) * 400ms)
 * 3. Holding (85-100%): Variable delay (200 + (progress - 0.85) * 800ms)
 * 4. Landed: Hold for 1200ms before hiding
 *
 * Shows a carousel of all alive players with the current selection highlighted.
 */
export function DealerRoulette({
    showDealerRoulette,
    rouletteIndex,
    roulettePhase,
    alivePlayers,
}: DealerRouletteProps) {
    if (!showDealerRoulette) return null;

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
}
