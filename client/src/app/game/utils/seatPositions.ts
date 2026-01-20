/**
 * Seat position calculation utilities.
 *
 * CRITICAL: The 42% radius (0.42) must match the CSS positioning.
 * All seat-related position calculations should use these functions.
 */

import { SEAT_RADIUS_PERCENT, SEAT_RADIUS } from '../constants';

/**
 * Get CSS position for a seat around the circular table.
 * Returns percentage values for left/top positioning.
 *
 * @param seat - Seat index (0 to totalSeats-1)
 * @param totalSeats - Total number of seats at the table
 * @returns Object with left and top CSS percentage values
 */
export function getSeatPosition(seat: number, totalSeats: number): { left: string; top: string } {
    const angle = (seat / totalSeats) * 2 * Math.PI - Math.PI / 2; // Start from top
    return {
        left: `${50 + SEAT_RADIUS_PERCENT * Math.cos(angle)}%`,
        top: `${50 + SEAT_RADIUS_PERCENT * Math.sin(angle)}%`,
    };
}

/**
 * Get pixel position for a seat within a table rect.
 * Used for hit detection during drag-drop.
 *
 * @param seat - Seat index (0 to totalSeats-1)
 * @param totalSeats - Total number of seats at the table
 * @param tableRect - DOMRect of the table element
 * @returns Object with x and y pixel coordinates
 */
export function getPixelPosition(
    seat: number,
    totalSeats: number,
    tableRect: DOMRect
): { x: number; y: number } {
    // Safety check: ensure valid dimensions to prevent NaN
    if (!tableRect.width || !tableRect.height || tableRect.width === 0 || tableRect.height === 0) {
        return { x: 0, y: 0 };
    }
    const angle = (seat / totalSeats) * 2 * Math.PI - Math.PI / 2;
    return {
        x: tableRect.left + tableRect.width * (0.5 + SEAT_RADIUS * Math.cos(angle)),
        y: tableRect.top + tableRect.height * (0.5 + SEAT_RADIUS * Math.sin(angle)),
    };
}
