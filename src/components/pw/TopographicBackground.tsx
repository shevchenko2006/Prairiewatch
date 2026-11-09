/** Decorative contours only; never used on the sourced geographic map. */
export function TopographicBackground({ variant = "header" }: { variant?: "header" | "sidebar" | "results" }) {
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 1200 600" preserveAspectRatio="xMidYMid slice" className={`pw-contours pw-contours-${variant}`}>
    <g fill="none" stroke="currentColor" strokeWidth="1">
      <path d="M-80 510C70 460 60 300 240 325S450 510 620 360S750 105 940 150S1100 310 1280 180"/>
      <path d="M-80 465C30 420 65 260 250 285S450 470 600 325S755 65 950 110S1110 270 1280 140"/>
      <path d="M-80 415C25 375 80 220 265 245S450 420 580 285S770 25 965 70S1120 230 1280 95"/>
      <path d="M-80 365C40 330 95 175 280 205S455 375 560 245S790-20 980 30S1140 190 1280 50"/>
      <path d="M-80 315C50 285 115 135 295 165S455 330 540 205S815-60 995-10S1160 150 1280 5"/>
      <path d="M-80 265C65 240 135 95 315 125S460 285 520 165S830-100 1010-50S1180 110 1280-40"/>
      <path d="M-80 560C95 505 70 345 230 365S450 550 640 400S755 150 935 195S1100 355 1280 225"/>
      <path d="M-80 610C110 550 90 390 220 405S445 595 665 445S765 195 930 240S1095 400 1280 270"/>
      <path d="M-80 660C130 595 105 435 210 450S440 640 690 490S775 240 925 285S1090 445 1280 315"/>
      <path d="M-80 710C150 640 125 480 205 495S440 685 710 535S790 285 920 330S1085 490 1280 360"/>
    </g>
  </svg>;
}
