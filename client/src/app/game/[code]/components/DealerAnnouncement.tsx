'use client';

import styles from '../page.module.css';

interface DealerAnnouncementProps {
    showDealerAnnouncement: boolean;
}

/**
 * Full-screen announcement shown to the player when they are selected as dealer.
 * Appears after the dealer roulette animation lands on them.
 */
export function DealerAnnouncement({ showDealerAnnouncement }: DealerAnnouncementProps) {
    if (!showDealerAnnouncement) return null;

    return (
        <div className={styles.dealerAnnouncement}>
            <div className={styles.dealerAnnouncementContent}>
                <span className={styles.dealerAnnouncementIcon}>👑</span>
                <h2 className={styles.dealerAnnouncementTitle}>You are the Dealer!</h2>
                <p className={styles.dealerAnnouncementSubtitle}>Assign drinks to each player</p>
            </div>
        </div>
    );
}
