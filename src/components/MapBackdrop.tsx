"use client";

import { useState } from "react";

import VectorBasemap from "./VectorBasemap";

/**
 * Our own vector basemap, rendered as a passive backdrop for the signed-out
 * landing — the real map behind frosted glass.
 *
 * Airport `dots` (coordinates only — no names, counts or ids) render as a cheap
 * GL circle layer so the network shows through the blur, but nothing an operator
 * signs in for reaches the browser. The map is frozen (interactive=false +
 * pointer-events-none) and carries no controls. The blur and a slight scale-up
 * (to hide the blur's soft, transparent edges) are applied here. The map's own
 * attribution control is dropped because it would be blurred and illegible — the
 * landing prints a sharp OpenStreetMap credit of its own instead.
 *
 * If WebGL is missing or the map fails to start, this renders nothing and the
 * landing's static field (gradient + station glows) shows through unchanged.
 */
export default function MapBackdrop({
  dots = [],
}: {
  dots?: [number, number][];
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Protomaps "black" is near-black; brighten it so the map actually reads
          as a backdrop, and keep the blur light enough that coastlines show. */}
      <div className="absolute inset-0 origin-center scale-[1.06] blur-[3px] brightness-[1.7] contrast-[1.08]">
        <VectorBasemap
          markers={[]}
          dots={dots}
          activeId={null}
          onSelect={() => {}}
          onFail={() => setFailed(true)}
          interactive={false}
          controls={false}
        />
      </div>
    </div>
  );
}
