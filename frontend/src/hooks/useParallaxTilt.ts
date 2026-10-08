'use client';

import { useState, useRef, useCallback, CSSProperties } from 'react';

interface ParallaxTiltOptions {
  maxTilt?: number; // Maximum tilt angle in degrees (default: 4.5)
  perspective?: number; // Perspective distance in px (default: 1200)
  scale?: number; // Scale on hover (default: 1.01)
  speed?: number; // Transition speed in ms (default: 300)
  easing?: string; // Transition timing function
  disabled?: boolean;
}

export function useParallaxTilt<T extends HTMLElement = HTMLDivElement>(
  options: ParallaxTiltOptions = {}
) {
  const {
    maxTilt = 4.5,
    perspective = 1200,
    scale = 1.01,
    speed = 350,
    easing = 'cubic-bezier(0.23, 1, 0.32, 1)',
    disabled = false,
  } = options;

  const ref = useRef<T | null>(null);
  const [transformStyle, setTransformStyle] = useState<CSSProperties>({
    transform: `perspective(${perspective}px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`,
    transition: `transform ${speed}ms ${easing}`,
    transformStyle: 'preserve-3d',
  });

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<T>) => {
      if (disabled || !ref.current) return;

      const rect = ref.current.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;

      // Cursor position relative to center of element: -1 to +1
      const mouseX = (e.clientX - rect.left - width / 2) / (width / 2);
      const mouseY = (e.clientY - rect.top - height / 2) / (height / 2);

      // Clamp between -1 and 1
      const clampedX = Math.max(-1, Math.min(1, mouseX));
      const clampedY = Math.max(-1, Math.min(1, mouseY));

      // Calculate rotation angles (rotateX is driven by Y, rotateY is driven by X)
      const rotateX = -clampedY * maxTilt;
      const rotateY = clampedX * maxTilt;

      setTransformStyle({
        transform: `perspective(${perspective}px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(${scale}, ${scale}, 1)`,
        transition: 'transform 80ms ease-out',
        transformStyle: 'preserve-3d',
      });
    },
    [disabled, maxTilt, perspective, scale]
  );

  const handleMouseLeave = useCallback(() => {
    if (disabled) return;
    setTransformStyle({
      transform: `perspective(${perspective}px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`,
      transition: `transform ${speed}ms ${easing}`,
      transformStyle: 'preserve-3d',
    });
  }, [disabled, perspective, speed, easing]);

  return {
    ref,
    tiltStyle: transformStyle,
    onMouseMove: handleMouseMove,
    onMouseLeave: handleMouseLeave,
  };
}
