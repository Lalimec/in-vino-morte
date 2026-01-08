// Haptic feedback manager
class HapticManager {
    private enabled = true;
    private supported = false;

    constructor() {
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            this.supported = true;
        }
    }

    public setEnabled(enabled: boolean): void {
        this.enabled = enabled;
    }

    public isEnabled(): boolean {
        return this.enabled && this.supported;
    }

    public light(): void {
        if (!this.isEnabled()) return;
        navigator.vibrate(10);
    }

    public medium(): void {
        if (!this.isEnabled()) return;
        navigator.vibrate(25);
    }

    public heavy(): void {
        if (!this.isEnabled()) return;
        navigator.vibrate([30, 50, 50]);
    }

    public success(): void {
        if (!this.isEnabled()) return;
        navigator.vibrate([10, 50, 20]);
    }

    public error(): void {
        if (!this.isEnabled()) return;
        navigator.vibrate([50, 30, 50, 30, 50]);
    }

    public doom(): void {
        if (!this.isEnabled()) return;
        navigator.vibrate([100, 50, 100]);
    }
}

export const hapticManager = new HapticManager();
