/**
 * SISMIP — Gráficos Vetoriais/Canvas HiDPI em Tempo Real
 * 1. Curva Comparativa de Umidade Relativa: MPC Preditivo vs. Higrostato Convencional
 * 2. Leque Preditivo das 64 Combinações do MPC (Horizonte de 60 min / 6 x 10 min)
 * 3. Curva Acumulada de Consumo Elétrico (kWh) e Horário de Ponta Enel
 * 4. Comparativo Solar (Microinversor vs String + Contabilização Separada)
 */
window.MuseuSim = window.MuseuSim || {};

(function () {
  const fmt = window.MuseuSim.fmt;

  function prepCanvas(canvas, fallbackHeight) {
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(280, rect.width || canvas.parentElement?.clientWidth || 520);
    const h = Math.max(170, rect.height || fallbackHeight || 220);
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }

  function palette(isLight) {
    return isLight
      ? {
          bg: '#ffffff',
          grid: '#e7e2d6',
          text: '#34453d',
          muted: '#576860',
          mpc: '#1e4d3b',
          conv: '#ea580c',
          bandFill: 'rgba(16, 185, 129, 0.13)',
          bandBorder: 'rgba(5, 150, 105, 0.50)',
          pontaFill: 'rgba(239, 68, 68, 0.09)',
          fanBad: 'rgba(239, 68, 68, 0.16)',
          fanOk: 'rgba(14, 165, 233, 0.22)',
          best: '#b87d1e'
        }
      : {
          bg: 'transparent',
          grid: 'rgba(165, 190, 178, 0.14)',
          text: '#e6ece8',
          muted: '#8ca197',
          mpc: '#52b788',
          conv: '#fb923c',
          bandFill: 'rgba(82, 183, 136, 0.13)',
          bandBorder: 'rgba(82, 183, 136, 0.50)',
          pontaFill: 'rgba(239, 68, 68, 0.12)',
          fanBad: 'rgba(248, 113, 113, 0.16)',
          fanOk: 'rgba(56, 189, 248, 0.22)',
          best: '#e0a84b'
        };
  }

  // Legenda em linha: amostra colorida + texto neutro, posicionada pela largura real do texto
  function drawLegend(ctx, pal, items, x, y) {
    ctx.save();
    ctx.font = "600 11px 'Plus Jakarta Sans', 'Segoe UI', sans-serif";
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    let cx = x;
    items.forEach((it) => {
      ctx.strokeStyle = it.color;
      ctx.fillStyle = it.color;
      ctx.lineWidth = 2.4;
      if (it.kind === 'box') {
        ctx.globalAlpha = 0.55;
        ctx.fillRect(cx, y - 5, 14, 10);
        ctx.globalAlpha = 1;
      } else {
        ctx.setLineDash(it.kind === 'dash' ? [4, 3] : []);
        ctx.beginPath();
        ctx.moveTo(cx, y);
        ctx.lineTo(cx + 16, y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      cx += 22;
      ctx.fillStyle = pal.text;
      ctx.fillText(it.label, cx, y);
      cx += ctx.measureText(it.label).width + 18;
    });
    ctx.restore();
  }

  /**
   * 1. Gráfico Histórico Comparativo de UR (%): MPC vs. Higrostato Convencional
   */
  function drawComparativoUrCanvas(canvas, histZona, perfil, isLight) {
    const setup = prepCanvas(canvas, 225);
    if (!setup || !histZona || histZona.length < 2) return;
    const { ctx, w, h } = setup;
    const pal = palette(isLight);

    const pad = { top: 26, right: 18, bottom: 28, left: 42 };
    const pw = w - pad.left - pad.right;
    const ph = h - pad.top - pad.bottom;

    const dados = histZona.slice(-72); // últimas 12 horas (72 passos de 10 min)
    let minY = Math.min(perfil.urCritMin - 3, 40);
    let maxY = Math.max(perfil.urCritMax + 5, 62);
    dados.forEach((d) => {
      minY = Math.min(minY, d.urMpc - 2, d.urConv - 2);
      maxY = Math.max(maxY, d.urMpc + 2, d.urConv + 2);
    });

    const xOf = (i) => pad.left + (i / Math.max(1, dados.length - 1)) * pw;
    const yOf = (val) => pad.top + ph - ((val - minY) / (maxY - minY)) * ph;

    // Destaque vertical de Horário de Ponta Enel (18h-21h)
    ctx.fillStyle = pal.pontaFill;
    for (let i = 0; i < dados.length - 1; i++) {
      if (dados[i].emPonta) {
        const x1 = xOf(i);
        const x2 = xOf(i + 1);
        ctx.fillRect(x1, pad.top, x2 - x1 + 1, ph);
      }
    }

    // Faixa segura operacional [urMin, urMax]
    const yBandTop = yOf(perfil.urMax);
    const yBandBot = yOf(perfil.urMin);
    ctx.fillStyle = pal.bandFill;
    ctx.fillRect(pad.left, yBandTop, pw, yBandBot - yBandTop);

    ctx.strokeStyle = pal.bandBorder;
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(pad.left, yBandTop);
    ctx.lineTo(pad.left + pw, yBandTop);
    ctx.moveTo(pad.left, yBandBot);
    ctx.lineTo(pad.left + pw, yBandBot);
    ctx.stroke();
    ctx.setLineDash([]);

    // Grade horizontal
    ctx.font = "10px 'JetBrains Mono', Consolas, monospace";
    ctx.fillStyle = pal.muted;
    ctx.textAlign = 'right';
    const stepsY = 4;
    for (let s = 0; s <= stepsY; s++) {
      const val = minY + ((maxY - minY) * s) / stepsY;
      const yy = yOf(val);
      ctx.strokeStyle = pal.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.left, yy);
      ctx.lineTo(pad.left + pw, yy);
      ctx.stroke();
      ctx.fillText(`${fmt(val, 0)}%`, pad.left - 6, yy + 3);
    }

    // Eixo X (horários)
    ctx.textAlign = 'center';
    const stride = Math.max(1, Math.floor(dados.length / 6));
    for (let i = 0; i < dados.length; i += stride) {
      ctx.fillText(dados[i].horaStr, xOf(i), h - 8);
    }

    // Linha Convencional (tracejada laranja)
    ctx.strokeStyle = pal.conv;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    dados.forEach((d, i) => {
      const xx = xOf(i);
      const yy = yOf(d.urConv);
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    // Linha MPC Proposto (sólida verde-esmeralda)
    ctx.strokeStyle = pal.mpc;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    dados.forEach((d, i) => {
      const xx = xOf(i);
      const yy = yOf(d.urMpc);
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    });
    ctx.stroke();

    // Legenda compacta no topo
    drawLegend(ctx, pal, [
      { label: 'Controle preditivo', color: pal.mpc },
      { label: 'Higrostato', color: pal.conv, kind: 'dash' },
      { label: 'Ponta 18h–21h', color: '#f87171', kind: 'box' }
    ], pad.left, 11);
  }

  /**
   * 2. Leque das 64 Combinações do MPC nos próximos 60 minutos (6 x 10 min)
   */
  function drawMPC64FanCanvas(canvas, mpcRes, perfil, horaAtualMin, isLight) {
    const setup = prepCanvas(canvas, 235);
    if (!setup || !mpcRes || !mpcRes.todas64) return;
    const { ctx, w, h } = setup;
    const pal = palette(isLight);

    const pad = { top: 28, right: 20, bottom: 30, left: 44 };
    const pw = w - pad.left - pad.right;
    const ph = h - pad.top - pad.bottom;

    let minY = perfil.urMin - 3.5;
    let maxY = perfil.urMax + 4.5;
    mpcRes.todas64.forEach((item) => {
      item.trajetoriaUr.forEach((v) => {
        if (v - 1 < minY) minY = v - 1;
        if (v + 1 > maxY) maxY = v + 1;
      });
    });

    const xOf = (stepIdx) => pad.left + (stepIdx / 6) * pw;
    const yOf = (val) => pad.top + ph - ((val - minY) / (maxY - minY)) * ph;

    // Faixa alvo [urMin, urMax]
    const yTop = yOf(perfil.urMax);
    const yBot = yOf(perfil.urMin);
    ctx.fillStyle = pal.bandFill;
    ctx.fillRect(pad.left, yTop, pw, yBot - yTop);
    ctx.strokeStyle = pal.bandBorder;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.left, yTop);
    ctx.lineTo(pad.left + pw, yTop);
    ctx.moveTo(pad.left, yBot);
    ctx.lineTo(pad.left + pw, yBot);
    ctx.stroke();
    ctx.setLineDash([]);

    // Grade Y
    ctx.font = "10px 'JetBrains Mono', Consolas, monospace";
    ctx.fillStyle = pal.muted;
    ctx.textAlign = 'right';
    for (let s = 0; s <= 4; s++) {
      const v = minY + ((maxY - minY) * s) / 4;
      const yy = yOf(v);
      ctx.strokeStyle = pal.grid;
      ctx.beginPath();
      ctx.moveTo(pad.left, yy);
      ctx.lineTo(pad.left + pw, yy);
      ctx.stroke();
      ctx.fillText(`${fmt(v, 1)}%`, pad.left - 6, yy + 3);
    }

    // Rótulos X (+0 min até +60 min)
    ctx.textAlign = 'center';
    for (let k = 0; k <= 6; k++) {
      const xx = xOf(k);
      ctx.fillText(k === 0 ? 'Agora' : `+${k * 10}m`, xx, h - 9);
    }

    // Desenha todas as 64 trajetórias candidatas!
    mpcRes.todas64.forEach((item) => {
      if (item.mask === mpcRes.melhor.mask) return;
      ctx.strokeStyle = item.viavel ? pal.fanOk : pal.fanBad;
      ctx.lineWidth = 1.05;
      ctx.beginPath();
      item.trajetoriaUr.forEach((v, idx) => {
        const xx = xOf(idx);
        const yy = yOf(v);
        if (idx === 0) ctx.moveTo(xx, yy);
        else ctx.lineTo(xx, yy);
      });
      ctx.stroke();
    });

    // Destaca a trajetória ótima escolhida pelo MPC
    const best = mpcRes.melhor;
    ctx.strokeStyle = pal.best;
    ctx.lineWidth = 3.0;
    ctx.beginPath();
    best.trajetoriaUr.forEach((v, idx) => {
      const xx = xOf(idx);
      const yy = yOf(v);
      if (idx === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    });
    ctx.stroke();

    // Pontos de decisão ON/OFF ao longo dos 6 intervalos
    best.trajetoriaUr.forEach((v, idx) => {
      const xx = xOf(idx);
      const yy = yOf(v);
      const cmdLigado = idx > 0 ? best.seq[idx - 1] === 1 : false;
      ctx.beginPath();
      ctx.arc(xx, yy, idx === 1 ? 5.2 : 3.8, 0, Math.PI * 2);
      ctx.fillStyle = idx === 0 ? '#ffffff' : cmdLigado ? '#38bdf8' : '#1e293b';
      ctx.fill();
      ctx.strokeStyle = pal.best;
      ctx.lineWidth = 1.8;
      ctx.stroke();
    });

    // Cabeçalho explicativo
    drawLegend(ctx, pal, [
      { label: `Escolhida ${best.binario}`, color: pal.best },
      { label: 'Ficam na faixa', color: '#38bdf8' },
      { label: 'Saem da faixa', color: '#f87171' }
    ], pad.left, 11);
  }

  /**
   * 3. Curva Acumulada de Energia (kWh): Economia de 25%–35% do MPC vs. Convencional
   */
  function drawEnergiaAcumuladaCanvas(canvas, histGlobal, isLight) {
    const setup = prepCanvas(canvas, 225);
    if (!setup || !histGlobal || histGlobal.length < 2) return;
    const { ctx, w, h } = setup;
    const pal = palette(isLight);

    const pad = { top: 28, right: 18, bottom: 28, left: 48 };
    const pw = w - pad.left - pad.right;
    const ph = h - pad.top - pad.bottom;

    const baseMpc = histGlobal[0].kwhAcumMpc;
    const baseConv = histGlobal[0].kwhAcumConv;
    const serie = histGlobal.map((d) => ({
      horaStr: d.horaStr,
      mpc: Math.max(0, d.kwhAcumMpc - baseMpc),
      conv: Math.max(0, d.kwhAcumConv - baseConv),
      emPonta: d.emPonta
    }));

    const maxKwh = Math.max(2, serie[serie.length - 1].conv * 1.12);
    const xOf = (i) => pad.left + (i / Math.max(1, serie.length - 1)) * pw;
    const yOf = (val) => pad.top + ph - (val / maxKwh) * ph;

    // Grade
    ctx.font = "10px 'JetBrains Mono', Consolas, monospace";
    ctx.fillStyle = pal.muted;
    ctx.textAlign = 'right';
    for (let s = 0; s <= 4; s++) {
      const val = (maxKwh * s) / 4;
      const yy = yOf(val);
      ctx.strokeStyle = pal.grid;
      ctx.beginPath();
      ctx.moveTo(pad.left, yy);
      ctx.lineTo(pad.left + pw, yy);
      ctx.stroke();
      ctx.fillText(`${fmt(val, 1)}`, pad.left - 6, yy + 3);
    }

    // Área sombreada da economia obtida entre as duas curvas
    ctx.beginPath();
    serie.forEach((d, i) => {
      const xx = xOf(i);
      const yy = yOf(d.conv);
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    });
    for (let i = serie.length - 1; i >= 0; i--) {
      ctx.lineTo(xOf(i), yOf(serie[i].mpc));
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(16, 185, 129, 0.16)';
    ctx.fill();

    // Curva Convencional
    ctx.strokeStyle = pal.conv;
    ctx.lineWidth = 2.2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    serie.forEach((d, i) => {
      if (i === 0) ctx.moveTo(xOf(i), yOf(d.conv));
      else ctx.lineTo(xOf(i), yOf(d.conv));
    });
    ctx.stroke();
    ctx.setLineDash([]);

    // Curva MPC
    ctx.strokeStyle = pal.mpc;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    serie.forEach((d, i) => {
      if (i === 0) ctx.moveTo(xOf(i), yOf(d.mpc));
      else ctx.lineTo(xOf(i), yOf(d.mpc));
    });
    ctx.stroke();

    // Eixo X
    ctx.textAlign = 'center';
    ctx.fillStyle = pal.muted;
    const stride = Math.max(1, Math.floor(serie.length / 6));
    for (let i = 0; i < serie.length; i += stride) {
      ctx.fillText(serie[i].horaStr, xOf(i), h - 8);
    }

    drawLegend(ctx, pal, [
      { label: 'Controle preditivo', color: pal.mpc },
      { label: 'Higrostato', color: pal.conv, kind: 'dash' },
      { label: 'Energia poupada', color: pal.mpc, kind: 'box' }
    ], pad.left, 11);
  }

  /**
   * 4. Gráfico de Barras: Microinversor vs String & Contabilização Separada (Seções 3.2 e 4.3)
   */
  function drawSolarComparativoCanvas(canvas, solarCalc, economiaMpcMensalKwh, isLight) {
    const setup = prepCanvas(canvas, 220);
    if (!setup || !solarCalc) return;
    const { ctx, w, h } = setup;
    const pal = palette(isLight);

    const pad = { top: 30, right: 24, bottom: 38, left: 54 };
    const pw = w - pad.left - pad.right;
    const ph = h - pad.top - pad.bottom;

    const barras = [
      {
        label: 'Economia do controle',
        sub: 'desumidificação',
        val: Math.round(economiaMpcMensalKwh),
        cor: '#52b788'
      },
      {
        label: 'Solar com microinversor',
        sub: 'sombra contornada',
        val: solarCalc.geracaoMensalMicroKwh,
        cor: '#0ea5e9'
      },
      {
        label: 'Solar com inversor string',
        sub: 'perde com a sombra',
        val: solarCalc.geracaoMensalStringKwh,
        cor: '#64748b'
      }
    ];

    const maxVal = Math.max(500, ...barras.map((b) => b.val)) * 1.18;
    const yOf = (v) => pad.top + ph - (v / maxVal) * ph;

    ctx.font = "10px 'JetBrains Mono', Consolas, monospace";
    ctx.fillStyle = pal.muted;
    ctx.textAlign = 'right';
    for (let s = 0; s <= 4; s++) {
      const v = (maxVal * s) / 4;
      const yy = yOf(v);
      ctx.strokeStyle = pal.grid;
      ctx.beginPath();
      ctx.moveTo(pad.left, yy);
      ctx.lineTo(pad.left + pw, yy);
      ctx.stroke();
      ctx.fillText(fmt(v, 0), pad.left - 6, yy + 3);
    }

    const colW = pw / barras.length;
    const barW = Math.min(78, colW * 0.52);

    barras.forEach((b, idx) => {
      const cx = pad.left + colW * idx + colW / 2;
      const topY = yOf(b.val);
      const bh = pad.top + ph - topY;

      ctx.fillStyle = b.cor;
      ctx.beginPath();
      ctx.roundRect(cx - barW / 2, topY, barW, bh, [6, 6, 0, 0]);
      ctx.fill();

      ctx.fillStyle = pal.text;
      ctx.font = "700 11.5px 'Plus Jakarta Sans', 'Segoe UI', sans-serif";
      ctx.textAlign = 'center';
      ctx.fillText(`${fmt(b.val, 0)} kWh/mês`, cx, topY - 7);

      ctx.font = "700 11.5px 'Plus Jakarta Sans', 'Segoe UI', sans-serif";
      ctx.fillText(b.label, cx, h - 20);
      ctx.fillStyle = pal.muted;
      ctx.font = "10.5px 'Plus Jakarta Sans', 'Segoe UI', sans-serif";
      ctx.fillText(b.sub, cx, h - 7);
    });
  }

  window.MuseuSim.Charts = {
    drawComparativoUrCanvas,
    drawMPC64FanCanvas,
    drawEnergiaAcumuladaCanvas,
    drawSolarComparativoCanvas
  };
})();
