import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../../lib/useReducedMotion';

/**
 * Replays an illustration while it is on screen: `play` turns its CSS animations on and
 * `run` changes every `ms` (and on every re-entry), so keying the illustration on it starts
 * the story over. Without motion, `play` stays false and the illustration rests on its final frame.
 */
export function useLoop<T extends Element>(ms?: number) {
  const reduced = useReducedMotion();
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);
  const [run, setRun] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced || !ms) return;
    const io = new IntersectionObserver(
      ([e]) => {
        setVisible(e.isIntersecting);
        if (e.isIntersecting) setRun((r) => r + 1);
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
    };
  }, [reduced, ms]);

  useEffect(() => {
    if (!visible || !ms) return;
    const id = window.setTimeout(() => {
      setRun((r) => r + 1);
    }, ms);
    return () => {
      window.clearTimeout(id);
    };
  }, [visible, run, ms]);

  return { ref, play: visible && !reduced && !!ms, run };
}
