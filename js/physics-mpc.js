/**
 * SISMIP — Motor Físico Higrotérmico, Ponto de Orvalho de Magnus,
 * Controlador Preditivo Baseado em Modelo (MPC - 64 combinações) e Gêmeo Comparativo
 */
window.MuseuSim = window.MuseuSim || {};

(function () {
  const CFG = window.MuseuSim.CONFIG;

  /**
   * Fórmula de Magnus aprimorada (Alduchov & Eskridge, 1996) — citada na Seção 2.4 do relatório
   * T em °C, UR em % (1..100) -> retorna Ponto de Orvalho em °C
   */
  function calcPontoOrvalhoMagnus(tempC, urPct) {
    const a = 17.625;
    const b = 243.04;
    const urClamped = Math.max(1, Math.min(100, urPct));
    const gamma = (a * tempC) / (b + tempC) + Math.log(urClamped / 100.0);
    const tdp = (b * gamma) / (a - gamma);
    return Number(tdp.toFixed(2));
  }

  /**
   * Estima temperatura interna superficial de paredes históricas espessas / vidros
   */
  function calcTempSuperficieFria(tempInterna, tempExterna, isPerimetro) {
    const pesoExterno = isPerimetro ? 0.42 : 0.26;
    const tSup = tempInterna * (1 - pesoExterno) + tempExterna * pesoExterno;
    return Number(tSup.toFixed(2));
  }

  /**
   * Verifica se o minuto do dia (0..1439) cai no Horário de Ponta Enel (18:00 - 21:00)
   */
  function isHorarioPonta(minDia) {
    const m = ((minDia % 1440) + 1440) % 1440;
    return m >= CFG.energia.inicioPontaMin && m < CFG.energia.fimPontaMin;
  }

  function formatHoraMin(minDia) {
    const m = ((Math.round(minDia) % 1440) + 1440) % 1440;
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  /**
   * Clima externo de Petrópolis (~800m altitude) + curva de visitação do Museu Imperial
   */
  function getClimaExterno(minDia, cenarioId, extraPerturb) {
    const m = ((minDia % 1440) + 1440) % 1440;
    const hora = m / 60.0;
    const cenario = CFG.cenarios[cenarioId] || CFG.cenarios.normal;
    const perturb = extraPerturb || { urBoost: 0, tempBoost: 0, visitBoost: 0 };

    // Temperatura serrana: mínima ~05:30 (15.2°C), máxima ~14:30 (22.8°C)
    const ondaTemp = -Math.cos(((hora - 2.5) / 24) * 2 * Math.PI);
    let tempExt = 18.8 + 3.7 * ondaTemp + cenario.offsetTempExt + (perturb.tempBoost || 0);

    // Umidade relativa serrana: alta à noite/madrugada (~88%) e sobe forte ao entardecer (17:30+)
    const ondaUrBase = Math.cos(((hora - 2.5) / 24) * 2 * Math.PI);
    const pulsoNevoeiroNoturno = Math.exp(-Math.pow((hora - 19.5) / 3.2, 2)) * 8.5;
    let urExt = 78.5 + 10.5 * ondaUrBase + pulsoNevoeiroNoturno + cenario.offsetUrExt + (perturb.urBoost || 0);
    urExt = Math.max(48, Math.min(99, urExt));

    // Irradiação solar normalizada (0..1) entre 06:30 e 17:45
    let irradiancia = 0;
    if (hora >= 6.5 && hora <= 17.75) {
      irradiancia = Math.sin(((hora - 6.5) / 11.25) * Math.PI) * cenario.fatorSol;
      irradiancia = Math.max(0, Math.min(1, irradiancia));
    }

    // Fluxo de visitantes no Museu Imperial (funcionamento 10h às 17h30, ou evento Som e Luz à noite)
    let visitantes = 0;
    if (hora >= 10.0 && hora <= 17.5) {
      const curvaVis = Math.sin(((hora - 10.0) / 7.5) * Math.PI);
      visitantes = Math.round((35 + 95 * curvaVis) * cenario.multVisitantes);
    } else if (cenarioId === 'som_e_luz' && hora >= 18.5 && hora <= 21.5) {
      visitantes = 85;
    }
    visitantes = Math.max(0, visitantes + Math.round(perturb.visitBoost || 0));

    const pontoOrvalhoExt = calcPontoOrvalhoMagnus(tempExt, urExt);

    return {
      minDia: m,
      horaStr: formatHoraMin(m),
      tempExt: Number(tempExt.toFixed(1)),
      urExt: Number(urExt.toFixed(1)),
      pontoOrvalhoExt,
      irradiancia: Number(irradiancia.toFixed(3)),
      visitantes,
      emPonta: isHorarioPonta(m),
      tarifaAtual: isHorarioPonta(m) ? CFG.energia.tarifaPonta : CFG.energia.tarifaForaPonta,
      cargaBaseComplexoKw: Number((14.2 + (hora >= 9 && hora <= 18 ? 4.8 : 0) + cenario.cargaExtraComplexoKw).toFixed(2))
    };
  }

  /**
   * Evolução física de 1 intervalo de 10 minutos para uma zona
   * Inclui lei psicrométrica real: a eficiência de condensação do desumidificador aumenta em UR mais alta
   * e cai quando o ar já está seco (<47% UR), penalizando sobre-desumidificação desnecessária.
   */
  function stepDinamicaZona(urAtual, tempAtual, comandoLigado, zonaCfg, climaPasso, usaSilicaPassiva = true) {
    // Troca higrométrica proporcional ao gradiente de umidade (UR_ext - UR_int)
    const ganhoInfiltracao = zonaCfg.infiltracaoTaxa * (climaPasso.urExt - urAtual);
    const ganhoVisitantes = (climaPasso.visitantes / 100.0) * zonaCfg.fatorVisitantes * 0.35;

    // Amortecimento higroscópico passivo (sílica gel condicionada e compartimentação - Seção 3.2 item 4)
    const amortecimentoSilica = (usaSilicaPassiva && zonaCfg.temVitrineSilica)
      ? 0.045 * (50.5 - urAtual)
      : 0;

    // Rendimento psicrométrico da serpentina: ótimo ~52-55% UR, cai bastante abaixo de 46% UR
    const eficienciaSerpentina = Math.max(0.48, Math.min(1.22, (urAtual - 27.0) / 24.5));
    const retiradaDesum = comandoLigado ? zonaCfg.capacidadeDesum * eficienciaSerpentina : 0;

    let proxUr = urAtual + ganhoInfiltracao + ganhoVisitantes + amortecimentoSilica - retiradaDesum;
    proxUr = Math.max(32, Math.min(88, proxUr));

    // Dinâmica térmica suave
    const trocaTermica = (zonaCfg.infiltracaoTaxa * 0.75) * (climaPasso.tempExt - tempAtual);
    const calorVisitantes = (climaPasso.visitantes / 120.0) * zonaCfg.fatorVisitantes * 0.07;
    const calorEquip = comandoLigado ? 0.06 : -0.01;
    let proxTemp = tempAtual + trocaTermica + calorVisitantes + calorEquip;
    proxTemp = Math.max(14, Math.min(30, proxTemp));

    return {
      ur: Number(proxUr.toFixed(2)),
      temp: Number(proxTemp.toFixed(2))
    };
  }

  /**
   * CONTROLADOR PREDITIVO BASEADO EM MODELO (MPC) — Seção 3.2 item 3
   * Simula exaustivamente as 2^6 = 64 combinações de ligar/desligar nos próximos 6 intervalos de 10 min (60 min).
   * Escolhe a sequência que maximiza permanência na faixa segura com menor custo/consumo,
   * evitando horário de ponta Enel e respeitando tempo mínimo de compressor.
   */
  function avaliarMPC64(zonaState, zonaCfg, perfil, previsao6Passos, cargaOutrasZonasKw) {
    const N = 6; // 6 intervalos de 10 min = 60 min
    const totalCombinacoes = 64; // 2^6
    const urAlvoCentro = (perfil.urMin + perfil.urMax) / 2.0;
    const todas64 = [];

    let melhorItem = null;

    for (let mask = 0; mask < totalCombinacoes; mask++) {
      const seq = [];
      for (let k = 0; k < N; k++) {
        seq.push((mask >> (N - 1 - k)) & 1);
      }

      let urSim = zonaState.ur;
      let tempSim = zonaState.temp;
      let prevCmd = zonaState.desumLigado ? 1 : 0;

      const trajetoriaUr = [Number(urSim.toFixed(2))];
      let passosNaFaixa = 0;
      let violacaoAcumulada = 0;
      let custoEnergia = 0;
      let kwhSeq = 0;
      let trocasEstado = 0;
      let riscoCondensacao = 0;

      // Restrição de tempo mínimo de funcionamento/repouso (evita ciclagem curta no 1º passo)
      let penalidadeCicloCurto = 0;
      if (zonaState.passosNoMesmoEstado < 2 && seq[0] !== prevCmd) {
        // Permite quebrar repouso apenas se houver emergência higrométrica
        if (zonaState.ur <= perfil.urCritMax && zonaState.ur >= perfil.urCritMin) {
          penalidadeCicloCurto = 45.0;
        }
      }

      for (let k = 0; k < N; k++) {
        const cmd = seq[k];
        const climaPrev = previsao6Passos[k];
        const prox = stepDinamicaZona(urSim, tempSim, cmd === 1, zonaCfg, climaPrev);
        urSim = prox.ur;
        tempSim = prox.temp;
        trajetoriaUr.push(urSim);

        if (urSim >= perfil.urMin && urSim <= perfil.urMax) {
          passosNaFaixa++;
        } else if (urSim > perfil.urMax) {
          const excesso = urSim - perfil.urMax;
          violacaoAcumulada += excesso * excesso * 26.0;
          if (urSim > perfil.urCritMax) {
            violacaoAcumulada += (urSim - perfil.urCritMax) * 90.0;
          }
        } else if (urSim < perfil.urMin) {
          // Desumidificar além da conta desperdiça energia e resseca materiais higroscópicos
          const falta = perfil.urMin - urSim;
          violacaoAcumulada += falta * falta * 22.0;
        }

        // Verifica margem de ponto de orvalho de Magnus
        const tdp = calcPontoOrvalhoMagnus(tempSim, urSim);
        const tParede = calcTempSuperficieFria(tempSim, climaPrev.tempExt, zonaCfg.id === 'RT-02' || zonaCfg.id === 'P-03');
        if (tParede - tdp < 2.2) {
          riscoCondensacao += (2.2 - (tParede - tdp)) * 40.0;
        }

        // Energia e tarifa horária (forte preferência por fora de ponta e escalonamento de demanda)
        if (cmd === 1) {
          const kwhPasso = zonaCfg.potenciaKw * (10 / 60);
          kwhSeq += kwhPasso;
          const pesoPonta = climaPrev.emPonta ? 3.4 : 1.0;
          const pesoDemandaSimultanea = k === 0 && cargaOutrasZonasKw > 1.8 ? 1.45 : 1.0;
          custoEnergia += kwhPasso * pesoPonta * pesoDemandaSimultanea * 14.0;
        }

        if (cmd !== prevCmd) {
          trocasEstado++;
        }
        prevCmd = cmd;
      }

      // Estabilidade inteligente na metade superior segura (menor gradiente c/ ar externo = maior eficiência, ICOM-CC/IIC)
      const urAlvoEficiente = urAlvoCentro + 0.9;
      const desvioFinalCentro = Math.abs(urSim - urAlvoEficiente) * 1.15;
      const penalidadeChattering = trocasEstado * 2.4;

      const custoTotal =
        (N - passosNaFaixa) * 35.0 +
        violacaoAcumulada +
        riscoCondensacao +
        custoEnergia +
        desvioFinalCentro +
        penalidadeChattering +
        penalidadeCicloCurto;

      const item = {
        mask,
        binario: seq.join(''),
        seq,
        trajetoriaUr,
        passosNaFaixa,
        viavel: passosNaFaixa === N && riscoCondensacao === 0,
        kwhSeq: Number(kwhSeq.toFixed(3)),
        custoTotal: Number(custoTotal.toFixed(2))
      };

      todas64.push(item);

      if (!melhorItem || item.custoTotal < melhorItem.custoTotal) {
        melhorItem = item;
      }
    }

    // Ordena cópia para exibir ranking das melhores sequências na inspeção
    const topSequencias = todas64
      .slice()
      .sort((a, b) => a.custoTotal - b.custoTotal)
      .slice(0, 6);

    return {
      melhor: melhorItem,
      comandoEscolhido: melhorItem.seq[0] === 1,
      todas64,
      topSequencias
    };
  }

  /**
   * CONTROLADOR CONVENCIONAL REATIVO (Higrostato Simples / Comparativo de Referência)
   * Sem previsão meteorológica, sem leitura junto ao acervo (atraso espacial/histerese larga)
   * e sem gestão de horário de ponta ou demanda simultânea.
   */
  function avaliarHigrostatoConvencional(urConv, ligadoConv, perfil) {
    // Higrostato mecânico/simples reage tarde (após passar do limite superior) e permanece ligado
    // além do necessário (sobre-desumidificando o ar até ~43.5% UR, onde o COP cai e o gradiente externo sobe).
    const limiarLigar = perfil.urMax + 0.9;
    const limiarDesligar = perfil.urMin - 1.4;

    if (!ligadoConv && urConv >= limiarLigar) {
      return true;
    }
    if (ligadoConv && urConv <= limiarDesligar) {
      return false;
    }
    return ligadoConv;
  }

  /**
   * Higrostato Local de Contingência (Modo Seguro / Fail-Safe quando sensor LoRa perde sinal)
   * Mais conservador que o convencional antigo para proteger o acervo até restabelecer o link sem fio.
   */
  function avaliarModoSeguroLocal(urAtual, ligadoAtual, perfil) {
    if (!ligadoAtual && urAtual >= perfil.urMax - 0.3) return true;
    if (ligadoAtual && urAtual <= perfil.urMin + 0.5) return false;
    return ligadoAtual;
  }

  /**
   * Simulador de Geração Solar Fotovoltaica no Edifício nº 4 (Seção 3.2 item 5 & Seção 4.3)
   * Compara Microinversores (MLPE) vs Inversor String sob sombreamento parcial do arvoredo histórico.
   */
  function calcularEstudoSolar(params, irradianciaInstantanea) {
    const numModulos = params.numModulos || 24;
    const potModuloWp = 550; // Monocristalino 550 Wp
    const potenciaPicoKwp = (numModulos * potModuloWp) / 1000.0;
    const sombraPct = params.sombreamentoPct ?? 28; // % da área sombreada pelas árvores dos jardins
    const usaMicroinversor = params.tecnologia !== 'string';

    // Em inversor string centralizado, sombreamento parcial em ~25-35% das placas derruba a corrente
    // das strings afetadas desproporcionalmente. Com microinversores, a perda fica restrita aos módulos sombreados.
    const fatorPerdaSombraMicro = 1 - (sombraPct / 100) * 0.78;
    const fatorPerdaSombraString = 1 - Math.min(0.82, (sombraPct / 100) * 1.65);

    const eficienciaSistema = 0.82; // perdas térmicas e cabeamento CA
    const fatorSombraAtivo = usaMicroinversor ? fatorPerdaSombraMicro : fatorPerdaSombraString;

    const geracaoInstantaneaKw = potenciaPicoKwp * irradianciaInstantanea * eficienciaSistema * fatorSombraAtivo;

    // Produtividade média em Petrópolis (HSP médio serrano ~ 4.05 h/dia considerando nebulosidade)
    const hspPetropolis = 4.05;
    const geracaoMensalMicroKwh = potenciaPicoKwp * hspPetropolis * 30 * eficienciaSistema * fatorPerdaSombraMicro;
    const geracaoMensalStringKwh = potenciaPicoKwp * hspPetropolis * 30 * eficienciaSistema * fatorPerdaSombraString;

    const geracaoMensalAtivaKwh = usaMicroinversor ? geracaoMensalMicroKwh : geracaoMensalStringKwh;
    const ganhoMicroVsStringPct = geracaoMensalStringKwh > 0
      ? ((geracaoMensalMicroKwh - geracaoMensalStringKwh) / geracaoMensalStringKwh) * 100
      : 0;

    const tarifaMediaCompensacao = 0.74; // R$/kWh líquido Lei 14.300/2022
    const economiaSolarMensalRs = geracaoMensalAtivaKwh * tarifaMediaCompensacao;
    const economiaSolarAnualRs = economiaSolarMensalRs * 12;

    // Investimento estimado solar (R$ 4.350/kWp com microinversor vs R$ 3.650/kWp string + estudos IPHAN)
    const custoEstudoIphan = 6500;
    const capexSolarRs = potenciaPicoKwp * (usaMicroinversor ? 4350 : 3650) + custoEstudoIphan;
    const paybackSolarAnos = economiaSolarAnualRs > 0 ? capexSolarRs / economiaSolarAnualRs : 99;

    return {
      numModulos,
      potenciaPicoKwp: Number(potenciaPicoKwp.toFixed(2)),
      sombraPct,
      usaMicroinversor,
      geracaoInstantaneaKw: Number(geracaoInstantaneaKw.toFixed(2)),
      geracaoMensalKwh: Math.round(geracaoMensalAtivaKwh),
      geracaoAnualKwh: Math.round(geracaoMensalAtivaKwh * 12),
      geracaoMensalMicroKwh: Math.round(geracaoMensalMicroKwh),
      geracaoMensalStringKwh: Math.round(geracaoMensalStringKwh),
      ganhoMicroVsStringPct: Number(ganhoMicroVsStringPct.toFixed(1)),
      economiaSolarMensalRs: Number(economiaSolarMensalRs.toFixed(2)),
      economiaSolarAnualRs: Number(economiaSolarAnualRs.toFixed(2)),
      capexSolarRs: Math.round(capexSolarRs),
      paybackSolarAnos: Number(paybackSolarAnos.toFixed(1))
    };
  }

  window.MuseuSim.Engine = {
    calcPontoOrvalhoMagnus,
    calcTempSuperficieFria,
    isHorarioPonta,
    formatHoraMin,
    getClimaExterno,
    stepDinamicaZona,
    avaliarMPC64,
    avaliarHigrostatoConvencional,
    avaliarModoSeguroLocal,
    calcularEstudoSolar
  };
})();
