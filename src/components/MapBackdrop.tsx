"use client";

import { useState } from "react";

import VectorBasemap from "./VectorBasemap";

/**
 * Our own vector basemap, rendered as a passive backdrop for the signed-out
 * landing — the real map behind frosted glass.
 *
 * No markers are passed, so no organisation data reaches a signed-out visitor;
 * the map is frozen (interactive=false + pointer-events-none) and carries no
 * controls. The blur and a slight scale-up (to hide the blur's soft, transparent
 * edges) are applied here. The map's own attribution control is dropped because
 * it would be blurred and illegible — the landing prints a sharp OpenStreetMap
 * credit of its own instead.
 *
 * If WebGL is missing or the map fails to start, this renders nothing and the
 * landing's static field (gradient + station glows) shows through unchanged.
 */
export default function MapBackdrop() {
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 origin-center scale-[1.08] blur-[4px]">
        <VectorBasemap
          markers={[]}
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
