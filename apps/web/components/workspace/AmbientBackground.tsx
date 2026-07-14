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
 *   far background — a drafting grid + one electric-blue light source
 *   background     — an architecture constellation in graphite, with
 *                    current flowing through its load-bearing node
 *   cursor light   — ambient lighting that follows the pointer
 *
 * The stage is deliberately near-monochrome: one blue light in an
 * otherwise graphite room, so the accent means something when the
 * interface uses it. The whole stack parallaxes against the cursor at
 * different depths; everything is pointer-events-none and sits behind
 * the content layers. */
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
  const farX = useSpring(useTransform(pointerX, (v) => v * -10), slow);
  const farY = useSpring(useTransform(pointerY, (v) => v * -7), slow);
  const midX = useSpring(useTransform(pointerX, (v) => v * -26), slow);
  const midY = useSpring(useTransform(pointerY, (v) => v * -17), slow);
  const springLightX = useSpring(lightX, { stiffness: 90, damping: 24 });
  const springLightY = useSpring(lightY, { stiffness: 90, damping: 24 });

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* — far background: the drafting grid ————————————————— */}
      <motion.div style={{ x: farX, y: farY }} className="grid-drafting absolute -inset-[4%]" />

      {/* — far background: one light source ——————————————————— */}
      <motion.div style={{ x: farX, y: farY }} className="absolute -inset-[10%]">
        <div
          className="glow-blob absolute right-[-10%] top-[-16%] h-[80vh] w-[52vw] rounded-full blur-3xl"
          style={{
            opacity: "var(--glow-opacity)",
            background:
              "radial-gradient(ellipse at center, var(--color-accent-500) 0%, transparent 62%)",
          }}
        />
        {/* A graphite counter-glow, bottom-left — tonal depth, no hue. */}
        <div
          className="glow-blob absolute bottom-[-30%] left-[-12%] h-[70vh] w-[46vw] rounded-full blur-3xl opacity-50 dark:opacity-35"
          style={{
            background:
              "radial-gradient(ellipse at center, var(--color-ink-300) 0%, transparent 60%)",
            animationDelay: "-14s",
          }}
        />
      </motion.div>

      {/* — far background: drifting particles ————————————————— */}
      <ParticleField />

      {/* — background: architecture constellation ————————————— */}
      <motion.div
        style={{ x: midX, y: midY }}
        className="absolute right-[-6%] top-[4%] h-[92vh] w-[58vw] opacity-80"
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

      {/* Vignette keeps the foreground legible over the stage. */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[var(--background)]/70" />
    </div>
  );
}

/** Sparse dust drifting upward on a canvas — cheap (one rAF loop, ~60
 * points), and skipped entirely under reduced motion. Graphite motes
 * with the occasional blue one — same one-light rule as the stage. */
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
      lit: Math.random() > 0.82,
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

    const isDark = () => document.documentElement.classList.contains("dark");

    let last = performance.now();
    function frame(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      context!.clearRect(0, 0, width, height);
      const graphite = isDark() ? "228, 226, 220" : "43, 42, 39";
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
        context!.fillStyle = p.lit
          ? `rgba(46, 107, 255, ${twinkle * 0.4})`
          : `rgba(${graphite}, ${twinkle * 0.22})`;
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

/** A slice of knowledge graph living behind the workspace — graphite
 * lattice, one lit node. Positions are fixed so edges stay attached;
 * motion comes from a slow sway of the whole constellation, a pulse of
 * current along the lit node's edges, and per-node shimmer — reads as
 * a system at rest, thinking, without tearing the lattice. */
function ArchitectureConstellation() {
  const reduceMotion = useReducedMotion();

  const nodes = [
    { x: 120, y: 140, r: 5 },
    { x: 320, y: 80, r: 7 },
    { x: 520, y: 190, r: 5 },
    { x: 250, y: 300, r: 9 }, // the lit node — the constellation's keystone
    { x: 460, y: 400, r: 6 },
    { x: 140, y: 470, r: 5 },
    { x: 620, y: 320, r: 7 },
    { x: 380, y: 560, r: 5 },
    { x: 600, y: 540, r: 4 },
  ];
  const LIT = 3;
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
      className="h-full w-full text-ink-950/35 dark:text-ink-50/30"
      animate={reduceMotion ? undefined : { rotate: [0, 2, 0, -2, 0], y: [0, -12, 0] }}
      transition={{ repeat: Infinity, duration: 48, ease: "easeInOut" }}
    >
      {edges.map(([a, b], index) => {
        const lit = a === LIT || b === LIT;
        return (
          <line
            key={`${a}-${b}`}
            x1={nodes[a].x}
            y1={nodes[a].y}
            x2={nodes[b].x}
            y2={nodes[b].y}
            stroke={lit ? "var(--color-accent-500)" : "currentColor"}
            strokeWidth="1"
            className="graph-edge-pulse"
            style={{ animationDelay: `${index * -0.7}s` }}
          />
        );
      })}
      {nodes.map((node, index) => {
        const lit = index === LIT;
        return (
          <g key={index}>
            {lit ? (
              <motion.circle
                cx={node.x}
                cy={node.y}
                r={node.r * 3}
                fill="var(--color-accent-500)"
                initial={{ opacity: 0.06 }}
                animate={reduceMotion ? undefined : { opacity: [0.05, 0.16, 0.05] }}
                transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
              />
            ) : null}
            <motion.circle
              cx={node.x}
              cy={node.y}
              r={node.r}
              fill={lit ? "var(--color-accent-500)" : "currentColor"}
              initial={{ opacity: 0.45 }}
              animate={reduceMotion ? undefined : { opacity: [0.35, lit ? 0.9 : 0.7, 0.35] }}
              transition={{ repeat: Infinity, duration: 4 + (index % 3) * 2, ease: "easeInOut" }}
            />
          </g>
        );
      })}
    </motion.svg>
  );
}
