// Helper para renderizar o logotipo vetorial perfeito da COB Advogados (3 Espadas em Vinho Red e Tipografia em Prata)

function getCOBLogoSVG(height = 55) {
  const scale = height / 70;
  const width = Math.round(310 * scale);
  
  return `
    <div style="display: inline-flex; align-items: center; gap: 14px; text-decoration: none;">
      <!-- Ícone Vetorial das 3 Espadas -->
      <svg width="${Math.round(75 * scale)}" height="${height}" viewBox="0 0 95 90" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- Espada 1 (Esquerda - mais inclinada) -->
        <g id="sword-1">
          <!-- Lâmina -->
          <path d="M 12 82 L 44 14" stroke="#8b2635" stroke-width="3" stroke-linecap="round"/>
          <path d="M 12 82 L 44 14" stroke="#ffffff" stroke-width="0.8" stroke-linecap="round" opacity="0.3"/>
          <!-- Guarda / Cruzeta -->
          <path d="M 17 60 L 33 66" stroke="#8b2635" stroke-width="2.5" stroke-linecap="round"/>
          <circle cx="16.5" cy="59.8" r="2.2" fill="#8b2635"/>
          <circle cx="33.5" cy="66.2" r="2.2" fill="#8b2635"/>
          <!-- Ponta da Espada -->
          <path d="M 44 14 L 42 7 L 48 13 Z" fill="#8b2635"/>
          <!-- Pomo da Espada -->
          <circle cx="9" cy="88" r="2.5" fill="#8b2635"/>
        </g>

        <!-- Espada 2 (Meio - inclinação intermediária) -->
        <g id="sword-2">
          <!-- Lâmina -->
          <path d="M 34 86 L 62 8" stroke="#8b2635" stroke-width="3.5" stroke-linecap="round"/>
          <path d="M 34 86 L 62 8" stroke="#ffffff" stroke-width="0.8" stroke-linecap="round" opacity="0.3"/>
          <!-- Guarda / Cruzeta -->
          <path d="M 35 48 L 53 54" stroke="#8b2635" stroke-width="2.5" stroke-linecap="round"/>
          <circle cx="34.5" cy="47.8" r="2.2" fill="#8b2635"/>
          <circle cx="53.5" cy="54.2" r="2.2" fill="#8b2635"/>
          <!-- Ponta da Espada -->
          <path d="M 62 8 L 60 1 L 66 7 Z" fill="#8b2635"/>
          <!-- Pomo da Espada -->
          <circle cx="30" cy="93" r="2.5" fill="#8b2635"/>
        </g>

        <!-- Espada 3 (Direita - mais vertical) -->
        <g id="sword-3">
          <!-- Lâmina -->
          <path d="M 60 88 L 60 2" stroke="#8b2635" stroke-width="4" stroke-linecap="round"/>
          <path d="M 60 88 L 60 2" stroke="#ffffff" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
          <!-- Guarda / Cruzeta -->
          <path d="M 42 32 L 78 32" stroke="#8b2635" stroke-width="2.8" stroke-linecap="round"/>
          <circle cx="41.5" cy="32" r="2.5" fill="#8b2635"/>
          <circle cx="78.5" cy="32" r="2.5" fill="#8b2635"/>
          <!-- Ponta da Espada -->
          <path d="M 60 2 L 56 -5 L 64 -5 Z" fill="#8b2635"/>
          <!-- Pomo da Espada -->
          <circle cx="60" cy="94" r="3" fill="#8b2635"/>
        </g>
      </svg>

      <!-- Tipografia Oficial -->
      <div style="display: flex; flex-direction: column; justify-content: center; line-height: 1.15;">
        <div style="font-family: 'Cinzel', 'Outfit', serif; font-size: ${Math.round(15 * scale)}px; font-weight: 700; color: #cbd5e1; letter-spacing: 0.5px;">
          CAVALCANTI, OLIVEIRA & BATISTA
        </div>
        <div style="font-family: 'Cinzel', 'Outfit', serif; font-size: ${Math.round(10 * scale)}px; font-weight: 700; color: #8b2635; letter-spacing: 4px; border-top: 1px solid #8b2635; padding-top: 3px; margin-top: 2px;">
          A D V O G A D O S
        </div>
      </div>
    </div>
  `;
}

function renderCOBBrandHeader(targetId = 'cobBrandHeader') {
  const elem = document.getElementById(targetId);
  if (!elem) return;

  elem.innerHTML = `
    <a href="/" style="text-decoration: none;">
      ${getCOBLogoSVG(52)}
    </a>
  `;
}
