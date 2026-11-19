/**
 * SISMIP — Plantas Arquitetônicas Vetoriais Interativas (SVG)
 * 1. Térreo do Palácio Imperial (Edifício nº 13 — fiel à Figura 3 do relatório / Ibram)
 * 2. Reserva Técnica — 2º Pavimento do Edifício nº 4 (Sala Piloto, Perímetro, Sílica Gel e Solar)
 * 3. Mapa de Localização do Complexo do Museu Imperial (fiel à Figura 1 do relatório — Edifícios 1 a 13)
 */
window.MuseuSim = window.MuseuSim || {};

(function () {
  const CFG = window.MuseuSim.CONFIG;
  const fmt = window.MuseuSim.fmt;

  function corPorStatusUr(ur, perfil, modoVisual) {
    if (modoVisual !== 'heatmap') {
      return null;
    }
    if (ur > perfil.urCritMax || ur < perfil.urCritMin) {
      return 'rgba(239, 68, 68, 0.52)'; // Crítico (vermelho)
    }
    if (ur > perfil.urMax || ur < perfil.urMin) {
      return 'rgba(245, 158, 11, 0.46)'; // Atenção (âmbar)
    }
    return 'rgba(16, 185, 129, 0.36)'; // Ideal na faixa (esmeralda)
  }

  function badgeCorZona(zState, perfil) {
    if (!zState.loraOnline) return { stroke: '#e0a84b', fill: '#78350f', dot: '#e0a84b', label: 'MODO SEGURO' };
    if (zState.ur > perfil.urCritMax || zState.ur < perfil.urCritMin || zState.riscoCondensacao) {
      return { stroke: '#ef4444', fill: '#7f1d1d', dot: '#f87171', label: 'ALERTA' };
    }
    if (zState.ur > perfil.urMax || zState.ur < perfil.urMin) {
      return { stroke: '#e0a84b', fill: '#78350f', dot: '#e0a84b', label: 'AJUSTANDO' };
    }
    return { stroke: '#52b788', fill: '#064e3b', dot: '#52b788', label: 'ESTÁVEL' };
  }

  /**
   * Renderiza um pino interativo de Zona/Sensor + Desumidificador sobre o SVG
   */
  function renderNoSensorSVG(zCfg, zState, perfil, selecionada, gwPos, repetidorAtivo, repPos) {
    const { x, y } = zCfg.posPlanta;
    const st = badgeCorZona(zState, perfil);
    const isSel = selecionada === zCfg.id;

    // Caminho do link LoRaWAN (direto ao GW ou via Repetidor se ativo e mais próximo)
    let linkPath = `M ${x} ${y} L ${gwPos.x} ${gwPos.y}`;
    if (repetidorAtivo && repPos && (zCfg.id === 'P-01' || zCfg.id === 'P-02')) {
      linkPath = `M ${x} ${y} L ${repPos.x} ${repPos.y} L ${gwPos.x} ${gwPos.y}`;
    }

    const dhX = x + (zCfg.id === 'P-03' ? 58 : 44);
    const dhY = y + (zCfg.id === 'P-03' ? 22 : 28);

    return `
      <g class="lora-link-group">
        <path d="${linkPath}"
              class="lora-ray ${zState.loraOnline ? 'online' : 'offline'}"
              stroke="${zState.loraOnline ? '#38bdf8' : '#ef4444'}"
              stroke-width="${isSel ? '2.2' : '1.4'}"
              stroke-dasharray="${zState.loraOnline ? '5 5' : '3 6'}"
              fill="none" opacity="${zState.loraOnline ? '0.68' : '0.55'}" />
        ${zState.loraOnline ? `
          <circle r="3.2" fill="#38bdf8" class="lora-packet">
            <animateMotion dur="${zCfg.id === 'P-03' ? '2.4s' : '3.1s'}" repeatCount="indefinite" path="${linkPath}" />
          </circle>
        ` : ''}
      </g>

      <!-- Halo microclimático da zona -->
      <circle cx="${x}" cy="${y}" r="${isSel ? 46 : 36}"
              fill="${st.dot}" opacity="${isSel ? '0.18' : '0.10'}"
              class="zone-halo ${zState.desumLigado ? 'active-dehum' : ''}" />

      <!-- Atuador Desumidificador + CT Clamp SCT-013 -->
      <g class="actuator-node" data-zone-id="${zCfg.id}" transform="translate(${dhX}, ${dhY})" style="cursor:pointer;">
        <rect x="-26" y="-12" width="52" height="24" rx="6"
              fill="${zState.desumLigado ? '#1d4a52' : '#1f3229'}"
              stroke="${zState.desumLigado ? '#38bdf8' : '#64748b'}" stroke-width="1.5" />
        <circle cx="-14" cy="0" r="6" fill="none" stroke="${zState.desumLigado ? '#7dd3fc' : '#94a3b8'}" stroke-width="1.3" />
        <g transform="translate(-14, 0)">
          <g>
            ${zState.desumLigado ? `<animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="1.3s" repeatCount="indefinite" />` : ''}
            <line x1="-4" y1="0" x2="4" y2="0" stroke="${zState.desumLigado ? '#38bdf8' : '#94a3b8'}" stroke-width="1.5"/>
            <line x1="0" y1="-4" x2="0" y2="4" stroke="${zState.desumLigado ? '#38bdf8' : '#94a3b8'}" stroke-width="1.5"/>
          </g>
        </g>
        <text x="8" y="-1" text-anchor="middle" fill="#f8f6f0" font-size="8.5" font-weight="700" font-family="monospace">
          ${zState.desumLigado ? 'ON' : 'OFF'}
        </text>
        <text x="8" y="8" text-anchor="middle" fill="${zState.desumLigado ? '#7dd3fc' : '#94a3b8'}" font-size="7.2" font-family="monospace">
          ${zState.desumLigado ? fmt(zCfg.potenciaKw, 2) + 'kW' : '0,00kW'}
        </text>
      </g>

      <!-- Vitrine / Armário com Sílica Gel (quando presente na zona) -->
      ${zCfg.temVitrineSilica ? `
        <g transform="translate(${x - 48}, ${y + 28})" class="silica-badge" data-zone-id="${zCfg.id}" style="cursor:pointer;">
          <rect x="-32" y="-10" width="64" height="20" rx="5" fill="#1e1b4b" stroke="#818cf8" stroke-width="1.2" />
          <text x="0" y="-1" text-anchor="middle" fill="#e0e7ff" font-size="7.2" font-weight="700">SÍLICA GEL</text>
          <text x="0" y="7" text-anchor="middle" fill="#a5b4fc" font-size="7.2" font-family="monospace">${fmt(zState.urVitrine, 1)}% | 0W</text>
        </g>
      ` : ''}

      <!-- Nó principal do Sensor SHT40 + marcador oficial da Figura 3 (1, 2, 3...) -->
      <g class="sensor-node ${isSel ? 'selected' : ''}" data-zone-id="${zCfg.id}" transform="translate(${x}, ${y})" style="cursor:pointer;">
        ${isSel ? `<circle r="24" fill="none" stroke="#e0a84b" stroke-width="2.2" stroke-dasharray="4 3" class="pulse-ring" />` : ''}

        <!-- Etiqueta flutuante superior com telemetria ao vivo -->
        <g transform="translate(0, -34)">
          <rect x="-56" y="-17" width="112" height="32" rx="7"
                fill="#13221c" fill-opacity="0.93"
                stroke="${isSel ? '#e0a84b' : st.stroke}" stroke-width="${isSel ? '2' : '1.4'}" />
          <text x="0" y="-4" text-anchor="middle" fill="#f8f6f0" font-size="10.5" font-weight="700" font-family="monospace">
            ${fmt(zState.ur, 1)}% UR · ${fmt(zState.temp, 1)}°C
          </text>
          <text x="0" y="9" text-anchor="middle" fill="${st.dot}" font-size="8.2" font-weight="700">
            ${zCfg.codigo} · ${st.label} ${zState.modoControle === 'manual' ? '(MAN)' : ''}
          </text>
        </g>

        <!-- Círculo numerado idêntico à convenção da Figura 3 do relatório -->
        <circle r="15" fill="#1e4d3b" stroke="${isSel ? '#e0a84b' : '#ffffff'}" stroke-width="2.4" />
        <circle cx="11" cy="-11" r="4.8" fill="${st.dot}" stroke="#13221c" stroke-width="1.4" />
        <text x="0" y="5" text-anchor="middle" fill="#ffffff" font-size="13" font-weight="800">
          ${zCfg.numeroMapa}
        </text>
      </g>
    `;
  }

  /**
   * 1. PLANTA DE SETORIZAÇÃO DO TÉRREO DO PALÁCIO IMPERIAL (EDIFÍCIO Nº 13 — FIGURA 3 DO RELATÓRIO)
   */
  function renderPlantaPalacioSVG(state) {
    const modoVisual = state.modoCorPlanta; // 'ibram' ou 'heatmap'
    const zP01 = state.zonas['P-01'];
    const zP02 = state.zonas['P-02'];
    const zP03 = state.zonas['P-03'];

    const pP01 = CFG.perfisConservacao[zP01.perfilId];
    const pP02 = CFG.perfisConservacao[zP02.perfilId];
    const pP03 = CFG.perfisConservacao[zP03.perfilId];

    // Cores dos setores: fiel à Figura 3 (Expositivo #b85d19, Administrativo #dfa785, Circulação #f8f6f0)
    // ou dinâmico por umidade no modo Heatmap
    const corExpEsq = corPorStatusUr(zP01.ur, pP01, modoVisual) || '#b85d19';
    const corExpDir = corPorStatusUr(zP02.ur, pP02, modoVisual) || '#b85d19';
    const corAdm = modoVisual === 'heatmap' ? 'rgba(148, 163, 184, 0.35)' : '#dfa785';
    const corCirc = corPorStatusUr(zP03.ur, pP03, modoVisual) || '#f0ece1';

    const gwPos = { x: 500, y: 122 };
    const repPos = { x: 396, y: 232 };
    const extPos = { x: 150, y: 358 };

    const cenarioAtivo = state.cenarioId;
    const nevoeiroAtivo = cenarioAtivo === 'nevoeiro' || state.climaAtual.urExt >= 90;
    const chuvaAtiva = cenarioAtivo === 'chuva_verao';

    // Gerador das 14 linhas de degraus da escadaria imperial central (como na Figura 3)
    let degrausEscada = '';
    for (let y = 92; y <= 176; y += 7) {
      degrausEscada += `<line x1="463" y1="${y}" x2="484" y2="${y}" stroke="#64748b" stroke-width="1.1" />`;
    }

    const zonasPalacioCfg = CFG.zonas.filter((z) => z.edificio === 'palacio');
    const nosSensores = zonasPalacioCfg
      .map((zCfg) =>
        renderNoSensorSVG(
          zCfg,
          state.zonas[zCfg.id],
          CFG.perfisConservacao[state.zonas[zCfg.id].perfilId],
          state.zonaSelecionada,
          gwPos,
          state.repetidorAtivo,
          repPos
        )
      )
      .join('');

    return `
      <svg viewBox="0 0 1000 455" class="floorplan-svg" role="img" aria-label="Planta de setorização do térreo do Palácio Imperial">
        <defs>
          <pattern id="marbleGrid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#cbd5e1" stroke-width="0.6" opacity="0.55" />
          </pattern>
          <radialGradient id="fogGrad" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stop-color="#cbd5e1" stop-opacity="0.22" />
            <stop offset="100%" stop-color="#94a3b8" stop-opacity="0.04" />
          </radialGradient>
        </defs>

        <!-- Fundo dos Jardins Imperiais ao redor do Palácio -->
        <rect x="0" y="0" width="1000" height="455" rx="12" fill="#101a16" class="svg-canvas-bg" />

        <!-- Gramado / entorno paisagístico sutil -->
        <rect x="28" y="20" width="944" height="415" rx="10" fill="#112220" opacity="0.45" stroke="#1e3a34" stroke-width="1" />

        <!-- Efeito atmosférico externo (Nevoeiro Serrano / Chuva) -->
        ${nevoeiroAtivo ? `
          <g class="weather-fog-layer" pointer-events="none">
            <ellipse cx="220" cy="60" rx="190" ry="34" fill="url(#fogGrad)" />
            <ellipse cx="780" cy="62" rx="195" ry="34" fill="url(#fogGrad)" />
            <ellipse cx="500" cy="405" rx="340" ry="28" fill="url(#fogGrad)" />
          </g>
        ` : ''}
        ${chuvaAtiva ? `
          <g stroke="#38bdf8" stroke-width="1" opacity="0.30" pointer-events="none">
            <line x1="70" y1="25" x2="58" y2="55" /><line x1="150" y1="30" x2="138" y2="60" />
            <line x1="840" y1="28" x2="828" y2="58" /><line x1="920" y1="35" x2="908" y2="65" />
            <line x1="310" y1="385" x2="298" y2="415" /><line x1="710" y1="385" x2="698" y2="415" />
          </g>
        ` : ''}

        <!-- Título sutil da planta -->
        <text x="44" y="42" fill="#94a3b8" font-size="11" font-weight="700" letter-spacing="0.06em">
          PALÁCIO IMPERIAL · TÉRREO
        </text>

        <!-- Bússola Norte -->
        <g transform="translate(942, 46)">
          <circle r="15" fill="#13221c" stroke="#475569" stroke-width="1.2" />
          <polygon points="0,-10 4,5 0,2 -4,5" fill="#e0a84b" />
          <text x="0" y="-18" text-anchor="middle" fill="#94a3b8" font-size="8.5" font-weight="700">N</text>
        </g>

        <!-- Pórticos Laterais (Oeste e Leste) e Escadaria Frontal Sul (fiel à Figura 3) -->
        <g stroke="#64748b" stroke-width="1.3" fill="#ece7da">
          <!-- Escadaria lateral esquerda -->
          <rect x="94" y="138" width="26" height="124" fill="#f8f6f0" />
          <line x1="100" y1="138" x2="100" y2="262" /><line x1="106" y1="138" x2="106" y2="262" />
          <!-- Escadaria lateral direita -->
          <rect x="880" y="138" width="26" height="124" fill="#f8f6f0" />
          <line x1="894" y1="138" x2="894" y2="262" /><line x1="900" y1="138" x2="900" y2="262" />
          <!-- Escadaria monumental frontal sul -->
          <rect x="445" y="356" width="110" height="24" fill="#f8f6f0" />
          <line x1="445" y1="362" x2="555" y2="362" />
          <line x1="445" y1="368" x2="555" y2="368" />
          <line x1="445" y1="374" x2="555" y2="374" />
        </g>

        <!-- Silhueta Estrutural Externa (Paredes Históricas Espessas do Século XIX) -->
        <path d="
          M 120 86 L 188 86 L 188 118 L 404 118 L 404 46 L 596 46 L 596 118
          L 812 118 L 812 86 L 880 86 L 880 316 L 596 316 L 596 356 L 404 356
          L 404 316 L 120 316 Z
        " fill="#f8f6f0" stroke="#334155" stroke-width="6" stroke-linejoin="miter" />

        <!-- Piso da Circulação Central e Corredores -->
        <path d="
          M 188 220 L 812 220 L 812 246 L 188 246 Z
          M 408 50 L 592 50 L 592 352 L 408 352 Z
        " fill="${corCirc}" />
        <path d="
          M 408 50 L 592 50 L 592 352 L 408 352 Z
        " fill="url(#marbleGrid)" pointer-events="none" />

        <!-- ==================== ALA ESQUERDA (P-01) ==================== -->
        <g class="wing-left" data-zone-id="P-01" style="cursor:pointer;">
          <!-- Galeria Extrema Oeste (Expositivo) -->
          <rect x="124" y="90" width="60" height="222" fill="${corExpEsq}" stroke="#f8f6f0" stroke-width="2.5" />

          <!-- Salas Administrativas Internas (cor pêssego #dfa785 igual à Figura 3) -->
          <rect x="188" y="122" width="46" height="96" fill="${corAdm}" stroke="#f8f6f0" stroke-width="2.5" />
          <rect x="236" y="122" width="48" height="96" fill="${corAdm}" stroke="#f8f6f0" stroke-width="2.5" />

          <!-- Grande Sala Expositiva da Ala Esquerda (Sede do Ponto 1 / P-01) -->
          <rect x="286" y="122" width="84" height="96" fill="${corExpEsq}" stroke="#f8f6f0" stroke-width="2.5" />
          <rect x="372" y="122" width="32" height="96" fill="${corExpEsq}" stroke="#f8f6f0" stroke-width="2.5" />

          <!-- Saleta Superior Esquerda do Corpo Central -->
          <rect x="408" y="50" width="52" height="88" fill="${corExpEsq}" stroke="#f8f6f0" stroke-width="2.5" />
          <rect x="408" y="140" width="52" height="48" fill="${corExpEsq}" stroke="#f8f6f0" stroke-width="2.5" />

          <!-- Fileira Frontal Sul da Ala Esquerda (3 salas expositivas + sala junto ao vestíbulo) -->
          <rect x="188" y="246" width="70" height="66" fill="${corExpEsq}" stroke="#f8f6f0" stroke-width="2.5" />
          <rect x="260" y="246" width="72" height="66" fill="${corExpEsq}" stroke="#f8f6f0" stroke-width="2.5" />
          <rect x="334" y="246" width="70" height="66" fill="${corExpEsq}" stroke="#f8f6f0" stroke-width="2.5" />
          <rect x="408" y="246" width="52" height="66" fill="${corExpEsq}" stroke="#f8f6f0" stroke-width="2.5" />
        </g>

        <!-- ==================== ALA DIREITA (P-02) ==================== -->
        <g class="wing-right" data-zone-id="P-02" style="cursor:pointer;">
          <!-- Saletas Superiores Direitas do Corpo Central -->
          <rect x="540" y="50" width="52" height="88" fill="${corExpDir}" stroke="#f8f6f0" stroke-width="2.5" />
          <rect x="540" y="140" width="52" height="48" fill="${corExpDir}" stroke="#f8f6f0" stroke-width="2.5" />

          <!-- Salas Superiores Internas da Ala Direita (Todas Expositivas como na Figura 3 + Ponto 2 / P-02) -->
          <rect x="596" y="122" width="34" height="96" fill="${corExpDir}" stroke="#f8f6f0" stroke-width="2.5" />
          <rect x="632" y="122" width="88" height="96" fill="${corExpDir}" stroke="#f8f6f0" stroke-width="2.5" />
          <rect x="722" y="122" width="44" height="96" fill="${corExpDir}" stroke="#f8f6f0" stroke-width="2.5" />
          <rect x="768" y="122" width="44" height="96" fill="${corExpDir}" stroke="#f8f6f0" stroke-width="2.5" />

          <!-- Fileira Frontal Sul da Ala Direita -->
          <rect x="540" y="246" width="52" height="66" fill="${corExpDir}" stroke="#f8f6f0" stroke-width="2.5" />
          <rect x="596" y="246" width="70" height="66" fill="${corExpDir}" stroke="#f8f6f0" stroke-width="2.5" />
          <rect x="668" y="246" width="72" height="66" fill="${corExpDir}" stroke="#f8f6f0" stroke-width="2.5" />
          <rect x="742" y="246" width="70" height="66" fill="${corExpDir}" stroke="#f8f6f0" stroke-width="2.5" />

          <!-- Galeria Extrema Leste (Expositivo) -->
          <rect x="816" y="90" width="60" height="222" fill="${corExpDir}" stroke="#f8f6f0" stroke-width="2.5" />
        </g>

        <!-- ==================== ELEMENTOS ARQUITETÔNICOS DO CORPO CENTRAL (P-03) ==================== -->
        <g pointer-events="none">
          <!-- Escadaria Principal e Poço Técnico [X] (fiel à Figura 3) -->
          <rect x="462" y="86" width="23" height="98" fill="#ffffff" stroke="#475569" stroke-width="1.3" />
          ${degrausEscada}
          <rect x="513" y="66" width="20" height="22" fill="#ffffff" stroke="#475569" stroke-width="1.2" />
          <line x1="513" y1="66" x2="533" y2="88" stroke="#64748b" stroke-width="1" />
          <line x1="533" y1="66" x2="513" y2="88" stroke="#64748b" stroke-width="1" />

          <!-- Colunas neoclássicas do Vestíbulo Central -->
          <circle cx="476" cy="212" r="3.5" fill="#ffffff" stroke="#334155" stroke-width="1.5" />
          <circle cx="524" cy="212" r="3.5" fill="#ffffff" stroke="#334155" stroke-width="1.5" />
          <circle cx="476" cy="268" r="3.5" fill="#ffffff" stroke="#334155" stroke-width="1.5" />
          <circle cx="524" cy="268" r="3.5" fill="#ffffff" stroke="#334155" stroke-width="1.5" />

          <!-- Arcos das 3 Portas Monumentais de Entrada (Sul) -->
          <path d="M 468 354 A 10 10 0 0 1 488 354" fill="none" stroke="#475569" stroke-width="1.4" />
          <path d="M 490 354 A 10 10 0 0 1 510 354" fill="none" stroke="#475569" stroke-width="1.4" />
          <path d="M 512 354 A 10 10 0 0 1 532 354" fill="none" stroke="#475569" stroke-width="1.4" />

          <!-- Esquadrias / Janelas históricas na fachada sul, leste e oeste -->
          ${[210, 240, 282, 312, 355, 385, 615, 645, 688, 718, 760, 790].map(
            (jx) => `<rect x="${jx - 6}" y="313" width="12" height="6" fill="#bae6fd" stroke="#334155" stroke-width="1" />`
          ).join('')}
          ${[125, 195, 265].map(
            (jy) => `
              <rect x="117" y="${jy}" width="6" height="14" fill="#bae6fd" stroke="#334155" stroke-width="1" />
              <rect x="877" y="${jy}" width="6" height="14" fill="#bae6fd" stroke="#334155" stroke-width="1" />
            `
          ).join('')}

          <!-- Colunata das varandas norte (recessos superiores) -->
          ${[215, 255, 295, 335, 375, 625, 665, 705, 745, 785].map(
            (cx) => `<rect x="${cx - 3}" y="112" width="6" height="6" fill="#ece7da" stroke="#475569" stroke-width="1" />`
          ).join('')}
        </g>

        <!-- ==================== INFRAESTRUTURA IOT: GATEWAY, REPETIDOR E SENSOR EXTERNO ==================== -->
        <!-- Link do Sensor Externo ao Gateway -->
        <path d="M ${extPos.x} ${extPos.y} L ${gwPos.x} ${gwPos.y}"
              stroke="#a78bfa" stroke-width="1.3" stroke-dasharray="4 5" fill="none" opacity="0.55" />

        <!-- Sensor Externo Protegido (Clima de Petrópolis) -->
        <g transform="translate(${extPos.x}, ${extPos.y})" class="ext-sensor-node">
          <rect x="-66" y="-18" width="132" height="36" rx="8" fill="#13221c" stroke="#a78bfa" stroke-width="1.6" />
          <text x="0" y="-3" text-anchor="middle" fill="#e9d5ff" font-size="9.2" font-weight="700">
            EXT-01 · ABRIGO JARDINS
          </text>
          <text x="0" y="10" text-anchor="middle" fill="#f8f6f0" font-size="9.8" font-weight="700" font-family="monospace">
            ${fmt(state.climaAtual.urExt, 1)}% UR · ${fmt(state.climaAtual.tempExt, 1)}°C
          </text>
        </g>

        <!-- Repetidor LoRaWAN Compacto (Opcional para vencer paredes espessas - Seção 4.4) -->
        <g transform="translate(${repPos.x}, ${repPos.y})" id="svg-toggle-repeater" style="cursor:pointer;">
          <circle r="13" fill="${state.repetidorAtivo ? '#065f46' : '#1f3229'}"
                  stroke="${state.repetidorAtivo ? '#52b788' : '#64748b'}" stroke-width="1.8" />
          <text x="0" y="3" text-anchor="middle" fill="#ffffff" font-size="7.8" font-weight="700">REP</text>
          <text x="-19" y="3" text-anchor="end" fill="${state.repetidorAtivo ? '#065f46' : '#475569'}" font-size="8.5" font-weight="800">
            ${state.repetidorAtivo ? 'REPETIDOR LIGADO' : 'REPETIDOR DESLIGADO'}
          </text>
        </g>

        <!-- Gateway LoRaWAN 915 MHz + Controlador MPC Local -->
        <g transform="translate(${gwPos.x}, ${gwPos.y})" class="gateway-node">
          <circle r="22" fill="#0ea5e9" opacity="0.16" class="pulse-ring" />
          <rect x="-46" y="-16" width="92" height="32" rx="8" fill="#133a2e" stroke="#38bdf8" stroke-width="2" />
          <text x="0" y="-2" text-anchor="middle" fill="#e0f2fe" font-size="8.8" font-weight="800">
            GW-01 · LoRa 915
          </text>
          <text x="0" y="10" text-anchor="middle" fill="#7dd3fc" font-size="8" font-family="monospace">
            MPC 64-Comb ON
          </text>
        </g>

        <!-- Nós das Zonas P-01, P-02 e P-03 -->
        ${nosSensores}

        <!-- ==================== LEGENDA OFICIAL IBRAM + ESCALA GRÁFICA (FIGURA 3) ==================== -->
        <g transform="translate(60, 405)">
          <rect x="0" y="0" width="14" height="14" rx="2" fill="#b85d19" stroke="#ffffff" stroke-width="0.8" />
          <text x="20" y="11" fill="#cbd5e1" font-size="11" font-weight="600">Expositivo</text>

          <rect x="95" y="0" width="14" height="14" rx="2" fill="#dfa785" stroke="#ffffff" stroke-width="0.8" />
          <text x="115" y="11" fill="#cbd5e1" font-size="11" font-weight="600">Administrativo</text>

          <rect x="212" y="0" width="14" height="14" rx="2" fill="#f0ece1" stroke="#64748b" stroke-width="0.8" />
          <text x="232" y="11" fill="#cbd5e1" font-size="11" font-weight="600">Circulação</text>

          <circle cx="316" cy="7" r="5" fill="#38bdf8" />
          <text x="327" y="11" fill="#7dd3fc" font-size="11" font-weight="600">Link sem fio LoRaWAN</text>
        </g>

        <!-- Barra de Escala 0 - 5 - 10 - 20 m (idêntica à Figura 3) -->
        <g transform="translate(760, 412)">
          <rect x="0" y="0" width="35" height="6" fill="#64748b" />
          <rect x="35" y="0" width="35" height="6" fill="#cbd5e1" />
          <rect x="70" y="0" width="70" height="6" fill="#64748b" />
          <text x="0" y="-4" text-anchor="middle" fill="#cbd5e1" font-size="9.5" font-family="monospace">0</text>
          <text x="35" y="-4" text-anchor="middle" fill="#cbd5e1" font-size="9.5" font-family="monospace">5</text>
          <text x="70" y="-4" text-anchor="middle" fill="#cbd5e1" font-size="9.5" font-family="monospace">10</text>
          <text x="140" y="-4" text-anchor="middle" fill="#cbd5e1" font-size="9.5" font-family="monospace">20 m</text>
        </g>
      </svg>
    `;
  }

  /**
   * 2. PLANTA DA RESERVA TÉCNICA — EDIFÍCIO Nº 4 (2º PAVIMENTO + COBERTURA SOLAR)
   */
  function renderPlantaReservaSVG(state) {
    const modoVisual = state.modoCorPlanta;
    const zRT1 = state.zonas['RT-01'];
    const zRT2 = state.zonas['RT-02'];
    const zRT3 = state.zonas['RT-03'];

    const corRT1 = corPorStatusUr(zRT1.ur, CFG.perfisConservacao[zRT1.perfilId], modoVisual) || '#24463a';
    const corRT2 = corPorStatusUr(zRT2.ur, CFG.perfisConservacao[zRT2.perfilId], modoVisual) || '#2a5244';
    const corRT3 = corPorStatusUr(zRT3.ur, CFG.perfisConservacao[zRT3.perfilId], modoVisual) || '#2e4b43';

    const gwPos = { x: 155, y: 285 };
    const zonasReservaCfg = CFG.zonas.filter((z) => z.edificio === 'reserva');
    const nosSensores = zonasReservaCfg
      .map((zCfg) =>
        renderNoSensorSVG(
          zCfg,
          state.zonas[zCfg.id],
          CFG.perfisConservacao[state.zonas[zCfg.id].perfilId],
          state.zonaSelecionada,
          gwPos,
          false,
          null
        )
      )
      .join('');

    const solarInfo = state.solarCalc;

    return `
      <svg viewBox="0 0 1000 455" class="floorplan-svg" role="img" aria-label="Planta do 2º pavimento do Edifício nº 4 - Reserva Técnica">
        <rect x="0" y="0" width="1000" height="455" rx="12" fill="#101a16" />

        <!-- Árvores históricas dos jardins ao Norte (causam sombreamento parcial citado na Seção 1.1 e 4.4) -->
        <g opacity="0.85">
          <circle cx="520" cy="48" r="28" fill="#14532d" stroke="#22c55e" stroke-width="1.2" />
          <circle cx="570" cy="42" r="34" fill="#166534" stroke="#22c55e" stroke-width="1.2" />
          <circle cx="635" cy="46" r="30" fill="#14532d" stroke="#22c55e" stroke-width="1.2" />
          <circle cx="705" cy="44" r="32" fill="#15803d" stroke="#4ade80" stroke-width="1.2" />
          <circle cx="770" cy="52" r="26" fill="#14532d" stroke="#22c55e" stroke-width="1.2" />
          <text x="645" y="20" text-anchor="middle" fill="#86efac" font-size="9.5" font-weight="700">
            ARVOREDO HISTÓRICO DOS JARDINS (UMIDADE &amp; SOMBREAMENTO PARCIAL NA COBERTURA)
          </text>
        </g>

        <text x="44" y="42" fill="#94a3b8" font-size="11" font-weight="700" letter-spacing="0.06em">
          RESERVA TÉCNICA · EDIFÍCIO Nº 4, 2º PAVIMENTO
        </text>

        <!-- Estrutura Externa do Edifício nº 4 -->
        <rect x="88" y="84" width="710" height="286" rx="4" fill="#ece7da" stroke="#475569" stroke-width="6" />

        <!-- Sala TI / Controle Local + Acesso (Canto Sudoeste) -->
        <rect x="94" y="226" width="125" height="138" fill="#1f3229" stroke="#94a3b8" stroke-width="2" />
        <text x="156" y="248" text-anchor="middle" fill="#cbd5e1" font-size="9.5" font-weight="700">SALA DE CONTROLE</text>
        <text x="156" y="261" text-anchor="middle" fill="#94a3b8" font-size="8.2">Servidor Python + Backup</text>

        <!-- Sala de Triagem e Museologia (Noroeste) -->
        <rect x="94" y="90" width="125" height="132" fill="#dfa785" stroke="#ffffff" stroke-width="2" />
        <text x="156" y="148" text-anchor="middle" fill="#431407" font-size="9.8" font-weight="700">SETOR DE</text>
        <text x="156" y="161" text-anchor="middle" fill="#431407" font-size="9.8" font-weight="700">MUSEOLOGIA</text>

        <!-- RT-01: SALA PILOTO — NÚCLEO DA RESERVA TÉCNICA (~300 mil itens) -->
        <g data-zone-id="RT-01" style="cursor:pointer;">
          <rect x="223" y="90" width="265" height="274" fill="${corRT1}" stroke="#f8f6f0" stroke-width="2.5" />
          <!-- Estantes deslizantes de acervo -->
          ${[112, 132, 152, 255, 275, 295, 315].map(
            (ry) => `<rect x="242" y="${ry}" width="92" height="11" rx="2" fill="#94a3b8" opacity="0.38" />`
          ).join('')}
          <text x="355" y="112" text-anchor="middle" fill="#ece7da" font-size="10.2" font-weight="700">
            SALA PILOTO — NÚCLEO DO ACERVO (RT-01)
          </text>
          <text x="355" y="348" text-anchor="middle" fill="#cbd5e1" font-size="8.8">
            Meta Operacional: 48% a 54% UR (Papel, Têxteis e Madeira)
          </text>
        </g>

        <!-- RT-02: ZONA PERIMETRAL E ABERTURAS EXTERNAS (Sentinela de infiltração/orvalho) -->
        <g data-zone-id="RT-02" style="cursor:pointer;">
          <rect x="492" y="90" width="300" height="122" fill="${corRT2}" stroke="#f8f6f0" stroke-width="2.5" />
          <!-- Janelas voltadas ao jardim úmido -->
          ${[535, 610, 685, 750].map(
            (wx) => `<rect x="${wx}" y="81" width="28" height="7" fill="#38bdf8" stroke="#13221c" stroke-width="1" />`
          ).join('')}
          <text x="642" y="108" text-anchor="middle" fill="#bae6fd" font-size="9.8" font-weight="700">
            PERÍMETRO NORTE &amp; ESQUADRIAS EXTERNAS (RT-02)
          </text>
        </g>

        <!-- RT-03: ARQUIVO HISTÓRICO & ARMÁRIOS VEDADOS COM SÍLICA GEL -->
        <g data-zone-id="RT-03" style="cursor:pointer;">
          <rect x="492" y="216" width="300" height="148" fill="${corRT3}" stroke="#f8f6f0" stroke-width="2.5" />
          <!-- Desenho dos armários vedados de microclima compartimentado -->
          ${[512, 552, 592].map(
            (ax) => `<rect x="${ax}" y="316" width="32" height="34" rx="3" fill="#312e81" stroke="#818cf8" stroke-width="1.3" />`
          ).join('')}
          <text x="558" y="310" text-anchor="middle" fill="#c7d2fe" font-size="8.2" font-weight="700">
            Armários Vedados (Sílica Gel)
          </text>
          <text x="642" y="236" text-anchor="middle" fill="#e0e7ff" font-size="9.8" font-weight="700">
            ARQUIVO HISTÓRICO &amp; OBRAS RARAS (RT-03)
          </text>
        </g>

        <!-- Gateway Local Edifício 4 -->
        <g transform="translate(${gwPos.x}, ${gwPos.y})">
          <rect x="-46" y="-15" width="92" height="30" rx="7" fill="#133a2e" stroke="#38bdf8" stroke-width="1.8" />
          <text x="0" y="-2" text-anchor="middle" fill="#e0f2fe" font-size="8.4" font-weight="800">GW-04 · LoRaWAN</text>
          <text x="0" y="9" text-anchor="middle" fill="#7dd3fc" font-size="7.8" font-family="monospace">Quadro SCT-013</text>
        </g>

        <!-- Sensores RT-01, RT-02 e RT-03 -->
        ${nosSensores}

        <!-- ==================== MINI-DIAGRAMA DA COBERTURA CERÂMICA SOLAR (DIREITA) ==================== -->
        <g transform="translate(816, 86)">
          <rect x="0" y="0" width="160" height="284" rx="10" fill="#182a22" stroke="#e0a84b" stroke-width="1.6" />
          <text x="80" y="22" text-anchor="middle" fill="#e0a84b" font-size="9.8" font-weight="800">
            COBERTURA ED. Nº 4
          </text>
          <text x="80" y="35" text-anchor="middle" fill="#94a3b8" font-size="8">
            Telhado Cerâmico + FV
          </text>

          <!-- Representação visual das placas monocristalinas + sombra parcial -->
          <rect x="16" y="48" width="128" height="96" rx="6" fill="#7c2d12" stroke="#ea580c" stroke-width="1.2" />
          ${[0, 1, 2].map((row) =>
            [0, 1, 2, 3].map((col) => {
              const px = 24 + col * 29;
              const py = 56 + row * 28;
              const sombreado = row === 0 && col >= 2 && solarInfo.sombraPct > 15;
              return `<rect x="${px}" y="${py}" width="25" height="23" rx="2"
                            fill="${sombreado ? '#1f3229' : '#0284c7'}"
                            stroke="#7dd3fc" stroke-width="0.9" />`;
            }).join('')
          ).join('')}
          <!-- Mancha de sombra das árvores -->
          ${solarInfo.sombraPct > 10 ? `
            <ellipse cx="118" cy="64" rx="34" ry="20" fill="#052e16" opacity="0.62" />
          ` : ''}

          <text x="80" y="162" text-anchor="middle" fill="#f8f6f0" font-size="11" font-weight="800" font-family="monospace">
            ${fmt(solarInfo.geracaoInstantaneaKw, 2)} kW agora
          </text>
          <text x="80" y="176" text-anchor="middle" fill="#38bdf8" font-size="8.6" font-weight="700">
            ${solarInfo.usaMicroinversor ? 'Microinversores MLPE' : 'Inversor String'}
          </text>
          <text x="80" y="194" text-anchor="middle" fill="#cbd5e1" font-size="8.5">
            Potência: ${fmt(solarInfo.potenciaPicoKwp, 1)} kWp (${solarInfo.numModulos} mód.)
          </text>
          <text x="80" y="209" text-anchor="middle" fill="#cbd5e1" font-size="8.5">
            Sombra arbórea: ${solarInfo.sombraPct}%
          </text>
          <text x="80" y="226" text-anchor="middle" fill="#52b788" font-size="9" font-weight="700">
            ~${fmt(solarInfo.geracaoMensalKwh, 0)} kWh/mês
          </text>
          <text x="80" y="242" text-anchor="middle" fill="#e0a84b" font-size="8" font-style="italic">
            Contabilizado separado
          </text>
          <text x="80" y="253" text-anchor="middle" fill="#e0a84b" font-size="8" font-style="italic">
            da economia do MPC
          </text>
          <g id="svg-open-solar-tab" style="cursor:pointer;">
            <rect x="22" y="260" width="116" height="18" rx="4" fill="#e0a84b" />
            <text x="80" y="272" text-anchor="middle" fill="#13221c" font-size="8.2" font-weight="800">
              SIMULAR VIABILIDADE →
            </text>
          </g>
        </g>

        <!-- Rodapé técnico -->
        <text x="90" y="418" fill="#94a3b8" font-size="10">
          Fixação 100% reversível sem furos (Portaria IPHAN nº 289/2025) · Monitoramento duplo: Núcleo do Acervo (RT-01) + Perímetro Externo (RT-02)
        </text>
      </svg>
    `;
  }

  /**
   * 3. MAPA DE LOCALIZAÇÃO DO COMPLEXO DO MUSEU IMPERIAL (FIGURA 1 — EDIFÍCIOS 1 A 13)
   */
  function renderMapaComplexoSVG(state) {
    const mediaPalacioUr = (
      (state.zonas['P-01'].ur + state.zonas['P-02'].ur + state.zonas['P-03'].ur) / 3
    ).toFixed(1).replace(".", ",");
    const mediaReservaUr = (
      (state.zonas['RT-01'].ur + state.zonas['RT-02'].ur + state.zonas['RT-03'].ur) / 3
    ).toFixed(1).replace(".", ",");

    return `
      <svg viewBox="0 0 1000 455" class="floorplan-svg" role="img" aria-label="Mapa de Localização do Complexo do Museu Imperial - Figura 1">
        <rect x="0" y="0" width="1000" height="455" rx="12" fill="#101a16" />

        <!-- Terreno murado do Complexo Histórico -->
        <path d="M 190 55 L 795 55 L 795 390 L 190 390 Z" fill="#132a23" stroke="#334155" stroke-width="3" />

        <!-- Caminhos geométricos dos Jardins Imperiais (fiel ao traçado da Figura 1) -->
        <g fill="none" stroke="#64748b" stroke-width="8" opacity="0.35" stroke-linecap="round">
          <path d="M 432 385 L 432 285 L 725 285 L 725 385" />
          <ellipse cx="585" cy="298" rx="95" ry="32" />
          <path d="M 432 285 L 365 235 L 365 160" />
          <path d="M 480 215 L 735 215" />
        </g>

        <!-- Anéis de cobertura sem fio LoRaWAN 915 MHz (longo alcance sem obras subterrâneas) -->
        <g pointer-events="none">
          <circle cx="600" cy="215" r="155" fill="none" stroke="#38bdf8" stroke-width="1.2" stroke-dasharray="6 6" opacity="0.45" />
          <circle cx="325" cy="195" r="125" fill="none" stroke="#52b788" stroke-width="1.2" stroke-dasharray="6 6" opacity="0.45" />
          <line x1="335" y1="195" x2="600" y2="215" stroke="#38bdf8" stroke-width="2" stroke-dasharray="5 5" opacity="0.75" />
        </g>

        <text x="44" y="38" fill="#f8f6f0" font-size="12" font-weight="800" letter-spacing="0.05em">
          COMPLEXO DO MUSEU IMPERIAL
        </text>
        <text x="44" y="55" fill="#94a3b8" font-size="9.5">
          Clique no Palácio (13) ou na Reserva Técnica (4) para abrir a planta com os sensores
        </text>

        <!-- Edifício 5: Lab. Conservação -->
        <rect x="222" y="135" width="36" height="36" fill="#475569" stroke="#cbd5e1" stroke-width="1.5" />
        <!-- Edifício 4: RESERVA TÉCNICA / ADMINISTRAÇÃO (DESTAQUE INTERATIVO) -->
        <g class="campus-bldg-target" data-goto-view="reserva" style="cursor:pointer;">
          <polygon points="262,168 382,182 378,214 258,200" fill="#065f46" stroke="#52b788" stroke-width="3" />
          <rect x="242" y="114" width="166" height="42" rx="7" fill="#13221c" stroke="#52b788" stroke-width="1.8" />
          <text x="325" y="131" text-anchor="middle" fill="#6ee7b7" font-size="9.5" font-weight="800">
            EDIFÍCIO Nº 4 · RESERVA TÉCNICA
          </text>
          <text x="325" y="146" text-anchor="middle" fill="#f8f6f0" font-size="9.5" font-family="monospace">
            Média ${mediaReservaUr}% UR · Abrir Planta →
          </text>
        </g>

        <!-- Edifício 3: Cafeteria -->
        <rect x="275" y="232" width="76" height="28" fill="#475569" stroke="#cbd5e1" stroke-width="1.5" />

        <!-- Edifícios 6, 7, 8: Pavilhão das Viaturas, Cineteatro e Biblioteca -->
        <polygon points="445,152 505,78 528,94 468,168" fill="#475569" stroke="#cbd5e1" stroke-width="1.5" />
        <rect x="546" y="76" width="38" height="44" fill="#475569" stroke="#cbd5e1" stroke-width="1.5" />

        <!-- Edifício 13: PALÁCIO IMPERIAL (DESTAQUE INTERATIVO PRINCIPAL) -->
        <g class="campus-bldg-target" data-goto-view="palacio" style="cursor:pointer;">
          <path d="M 505 186 L 582 186 L 582 174 L 628 174 L 628 186 L 705 186 L 705 242 L 628 242 L 628 252 L 582 252 L 582 242 L 505 242 Z"
                fill="#9a3412" stroke="#e0a84b" stroke-width="3.2" />
          <rect x="515" y="122" width="182" height="42" rx="7" fill="#13221c" stroke="#e0a84b" stroke-width="1.8" />
          <text x="606" y="139" text-anchor="middle" fill="#ecc27a" font-size="9.5" font-weight="800">
            EDIFÍCIO Nº 13 · PALÁCIO IMPERIAL
          </text>
          <text x="606" y="154" text-anchor="middle" fill="#f8f6f0" font-size="9.5" font-family="monospace">
            P-01..P-03: ${mediaPalacioUr}% UR · Abrir →
          </text>
        </g>

        <!-- Edifícios 11 e 12 (Leste) e 2 (Bilheteria Oeste) -->
        <rect x="738" y="236" width="28" height="76" fill="#475569" stroke="#cbd5e1" stroke-width="1.5" />
        <rect x="342" y="310" width="24" height="32" fill="#475569" stroke="#cbd5e1" stroke-width="1.5" />

        <!-- Marcadores numerados 1 a 13 (fiéis à Figura 1) -->
        ${CFG.edificiosComplexo.map((ed) => {
          const dest = ed.num === 4 || ed.num === 13;
          return `
            <g transform="translate(${ed.x}, ${ed.y})" ${ed.targetView ? `class="campus-bldg-target" data-goto-view="${ed.targetView}" style="cursor:pointer;"` : ''}>
              <circle r="${dest ? 12 : 9.5}" fill="${dest ? '#e0a84b' : '#1f3229'}" stroke="#ffffff" stroke-width="1.6" />
              <text x="0" y="3.5" text-anchor="middle" fill="${dest ? '#13221c' : '#f8f6f0'}" font-size="${dest ? '10' : '8.5'}" font-weight="800">
                ${ed.num}
              </text>
            </g>
          `;
        }).join('')}

        <!-- Painel lateral de índice do Mapa de Localização -->
        <g transform="translate(812, 62)">
          <rect x="0" y="0" width="168" height="330" rx="8" fill="#13221c" stroke="#334155" stroke-width="1.4" />
          <text x="12" y="22" fill="#e0a84b" font-size="9.5" font-weight="800">LEGENDA DO COMPLEXO</text>
          ${[
            '1 · Entrada / Saída',
            '2 · Bilheteria',
            '3 · Cafeteria',
            '4 · Reserva Técnica',
            '5 · Lab. Conservação',
            '6 · Pavilhão das Viaturas',
            '7 · Cineteatro',
            '8 · Biblioteca',
            '9 · Jardins (Som e Luz)',
            '10 · Loja do Museu',
            '11 · Guarda-volumes',
            '12 · Sanitários',
            '13 · Palácio Imperial'
          ].map((txt, idx) => {
            const isStar = idx === 3 || idx === 12;
            return `<text x="12" y="${44 + idx * 21}" fill="${isStar ? '#7dd3fc' : '#cbd5e1'}" font-size="8.8" font-weight="${isStar ? '700' : '500'}">${txt}</text>`;
          }).join('')}
        </g>

        <text x="490" y="422" text-anchor="middle" fill="#94a3b8" font-size="10">
          Rua da Imperatriz — Centro Histórico de Petrópolis/RJ (Conjunto Tombado IPHAN · Decreto-Lei nº 25/1937)
        </text>
      </svg>
    `;
  }

  window.MuseuSim.FloorPlans = {
    renderPlantaPalacioSVG,
    renderPlantaReservaSVG,
    renderMapaComplexoSVG
  };
})();
