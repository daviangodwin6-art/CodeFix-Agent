// Motion helpers on anime.js v4. All of it is decoration: with motion off, nothing here runs.
// Motion follows the system's "reduce motion" setting until the user picks with the Motion switch
// (remembered in localStorage). The choice is the `motion` class on <html>, which the CSS keys off too.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { animate, createScope, spring, stagger, utils } from "animejs";

const html = document.documentElement;
function stored() {
  try { return localStorage.getItem("motion"); } catch (e) { return null; }
}
html.classList.toggle("motion", stored() ? stored() === "1" : !window.matchMedia("(prefers-reduced-motion: reduce)").matches);

export const still = () => !html.classList.contains("motion");

export function MotionToggle({ className = "" }) {
  const [on, setOn] = useState(!still());
  function toggle() {
    html.classList.toggle("motion", !on);
    try { localStorage.setItem("motion", on ? "0" : "1"); } catch (e) { /* private mode: lasts for this page */ }
    setOn(!on);
  }
  return (
    <button type="button" role="switch" aria-checked={on} onClick={toggle} title="Turn animations on or off"
            className={"flex items-center gap-1 whitespace-nowrap rounded px-2 py-1 border transition-colors " +
              (on ? "border-blue-200 bg-blue-50 text-blue-700 " : "border-slate-300 bg-white text-slate-600 ") + className}>
      <span aria-hidden="true" className="material-symbols-outlined text-[14px]">animation</span>
      <span>Motion {on ? "on" : "off"}</span>
    </button>
  );
}
const clean = (animation) => utils.cleanInlineStyles(animation); // leave no transform behind

// Run `setup` (anime.js calls) inside `ref` whenever deps change; reverted on cleanup.
export function useAnime(ref, setup, deps) {
  useLayoutEffect(() => {
    if (still() || !ref.current) return;
    const scope = createScope({ root: ref }).add(setup);
    return () => scope.revert();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}

// Fade + rise, one after another.
export function enter(targets, params) {
  const list = [...targets];
  if (!list.length) return;
  // from-values are applied at once, so nothing flashes; `clean` then restores the element's own styles
  animate(list, { opacity: [0, 1], y: [14, 0], duration: 600, ease: "outExpo", delay: stagger(70), onComplete: clean, ...params });
}

// Springy scale-in, for things that just changed state.
export function pop(targets, params) {
  const list = [...targets];
  if (!list.length) return;
  animate(list, { scale: [0.6, 1], ease: spring({ bounce: 0.45, duration: 450 }), onComplete: clean, ...params });
}

// Which indexes changed since the previous render. `first` is true on the first render (everything is new).
export function useChanged(values) {
  const prev = useRef(null);
  const first = prev.current === null;
  const changed = values.map((v, i) => (first || prev.current[i] !== v ? i : -1)).filter((i) => i >= 0);
  useEffect(() => { prev.current = values; });
  return { first, changed, key: values.join("|") };
}

// A number that counts up to its value.
export function CountUp({ value }) {
  const target = Number(value) || 0;
  const [shown, setShown] = useState(still() ? target : 0);
  useEffect(() => {
    if (still()) return setShown(target);
    const counter = { v: 0 };
    const animation = animate(counter, {
      v: target, duration: 900, ease: "outExpo",
      onUpdate: () => setShown(Math.round(counter.v)), onComplete: () => setShown(target),
    });
    return () => animation.pause();
  }, [target]);
  return shown;
}
