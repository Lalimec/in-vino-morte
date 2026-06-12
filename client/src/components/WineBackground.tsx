'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { shouldUseStaticBackground } from '@/lib/config';

const LightPillar = dynamic(() => import('./LightPillar'), {
  ssr: false,
  loading: () => null,
});

/**
 * Fallback gradient, only shown when WebGL is unavailable or before the canvas
 * has painted. Uses the shader's own colors (wine #4d0f39 top, green #173a0e
 * bottom) so the page never flashes a mismatched background. This is NOT the
 * normal background - the real organic light pillar (below) is.
 */
const FALLBACK_BACKGROUND =
  'radial-gradient(46% 44% at 50% 24%, rgba(77, 15, 57, 0.45) 0%, rgba(77, 15, 57, 0) 66%),' +
  'radial-gradient(52% 46% at 50% 80%, rgba(23, 58, 14, 0.35) 0%, rgba(23, 58, 14, 0) 66%),' +
  'radial-gradient(ellipse at center, var(--color-bg-secondary) 0%, var(--color-bg-primary) 78%)';

interface WineBackgroundProps {
  children?: React.ReactNode;
}

export default function WineBackground({ children }: WineBackgroundProps) {
  // Selector subscription: only re-render when motionEnabled actually changes,
  // not on every game-state update.
  const motionEnabled = useGameStore((s) => s.motionEnabled);

  // Decide after mount whether this device should animate the shader.
  // Default to non-animated (static frame) for SSR / first paint so phones
  // never start the 60fps raymarch loop.
  const [staticOnly, setStaticOnly] = useState(true);
  useEffect(() => {
    setStaticOnly(shouldUseStaticBackground());
  }, []);

  // The organic pillar is ALWAYS rendered (shape preserved). Only the animation
  // loop is gated: full 60fps on capable desktops with motion enabled, a single
  // static frame on mobile / reduced-motion / motion-off.
  const animated = motionEnabled && !staticOnly;

  return (
    <div className="relative min-h-dvh w-full overflow-hidden" style={{ background: 'var(--color-bg-primary)' }}>
      {/* Fallback gradient: instant first paint + shown if WebGL is unsupported */}
      <div className="fixed inset-0" style={{ zIndex: 0, background: FALLBACK_BACKGROUND }} />

      {/* Real organic light pillar - same shader, same shape everywhere.
          animated=false renders one static frame instead of looping. */}
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
          animated={animated}
        />
      </div>

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
