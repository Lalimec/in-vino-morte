// Audio manager for game sounds
class AudioManager {
    private sounds: Map<string, HTMLAudioElement> = new Map();
    private enabled = true;
    private volume = 0.7;
    private initialized = false;

    public init(): void {
        if (this.initialized || typeof window === 'undefined') return;

        // Preload sounds
        const soundFiles: Record<string, string> = {
            'pickup': '/sounds/pickup.mp3',
            'drop': '/sounds/drop.mp3',
            'invalid': '/sounds/invalid.mp3',
            'flip': '/sounds/flip.mp3',
            'safe': '/sounds/safe.mp3',
            'doom': '/sounds/doom.mp3',
            'elim': '/sounds/elim.mp3',
            'win': '/sounds/win.mp3',
            'turn': '/sounds/turn.mp3',
            'swap': '/sounds/swap.mp3',
        };

        for (const [name, path] of Object.entries(soundFiles)) {
            try {
                const audio = new Audio();
                audio.preload = 'none'; // Don't preload to avoid 404 errors
                audio.volume = this.volume;
                audio.src = path;
                // Silently handle load errors
                audio.onerror = () => { /* Sound file not found, ignore */ };
                this.sounds.set(name, audio);
            } catch {
                // Audio creation failed, ignore
            }
        }

        this.initialized = true;
    }

    public play(soundName: string): void {
        if (!this.enabled) return;

        const sound = this.sounds.get(soundName);
        if (sound) {
            // Clone the audio for overlapping plays
            const clone = sound.cloneNode() as HTMLAudioElement;
            clone.volume = this.volume;
            clone.play().catch(() => {
                // Autoplay might be blocked, that's ok
            });
        }
    }

    public setEnabled(enabled: boolean): void {
        this.enabled = enabled;
    }

    public isEnabled(): boolean {
        return this.enabled;
    }

    public setVolume(volume: number): void {
        this.volume = Math.max(0, Math.min(1, volume));
        for (const audio of this.sounds.values()) {
            audio.volume = this.volume;
        }
    }

    // Unlock audio context (required for mobile)
    public unlock(): void {
        const audio = new Audio();
        audio.play().catch(() => { });
        audio.pause();
    }
}

export const audioManager = new AudioManager();
