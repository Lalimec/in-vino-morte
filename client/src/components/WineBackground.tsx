'use client';

import dynamic from 'next/dynamic';
import { useGameStore } from '@/stores/gameStore';

const LightPillar = dynamic(() => import('./LightPillar'), {
  ssr: false,
  loading: () => null,
});

interface WineBackgroundProps {
  children?: React.ReactNode;
}

export default function WineBackground({ children }: WineBackgroundProps) {
  const { motionEnabled } = useGameStore();

  return (
    <div className="relative min-h-dvh w-full overflow-hidden" style={{ background: 'var(--color-bg-primary)' }}>
      {/* Animated background - only render when motion is enabled */}
      {motionEnabled && (
        <div className="fixed inset-0" style={{ zIndex: 0 }}>
          <LightPillar
            topColor="#4d0f39"
            bottomColor="#173a0e"
            intensity={1}
            rotationSpeed={0.3}
            interactive={false}
            glowAmount={0.02}
            pillarWidth={3}
            pillarHeight={0.25}
            noiseIntensity={0.6}
            pillarRotation={180}
            mixBlendMode="normal"
          />
        </div>
      )}

      {/* Static fallback gradient when motion is disabled */}
      {!motionEnabled && (
        <div
          className="fixed inset-0"
          style={{
            zIndex: 0,
            background: 'radial-gradient(ellipse at center, var(--color-bg-secondary) 0%, var(--color-bg-primary) 70%)',
          }}
        />
      )}

      {/* Blur overlay layer - workaround for backdrop-filter not working on WebGL canvas */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          zIndex: 1,
          background: 'radial-gradient(ellipse at center, rgba(77, 15, 57, 0.15) 0%, rgba(13, 10, 14, 0.3) 70%)',
          backdropFilter: 'blur(0px)', /* Placeholder for stacking context */
        }}
      />

      {/* Content */}
      <div className="relative" style={{ zIndex: 2 }}>
        {children}
      </div>
    </div>
  );
}
