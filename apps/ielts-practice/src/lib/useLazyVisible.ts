import { useEffect, useRef, useState } from 'react';

// Track whether an element is (or has been) visible in the viewport so a
// component can defer expensive network fetches until the user scrolls to it.
// Returns a ref to attach + a stickyVisible boolean (true the first time the
// element crosses the threshold, then stays true).
export const useLazyVisible = (options?: IntersectionObserverInit): {
  ref: (el: HTMLElement | null) => void;
  visible: boolean;
} => {
  const [visible, setVisible] = useState(false);
  const elRef = useRef<HTMLElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const ref = (el: HTMLElement | null) => {
    if (elRef.current === el) return;
    if (observerRef.current && elRef.current) {
      observerRef.current.unobserve(elRef.current);
    }
    elRef.current = el;
    if (el && observerRef.current) {
      observerRef.current.observe(el);
    }
  };

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observerRef.current?.disconnect();
            return;
          }
        }
      },
      { rootMargin: '120px', threshold: 0, ...options },
    );
    if (elRef.current) observerRef.current.observe(elRef.current);
    return () => {
      observerRef.current?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ref, visible };
};
