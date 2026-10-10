import { useEffect, useRef } from 'react';

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  spin: number;
  angle: number;
  color: string;
  round: boolean;
}

const GRAVITY = 0.32;
const DRAG = 0.985;

/** One celebratory burst from two points near the top. Draws nothing when the user prefers reduced motion. */
export function Confetti({ colors, count = 160 }: { colors: string[]; count?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = innerWidth * dpr;
      canvas.height = innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    addEventListener('resize', resize);

    const burst = (originX: number, direction: number): Piece[] =>
      Array.from({ length: count / 2 }, () => {
        const angle = (-90 + direction * (15 + Math.random() * 45)) * (Math.PI / 180);
        const speed = 9 + Math.random() * 11;
        return {
          x: originX,
          y: innerHeight * 0.35,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: 7 + Math.random() * 8,
          spin: (Math.random() - 0.5) * 0.4,
          angle: Math.random() * Math.PI,
          color: colors[Math.floor(Math.random() * colors.length)],
          round: Math.random() < 0.3,
        };
      });
    const pieces = [...burst(innerWidth * 0.2, 1), ...burst(innerWidth * 0.8, -1)];

    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      // Physics is tuned per 60fps frame; scale by real elapsed time so fast displays don't rush it.
      const dt = Math.min((now - last) / (1000 / 60), 3);
      last = now;
      const drag = DRAG ** dt;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      let alive = 0;
      for (const p of pieces) {
        p.vx *= drag;
        p.vy = p.vy * drag + GRAVITY * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.angle += p.spin * dt;
        if (p.y > innerHeight + 20) continue;
        alive++;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        if (p.round) {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2.4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Squashing the width with the angle reads as a paper strip turning over.
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size * Math.abs(Math.cos(p.angle * 2)), p.size / 2);
        }
        ctx.restore();
      }
      if (alive) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      removeEventListener('resize', resize);
    };
  }, [colors, count]);

  return <canvas ref={ref} className="confetti" aria-hidden />;
}
