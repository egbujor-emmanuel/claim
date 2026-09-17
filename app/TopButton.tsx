"use client";

import { useEffect, useState } from "react";

/**
 * A way back to the top, from anywhere.
 *
 * The opening is a pinned scroll sequence: going down runs an animation, and
 * going back up runs it in reverse, which does not feel like navigating. Once
 * someone is deep in a 40-card scan there is nothing on screen that returns
 * them to the search box, and scrolling up through the title sequence is not an
 * obvious way to get there.
 *
 * Appears only after the first screen, so it never sits on top of the opening.
 */
export function TopButton() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > window.innerHeight * 0.9);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!show) return null;

  return (
    <button
      type="button"
      className="to-top"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Back to the top"
    >
      ↑ Top
    </button>
  );
}
