// The AI characters as drawn robots (vector rigs) for the TV: Nova-7 walks on two legs,
// Glitch rolls on tank tracks, Prof. Byte balances on one wheel and Turbo is a rocket.
// Plain browser script exposing globals. aiRobot(name, kind) gives a character's one body;
// createAiRobot(kind) returns { el, pose(p) }:
// pose({ step, mood, wheel, boost, tilt }) moves the parts (legs, wheels, flame, eyes) by
// attribute, so the robot animates without repainting the page around it.
// kind: 'boot' (Nova-7), 'glitch', 'dizzy' (Prof. Byte), 'zoom' (Turbo): the personas' entrance.

var AI_ROBOT_SVG = {
  boot:
    '<defs>' +
      '<linearGradient id="boot-hull" x1="0.1" y1="0" x2="0.9" y2="1">' +
        '<stop offset="0" stop-color="#ffffff"/>' +
        '<stop offset="0.52" stop-color="#e2e8f0"/>' +
        '<stop offset="1" stop-color="#94a3b8"/>' +
      '</linearGradient>' +
      '<linearGradient id="boot-metal" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="#cbd5e1"/>' +
        '<stop offset="0.55" stop-color="#7c8ea8"/>' +
        '<stop offset="1" stop-color="#475569"/>' +
      '</linearGradient>' +
      '<linearGradient id="boot-visor" x1="0.2" y1="0" x2="0.8" y2="1">' +
        '<stop offset="0" stop-color="#172554"/>' +
        '<stop offset="0.55" stop-color="#0b1530"/>' +
        '<stop offset="1" stop-color="#050a18"/>' +
      '</linearGradient>' +
      '<linearGradient id="boot-cyan" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#7dd3fc"/>' +
        '<stop offset="0.5" stop-color="#38bdf8"/>' +
        '<stop offset="1" stop-color="#0284c7"/>' +
      '</linearGradient>' +
      '<radialGradient id="boot-glow" cx="50%" cy="50%" r="50%">' +
        '<stop offset="0" stop-color="#fde047"/>' +
        '<stop offset="0.55" stop-color="#facc15"/>' +
        '<stop offset="1" stop-color="#ca8a04"/>' +
      '</radialGradient>' +
    '</defs>' +
    '<ellipse cx="100" cy="232" rx="48" ry="6.5" fill="#000" opacity="0.38"/>' +
    '<g data-part="body">' +
      // Articulated legs with thigh plates, knee joints, shin armor, and rocket-trim boots
      '<g data-part="legL">' +
        '<path d="M84 172 L76 200 L82 221" stroke="#0b1530" stroke-width="15" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M84 172 L76 200 L82 221" stroke="url(#boot-metal)" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<circle cx="76" cy="200" r="6.5" fill="url(#boot-hull)" stroke="#0b1530" stroke-width="2.4"/>' +
        '<circle cx="75" cy="199" r="2" fill="#38bdf8"/>' +
        '<path d="M62 224 Q62 215 74 215 L91 215 Q95 215 95 224 L95 229 Q95 231 92 231 L65 231 Q62 231 62 228 Z" fill="url(#boot-cyan)" stroke="#0b1530" stroke-width="2.6" stroke-linejoin="round"/>' +
        '<path d="M65 227 H92" stroke="#0b1530" stroke-width="2" stroke-linecap="round"/>' +
        '<path d="M68 218 H86" stroke="#e0f2fe" stroke-width="2" stroke-linecap="round" opacity="0.85"/>' +
      '</g>' +
      '<g data-part="legR">' +
        '<path d="M116 172 L124 200 L118 221" stroke="#0b1530" stroke-width="15" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M116 172 L124 200 L118 221" stroke="url(#boot-metal)" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<circle cx="124" cy="200" r="6.5" fill="url(#boot-hull)" stroke="#0b1530" stroke-width="2.4"/>' +
        '<circle cx="125" cy="199" r="2" fill="#38bdf8"/>' +
        '<path d="M105 224 Q105 215 109 215 L126 215 Q138 215 138 224 L138 228 Q138 231 135 231 L108 231 Q105 231 105 229 Z" fill="url(#boot-cyan)" stroke="#0b1530" stroke-width="2.6" stroke-linejoin="round"/>' +
        '<path d="M108 227 H135" stroke="#0b1530" stroke-width="2" stroke-linecap="round"/>' +
        '<path d="M114 218 H132" stroke="#e0f2fe" stroke-width="2" stroke-linecap="round" opacity="0.85"/>' +
      '</g>' +
      // Articulated arms with shoulder pauldrons, elbow spheres, forearm cuffs & clamp hands
      '<g data-part="armL">' +
        '<path d="M58 116 L36 144 L41 167" stroke="#0b1530" stroke-width="14" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M58 116 L36 144 L41 167" stroke="url(#boot-metal)" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<circle cx="56" cy="116" r="10.5" fill="url(#boot-hull)" stroke="#0b1530" stroke-width="2.5"/>' +
        '<circle cx="56" cy="116" r="4" fill="url(#boot-cyan)"/>' +
        '<circle cx="36" cy="144" r="6" fill="url(#boot-hull)" stroke="#0b1530" stroke-width="2.2"/>' +
        '<path d="M35 166 Q33 176 38 180 M47 166 Q49 176 44 180" stroke="#0b1530" stroke-width="5.5" stroke-linecap="round" fill="none"/>' +
        '<path d="M35 166 Q33 176 38 180 M47 166 Q49 176 44 180" stroke="url(#boot-hull)" stroke-width="3" stroke-linecap="round" fill="none"/>' +
        '<circle cx="41" cy="166" r="7" fill="url(#boot-hull)" stroke="#0b1530" stroke-width="2.4"/>' +
      '</g>' +
      '<g data-part="armR">' +
        '<path d="M142 116 L164 144 L159 167" stroke="#0b1530" stroke-width="14" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M142 116 L164 144 L159 167" stroke="url(#boot-metal)" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<circle cx="144" cy="116" r="10.5" fill="url(#boot-hull)" stroke="#0b1530" stroke-width="2.5"/>' +
        '<circle cx="144" cy="116" r="4" fill="url(#boot-cyan)"/>' +
        '<circle cx="164" cy="144" r="6" fill="url(#boot-hull)" stroke="#0b1530" stroke-width="2.2"/>' +
        '<path d="M153 166 Q151 176 156 180 M165 166 Q167 176 162 180" stroke="#0b1530" stroke-width="5.5" stroke-linecap="round" fill="none"/>' +
        '<path d="M153 166 Q151 176 156 180 M165 166 Q167 176 162 180" stroke="url(#boot-hull)" stroke-width="3" stroke-linecap="round" fill="none"/>' +
        '<circle cx="159" cy="166" r="7" fill="url(#boot-hull)" stroke="#0b1530" stroke-width="2.4"/>' +
      '</g>' +
      // Pelvis & ribbed neck collar
      '<rect x="74" y="164" width="52" height="14" rx="7" fill="#334155" stroke="#0b1530" stroke-width="2.6"/>' +
      '<rect x="88" y="94" width="24" height="14" rx="4" fill="url(#boot-metal)" stroke="#0b1530" stroke-width="2.4"/>' +
      '<path d="M90 100 H110" stroke="#0b1530" stroke-width="1.6"/>' +
      // Contoured chest armor with panel seams, cyan belt strip, and illuminated 7 reactor
      '<path d="M62 104 Q100 98 138 104 L142 152 Q140 168 122 170 L78 170 Q60 168 58 152 Z" fill="url(#boot-hull)" stroke="#0b1530" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M68 110 Q100 104 132 110" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" opacity="0.8"/>' +
      '<path d="M64 152 Q100 158 136 152" fill="none" stroke="#94a3b8" stroke-width="2"/>' +
      '<rect x="72" y="156" width="56" height="5" rx="2.5" fill="url(#boot-cyan)" stroke="#0b1530" stroke-width="1.4"/>' +
      '<circle cx="70" cy="116" r="2.2" fill="#64748b"/><circle cx="130" cy="116" r="2.2" fill="#64748b"/>' +
      '<circle cx="100" cy="131" r="18" fill="#0b1530" stroke="#94a3b8" stroke-width="2"/>' +
      '<circle cx="100" cy="131" r="14.5" fill="url(#boot-cyan)"/>' +
      '<path d="M90 123 A12 12 0 0 1 110 123" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity="0.65"/>' +
      '<text x="100" y="138" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="21" fill="#0b1530">7</text>' +
      // Head: ear pods, glowing antenna, visor helmet, glass glare & expressive HUD eyes
      '<g data-part="head">' +
        '<rect x="96" y="10" width="8" height="16" rx="3" fill="url(#boot-metal)" stroke="#0b1530" stroke-width="2"/>' +
        '<g data-part="beacon"><circle cx="100" cy="9" r="10" fill="#facc15" opacity="0.28"/><circle cx="100" cy="9" r="6.5" fill="url(#boot-glow)" stroke="#0b1530" stroke-width="2.2"/><circle cx="98" cy="7" r="2" fill="#ffffff" opacity="0.85"/></g>' +
        '<rect x="44" y="46" width="12" height="24" rx="5" fill="url(#boot-cyan)" stroke="#0b1530" stroke-width="2.5"/>' +
        '<rect x="144" y="46" width="12" height="24" rx="5" fill="url(#boot-cyan)" stroke="#0b1530" stroke-width="2.5"/>' +
        '<rect x="51" y="23" width="98" height="72" rx="26" fill="url(#boot-hull)" stroke="#0b1530" stroke-width="3"/>' +
        '<path d="M66 28 Q100 24 134 28" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity="0.85"/>' +
        '<rect x="61" y="36" width="78" height="44" rx="18" fill="url(#boot-visor)" stroke="#475569" stroke-width="2"/>' +
        '<path d="M68 42 Q100 37 131 44" fill="none" stroke="#bae6fd" stroke-width="2.5" stroke-linecap="round" opacity="0.28"/>' +
        '<g data-part="calm">' +
          '<rect x="74" y="49" width="15" height="12" rx="6" fill="#38bdf8"/>' +
          '<rect x="111" y="49" width="15" height="12" rx="6" fill="#38bdf8"/>' +
          '<circle cx="79" cy="53" r="2.4" fill="#ffffff" opacity="0.9"/><circle cx="116" cy="53" r="2.4" fill="#ffffff" opacity="0.9"/>' +
          '<path d="M90 69 Q100 76 110 69" stroke="#7dd3fc" stroke-width="3.2" fill="none" stroke-linecap="round"/>' +
        '</g>' +
        '<g data-part="worried" style="display:none">' +
          '<path d="M74 49 L89 53 M126 49 L111 53" stroke="#7dd3fc" stroke-width="3.6" stroke-linecap="round"/>' +
          '<circle cx="82" cy="61" r="6" fill="#38bdf8"/><circle cx="118" cy="61" r="6" fill="#38bdf8"/>' +
          '<circle cx="80.5" cy="59.5" r="2" fill="#ffffff"/><circle cx="116.5" cy="59.5" r="2" fill="#ffffff"/>' +
          '<path d="M90 73 Q95 68 100 72 Q105 68 110 73" stroke="#7dd3fc" stroke-width="2.8" fill="none" stroke-linecap="round"/>' +
          '<path d="M146 33 Q153 45 146 50 Q139 45 146 33 Z" fill="#7dd3fc" stroke="#0b1530" stroke-width="1.6"/>' +
        '</g>' +
      '</g>' +
    '</g>',

  glitch:
    '<defs>' +
      '<linearGradient id="gl-case" x1="0.1" y1="0" x2="0.9" y2="1">' +
        '<stop offset="0" stop-color="#ddd6fe"/>' +
        '<stop offset="0.48" stop-color="#a78bfa"/>' +
        '<stop offset="1" stop-color="#5b21b6"/>' +
      '</linearGradient>' +
      '<linearGradient id="gl-crt" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#0f172a"/>' +
        '<stop offset="1" stop-color="#050816"/>' +
      '</linearGradient>' +
      '<linearGradient id="gl-track" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#334155"/>' +
        '<stop offset="0.5" stop-color="#1e293b"/>' +
        '<stop offset="1" stop-color="#0f172a"/>' +
      '</linearGradient>' +
      '<linearGradient id="gl-wheel" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="#64748b"/>' +
        '<stop offset="1" stop-color="#1e293b"/>' +
      '</linearGradient>' +
    '</defs>' +
    '<ellipse cx="100" cy="232" rx="66" ry="6.5" fill="#000" opacity="0.38"/>' +
    '<g data-part="body">' +
      // Chromatic RGB split ghosts shaped like Glitch's monitor silhouette
      '<g data-part="ghosts">' +
        '<path d="M37 44 Q37 32 49 32 L139 32 Q151 32 151 44 L151 124 Q151 136 139 136 L49 136 Q37 136 37 124 Z" fill="#fb7185" opacity="0.48"/>' +
        '<path d="M51 36 Q51 24 63 24 L153 24 Q165 24 165 36 L165 116 Q165 128 153 128 L63 128 Q51 128 51 116 Z" fill="#38bdf8" opacity="0.48"/>' +
      '</g>' +
      // Corrugated arms with claw pincers
      '<g data-part="armL">' +
        '<path d="M44 102 L26 114 L21 128" stroke="#0b1530" stroke-width="13" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M44 102 L26 114 L21 128" stroke="#8b5cf6" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<circle cx="26" cy="114" r="5" fill="#cbd5e1" stroke="#0b1530" stroke-width="2"/>' +
        '<path d="M15 128 L12 138 M26 128 L29 138" stroke="#34d399" stroke-width="4" stroke-linecap="round"/>' +
        '<circle cx="21" cy="127" r="5.5" fill="#cbd5e1" stroke="#0b1530" stroke-width="2"/>' +
      '</g>' +
      '<g data-part="armR">' +
        '<path d="M156 102 L175 90 L181 76" stroke="#0b1530" stroke-width="13" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M156 102 L175 90 L181 76" stroke="#8b5cf6" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<circle cx="175" cy="90" r="5" fill="#cbd5e1" stroke="#0b1530" stroke-width="2"/>' +
        '<path d="M175 76 L172 66 M186 76 L189 66" stroke="#34d399" stroke-width="4" stroke-linecap="round"/>' +
        '<circle cx="181" cy="77" r="5.5" fill="#cbd5e1" stroke="#0b1530" stroke-width="2"/>' +
      '</g>' +
      // Lower neck / waist arcade core box
      '<rect x="66" y="132" width="68" height="38" rx="9" fill="#6d28d9" stroke="#0b1530" stroke-width="2.8"/>' +
      '<rect x="76" y="140" width="48" height="18" rx="4" fill="#0b1530"/>' +
      '<circle cx="85" cy="149" r="3" fill="#34d399"/><circle cx="96" cy="149" r="3" fill="#facc15"/><rect x="105" y="146" width="13" height="6" rx="2" fill="#38bdf8"/>' +
      // Bent lightning antenna with floating emerald pixel cube
      '<path d="M88 38 L74 16 L90 12 L84 4" stroke="#0b1530" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M88 38 L74 16 L90 12 L84 4" stroke="#c4b5fd" stroke-width="4.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<rect x="86" y="1" width="12" height="12" rx="2" fill="#34d399" stroke="#0b1530" stroke-width="2"/>' +
      '<rect x="89" y="4" width="4" height="4" fill="#a7f3d0"/>' +
      // Bulky CRT monitor head casing with chamfered bezel and vent slots
      '<rect x="43" y="37" width="114" height="98" rx="17" fill="url(#gl-case)" stroke="#0b1530" stroke-width="3"/>' +
      '<path d="M54 42 H146" stroke="#f5f3ff" stroke-width="2.5" stroke-linecap="round" opacity="0.75"/>' +
      '<path d="M49 58 V74 M49 80 V96" stroke="#4c1d95" stroke-width="2.2" stroke-linecap="round" opacity="0.65"/>' +
      '<path d="M151 58 V74 M151 80 V96" stroke="#4c1d95" stroke-width="2.2" stroke-linecap="round" opacity="0.65"/>' +
      // Recessed CRT display cavity & phosphor scanlines
      '<rect x="55" y="49" width="90" height="72" rx="10" fill="url(#gl-crt)" stroke="#2e1065" stroke-width="2.5"/>' +
      '<path d="M62 56 Q100 52 136 57" stroke="#38bdf8" stroke-width="2" fill="none" opacity="0.28" stroke-linecap="round"/>' +
      '<g opacity="0.18"><line x1="57" y1="62" x2="143" y2="62" stroke="#34d399" stroke-width="1"/><line x1="57" y1="72" x2="143" y2="72" stroke="#34d399" stroke-width="1"/><line x1="57" y1="82" x2="143" y2="82" stroke="#34d399" stroke-width="1"/><line x1="57" y1="92" x2="143" y2="92" stroke="#34d399" stroke-width="1"/><line x1="57" y1="102" x2="143" y2="102" stroke="#34d399" stroke-width="1"/></g>' +
      // Glitch bar line
      '<rect x="57" y="84" width="86" height="3.5" fill="#c4b5fd" opacity="0.45"/>' +
      '<g data-part="calm">' +
        '<rect x="70" y="64" width="15" height="15" rx="2.5" fill="#34d399"/>' +
        '<rect x="115" y="64" width="15" height="15" rx="2.5" fill="#34d399"/>' +
        '<rect x="73" y="67" width="4" height="4" fill="#ecfdf5"/><rect x="118" y="67" width="4" height="4" fill="#ecfdf5"/>' +
        '<path d="M76 98 h9 v6 h9 v-6 h12 v6 h9 v-6 h9" stroke="#34d399" stroke-width="5" fill="none" stroke-linecap="square"/>' +
      '</g>' +
      '<g data-part="worried" style="display:none">' +
        '<path d="M68 64 L85 72 L68 80" stroke="#34d399" stroke-width="4.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M132 64 L115 72 L132 80" stroke="#34d399" stroke-width="4.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<rect x="86" y="96" width="28" height="11" rx="2" fill="#fb7185"/>' +
        '<rect x="90" y="99" width="20" height="5" fill="#050816"/>' +
      '</g>' +
    '</g>' +
    // Armored tank tread base + notched track belt + hydraulic axle guard + 3 spoked bogie wheels
    '<rect x="30" y="164" width="140" height="58" rx="29" fill="url(#gl-track)" stroke="#0b1530" stroke-width="3.2"/>' +
    '<rect x="34" y="168" width="132" height="50" rx="25" fill="none" stroke="#64748b" stroke-width="2" stroke-dasharray="6 5"/>' +
    '<rect x="52" y="162" width="96" height="9" rx="4.5" fill="#8b5cf6" stroke="#0b1530" stroke-width="2"/>' +
    '<g data-part="w1"><circle cx="62" cy="193" r="17.5" fill="url(#gl-wheel)" stroke="#cbd5e1" stroke-width="3.5"/><path d="M62 178 V208 M47 193 H77" stroke="#cbd5e1" stroke-width="3"/><circle cx="62" cy="193" r="6" fill="#34d399" stroke="#0b1530" stroke-width="2"/></g>' +
    '<g data-part="w2"><circle cx="100" cy="193" r="17.5" fill="url(#gl-wheel)" stroke="#cbd5e1" stroke-width="3.5"/><path d="M100 178 V208 M85 193 H115" stroke="#cbd5e1" stroke-width="3"/><circle cx="100" cy="193" r="6" fill="#34d399" stroke="#0b1530" stroke-width="2"/></g>' +
    '<g data-part="w3"><circle cx="138" cy="193" r="17.5" fill="url(#gl-wheel)" stroke="#cbd5e1" stroke-width="3.5"/><path d="M138 178 V208 M123 193 H153" stroke="#cbd5e1" stroke-width="3"/><circle cx="138" cy="193" r="6" fill="#34d399" stroke="#0b1530" stroke-width="2"/></g>',

  dizzy:
    '<defs>' +
      '<radialGradient id="dz-glass" cx="38%" cy="32%" r="72%">' +
        '<stop offset="0" stop-color="#e0f2fe" stop-opacity="0.72"/>' +
        '<stop offset="0.55" stop-color="#7dd3fc" stop-opacity="0.32"/>' +
        '<stop offset="1" stop-color="#0284c7" stop-opacity="0.45"/>' +
      '</radialGradient>' +
      '<linearGradient id="dz-brain" x1="0.2" y1="0" x2="0.8" y2="1">' +
        '<stop offset="0" stop-color="#fecdd3"/>' +
        '<stop offset="0.45" stop-color="#fb7185"/>' +
        '<stop offset="1" stop-color="#be123c"/>' +
      '</linearGradient>' +
      '<linearGradient id="dz-coat" x1="0.1" y1="0" x2="0.9" y2="1">' +
        '<stop offset="0" stop-color="#6ee7b7"/>' +
        '<stop offset="0.5" stop-color="#10b981"/>' +
        '<stop offset="1" stop-color="#047857"/>' +
      '</linearGradient>' +
      '<linearGradient id="dz-brass" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="#fef08a"/>' +
        '<stop offset="0.55" stop-color="#facc15"/>' +
        '<stop offset="1" stop-color="#b45309"/>' +
      '</linearGradient>' +
    '</defs>' +
    '<ellipse cx="100" cy="233" rx="38" ry="5.5" fill="#000" opacity="0.38"/>' +
    '<g data-part="body">' +
      // Floating bi-lobed brain with sulci folds and glowing synapses inside bell-jar dome
      '<g data-part="brain">' +
        '<path d="M72 82 C66 64 78 48 92 52 C98 40 112 42 114 52 C128 48 136 64 128 82 Z" fill="url(#dz-brain)" stroke="#881337" stroke-width="2.4" stroke-linejoin="round"/>' +
        '<path d="M84 58 Q90 66 83 74 M101 50 Q96 63 103 74 M117 58 Q111 66 118 74" stroke="#9f1239" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
        '<circle cx="88" cy="60" r="2.2" fill="#fef08a"/><circle cx="112" cy="56" r="2" fill="#7dd3fc"/>' +
      '</g>' +
      // Translucent glass bell-jar dome with specular reflection crescent
      '<path d="M51 86 A49 49 0 0 1 149 86 Z" fill="url(#dz-glass)" stroke="#0b1530" stroke-width="3"/>' +
      '<path d="M62 72 A38 38 0 0 1 92 42" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" opacity="0.72"/>' +
      '<circle cx="98" cy="40" r="2" fill="#ffffff" opacity="0.8"/>' +
      // Brass & steel collar ring with rivets
      '<rect x="46" y="84" width="108" height="15" rx="7.5" fill="#94a3b8" stroke="#0b1530" stroke-width="2.8"/>' +
      '<circle cx="58" cy="91.5" r="2.2" fill="#facc15"/><circle cx="79" cy="91.5" r="2.2" fill="#facc15"/><circle cx="100" cy="91.5" r="2.2" fill="#facc15"/><circle cx="121" cy="91.5" r="2.2" fill="#facc15"/><circle cx="142" cy="91.5" r="2.2" fill="#facc15"/>' +
      // Monowheel chrome suspension fork
      '<rect x="92" y="175" width="16" height="28" rx="4" fill="#cbd5e1" stroke="#0b1530" stroke-width="2.6"/>' +
      // Segmented professor sleeves + cuffs + gloved hands (stylus in right hand)
      '<g data-part="armL">' +
        '<path d="M60 134 L41 151" stroke="#0b1530" stroke-width="13" stroke-linecap="round"/>' +
        '<path d="M60 134 L41 151" stroke="url(#dz-coat)" stroke-width="8" stroke-linecap="round"/>' +
        '<circle cx="40" cy="153" r="6.5" fill="#f8fafc" stroke="#0b1530" stroke-width="2.4"/>' +
      '</g>' +
      '<g data-part="armR">' +
        '<path d="M140 134 L156 114" stroke="#0b1530" stroke-width="13" stroke-linecap="round"/>' +
        '<path d="M140 134 L156 114" stroke="url(#dz-coat)" stroke-width="8" stroke-linecap="round"/>' +
        '<line x1="158" y1="112" x2="167" y2="97" stroke="#facc15" stroke-width="3.2" stroke-linecap="round"/>' +
        '<circle cx="157" cy="113" r="6.5" fill="#f8fafc" stroke="#0b1530" stroke-width="2.4"/>' +
      '</g>' +
      // Emerald lab chassis torso with lab-coat collar, pocket pens & dapper bow tie
      '<rect x="58" y="99" width="84" height="80" rx="22" fill="url(#dz-coat)" stroke="#0b1530" stroke-width="3"/>' +
      '<path d="M76 154 L100 176 L124 154" fill="#f8fafc" stroke="#0b1530" stroke-width="2.2" stroke-linejoin="round"/>' +
      '<rect x="118" y="142" width="14" height="12" rx="2" fill="#ecfdf5" stroke="#0b1530" stroke-width="1.6"/>' +
      '<line x1="122" y1="136" x2="122" y2="142" stroke="#38bdf8" stroke-width="2.6" stroke-linecap="round"/>' +
      '<line x1="127" y1="137" x2="127" y2="142" stroke="#facc15" stroke-width="2.6" stroke-linecap="round"/>' +
      // Dapper coral-crimson bow tie
      '<path d="M85 159 L98 166 L85 173 Z M115 159 L102 166 L115 173 Z" fill="#fb7185" stroke="#0b1530" stroke-width="2" stroke-linejoin="round"/>' +
      '<circle cx="100" cy="166" r="4" fill="#f43f5e" stroke="#0b1530" stroke-width="2"/>' +
      // Oversized brass round spectacles & white handlebar mustache
      '<circle cx="83" cy="123" r="14" fill="#0b1530" stroke="url(#dz-brass)" stroke-width="4.2"/>' +
      '<circle cx="117" cy="123" r="14" fill="#0b1530" stroke="url(#dz-brass)" stroke-width="4.2"/>' +
      '<path d="M97 123 Q100 120 103 123" stroke="url(#dz-brass)" stroke-width="4" fill="none"/>' +
      '<path d="M76 116 L84 113 M110 116 L118 113" stroke="#ffffff" stroke-width="1.8" opacity="0.45" stroke-linecap="round"/>' +
      '<g data-part="calm">' +
        '<circle cx="85" cy="125" r="4.8" fill="#7dd3fc"/><circle cx="119" cy="125" r="4.8" fill="#7dd3fc"/>' +
        '<circle cx="84" cy="123.5" r="1.8" fill="#ffffff"/><circle cx="118" cy="123.5" r="1.8" fill="#ffffff"/>' +
      '</g>' +
      '<g data-part="worried" style="display:none">' +
        '<circle cx="83" cy="123" r="7" fill="none" stroke="#fde047" stroke-width="2"/>' +
        '<circle cx="117" cy="123" r="7" fill="none" stroke="#fde047" stroke-width="2"/>' +
        '<circle cx="83" cy="123" r="3" fill="#ffffff"/><circle cx="117" cy="123" r="3" fill="#ffffff"/>' +
      '</g>' +
      '<path d="M80 144 Q90 137 100 144 Q110 137 120 144 Q110 153 100 147 Q90 153 80 144 Z" fill="#f8fafc" stroke="#0b1530" stroke-width="2" stroke-linejoin="round"/>' +
    '</g>' +
    // Gyro monowheel with ribbed outer tire, glowing cyan balance ring & machined spokes
    '<g data-part="w1">' +
      '<circle cx="100" cy="206" r="25" fill="#1e293b" stroke="#0b1530" stroke-width="3.5"/>' +
      '<circle cx="100" cy="206" r="20" fill="#0f172a" stroke="#38bdf8" stroke-width="2.5"/>' +
      '<path d="M100 186 V226 M80 206 H120" stroke="#94a3b8" stroke-width="3.5"/>' +
      '<circle cx="100" cy="206" r="7" fill="url(#dz-brass)" stroke="#0b1530" stroke-width="2.2"/>' +
    '</g>',

  zoom:
    '<defs>' +
      '<linearGradient id="zm-hull" x1="0" y1="0" x2="1" y2="0">' +
        '<stop offset="0" stop-color="#94a3b8"/>' +
        '<stop offset="0.32" stop-color="#ffffff"/>' +
        '<stop offset="0.65" stop-color="#e2e8f0"/>' +
        '<stop offset="1" stop-color="#64748b"/>' +
      '</linearGradient>' +
      '<linearGradient id="zm-red" x1="0" y1="0" x2="1" y2="0.4">' +
        '<stop offset="0" stop-color="#fda4af"/>' +
        '<stop offset="0.45" stop-color="#fb7185"/>' +
        '<stop offset="1" stop-color="#be123c"/>' +
      '</linearGradient>' +
      '<linearGradient id="zm-flame-out" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#fb7185"/>' +
        '<stop offset="1" stop-color="#e11d48" stop-opacity="0.85"/>' +
      '</linearGradient>' +
      '<linearGradient id="zm-flame-mid" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#fde047"/>' +
        '<stop offset="1" stop-color="#f97316"/>' +
      '</linearGradient>' +
    '</defs>' +
    // Multi-layered plasma exhaust plume + Mach cone core
    '<g data-part="flame">' +
      '<path d="M80 185 Q100 264 120 185 Z" fill="url(#zm-flame-out)"/>' +
      '<path d="M87 185 Q100 242 113 185 Z" fill="url(#zm-flame-mid)"/>' +
      '<path d="M94 185 Q100 218 106 185 Z" fill="#fef9c3"/>' +
      '<circle cx="92" cy="232" r="2.2" fill="#fde047"/><circle cx="109" cy="226" r="1.8" fill="#fb7185"/>' +
    '</g>' +
    '<g data-part="body">' +
      // Swept aerodynamic delta fins with bevel highlights
      '<path d="M62 142 L28 198 L72 180 Z" fill="url(#zm-red)" stroke="#0b1530" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M138 142 L172 198 L128 180 Z" fill="url(#zm-red)" stroke="#0b1530" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M60 151 L38 189" stroke="#ffe4e6" stroke-width="2" stroke-linecap="round" opacity="0.7"/>' +
      '<path d="M140 151 L162 189" stroke="#ffe4e6" stroke-width="2" stroke-linecap="round" opacity="0.45"/>' +
      // Contoured cylindrical metallic rocket fuselage
      '<path d="M100 8 C139 40 142 118 133 182 L67 182 C58 118 61 40 100 8 Z" fill="url(#zm-hull)" stroke="#0b1530" stroke-width="3" stroke-linejoin="round"/>' +
      // Glossy crimson nosecone
      '<path d="M100 8 C119 23 128 40 132 58 L68 58 C72 40 81 23 100 8 Z" fill="url(#zm-red)" stroke="#0b1530" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M89 22 Q82 38 80 51" fill="none" stroke="#ffe4e6" stroke-width="2.5" stroke-linecap="round" opacity="0.7"/>' +
      // Racing stripes & thruster nozzle collar
      '<path d="M71 138 L129 138" stroke="#38bdf8" stroke-width="6" stroke-linecap="round"/>' +
      '<path d="M75 153 L125 153" stroke="#0284c7" stroke-width="5" stroke-linecap="round" opacity="0.8"/>' +
      '<rect x="68" y="174" width="64" height="13" rx="4" fill="#475569" stroke="#0b1530" stroke-width="2.6"/>' +
      '<circle cx="77" cy="180.5" r="1.8" fill="#cbd5e1"/><circle cx="100" cy="180.5" r="1.8" fill="#cbd5e1"/><circle cx="123" cy="180.5" r="1.8" fill="#cbd5e1"/>' +
      // Riveted anodized cockpit porthole & glass sheen
      '<circle cx="100" cy="96" r="28" fill="#0f172a" stroke="#38bdf8" stroke-width="6.5"/>' +
      '<circle cx="100" cy="96" r="30.5" fill="none" stroke="#0b1530" stroke-width="2.2"/>' +
      '<path d="M81 80 A23 23 0 0 1 118 79" fill="none" stroke="#bae6fd" stroke-width="2.6" stroke-linecap="round" opacity="0.35"/>' +
      '<g data-part="calm">' +
        '<circle cx="91" cy="94" r="5.5" fill="#facc15"/><circle cx="109" cy="94" r="5.5" fill="#facc15"/>' +
        '<circle cx="89.5" cy="92.2" r="2" fill="#ffffff"/><circle cx="107.5" cy="92.2" r="2" fill="#ffffff"/>' +
        '<path d="M89 107 Q100 116 111 107" stroke="#fde047" stroke-width="3.2" fill="none" stroke-linecap="round"/>' +
      '</g>' +
      '<g data-part="worried" style="display:none">' +
        '<path d="M85 89 l10 8 M95 89 l-10 8 M105 89 l10 8 M115 89 l-10 8" stroke="#fde047" stroke-width="3.2" stroke-linecap="round"/>' +
        '<circle cx="100" cy="109" r="4.5" fill="#fde047"/>' +
      '</g>' +
      // Swept racer arms with cyan cuff bands & gloved fists
      '<g data-part="armL">' +
        '<path d="M64 120 L40 103" stroke="#0b1530" stroke-width="12" stroke-linecap="round"/>' +
        '<path d="M64 120 L40 103" stroke="#cbd5e1" stroke-width="7.5" stroke-linecap="round"/>' +
        '<circle cx="38" cy="101" r="6.5" fill="#38bdf8" stroke="#0b1530" stroke-width="2.4"/>' +
      '</g>' +
      '<g data-part="armR">' +
        '<path d="M136 120 L160 103" stroke="#0b1530" stroke-width="12" stroke-linecap="round"/>' +
        '<path d="M136 120 L160 103" stroke="#cbd5e1" stroke-width="7.5" stroke-linecap="round"/>' +
        '<circle cx="162" cy="101" r="6.5" fill="#38bdf8" stroke="#0b1530" stroke-width="2.4"/>' +
      '</g>' +
    '</g>',
};

var _aiRobotUid = 0;

/** Namespaces SVG <defs> IDs per mounted instance so multiple rigs never collide in the DOM. */
function _aiRobotsUniqueSvg(markup) {
  var uid = 'ar' + (++_aiRobotUid) + '_';
  return markup
    .replace(/\bid="([^"]+)"/g, 'id="' + uid + '$1"')
    .replace(/url\(#([^)]+)\)/g, 'url(#' + uid + '$1)');
}

/** One robot, ready to place: { el, kind, pose(p) }. el is a 200×240 viewBox SVG in a span. */
function createAiRobot(kind) {
  var k = AI_ROBOT_SVG[kind] ? kind : 'boot';
  var el = document.createElement('span');
  el.className = 'ai-robot ai-robot-' + k;
  el.innerHTML = '<svg viewBox="0 0 200 240" width="100%" height="100%" aria-hidden="true" overflow="visible">' + _aiRobotsUniqueSvg(AI_ROBOT_SVG[k]) + '</svg>';
  var part = {};
  Array.prototype.forEach.call(el.querySelectorAll('[data-part]'), function (n) { part[n.getAttribute('data-part')] = n; });
  var last = {};
  function set(name, tf) {
    if (!part[name] || last[name] === tf) return;
    last[name] = tf;
    part[name].setAttribute('transform', tf);
  }
  var mood = 'calm';
  return {
    el: el,
    kind: k,
    /**
     * step: walking phase in turns (0..1 repeats); wheel: wheel angle in degrees;
     * boost: 0..1 flame size; tilt: body lean in degrees; arm: 0..1 arms up; mood: 'calm'|'worried'.
     */
    pose: function (p) {
      p = p || {};
      var tilt = p.tilt || 0, arm = p.arm || 0;
      if ((p.mood || 'calm') !== mood && part.calm && part.worried) {
        mood = p.mood || 'calm';
        part.calm.style.display = mood === 'worried' ? 'none' : '';
        part.worried.style.display = mood === 'worried' ? '' : 'none';
      }
      if (k === 'boot') {
        var s = Math.sin(2 * Math.PI * (p.step || 0));
        set('legL', 'rotate(' + (s * 22).toFixed(1) + ' 84 174)');
        set('legR', 'rotate(' + (-s * 22).toFixed(1) + ' 116 174)');
        set('armL', 'rotate(' + (-s * 16 + arm * 60).toFixed(1) + ' 58 116)');
        set('armR', 'rotate(' + (s * 16 - arm * 60).toFixed(1) + ' 142 116)');
        set('body', 'translate(0 ' + (-Math.abs(s) * 4).toFixed(1) + ') rotate(' + tilt.toFixed(1) + ' 100 224)');
        set('head', 'rotate(' + (p.look || 0).toFixed(1) + ' 100 96)');
        if (part.beacon) {
          var bs = 1 + 0.14 * Math.abs(s) + 0.1 * arm;
          set('beacon', 'translate(100 9) scale(' + bs.toFixed(2) + ') translate(-100 -9)');
        }
      } else if (k === 'glitch') {
        var w = p.wheel || 0;
        set('w1', 'rotate(' + w.toFixed(0) + ' 62 193)');
        set('w2', 'rotate(' + w.toFixed(0) + ' 100 193)');
        set('w3', 'rotate(' + w.toFixed(0) + ' 138 193)');
        set('body', 'rotate(' + tilt.toFixed(1) + ' 100 166)');
        set('armL', 'rotate(' + (arm * 50).toFixed(1) + ' 44 100)');
        set('armR', 'rotate(' + (-arm * 40).toFixed(1) + ' 156 100)');
        set('ghosts', 'translate(' + ((p.jitter || 0) * 6).toFixed(1) + ' 0)');
      } else if (k === 'dizzy') {
        set('w1', 'rotate(' + (p.wheel || 0).toFixed(0) + ' 100 206)');
        set('body', 'rotate(' + tilt.toFixed(1) + ' 100 206)');
        set('brain', 'translate(0 ' + (Math.sin((p.step || 0) * 2 * Math.PI) * 2).toFixed(1) + ')');
        set('armL', 'rotate(' + (arm * 70).toFixed(1) + ' 60 136)');
        set('armR', 'rotate(' + (-arm * 30).toFixed(1) + ' 140 136)');
      } else {
        var b = 0.5 + 0.9 * Math.max(0, Math.min(1, p.boost == null ? 0.4 : p.boost));
        set('flame', 'translate(100 186) scale(' + (0.8 + 0.2 * b).toFixed(2) + ' ' + b.toFixed(2) + ') translate(-100 -186)');
        set('body', 'rotate(' + tilt.toFixed(1) + ' 100 120)');
        set('armL', 'rotate(' + (arm * 40).toFixed(1) + ' 64 120)');
        set('armR', 'rotate(' + (-arm * 40).toFixed(1) + ' 136 120)');
      }
    },
  };
}

/**
 * The one body of a character: made the first time it is asked for, then the same element
 * wherever the character appears (topbar dancer, Board Crash, game intro), so a robot can
 * never be on screen twice. key: the persona's name; kind: its rig.
 */
var AI_ROBOT_CAST = {};
function aiRobot(key, kind) {
  var r = AI_ROBOT_CAST[key];
  if (!r) {
    r = AI_ROBOT_CAST[key] = createAiRobot(kind || key);
    r.key = key;
    r.el.setAttribute('data-actor', key);
  }
  return r;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AI_ROBOT_SVG: AI_ROBOT_SVG, aiRobot: aiRobot };
}
