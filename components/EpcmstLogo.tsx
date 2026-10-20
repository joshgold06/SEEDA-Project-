// Vector recreation of the EPCMst logo: an open blue hexagon mark, "EPCM" in navy
// and "st" in blue. Drawn inline (rather than loaded as an image) so it stays sharp
// at any size and can use the app's Inter font. To use the original artwork instead,
// save it as public/epcmst-logo.png and swap this component's body for an <img>.
// Just the hexagon mark, for tight spaces like the sidebar.
export function EpcmstMark({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="130 140 440 460" role="img" aria-label="EPCMst" className={className}>
      <polygon fill="var(--logo-blue, #0E75BB)" points="147,283 358,160 541,275 440,277 358,227 205,314 215,477 265,509 267,577 160,508" />
    </svg>
  );
}

export function EpcmstLogo({ className = "h-14 w-auto" }: { className?: string }) {
  const font = '"Inter Variable", Inter, "Helvetica Neue", Arial, sans-serif';
  return (
    <svg viewBox="130 140 1690 560" role="img" aria-label="EPCMst" className={className}>
      <polygon fill="var(--logo-blue, #0E75BB)" points="147,283 358,160 541,275 440,277 358,227 205,314 215,477 265,509 267,577 160,508" />
      <text x="330" y="655" fontFamily={font} fontWeight={700} fontSize={450} fill="var(--logo-navy, #2E5483)" textLength={1180} lengthAdjust="spacingAndGlyphs">
        EPCM
      </text>
      <text x="1540" y="672" fontFamily={font} fontWeight={700} fontSize={322} fill="var(--logo-blue, #0E75BB)" textLength={258} lengthAdjust="spacingAndGlyphs">
        st
      </text>
    </svg>
  );
}
