// Share one observer and one pair of listeners across all Mythic artworks.
// No timers or per-frame React updates. The last subscriber releases all resources.
const targets = new Map<HTMLElement, boolean>();
let observer: IntersectionObserver | undefined;
let reducedMotion: MediaQueryList | undefined;

function syncMotion() {
  const allowed = !document.hidden && !reducedMotion?.matches;
  for (const [element, visible] of targets) element.dataset.motionActive = String(allowed && visible);
}

export function observeVisibleMotion(element: HTMLElement): () => void {
  element.dataset.motionActive = "false";
  if (!("IntersectionObserver" in window)) return () => {}; // Static fallback is deliberate.
  if (!observer) {
    reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const target = entry.target as HTMLElement;
        // A nearly complete artwork keeps individual sparkles from running offscreen.
        if (targets.has(target)) targets.set(target, entry.isIntersecting && entry.intersectionRatio >= .98);
      }
      syncMotion();
    }, { threshold: [.98] });
    document.addEventListener("visibilitychange", syncMotion);
    reducedMotion.addEventListener("change", syncMotion);
  }
  targets.set(element, false);
  observer.observe(element);
  return () => {
    observer?.unobserve(element);
    targets.delete(element);
    element.dataset.motionActive = "false";
    if (targets.size === 0) {
      observer?.disconnect();
      observer = undefined;
      document.removeEventListener("visibilitychange", syncMotion);
      reducedMotion?.removeEventListener("change", syncMotion);
      reducedMotion = undefined;
    }
  };
}
