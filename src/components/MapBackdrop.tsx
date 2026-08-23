/**
 * Passive, frosted backdrop for the signed-out landing.
 *
 * This used to mount the real vector map (MapLibre + PMTiles) just to show it
 * blurred behind the gate — which pulled the ~870 kB map chunk and streamed
 * tiles from R2 on the *front door*, so the landing felt slow. It's replaced by
 * a single static image: a pre-rendered dark map of Europe with the airport dot
 * positions baked in (coordinates only — no names, counts or ids reach the
 * browser, same as before), built from the same CARTO dark tiles + marker set
 * and framed to match the map's own view (centre 10,50, zoomed so Europe fills
 * the frame like the live map's COVERAGE_BBOX does).
 *
 * The frosted look — a light blur, a brightness lift and a slight scale-up to
 * hide the blur's soft edges — is applied here in CSS, exactly as it was over
 * the live map. No WebGL, no tile fetches, nothing to wait for: it's a single
 * ~140 kB image in /public, so it paints about as fast as the page itself.
 */
export default function MapBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Plain <img>: the asset is pre-sized and already compressed, so there's
          nothing for next/image to optimise, and this keeps the landing off the
          image-optimiser path entirely. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/landing-map.jpg"
        alt=""
        draggable={false}
        className="absolute inset-0 h-full w-full origin-center scale-[1.06] object-cover
          blur-[3px] brightness-[1.2] contrast-[1.05]"
      />
    </div>
  );
}
