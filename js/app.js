/**
 * SISMIP — Controlador Principal da Aplicação Web Interativa
 * Simulador Digital & Supervisório IoT — Museu Imperial de Petrópolis (UFCI/RJ, 2026)
 */
window.MuseuSim = window.MuseuSim || {};

(function () {
  const CFG = window.MuseuSim.CONFIG;
  const fmt = window.MuseuSim.fmt;
  const dec = (v) => String(v).replace('.', ',');
  const Engine = window.MuseuSim.Engine;
  const FloorPlans = window.MuseuSim.FloorPlans;
  const Charts = window.MuseuSim.Charts;

  const state = {
    abaAtiva: 'supervisorio',       // 'supervisorio' | 'mpc' | 'lorawan' | 'solar'
    plantaAtiva: 'palacio',         // 'palacio' | 'reserva' | 'complexo'
    modoCorPlanta: 'ibram',         // 'ibram' | 'heatmap'
    temaClaro: false,               // Modo Projetor (claro) vs Modo Supervisório (escuro)
    rodando: true,
    intervaloMs: 1600,              // velocidade da simulação
    timerHandle: null,

    minDiaAtual: 5 * 60,            // começa pré-aquecimento às 05:00 e abre ao vivo às 17:10
    passoGlobal: 0,
    cenarioId: 'normal',
    repetidorAtivo: true,
    zonaSelecionada: 'P-01',

    climaAtual: null,
    previsao6Passos: [],
    zonas: {},
    historicoGlobal: [],            // série consolidada de energia/clima
    logsTelemetria: [],             // tabela de leituras para exportação CSV
    alertas: [],                    // feed estilo Telegram / E-mail

    solarParams: {
      numModulos: 24,
      sombreamentoPct: 28,
      tecnologia: 'microinversor'
    },
    solarCalc: null,

    metricasAcumuladas: {
      kwhMpc: 0,
      kwhConv: 0,
      custoMpcRs: 0,
      custoConvRs: 0,
      amostrasTotais: 0,
      amostrasNaFaixaMpc: 0,
      amostrasNaFaixaConv: 0,
      picoDemandaMpcKw: 0,
      picoDemandaConvKw: 0
    }
  };

  function criarEstadoInicialZonas() {
    state.zonas = {};
    CFG.zonas.forEach((z) => {
      state.zonas[z.id] = {
        id: z.id,
        perfilId: z.perfilPadrao,
        modoControle: 'mpc',        // 'mpc' | 'seguro' | 'manual'
        comandoManualOn: false,
        loraOnline: true,
        bateriaPct: z.bateriaInicial,
        rssiDbm: z.atenuacaoBaseDbm,

        // Estado real controlado pelo SISMIP (MPC / Manual / Seguro)
        ur: z.urInicial,
        temp: z.tempInicial,
        pontoOrvalho: Engine.calcPontoOrvalhoMagnus(z.tempInicial, z.urInicial),
        tempParede: z.tempInicial - 1.2,
        riscoCondensacao: false,
        urVitrine: z.urVitrineSilica || 50.0,
        desumLigado: false,
        passosNoMesmoEstado: 3,

        // Estado gêmeo do Higrostato Convencional (mesmas perturbações para ensaio comparativo)
        urConv: z.urInicial + 0.8,
        tempConv: z.tempInicial,
        desumLigadoConv: false,

        // Métricas por zona
        kwhZonaMpc: 0,
        kwhZonaConv: 0,
        custoZonaMpc: 0,
        custoZonaConv: 0,
        passosTotais: 0,
        passosFaixaMpc: 0,
        passosFaixaConv: 0,
        ciclosMpc: 0,
        ciclosConv: 0,

        ultimoMpc: null,
        historico: []
      };
    });
  }

  function registrarAlerta(nivel, canal, zonaCodigo, titulo, mensagem, silencioso) {
    if (silencioso) return;
    const hora = Engine.formatHoraMin(state.minDiaAtual);
    // Evita duplicar o mesmo alerta consecutivo para a mesma zona
    const recente = state.alertas[0];
    if (recente && recente.zonaCodigo === zonaCodigo && recente.titulo === titulo) {
      return;
    }
    state.alertas.unshift({
      id: Date.now() + Math.random(),
      hora,
      nivel, // 'critico' | 'aviso' | 'info' | 'ok'
      canal, // 'Telegram' | 'E-mail' | 'Sistema'
      zonaCodigo,
      titulo,
      mensagem
    });
    if (state.alertas.length > 35) {
      state.alertas.pop();
    }
  }

  function montarPrevisao6Passos(minBase) {
    const lista = [];
    for (let k = 1; k <= 6; k++) {
      lista.push(Engine.getClimaExterno(minBase + k * 10, state.cenarioId));
    }
    return lista;
  }

  /**
   * Avança 1 intervalo de 10 minutos em todas as zonas (MPC vs. Convencional)
   */
  function executarPassoSimulacao(silencioso) {
    state.minDiaAtual = (state.minDiaAtual + 10) % 1440;
    state.passoGlobal += 1;

    const clima = Engine.getClimaExterno(state.minDiaAtual, state.cenarioId);
    state.climaAtual = clima;
    state.previsao6Passos = montarPrevisao6Passos(state.minDiaAtual);
    state.solarCalc = Engine.calcularEstudoSolar(state.solarParams, clima.irradiancia);

    let potInstantaneaMpcKw = 0;
    let potInstantaneaConvKw = 0;

    CFG.zonas.forEach((zCfg) => {
      const zSt = state.zonas[zCfg.id];
      const perfil = CFG.perfisConservacao[zSt.perfilId];

      // Atualiza RSSI considerando Repetidor REP-01 nas alas do Palácio
      const ganhoRep = state.repetidorAtivo && (zCfg.id === 'P-01' || zCfg.id === 'P-02') ? 13 : 0;
      const jitterRssi = Math.round((Math.sin(state.passoGlobal * 0.7 + zCfg.volumeM3) * 1.5));
      zSt.rssiDbm = zSt.loraOnline ? zCfg.atenuacaoBaseDbm + ganhoRep + jitterRssi : -120;

      // Descarga lentíssima de bateria SHT40
      if (state.passoGlobal % 18 === 0 && zSt.bateriaPct > 5) {
        zSt.bateriaPct = Number((zSt.bateriaPct - 0.1).toFixed(1));
      }

      // 1. Calcula decisão ótima das 64 combinações do MPC
      const mpcRes = Engine.avaliarMPC64(
        zSt,
        zCfg,
        perfil,
        state.previsao6Passos,
        potInstantaneaMpcKw
      );
      zSt.ultimoMpc = mpcRes;

      // Define comando real conforme modo (MPC, Seguro por queda de sinal, ou Manual)
      let novoCmdMpc = false;
      let modoEfetivo = zSt.modoControle;
      if (!zSt.loraOnline) {
        modoEfetivo = 'seguro';
        novoCmdMpc = Engine.avaliarModoSeguroLocal(zSt.ur, zSt.desumLigado, perfil);
      } else if (zSt.modoControle === 'manual') {
        novoCmdMpc = zSt.comandoManualOn;
      } else if (zSt.modoControle === 'seguro') {
        novoCmdMpc = Engine.avaliarModoSeguroLocal(zSt.ur, zSt.desumLigado, perfil);
      } else {
        novoCmdMpc = mpcRes.comandoEscolhido;
      }

      if (novoCmdMpc !== zSt.desumLigado) {
        zSt.passosNoMesmoEstado = 1;
        if (novoCmdMpc) zSt.ciclosMpc += 1;
      } else {
        zSt.passosNoMesmoEstado += 1;
      }
      zSt.desumLigado = novoCmdMpc;

      // 2. Comando do Higrostato Convencional paralelo (para comparação justa sob mesmo clima)
      const novoCmdConv = Engine.avaliarHigrostatoConvencional(zSt.urConv, zSt.desumLigadoConv, perfil);
      if (novoCmdConv && !zSt.desumLigadoConv) zSt.ciclosConv += 1;
      zSt.desumLigadoConv = novoCmdConv;

      // 3. Evolução física do ambiente (10 min)
      const proxReal = Engine.stepDinamicaZona(zSt.ur, zSt.temp, zSt.desumLigado, zCfg, clima, true);
      const proxConv = Engine.stepDinamicaZona(zSt.urConv, zSt.tempConv, zSt.desumLigadoConv, zCfg, clima, false);

      zSt.ur = proxReal.ur;
      zSt.temp = proxReal.temp;
      zSt.urConv = proxConv.ur;
      zSt.tempConv = proxConv.temp;

      // Microclima passivo das vitrines/armários com sílica gel condicionada (~50% quase imune a picos!)
      if (zCfg.temVitrineSilica) {
        zSt.urVitrine = Number((zSt.urVitrine + 0.03 * (zSt.ur - zSt.urVitrine) + 0.08 * (50.0 - zSt.urVitrine)).toFixed(2));
      }

      // Ponto de orvalho de Magnus e verificação de superfície fria
      zSt.pontoOrvalho = Engine.calcPontoOrvalhoMagnus(zSt.temp, zSt.ur);
      zSt.tempParede = Engine.calcTempSuperficieFria(
        zSt.temp,
        clima.tempExt,
        zCfg.id === 'RT-02' || zCfg.id === 'P-03'
      );
      zSt.riscoCondensacao = zSt.tempParede - zSt.pontoOrvalho < 2.0;

      // 4. Contabilização elétrica (SCT-013)
      // Na climatização convencional sem compartimentação (Seções 1.1 e 3.2), trata-se maior volume de ar com menor eficiência
      const potConvKw = zCfg.potenciaKw * (zCfg.temVitrineSilica ? 1.06 : 1.02);
      const kwhPassoMpc = zSt.desumLigado ? zCfg.potenciaKw * (10 / 60) : 0;
      const kwhPassoConv = zSt.desumLigadoConv ? potConvKw * (10 / 60) : 0;

      if (zSt.desumLigado) potInstantaneaMpcKw += zCfg.potenciaKw;
      if (zSt.desumLigadoConv) potInstantaneaConvKw += potConvKw;

      zSt.kwhZonaMpc += kwhPassoMpc;
      zSt.kwhZonaConv += kwhPassoConv;
      zSt.custoZonaMpc += kwhPassoMpc * clima.tarifaAtual;
      zSt.custoZonaConv += kwhPassoConv * clima.tarifaAtual;

      state.metricasAcumuladas.kwhMpc += kwhPassoMpc;
      state.metricasAcumuladas.kwhConv += kwhPassoConv;
      state.metricasAcumuladas.custoMpcRs += kwhPassoMpc * clima.tarifaAtual;
      state.metricasAcumuladas.custoConvRs += kwhPassoConv * clima.tarifaAtual;

      const dentroMpc = zSt.ur >= perfil.urMin && zSt.ur <= perfil.urMax;
      const dentroConv = zSt.urConv >= perfil.urMin && zSt.urConv <= perfil.urMax;

      zSt.passosTotais += 1;
      if (dentroMpc) zSt.passosFaixaMpc += 1;
      if (dentroConv) zSt.passosFaixaConv += 1;

      state.metricasAcumuladas.amostrasTotais += 1;
      if (dentroMpc) state.metricasAcumuladas.amostrasNaFaixaMpc += 1;
      if (dentroConv) state.metricasAcumuladas.amostrasNaFaixaConv += 1;

      // Histórico da zona
      zSt.historico.push({
        horaStr: clima.horaStr,
        minDia: state.minDiaAtual,
        emPonta: clima.emPonta,
        urMpc: zSt.ur,
        urConv: zSt.urConv,
        temp: zSt.temp,
        pontoOrvalho: zSt.pontoOrvalho,
        desumMpc: zSt.desumLigado ? 1 : 0,
        desumConv: zSt.desumLigadoConv ? 1 : 0
      });
      if (zSt.historico.length > 144) zSt.historico.shift();

      // Registro para tabela LoRaWAN / CSV
      state.logsTelemetria.unshift({
        timestamp: clima.horaStr,
        zona: zCfg.codigo,
        sensor: zCfg.sensorId,
        tempC: zSt.temp.toFixed(1),
        urPct: zSt.ur.toFixed(1),
        orvalhoC: zSt.pontoOrvalho.toFixed(1),
        modo: modoEfetivo.toUpperCase(),
        seqMpc: mpcRes.melhor.binario,
        desumidificador: zSt.desumLigado ? 'ON' : 'OFF',
        potenciaKw: zSt.desumLigado ? zCfg.potenciaKw.toFixed(2) : '0.00',
        rssiDbm: zSt.loraOnline ? zSt.rssiDbm : 'SEM SINAL',
        bateriaPct: zSt.bateriaPct.toFixed(0)
      });

      // Alertas inteligentes (Telegram / E-mail)
      if (zSt.riscoCondensacao) {
        registrarAlerta(
          'critico',
          'Telegram',
          zCfg.codigo,
          'Risco de Condensação Superficial (Magnus)',
          `Ponto de orvalho (${zSt.pontoOrvalho}°C) próximo à parede fria (${zSt.tempParede}°C). Desumidificação preventiva acionada.`,
          silencioso
        );
      } else if (zSt.ur > perfil.urCritMax) {
        registrarAlerta(
          'critico',
          'Telegram',
          zCfg.codigo,
          `Umidade Acima do Limite (${fmt(zSt.ur, 1)}% UR)`,
          `Limite crítico de ${perfil.urCritMax}% ultrapassado em ${zCfg.nome}. Verificar vedação de esquadrias.`,
          silencioso
        );
      } else if (zSt.bateriaPct < 20) {
        registrarAlerta(
          'aviso',
          'E-mail',
          zCfg.codigo,
          `Bateria Baixa no Sensor ${zCfg.sensorId}`,
          `Carga em ${fmt(zSt.bateriaPct, 0)}%. Substituir por unidade reserva na rotina de manutenção.`,
          silencioso
        );
      }
    });

    if (state.logsTelemetria.length > 180) {
      state.logsTelemetria.length = 180;
    }

    state.metricasAcumuladas.picoDemandaMpcKw = Math.max(
      state.metricasAcumuladas.picoDemandaMpcKw,
      potInstantaneaMpcKw
    );
    state.metricasAcumuladas.picoDemandaConvKw = Math.max(
      state.metricasAcumuladas.picoDemandaConvKw,
      potInstantaneaConvKw
    );

    // Alerta informativo quando o MPC antecipa o Horário de Ponta às 17:20
    if (state.minDiaAtual === 17 * 60 + 20 && !silencioso) {
      registrarAlerta(
        'info',
        'Telegram',
        'MPC-GERAL',
        'Pré-Desumidificação Antes da Ponta Enel (18h–21h)',
        'Horizonte de 60 min detectou tarifa de ponta + subida de umidade noturna. Estabilizando zonas próximo a 49% UR fora da ponta.',
        false
      );
    }

    state.historicoGlobal.push({
      horaStr: clima.horaStr,
      emPonta: clima.emPonta,
      potMpcKw: Number(potInstantaneaMpcKw.toFixed(2)),
      potConvKw: Number(potInstantaneaConvKw.toFixed(2)),
      kwhAcumMpc: Number(state.metricasAcumuladas.kwhMpc.toFixed(3)),
      kwhAcumConv: Number(state.metricasAcumuladas.kwhConv.toFixed(3))
    });
    if (state.historicoGlobal.length > 144) state.historicoGlobal.shift();
  }

  /**
   * Pré-aquece 12 horas (72 intervalos de 10 min: 05:00 -> 17:10)
   */
  function inicializarSimulacaoCompleta() {
    state.minDiaAtual = 5 * 60;
    state.passoGlobal = 0;
    state.historicoGlobal = [];
    state.logsTelemetria = [];
    state.alertas = [];
    state.metricasAcumuladas = {
      kwhMpc: 0,
      kwhConv: 0,
      custoMpcRs: 0,
      custoConvRs: 0,
      amostrasTotais: 0,
      amostrasNaFaixaMpc: 0,
      amostrasNaFaixaConv: 0,
      picoDemandaMpcKw: 0,
      picoDemandaConvKw: 0
    };

    criarEstadoInicialZonas();

    // Simula 73 passos silenciosos (05:10 até 17:10)
    for (let i = 0; i < 73; i++) {
      executarPassoSimulacao(true);
    }

    // Popula alertas iniciais realistas para demonstração imediata
    registrarAlerta(
      'ok',
      'Sistema',
      'SISMIP',
      'Rede LoRaWAN 915 MHz & MPC Inicializados',
      '6 zonas sincronizadas (Palácio Ed. 13 + Reserva Técnica Ed. 4). Economia acumulada dentro da meta de 25%–35%.',
      false
    );
    registrarAlerta(
      'info',
      'Telegram',
      'P-03',
      'Antecipação Preditiva de Umidade Serrana',
      'MPC simulou as 64 combinações (60 min) e pré-condicionou a Circulação Central antes do Horário de Ponta Enel (18h).',
      false
    );
    registrarAlerta(
      'info',
      'E-mail',
      'RT-01',
      'Relatório Diário — Setor de Museologia',
      'Sala Piloto da Reserva Técnica mantida entre 48% e 54% UR com variação diária < 4,2% (Diretriz ICOM-CC/IIC atendida).',
      false
    );
  }

  function calcularResumoEconomia() {
    const m = state.metricasAcumuladas;
    const econKwhPct = m.kwhConv > 0 ? ((m.kwhConv - m.kwhMpc) / m.kwhConv) * 100 : 0;
    const econRsPct = m.custoConvRs > 0 ? ((m.custoConvRs - m.custoMpcRs) / m.custoConvRs) * 100 : 0;
    const taxaFaixaMpc = m.amostrasTotais > 0 ? (m.amostrasNaFaixaMpc / m.amostrasTotais) * 100 : 100;
    const taxaFaixaConv = m.amostrasTotais > 0 ? (m.amostrasNaFaixaConv / m.amostrasTotais) * 100 : 100;

    // Extrapolação mensal proporcional (mês = 4320 intervalos de 10 min)
    const passosRodados = Math.max(1, state.historicoGlobal.length);
    const fatorMes = 4320 / passosRodados;
    const econMensalKwh = Math.max(0, (m.kwhConv - m.kwhMpc) * fatorMes);
    const econMensalRs = Math.max(0, (m.custoConvRs - m.custoMpcRs) * fatorMes);
    const co2EvitadoAnualKg = econMensalKwh * 12 * CFG.energia.fatorEmissaoCO2;

    return {
      econKwhPct: Number(econKwhPct.toFixed(1)),
      econRsPct: Number(econRsPct.toFixed(1)),
      taxaFaixaMpc: Number(taxaFaixaMpc.toFixed(1)),
      taxaFaixaConv: Number(taxaFaixaConv.toFixed(1)),
      econMensalKwh: Math.round(econMensalKwh),
      econMensalRs: Number(econMensalRs.toFixed(2)),
      econAnualRs: Number((econMensalRs * 12).toFixed(2)),
      co2EvitadoAnualKg: Number(co2EvitadoAnualKg.toFixed(1))
    };
  }

  // ==================== RENDERIZAÇÃO DA INTERFACE ====================

  function renderHeader() {
    const c = state.climaAtual;
    const cenario = CFG.cenarios[state.cenarioId];

    document.getElementById('clock-display').textContent = c.horaStr;
    const tariffEl = document.getElementById('tariff-badge');
    if (c.emPonta) {
      tariffEl.textContent = `Horário de ponta · R$ ${fmt(c.tarifaAtual, 2)}/kWh`;
      tariffEl.className = 'status-pill pill-danger';
    } else {
      tariffEl.textContent = `Fora da ponta · R$ ${fmt(c.tarifaAtual, 2)}/kWh`;
      tariffEl.className = 'status-pill pill-ok';
    }

    document.getElementById('weather-pill').innerHTML =
      `<span class="wx-lbl">Lá fora</span> <strong>${fmt(c.tempExt, 1)} °C</strong> · <strong>${fmt(c.urExt, 0)}% UR</strong> · ${c.visitantes} visitantes`;

    const btnPlay = document.getElementById('btn-play-pause');
    btnPlay.innerHTML = state.rodando ? 'Pausar' : 'Continuar';
    btnPlay.classList.toggle('btn-active', state.rodando);

    // Botões de cenário ativos
    document.querySelectorAll('[data-scenario]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.scenario === state.cenarioId);
    });
  }

  function renderKPIs() {
    const res = calcularResumoEconomia();
    const ult = state.historicoGlobal[state.historicoGlobal.length - 1] || { potMpcKw: 0, potConvKw: 0 };
    const zonasRisco = Object.values(state.zonas).filter((z) => z.riscoCondensacao).length;
    const zonasOffline = Object.values(state.zonas).filter((z) => !z.loraOnline).length;

    document.getElementById('kpi-economia-pct').textContent = `-${fmt(res.econKwhPct, 1)}%`;
    document.getElementById('kpi-economia-sub').textContent =
      `${fmt(state.metricasAcumuladas.kwhMpc, 1)} kWh contra ${fmt(state.metricasAcumuladas.kwhConv, 1)} kWh · meta 25% a 35%`;

    document.getElementById('kpi-estabilidade').textContent = `${fmt(res.taxaFaixaMpc, 1)}%`;
    document.getElementById('kpi-estabilidade-sub').textContent =
      `Higrostato convencional: ${fmt(res.taxaFaixaConv, 1)}%`;

    document.getElementById('kpi-demanda').textContent = `${fmt(ult.potMpcKw, 2)} kW`;
    document.getElementById('kpi-demanda-sub').textContent =
      `Pico: ${fmt(state.metricasAcumuladas.picoDemandaMpcKw, 2)} kW (convencional ${fmt(state.metricasAcumuladas.picoDemandaConvKw, 2)} kW)`;

    const kpiSeg = document.getElementById('kpi-seguranca');
    const kpiSegSub = document.getElementById('kpi-seguranca-sub');
    if (zonasRisco > 0) {
      kpiSeg.textContent = `${zonasRisco} em risco de orvalho`;
      kpiSeg.style.color = '#ef4444';
    } else if (zonasOffline > 0) {
      kpiSeg.textContent = `${zonasOffline} em modo seguro`;
      kpiSeg.style.color = '#f59e0b';
    } else {
      kpiSeg.textContent = 'Tudo seguro';
      kpiSeg.style.color = '';
    }
    kpiSegSub.textContent = `6 sensores online · sem risco de condensação`;
  }

  function renderPlantaPrincipal() {
    const container = document.getElementById('floorplan-stage');
    if (!container) return;

    if (state.plantaAtiva === 'palacio') {
      container.innerHTML = FloorPlans.renderPlantaPalacioSVG(state);
    } else if (state.plantaAtiva === 'reserva') {
      container.innerHTML = FloorPlans.renderPlantaReservaSVG(state);
    } else {
      container.innerHTML = FloorPlans.renderMapaComplexoSVG(state);
    }

    // Atualiza abas da planta
    document.querySelectorAll('[data-floor-view]').forEach((b) => {
      b.classList.toggle('active', b.dataset.floorView === state.plantaAtiva);
    });
    document.querySelectorAll('[data-color-mode]').forEach((b) => {
      b.classList.toggle('active', b.dataset.colorMode === state.modoCorPlanta);
    });
    const btnRep = document.getElementById('btn-toggle-repeater');
    if (btnRep) {
      btnRep.textContent = state.repetidorAtivo ? 'Repetidor: ligado' : 'Repetidor: desligado';
      btnRep.classList.toggle('active', state.repetidorAtivo);
    }

    // Bind de cliques nos sensores/salas dentro do SVG
    container.querySelectorAll('[data-zone-id]').forEach((el) => {
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        selecionarZona(el.dataset.zoneId);
      });
    });

    container.querySelectorAll('[data-goto-view]').forEach((el) => {
      el.addEventListener('click', () => {
        state.plantaAtiva = el.dataset.gotoView;
        state.zonaSelecionada = state.plantaAtiva === 'reserva' ? 'RT-01' : 'P-01';
        renderTudo();
      });
    });

    const svgRep = container.querySelector('#svg-toggle-repeater');
    if (svgRep) {
      svgRep.addEventListener('click', () => {
        state.repetidorAtivo = !state.repetidorAtivo;
        registrarAlerta(
          'info',
          'Sistema',
          'REP-01',
          state.repetidorAtivo ? 'Repetidor LoRaWAN Ativado' : 'Repetidor LoRaWAN Desativado',
          state.repetidorAtivo
            ? 'Ganho de +13 dBm aplicado às alas P-01 e P-02, compensando paredes espessas do Palácio.'
            : 'Comunicação direta ao Gateway GW-01 com maior atenuação nas extremidades.',
          false
        );
        renderTudo();
      });
    }

    const svgSolarBtn = container.querySelector('#svg-open-solar-tab');
    if (svgSolarBtn) {
      svgSolarBtn.addEventListener('click', () => {
        mudarAba('solar');
      });
    }
  }

  function renderStripZonas() {
    const grid = document.getElementById('zones-mini-strip');
    if (!grid) return;

    grid.innerHTML = CFG.zonas
      .map((zCfg) => {
        const zSt = state.zonas[zCfg.id];
        const perfil = CFG.perfisConservacao[zSt.perfilId];
        const isSel = state.zonaSelecionada === zCfg.id;
        const ok = zSt.ur >= perfil.urMin && zSt.ur <= perfil.urMax && zSt.loraOnline;
        const statusCls = !zSt.loraOnline
          ? 'warn'
          : zSt.ur > perfil.urCritMax || zSt.ur < perfil.urCritMin
          ? 'crit'
          : ok
          ? 'ok'
          : 'warn';

        return `
          <button type="button" class="zone-mini-card ${isSel ? 'selected' : ''} status-${statusCls}" data-select-zone="${zCfg.id}">
            <div class="zmc-top">
              <span class="zmc-code">${zCfg.codigo}</span>
              <span class="zmc-dh ${zSt.desumLigado ? 'on' : 'off'}">${zSt.desumLigado ? 'Ligado' : 'Desligado'}</span>
            </div>
            <div class="zmc-ur">${fmt(zSt.ur, 1)}% <small>UR</small></div>
            <div class="zmc-meta">${fmt(zSt.temp, 1)}°C · orvalho ${fmt(zSt.pontoOrvalho, 1)}°C</div>
            <div class="zmc-foot">Faixa ${perfil.urMin}–${perfil.urMax}% · ${zSt.loraOnline ? zSt.rssiDbm + ' dBm' : 'sem sinal'}</div>
          </button>
        `;
      })
      .join('');

    grid.querySelectorAll('[data-select-zone]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.selectZone;
        const zCfg = CFG.zonas.find((z) => z.id === id);
        if (zCfg && state.plantaAtiva !== 'complexo') {
          state.plantaAtiva = zCfg.edificio;
        }
        selecionarZona(id);
      });
    });
  }

  function renderInspetorZona() {
    const zCfg = CFG.zonas.find((z) => z.id === state.zonaSelecionada) || CFG.zonas[0];
    const zSt = state.zonas[zCfg.id];
    const perfil = CFG.perfisConservacao[zSt.perfilId];
    const mpc = zSt.ultimoMpc;

    document.getElementById('insp-codigo').textContent = zCfg.codigo;
    document.getElementById('insp-nome').textContent = zCfg.nome;
    document.getElementById('insp-edificio').textContent = zCfg.edificioNome;
    document.getElementById('insp-acervo').textContent = zCfg.acervo;

    document.getElementById('insp-ur').textContent = `${fmt(zSt.ur, 1)}%`;
    document.getElementById('insp-ur-conv').textContent = `Convencional: ${fmt(zSt.urConv, 1)}%`;
    document.getElementById('insp-temp').textContent = `${fmt(zSt.temp, 1)} °C`;
    document.getElementById('insp-orvalho').textContent = `${fmt(zSt.pontoOrvalho, 1)} °C`;
    document.getElementById('insp-parede').textContent =
      `Parede fria: ${fmt(zSt.tempParede, 1)}°C (Δ ${fmt((zSt.tempParede - zSt.pontoOrvalho), 1)}°C)`;

    document.getElementById('insp-potencia').textContent =
      zSt.desumLigado ? `${fmt(zCfg.potenciaKw, 2)} kW · ligado` : `0,00 kW · repouso`;
    document.getElementById('insp-potencia').className =
      `insp-val ${zSt.desumLigado ? 'text-cyan' : 'text-muted'}`;

    document.getElementById('insp-lora').textContent =
      zSt.loraOnline ? `${zSt.rssiDbm} dBm · Bat ${fmt(zSt.bateriaPct, 0)}%` : 'Sem sinal · modo seguro';
    document.getElementById('insp-lora').className =
      `insp-val ${zSt.loraOnline ? 'text-emerald' : 'text-amber'}`;

    // Sequência binária ótima das 64 combinações
    if (mpc && mpc.melhor) {
      const chips = mpc.melhor.seq
        .map(
          (bit, idx) =>
            `<span class="seq-bit ${bit ? 'on' : 'off'} ${idx === 0 ? 'exec-now' : ''}" title="+${(idx + 1) * 10} min">${bit ? 'ON' : 'OFF'}</span>`
        )
        .join('');
      document.getElementById('insp-mpc-seq').innerHTML = chips;
    }

    // Seletor de perfil
    const selPerfil = document.getElementById('select-zone-profile');
    if (selPerfil.value !== zSt.perfilId) {
      selPerfil.value = zSt.perfilId;
    }

    // Botões de modo de controle
    document.querySelectorAll('[data-ctrl-mode]').forEach((b) => {
      b.classList.toggle('active', b.dataset.ctrlMode === zSt.modoControle);
    });

    const manualBox = document.getElementById('manual-override-box');
    manualBox.style.display = zSt.modoControle === 'manual' ? 'flex' : 'none';
    const btnManualToggle = document.getElementById('btn-manual-actuator');
    btnManualToggle.textContent = zSt.comandoManualOn
      ? 'Desumidificador ligado (clique para desligar)'
      : 'Desumidificador desligado (clique para ligar)';
    btnManualToggle.className = `btn-full ${zSt.comandoManualOn ? 'btn-cyan' : 'btn-outline'}`;

    // Botão de simular perda de sinal LoRaWAN na zona
    const btnSignal = document.getElementById('btn-toggle-lora-zone');
    btnSignal.textContent = zSt.loraOnline
      ? 'Simular queda do sinal LoRa nesta zona'
      : 'Restaurar o sinal LoRa desta zona';
    btnSignal.className = `btn-full ${zSt.loraOnline ? 'btn-warn-outline' : 'btn-emerald'}`;
  }

  function renderAlertasFeed() {
    const list = document.getElementById('alerts-feed-list');
    if (!list) return;

    list.innerHTML = state.alertas
      .slice(0, 12)
      .map((a) => {
        const badgeCanal = a.canal === 'Telegram' ? 'Telegram' : a.canal === 'E-mail' ? 'E-mail' : 'Sistema';
        return `
          <div class="alert-item alert-${a.nivel}">
            <div class="alert-head">
              <span class="alert-channel">${badgeCanal} · <strong>${a.zonaCodigo}</strong></span>
              <span class="alert-time">${a.hora}</span>
            </div>
            <div class="alert-title">${a.titulo}</div>
            <div class="alert-msg">${a.mensagem}</div>
          </div>
        `;
      })
      .join('');
  }

  function renderAbaMPC() {
    const zCfg = CFG.zonas.find((z) => z.id === state.zonaSelecionada) || CFG.zonas[0];
    const zSt = state.zonas[zCfg.id];
    const perfil = CFG.perfisConservacao[zSt.perfilId];

    // Atualiza diagrama de fluxo ao vivo (Figura 2 do relatório)
    document.getElementById('flow-sensor-val').textContent =
      `${zCfg.codigo}: ${fmt(zSt.ur, 1)}% UR · ${fmt(zSt.temp, 1)}°C`;
    document.getElementById('flow-gw-val').textContent =
      zSt.loraOnline ? `915 MHz (${zSt.rssiDbm} dBm)` : 'Sem sinal · modo seguro';
    document.getElementById('flow-mpc-val').textContent =
      zSt.ultimoMpc ? `Escolhida: ${zSt.ultimoMpc.melhor.binario}` : 'Calculando...';
    document.getElementById('flow-act-val').textContent =
      zSt.desumLigado ? `Ligado (${fmt(zCfg.potenciaKw, 2)} kW)` : 'Em repouso';

    // Ranking das 6 melhores sequências dentre as 64 testadas
    const tbodySeq = document.getElementById('mpc-ranking-tbody');
    if (tbodySeq && zSt.ultimoMpc) {
      tbodySeq.innerHTML = zSt.ultimoMpc.topSequencias
        .map((item, idx) => {
          const urFinal = item.trajetoriaUr[item.trajetoriaUr.length - 1];
          return `
            <tr class="${idx === 0 ? 'row-winner' : ''}">
              <td>${idx === 0 ? '1º (escolhida)' : (idx + 1) + 'º'}</td>
              <td><code>${item.binario}</code></td>
              <td><strong>${item.seq[0] ? 'Ligar' : 'Manter desligado'}</strong></td>
              <td>${fmt(urFinal, 1)}%</td>
              <td>${item.passosNaFaixa}/6 passos</td>
              <td>${fmt(item.kwhSeq, 2)} kWh</td>
              <td>${fmt(item.custoTotal, 1)}</td>
            </tr>
          `;
        })
        .join('');
    }

    // Tabela comparativa consolidada por zona
    const tbodyComp = document.getElementById('comp-zones-tbody');
    if (tbodyComp) {
      tbodyComp.innerHTML = CFG.zonas
        .map((zc) => {
          const zs = state.zonas[zc.id];
          const pf = CFG.perfisConservacao[zs.perfilId];
          const econZ = zs.kwhZonaConv > 0 ? ((zs.kwhZonaConv - zs.kwhZonaMpc) / zs.kwhZonaConv) * 100 : 0;
          const fMpc = zs.passosTotais > 0 ? fmt(((zs.passosFaixaMpc / zs.passosTotais) * 100), 1) : '100,0';
          const fConv = zs.passosTotais > 0 ? fmt(((zs.passosFaixaConv / zs.passosTotais) * 100), 1) : '100,0';
          return `
            <tr>
              <td><strong>${zc.codigo}</strong> <span class="vs">${zc.nome}</span></td>
              <td>${pf.urMin}%–${pf.urMax}%</td>
              <td>${fmt(zs.kwhZonaMpc, 2)} kWh</td>
              <td>${fmt(zs.kwhZonaConv, 2)} kWh</td>
              <td class="text-emerald"><strong>-${fmt(econZ, 1)}%</strong></td>
              <td>${fMpc}% <span class="vs">contra ${fConv}%</span></td>
              <td>R$ ${fmt(zs.custoZonaMpc, 2)} <span class="vs">contra R$ ${fmt(zs.custoZonaConv, 2)}</span></td>
            </tr>
          `;
        })
        .join('');
    }

    document.getElementById('mpc-selected-zone-label').textContent = zCfg.codigo;
    Charts.drawMPC64FanCanvas(
      document.getElementById('canvas-mpc-fan-large'),
      zSt.ultimoMpc,
      perfil,
      state.minDiaAtual,
      state.temaClaro
    );
    Charts.drawEnergiaAcumuladaCanvas(
      document.getElementById('canvas-energia-acum'),
      state.historicoGlobal,
      state.temaClaro
    );
  }

  function renderAbaLoRaWAN() {
    // Atualiza preview JSON de Uplink
    atualizarPreviewPayloadAPI();

    // Tabela de histórico recente
    const tbody = document.getElementById('telemetry-log-tbody');
    if (tbody) {
      tbody.innerHTML = state.logsTelemetria
        .slice(0, 24)
        .map(
          (r) => `
          <tr>
            <td><code>${r.timestamp}</code></td>
            <td><strong>${r.zona}</strong></td>
            <td><code>${r.sensor}</code></td>
            <td>${dec(r.tempC)} °C</td>
            <td><strong>${dec(r.urPct)}%</strong></td>
            <td>${dec(r.orvalhoC)} °C</td>
            <td>${r.modo}</td>
            <td><code>${r.seqMpc}</code></td>
            <td><span class="badge-mini ${r.desumidificador === 'ON' ? 'on' : 'off'}">${r.desumidificador} (${dec(r.potenciaKw)} kW)</span></td>
            <td>${r.rssiDbm}</td>
            <td>${r.bateriaPct}%</td>
          </tr>
        `
        )
        .join('');
    }
  }

  function renderAbaSolar() {
    const s = state.solarCalc;
    const econ = calcularResumoEconomia();

    document.getElementById('solar-kwp-val').innerHTML = `${fmt(s.potenciaPicoKwp, 1)} kWp<span class="insp-hint">instalação de R$ ${fmt(s.potenciaPicoKwp * 3.8, 0)} mil a R$ ${fmt(s.potenciaPicoKwp * 5.5, 0)} mil (R$ 3.800 a 5.500/kWp)</span>`;
    document.getElementById('solar-mensal-val').textContent = `${fmt(s.geracaoMensalKwh, 0)} kWh/mês`;
    document.getElementById('solar-economia-val').textContent = `R$ ${s.economiaSolarAnualRs.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/ano`;
    document.getElementById('solar-ganho-micro').textContent =
      `+${fmt(s.ganhoMicroVsStringPct, 1)}% com ${s.sombraPct}% de sombra`;

    // Contabilização separada (Seção 3.2 item 5 e Seção 4.3)
    document.getElementById('sep-mpc-anual').innerHTML =
      `R$ ${econ.econAnualRs.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/ano<span class="insp-hint">${fmt(econ.econMensalKwh * 12, 0)} kWh/ano poupados</span>`;
    document.getElementById('sep-solar-anual').innerHTML =
      `R$ ${s.economiaSolarAnualRs.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/ano<span class="insp-hint">${fmt(s.geracaoAnualKwh, 0)} kWh/ano gerados</span>`;
    document.getElementById('sep-co2-anual').textContent =
      `${fmt((econ.co2EvitadoAnualKg + s.geracaoAnualKwh * CFG.energia.fatorEmissaoCO2), 0)} kg CO₂/ano`;

    // Cenários de retorno: Tabela 4 do relatório (12 desumidificadores, tarifa média de R$ 0,80/kWh,
    // custo recorrente de R$ 1.000/ano, compras ligadas à energia R$ 37.135 e horas das equipes R$ 26.800)
    const cenariosFin = [
      { nome: 'Conservador', hipotese: '0,75 kW · 40% do tempo · 25%', kwh: '7.900 kWh', rs: 'R$ 6.300', compras: '7,0 anos', horas: '12,0 anos' },
      { nome: 'Intermediário', hipotese: '1,0 kW · 50% do tempo · 30%', kwh: '15.800 kWh', rs: 'R$ 12.600', compras: '3,2 anos', horas: '5,5 anos' },
      { nome: 'Otimista', hipotese: '1,2 kW · 60% do tempo · 35%', kwh: '26.500 kWh', rs: 'R$ 21.200', compras: '1,8 ano', horas: '3,2 anos' }
    ];
    const tbodyPayback = document.getElementById('payback-scenarios-tbody');
    if (tbodyPayback && !tbodyPayback.dataset.rendered) {
      tbodyPayback.innerHTML = cenariosFin
        .map(
          (c) => `
            <tr>
              <td><strong>${c.nome}</strong></td>
              <td>${c.hipotese}</td>
              <td>${c.rs}<span class="vs">${c.kwh}</span></td>
              <td><strong>${c.compras}</strong></td>
              <td>${c.horas}</td>
            </tr>
          `
        )
        .join('');
      tbodyPayback.dataset.rendered = '1';
    }

    // Tabela oficial das Notas de Empenho do Portal da Transparência (Página 7 do PDF)
    const tbodyEmp = document.getElementById('empenhos-tbody');
    if (tbodyEmp && !tbodyEmp.dataset.rendered) {
      tbodyEmp.innerHTML = CFG.energia.notasEmpenho
        .map(
          (ne) => `
          <tr>
            <td><code>${ne.codigo}</code></td>
            <td>${ne.exercicio}</td>
            <td>${ne.finalidade}</td>
            <td>${ne.liquidacoes}</td>
            <td><strong>R$ ${ne.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></td>
          </tr>
        `
        )
        .join('');
      tbodyEmp.dataset.rendered = '1';
    }

    Charts.drawSolarComparativoCanvas(
      document.getElementById('canvas-solar-comp'),
      s,
      econ.econMensalKwh,
      state.temaClaro
    );
  }

  function renderGraficosSupervisorio() {
    const zCfg = CFG.zonas.find((z) => z.id === state.zonaSelecionada) || CFG.zonas[0];
    const zSt = state.zonas[zCfg.id];
    const perfil = CFG.perfisConservacao[zSt.perfilId];

    document.getElementById('chart-ur-zone-title').textContent =
      `Umidade relativa · ${zCfg.codigo} (faixa ${perfil.urMin}% a ${perfil.urMax}%)`;
    document.getElementById('chart-fan-zone-title').textContent =
      `Próximos 60 min · ${zCfg.codigo}`;

    Charts.drawComparativoUrCanvas(
      document.getElementById('canvas-ur-comparativo'),
      zSt.historico,
      perfil,
      state.temaClaro
    );
    Charts.drawMPC64FanCanvas(
      document.getElementById('canvas-mpc-fan-mini'),
      zSt.ultimoMpc,
      perfil,
      state.minDiaAtual,
      state.temaClaro
    );
  }

  function renderTudo() {
    renderHeader();
    renderKPIs();

    if (state.abaAtiva === 'supervisorio') {
      renderPlantaPrincipal();
      renderStripZonas();
      renderInspetorZona();
      renderAlertasFeed();
      renderGraficosSupervisorio();
    } else if (state.abaAtiva === 'mpc') {
      renderAbaMPC();
    } else if (state.abaAtiva === 'lorawan') {
      renderAbaLoRaWAN();
    } else if (state.abaAtiva === 'solar') {
      renderAbaSolar();
    }
  }

  // ==================== INTERAÇÕES E EVENTOS ====================

  function selecionarZona(zonaId) {
    if (!state.zonas[zonaId]) return;
    state.zonaSelecionada = zonaId;
    renderTudo();
  }

  function mudarAba(abaId) {
    state.abaAtiva = abaId;
    document.querySelectorAll('[data-tab-target]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tabTarget === abaId);
    });
    document.querySelectorAll('.tab-panel').forEach((sec) => {
      sec.classList.toggle('active', sec.id === `tab-${abaId}`);
    });
    // Aguarda layout do painel visível para dimensionar os canvas corretamente
    requestAnimationFrame(() => renderTudo());
  }

  function reiniciarTimer() {
    if (state.timerHandle) {
      clearInterval(state.timerHandle);
      state.timerHandle = null;
    }
    if (state.rodando) {
      state.timerHandle = setInterval(() => {
        executarPassoSimulacao(false);
        renderTudo();
      }, state.intervaloMs);
    }
  }

  function atualizarPreviewPayloadAPI() {
    const zId = document.getElementById('api-zone-select')?.value || 'P-01';
    const temp = parseFloat(document.getElementById('api-temp-input')?.value || '20.5');
    const ur = parseFloat(document.getElementById('api-ur-input')?.value || '56.8');
    const bat = parseFloat(document.getElementById('api-bat-input')?.value || '92');
    const zCfg = CFG.zonas.find((z) => z.id === zId) || CFG.zonas[0];
    const tdp = Engine.calcPontoOrvalhoMagnus(temp, ur);

    const payload = {
      endpoint: 'POST /api/v1/lorawan/uplink',
      network: 'LoRaWAN AU915 (915 MHz) · Criptografia AES-128',
      device_id: zCfg.sensorId,
      zone: zCfg.codigo,
      timestamp_local: Engine.formatHoraMin(state.minDiaAtual),
      telemetry: {
        sht40_temp_c: temp,
        sht40_rh_pct: ur,
        magnus_dew_point_c: tdp,
        battery_pct: bat,
        sct013_circuit: zCfg.ctId
      }
    };
    const pre = document.getElementById('api-json-preview');
    if (pre) {
      pre.textContent = JSON.stringify(payload, null, 2);
    }
  }

  function exportarHistoricoCSV() {
    const cabecalho = [
      'Horario',
      'Zona',
      'Sensor_LoRaWAN',
      'Temperatura_C',
      'Umidade_Relativa_Pct',
      'Ponto_Orvalho_Magnus_C',
      'Modo_Controle',
      'Sequencia_MPC_60min',
      'Desumidificador',
      'Potencia_kW',
      'RSSI_dBm',
      'Bateria_Pct'
    ];
    const linhas = state.logsTelemetria.map((r) =>
      [
        r.timestamp,
        r.zona,
        r.sensor,
        dec(r.tempC),
        dec(r.urPct),
        dec(r.orvalhoC),
        r.modo,
        `"${r.seqMpc}"`,
        r.desumidificador,
        dec(r.potenciaKw),
        r.rssiDbm,
        r.bateriaPct
      ].join(';')
    );
    const csvContent = '\uFEFF' + [cabecalho.join(';'), ...linhas].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SISMIP_MuseuImperial_Historico_${state.climaAtual.horaStr.replace(':', 'h')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function configurarEventosDOM() {
    // Navegação de abas principais
    document.querySelectorAll('[data-tab-target]').forEach((btn) => {
      btn.addEventListener('click', () => mudarAba(btn.dataset.tabTarget));
    });

    // Controles de reprodução do simulador
    document.getElementById('btn-play-pause').addEventListener('click', () => {
      state.rodando = !state.rodando;
      reiniciarTimer();
      renderHeader();
    });

    document.getElementById('btn-step-10m').addEventListener('click', () => {
      executarPassoSimulacao(false);
      renderTudo();
    });

    document.getElementById('select-sim-speed').addEventListener('change', (ev) => {
      state.intervaloMs = Number(ev.target.value);
      reiniciarTimer();
    });

    document.getElementById('btn-reset-sim').addEventListener('click', () => {
      state.cenarioId = 'normal';
      inicializarSimulacaoCompleta();
      renderTudo();
    });

    // Modo Claro (Projetor) / Modo Escuro (Supervisório)
    document.getElementById('btn-theme-toggle').addEventListener('click', () => {
      state.temaClaro = !state.temaClaro;
      try { localStorage.setItem("sismip-tema", state.temaClaro ? "claro" : "escuro"); } catch (e) {}
      document.body.classList.toggle('theme-light', state.temaClaro);
      document.getElementById('btn-theme-toggle').textContent = state.temaClaro
        ? 'Modo escuro'
        : 'Modo projetor';
      renderTudo();
    });

    // Modal "Sobre o Projeto Acadêmico (UFCI/RJ)"
    const modal = document.getElementById('project-modal');
    document.getElementById('btn-open-about').addEventListener('click', () => {
      modal.classList.add('open');
    });
    document.getElementById('btn-close-about').addEventListener('click', () => {
      modal.classList.remove('open');
    });
    modal.addEventListener('click', (ev) => {
      if (ev.target === modal) modal.classList.remove('open');
    });

    // Cenários climáticos e eventos rápidos
    document.querySelectorAll('[data-scenario]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const scId = btn.dataset.scenario;
        state.cenarioId = scId;
        const sc = CFG.cenarios[scId];
        registrarAlerta(
          scId === 'normal' ? 'ok' : 'info',
          'Telegram',
          'CLIMA-EXT',
          `Cenário Ativado: ${sc.nome}`,
          sc.descricao,
          false
        );
        executarPassoSimulacao(false);
        renderTudo();
      });
    });

    // Botão rápido: saltar para 17:20 (Pré-Ponta Enel)
    document.getElementById('btn-jump-preponta').addEventListener('click', () => {
      state.minDiaAtual = 17 * 60 + 10;
      executarPassoSimulacao(false);
      renderTudo();
    });

    // Troca de planta arquitetônica
    document.querySelectorAll('[data-floor-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.plantaAtiva = btn.dataset.floorView;
        if (state.plantaAtiva === 'palacio' && state.zonaSelecionada.startsWith('RT')) {
          state.zonaSelecionada = 'P-01';
        } else if (state.plantaAtiva === 'reserva' && state.zonaSelecionada.startsWith('P-')) {
          state.zonaSelecionada = 'RT-01';
        }
        renderTudo();
      });
    });

    // Modo de cor da planta (Setorização Ibram vs Mapa de Calor UR)
    document.querySelectorAll('[data-color-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.modoCorPlanta = btn.dataset.colorMode;
        renderTudo();
      });
    });

    // Botão do Repetidor REP-01
    document.getElementById('btn-toggle-repeater').addEventListener('click', () => {
      state.repetidorAtivo = !state.repetidorAtivo;
      renderTudo();
    });

    // Controles do Inspetor da Zona Selecionada
    document.getElementById('select-zone-profile').addEventListener('change', (ev) => {
      const zSt = state.zonas[state.zonaSelecionada];
      zSt.perfilId = ev.target.value;
      const pf = CFG.perfisConservacao[zSt.perfilId];
      registrarAlerta(
        'info',
        'Sistema',
        state.zonaSelecionada,
        `Faixa de Conservação Atualizada (${pf.urMin}%–${pf.urMax}% UR)`,
        `Museologia alterou diretriz da zona ${state.zonaSelecionada} para: ${pf.nome}.`,
        false
      );
      executarPassoSimulacao(true);
      renderTudo();
    });

    document.querySelectorAll('[data-ctrl-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const zSt = state.zonas[state.zonaSelecionada];
        zSt.modoControle = btn.dataset.ctrlMode;
        if (zSt.modoControle === 'manual') {
          zSt.comandoManualOn = zSt.desumLigado;
        }
        registrarAlerta(
          'info',
          'Sistema',
          state.zonaSelecionada,
          `Modo Alterado: ${zSt.modoControle.toUpperCase()}`,
          `Operação da zona ${state.zonaSelecionada} definida pela equipe técnica.`,
          false
        );
        renderTudo();
      });
    });

    document.getElementById('btn-manual-actuator').addEventListener('click', () => {
      const zSt = state.zonas[state.zonaSelecionada];
      zSt.modoControle = 'manual';
      zSt.comandoManualOn = !zSt.comandoManualOn;
      zSt.desumLigado = zSt.comandoManualOn;
      registrarAlerta(
        'aviso',
        'Telegram',
        state.zonaSelecionada,
        `Comando Manual: Desumidificador ${zSt.comandoManualOn ? 'LIGADO' : 'DESLIGADO'}`,
        `Acionamento direto executado pela equipe de Manutenção Predial na zona ${state.zonaSelecionada}.`,
        false
      );
      renderTudo();
    });

    document.getElementById('btn-toggle-lora-zone').addEventListener('click', () => {
      const zSt = state.zonas[state.zonaSelecionada];
      zSt.loraOnline = !zSt.loraOnline;
      if (!zSt.loraOnline) {
        registrarAlerta(
          'aviso',
          'Telegram',
          state.zonaSelecionada,
          'Perda de Sinal LoRaWAN — Modo Seguro Ativado',
          `Sem pacotes do sensor de ${state.zonaSelecionada}. Zona comutada automaticamente para o higrostato local de contingência (Seção 3.2).`,
          false
        );
      } else {
        registrarAlerta(
          'ok',
          'Telegram',
          state.zonaSelecionada,
          'Link LoRaWAN 915 MHz Restabelecido',
          `Sensor reconectado ao Gateway. Controle Preditivo MPC retomado automaticamente em ${state.zonaSelecionada}.`,
          false
        );
      }
      renderTudo();
    });

    // Botão de disparo de alerta teste no Telegram
    document.getElementById('btn-test-telegram').addEventListener('click', () => {
      const zSt = state.zonas[state.zonaSelecionada];
      registrarAlerta(
        'info',
        'Telegram',
        state.zonaSelecionada,
        'Teste de Notificação — @SISMIP_MuseuImperial_Bot',
        `Status ${state.zonaSelecionada}: ${fmt(zSt.ur, 1)}% UR | ${fmt(zSt.temp, 1)}°C | Orvalho ${fmt(zSt.pontoOrvalho, 1)}°C | Bateria ${fmt(zSt.bateriaPct, 0)}%.`,
        false
      );
      renderAlertasFeed();
    });

    // Formulário de Injeção de Leitura / Simulador API (Aba LoRaWAN)
    ['api-zone-select', 'api-temp-input', 'api-ur-input', 'api-bat-input'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', atualizarPreviewPayloadAPI);
    });

    document.getElementById('form-inject-reading').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const zId = document.getElementById('api-zone-select').value;
      const temp = parseFloat(document.getElementById('api-temp-input').value);
      const ur = parseFloat(document.getElementById('api-ur-input').value);
      const bat = parseFloat(document.getElementById('api-bat-input').value);

      const zCfg = CFG.zonas.find((z) => z.id === zId);
      const zSt = state.zonas[zId];
      if (!zSt || isNaN(temp) || isNaN(ur)) return;

      zSt.temp = Math.max(10, Math.min(38, temp));
      zSt.ur = Math.max(25, Math.min(95, ur));
      zSt.bateriaPct = Math.max(1, Math.min(100, bat));
      zSt.pontoOrvalho = Engine.calcPontoOrvalhoMagnus(zSt.temp, zSt.ur);
      zSt.ultimoMpc = Engine.avaliarMPC64(
        zSt,
        zCfg,
        CFG.perfisConservacao[zSt.perfilId],
        state.previsao6Passos,
        0
      );
      if (zSt.modoControle === 'mpc' && zSt.loraOnline) {
        zSt.desumLigado = zSt.ultimoMpc.comandoEscolhido;
      }

      state.logsTelemetria.unshift({
        timestamp: Engine.formatHoraMin(state.minDiaAtual) + '*',
        zona: zCfg.codigo,
        sensor: zCfg.sensorId + ' (API)',
        tempC: zSt.temp.toFixed(1),
        urPct: zSt.ur.toFixed(1),
        orvalhoC: zSt.pontoOrvalho.toFixed(1),
        modo: 'INJEÇÃO API',
        seqMpc: zSt.ultimoMpc.melhor.binario,
        desumidificador: zSt.desumLigado ? 'ON' : 'OFF',
        potenciaKw: zSt.desumLigado ? zCfg.potenciaKw.toFixed(2) : '0.00',
        rssiDbm: zSt.rssiDbm,
        bateriaPct: zSt.bateriaPct.toFixed(0)
      });

      registrarAlerta(
        'info',
        'Telegram',
        zCfg.codigo,
        `Pacote Injetado via API (${fmt(zSt.ur, 1)}% UR · ${fmt(zSt.temp, 1)}°C)`,
        `MPC recalculou as 64 combinações → Nova sequência ótima [${zSt.ultimoMpc.melhor.binario}] (Orvalho: ${zSt.pontoOrvalho}°C).`,
        false
      );

      state.zonaSelecionada = zId;
      const feedback = document.getElementById('api-submit-feedback');
      feedback.textContent = `Pacote recebido em ${zCfg.codigo}! Sequência MPC recalculada: [${zSt.ultimoMpc.melhor.binario}]`;
      setTimeout(() => {
        feedback.textContent = '';
      }, 4500);

      renderTudo();
    });

    document.getElementById('btn-export-csv').addEventListener('click', exportarHistoricoCSV);

    // Controles Solares (Aba Energia Solar & Impacto)
    const sliderMod = document.getElementById('slider-solar-modulos');
    const sliderSombra = document.getElementById('slider-solar-sombra');
    sliderMod.addEventListener('input', (ev) => {
      state.solarParams.numModulos = Number(ev.target.value);
      document.getElementById('lbl-solar-modulos').textContent = `${state.solarParams.numModulos} módulos`;
      state.solarCalc = Engine.calcularEstudoSolar(state.solarParams, state.climaAtual.irradiancia);
      renderAbaSolar();
    });
    sliderSombra.addEventListener('input', (ev) => {
      state.solarParams.sombreamentoPct = Number(ev.target.value);
      document.getElementById('lbl-solar-sombra').textContent = `${state.solarParams.sombreamentoPct}%`;
      state.solarCalc = Engine.calcularEstudoSolar(state.solarParams, state.climaAtual.irradiancia);
      renderAbaSolar();
    });
    document.querySelectorAll('[data-solar-tech]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.solarParams.tecnologia = btn.dataset.solarTech;
        document.querySelectorAll('[data-solar-tech]').forEach((b) =>
          b.classList.toggle('active', b.dataset.solarTech === state.solarParams.tecnologia)
        );
        state.solarCalc = Engine.calcularEstudoSolar(state.solarParams, state.climaAtual.irradiancia);
        renderAbaSolar();
      });
    });

    // Redimensionamento responsivo dos gráficos Canvas
    window.addEventListener('resize', () => {
      renderTudo();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    inicializarSimulacaoCompleta();
    configurarEventosDOM();
    // Endereço opcional: #mpc, #lorawan, #solar (e #mpc-claro para abrir no modo projetor)
    const partesHash = (location.hash || '').replace('#', '').split('-');
    const abaInicial = partesHash[0];
    let temaSalvo = null;
    try { temaSalvo = localStorage.getItem('sismip-tema'); } catch (e) {}
    if (partesHash.includes('claro') || temaSalvo === 'claro') {
      document.getElementById('btn-theme-toggle').click();
    }
    if (['supervisorio', 'mpc', 'lorawan', 'solar'].includes(abaInicial)) {
      mudarAba(abaInicial);
    }
    configurarLigacaoSlides();
    renderTudo();
    reiniciarTimer();
  });

  // Ligação com os slides (slides.html): dentro dos slides o simulador abre numa camada
  // e o botão só fecha essa camada; aberto sozinho, o botão volta ao último slide visto.
  function configurarLigacaoSlides() {
    const btn = document.getElementById('btn-go-slides');
    if (!btn) return;
    const embutido = window.parent !== window;
    let slideSalvo = null;
    try { slideSalvo = localStorage.getItem('sismip-slide'); } catch (e) {}
    if (embutido || slideSalvo) {
      btn.textContent = 'Voltar aos slides';
    }
    if (embutido) {
      // Esc dentro do simulador também volta aos slides (menos com a janela "Sobre" aberta)
      document.addEventListener('keydown', (ev) => {
        const modal = document.getElementById('project-modal');
        if (ev.key === 'Escape' && !(modal && modal.classList.contains('open'))) {
          window.parent.postMessage({ tipo: 'sismip-voltar-slides' }, '*');
        }
      });
    }
    btn.addEventListener('click', (ev) => {
      if (embutido) {
        ev.preventDefault();
        window.parent.postMessage({ tipo: 'sismip-voltar-slides' }, '*');
        return;
      }
      if (slideSalvo) {
        btn.href = `slides.html#slide-${slideSalvo}`;
      }
    });
  }
})();
