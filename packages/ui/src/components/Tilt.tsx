"use client";

import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "framer-motion";
import type { PointerEvent, ReactNode } from "react";

export interface TiltProps {
  children: ReactNode;
  className?: string;
  /** Max rotation in degrees at the panel's edge. Keep small — panels
   * should feel like they have mass, not like they're on a gimbal. */
  maxTilt?: number;
  /** Paint a specular highlight that tracks the cursor (cursor-aware
   * lighting), so hovering reads as holding a light over glass. */
  glare?: boolean;
}

/** Cursor-aware 3D tilt — the workspace's "panels are physical objects"
 * primitive. Rotation and lighting both run through springs so the panel
 * glides under the cursor instead of snapping. Inert under
 * `prefers-reduced-motion`. */
export function Tilt({ children, className = "", maxTilt = 5, glare = true }: TiltProps) {
  const reduceMotion = useReducedMotion();

  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const lightX = useMotionValue(50);
  const lightY = useMotionValue(50);
  const glareOpacity = useMotionValue(0);

  const spring = { stiffness: 220, damping: 24, mass: 0.6 };
  const springRotateX = useSpring(rotateX, spring);
  const springRotateY = useSpring(rotateY, spring);
  const springGlare = useSpring(glareOpacity, { stiffness: 180, damping: 26 });

  const glareBackground = useMotionTemplate`radial-gradient(340px circle at ${lightX}% ${lightY}%, var(--glass-highlight), transparent 65%)`;

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (reduceMotion) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    rotateX.set((0.5 - py) * maxTilt * 2);
    rotateY.set((px - 0.5) * maxTilt * 2);
    lightX.set(px * 100);
    lightY.set(py * 100);
    glareOpacity.set(1);
  }

  function handlePointerLeave() {
    rotateX.set(0);
    rotateY.set(0);
    glareOpacity.set(0);
  }

  return (
    <motion.div
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      style={{
        rotateX: springRotateX,
        rotateY: springRotateY,
        transformPerspective: 900,
        transformStyle: "preserve-3d",
      }}
      className={`relative ${className}`}
    >
      {children}
      {glare && !reduceMotion ? (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit]"
          style={{ background: glareBackground, opacity: springGlare }}
        />
      ) : null}
    </motion.div>
  );
}
