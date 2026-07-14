"use client";

import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";
import { useEffect, useRef } from "react";

/** The workspace's stage, back to front:
 *
 *   far background — evolving aurora gradients + drifting particles
 *   background     — an animated architecture constellation (orbiting
 *                    nodes, pulsing connections)
 *   cursor light   — ambient lighting that follows the pointer
 *
 * The whole stack parallaxes against the cursor at different depths, so
 * moving the mouse subtly shifts perspective. Everything is
 * pointer-events-none and sits behind the content layers. */
export function AmbientBackground() {
  const reduceMotion = useReducedMotion();

  // One pointer listener drives every layer. Normalized -1..1.
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  // Cursor light tracks in px.
  const lightX = useMotionValue(-600);
  const lightY = useMotionValue(-600);

  useEffect(() => {
    if (reduceMotion) return;
    function onPointerMove(event: PointerEvent) {
      pointerX.set((event.clientX / window.innerWidth - 0.5) * 2);
      pointerY.set((event.clientY / window.innerHeight - 0.5) * 2);
      lightX.set(event.clientX);
      lightY.set(event.clientY);
    }
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", onPointerMove);
  }, [reduceMotion, pointerX, pointerY, lightX, lightY]);

  const slow = { stiffness: 40, damping: 20, mass: 1.2 };
  // Far layer barely moves; nearer layers move more — depth from motion.
  const farX = useSpring(useTransform(pointerX, (v) => v * -12), slow);
  const farY = useSpring(useTransform(pointerY, (v) => v * -8), slow);
  const midX = useSpring(useTransform(pointerX, (v) => v * -28), slow);
  const midY = useSpring(useTransform(pointerY, (v) => v * -18), slow);
  const springLightX = useSpring(lightX, { stiffness: 90, damping: 24 });
  const springLightY = useSpring(lightY, { stiffness: 90, damping: 24 });

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* — far background: aurora ————————————————————————————— */}
      <motion.div style={{ x: farX, y: farY }} className="absolute -inset-[10%]">
        <div
          className="aurora-blob absolute left-[42%] top-[-18%] h-[70vh] w-[55vw] rounded-full blur-3xl"
          style={{
            opacity: "var(--aurora-opacity)",
            background:
              "radial-gradient(ellipse at center, var(--color-aurora-blue) 0%, transparent 65%)",
          }}
        />
        <div
          className="aurora-blob-alt absolute right-[-8%] top-[8%] h-[75vh] w-[45vw] rounded-full blur-3xl"
          style={{
            opacity: "calc(var(--aurora-opacity) * 0.9)",
            background:
              "radial-gradient(ellipse at center, var(--color-aurora-violet) 0%, transparent 62%)",
          }}
        />
        <div
          className="aurora-blob absolute bottom-[-25%] left-[8%] h-[60vh] w-[40vw] rounded-full blur-3xl"
          style={{
            opacity: "calc(var(--aurora-opacity) * 0.55)",
            background:
              "radial-gradient(ellipse at center, var(--color-aurora-magenta) 0%, transparent 60%)",
            animationDelay: "-12s",
          }}
        />
      </motion.div>

      {/* — far background: drifting particles ————————————————— */}
      <ParticleField />

      {/* — background: animated architecture ————————————————— */}
      <motion.div
        style={{ x: midX, y: midY }}
        className="absolute right-[-6%] top-[4%] h-[92vh] w-[58vw] opacity-70 dark:opacity-80"
      >
        <ArchitectureConstellation />
      </motion.div>

      {/* — ambient cursor lighting ————————————————————————————— */}
      {!reduceMotion && (
        <motion.div
          className="absolute size-[42rem] rounded-full"
          style={{
            left: springLightX,
            top: springLightY,
            translateX: "-50%",
            translateY: "-50%",
            background: "radial-gradient(circle, var(--cursor-light) 0%, transparent 65%)",
          }}
        />
      )}

      {/* Vignette keeps the foreground legible over the light show. */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[var(--background)]/70" />
    </div>
  );
}

/** Sparse dust drifting upward on a canvas — cheap (one rAF loop, ~60
 * points), and skipped entirely under reduced motion. */
function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    let raf = 0;
    let width = 0;
    let height = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const particles = Array.from({ length: 60 }, () => ({
      x: Math.random(),
      y: Math.random(),
      radius: 0.6 + Math.random() * 1.6,
      speed: 0.008 + Math.random() * 0.02, // % of height per second
      drift: (Math.random() - 0.5) * 0.01,
      phase: Math.random() * Math.PI * 2,
      violet: Math.random() > 0.5,
    }));

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas!.width = width * dpr;
      canvas!.height = height * dpr;
      context!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    let last = performance.now();
    function frame(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      context!.clearRect(0, 0, width, height);
      for (const p of particles) {
        p.y -= p.speed * dt * 6;
        p.x += p.drift * dt * 6;
        if (p.y < -0.02) {
          p.y = 1.02;
          p.x = Math.random();
        }
        const twinkle = 0.35 + 0.3 * Math.sin(now / 900 + p.phase);
        context!.beginPath();
        context!.arc(p.x * width, p.y * height, p.radius, 0, Math.PI * 2);
        context!.fillStyle = p.violet
          ? `rgba(139, 92, 246, ${twinkle * 0.35})`
          : `rgba(79, 124, 255, ${twinkle * 0.3})`;
        context!.fill();
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [reduceMotion]);

  if (reduceMotion) return null;
  return <canvas ref={canvasRef} className="absolute inset-0" />;
}

/** A slice of knowledge graph living behind the workspace: nodes on slow
 * orbits, connections pulsing. Positions are fixed so edges stay
 * attached; motion comes from a slow sway of the whole constellation
 * plus per-node shimmer — reads as orbit without tearing the lattice. */
function ArchitectureConstellation() {
  const reduceMotion = useReducedMotion();

  const nodes = [
    { x: 120, y: 140, r: 5 },
    { x: 320, y: 80, r: 7 },
    { x: 520, y: 190, r: 5 },
    { x: 250, y: 300, r: 9 },
    { x: 460, y: 400, r: 6 },
    { x: 140, y: 470, r: 5 },
    { x: 620, y: 320, r: 7 },
    { x: 380, y: 560, r: 5 },
    { x: 600, y: 540, r: 4 },
  ];
  const edges: Array<[number, number]> = [
    [0, 1],
    [1, 2],
    [1, 3],
    [0, 3],
    [3, 4],
    [2, 6],
    [4, 6],
    [3, 5],
    [4, 7],
    [6, 8],
    [7, 8],
  ];

  return (
    <motion.svg
      viewBox="0 0 720 680"
      className="h-full w-full"
      animate={reduceMotion ? undefined : { rotate: [0, 2.5, 0, -2.5, 0], y: [0, -14, 0] }}
      transition={{ repeat: Infinity, duration: 48, ease: "easeInOut" }}
    >
      <defs>
        <linearGradient id="constellation-edge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--color-aurora-blue)" />
          <stop offset="100%" stopColor="var(--color-aurora-violet)" />
        </linearGradient>
      </defs>
      {edges.map(([a, b], index) => (
        <line
          key={`${a}-${b}`}
          x1={nodes[a].x}
          y1={nodes[a].y}
          x2={nodes[b].x}
          y2={nodes[b].y}
          stroke="url(#constellation-edge)"
          strokeWidth="1"
          className="graph-edge-pulse"
          style={{ animationDelay: `${index * -0.7}s` }}
        />
      ))}
      {nodes.map((node, index) => (
        <g key={index}>
          <motion.circle
            cx={node.x}
            cy={node.y}
            r={node.r * 3}
            fill="var(--color-aurora-violet)"
            initial={{ opacity: 0.05 }}
            animate={reduceMotion ? undefined : { opacity: [0.04, 0.12, 0.04] }}
            transition={{ repeat: Infinity, duration: 5 + index, ease: "easeInOut" }}
          />
          <motion.circle
            cx={node.x}
            cy={node.y}
            r={node.r}
            fill="var(--color-aurora-blue)"
            initial={{ opacity: 0.5 }}
            animate={reduceMotion ? undefined : { opacity: [0.4, 0.85, 0.4] }}
            transition={{ repeat: Infinity, duration: 4 + (index % 3) * 2, ease: "easeInOut" }}
          />
        </g>
      ))}
    </motion.svg>
  );
}
