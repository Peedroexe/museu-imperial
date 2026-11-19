/**
 * SISMIP — Sistema Inteligente de Monitoramento e Controle Microclimático
 * Museu Imperial / Ibram — Petrópolis, RJ
 * Dados de configuração, zonas, perfis climáticos da Serra de Petrópolis e referências do relatório (UFCI/RJ, 2026)
 */
window.MuseuSim = window.MuseuSim || {};

// Formata números no padrão brasileiro (vírgula decimal, ponto de milhar)
window.MuseuSim.fmt = function (n, casas) {
  const d = casas === undefined ? 1 : casas;
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
};

window.MuseuSim.CONFIG = {
  meta: {
    sigla: 'SISMIP',
    titulo: 'Sistema Híbrido de Eficiência Energética e Controle Preditivo',
    instituicao: 'Museu Imperial / Ibram — Petrópolis, RJ',
    universidade: 'UFCI/RJ — Campus Petrópolis | Engenharia da Computação',
    disciplina: 'Avaliação P2: Tecnologia para Sustentabilidade (2026)',
    autores: [
      'Elisa Lacerda Moura',
      'Marcos Oliveira do Rego',
      'Pedro Lucas Gomes Soares',
      'Pedro Rodrigues Couto'
    ]
  },

  // Tarifas de referência Enel Rio (Ampla Energia - UASG 343015)
  energia: {
    tarifaForaPonta: 0.80,      // R$/kWh (tarifa média ilustrativa do relatório, Tabela 4)
    tarifaPonta: 1.94,          // R$/kWh (18h às 21h - penalidade horária / demanda ativa)
    inicioPontaMin: 18 * 60,    // 18:00
    fimPontaMin: 21 * 60,       // 21:00
    fatorEmissaoCO2: 0.0385,    // kg CO2eq / kWh (SIN médio Brasil)
    empenho2025Total: 157840.20,
    mediaMensalComplexo: 13153.35,
    notasEmpenho: [
      {
        codigo: '2025NE000017',
        exercicio: 2025,
        finalidade: 'Serviços de energia elétrica (Museu Imperial)',
        liquidacoes: 'fev. a abr./2025',
        valor: 43736.37
      },
      {
        codigo: '2025NE000026',
        exercicio: 2025,
        finalidade: 'Serviços de energia elétrica (Museu Imperial)',
        liquidacoes: 'mai. a dez./2025',
        valor: 114103.83
      },
      {
        codigo: '2026NE000009',
        exercicio: 2026,
        finalidade: 'Energia elétrica no Museu Imperial e Casa Cláudio de Souza',
        liquidacoes: 'jan. a out./2026',
        valor: 140892.99,
        obs: 'Valor do item de despesa (doc atual: R$ 16.924,87)'
      },
      {
        codigo: '2026NE000041',
        exercicio: 2026,
        finalidade: 'Fornecimento e atendimento à demanda ativa (Museu Imperial e Casa Cláudio de Souza)',
        liquidacoes: 'out./2026',
        valor: 65710.14
      }
    ]
  },

  // Perfis normativos de conservação (Seções 2.1 e 3.5)
  perfisConservacao: {
    reserva_operacional: {
      id: 'reserva_operacional',
      nome: 'Margem Operacional Piloto (48% – 54% UR)',
      norma: 'Meta Seção 3.5 (Segurança dentro de 45%–55%)',
      urMin: 48,
      urMax: 54,
      urCritMin: 45,
      urCritMax: 55,
      tempMin: 18,
      tempMax: 23,
      delta24hMax: 6
    },
    acervo_sensivel: {
      id: 'acervo_sensivel',
      nome: 'Acervo Misto Sensível (45% – 55% UR)',
      norma: 'Referência Papel, Tecidos e Madeira (CCI / Seção 3.5)',
      urMin: 45,
      urMax: 55,
      urCritMin: 42,
      urCritMax: 58,
      tempMin: 16,
      tempMax: 24,
      delta24hMax: 8
    },
    icom_geral: {
      id: 'icom_geral',
      nome: 'Diretriz Estendida ICOM-CC / IIC (40% – 60% UR)',
      norma: 'Declaração Conjunta ICOM-CC & IIC (2014) | Máx ±10%/24h',
      urMin: 43,
      urMax: 57,
      urCritMin: 40,
      urCritMax: 60,
      tempMin: 16,
      tempMax: 25,
      delta24hMax: 10
    }
  },

  // Definição das zonas monitoradas no Palácio (Ed. 13 - Figura 3) e Reserva Técnica (Ed. 4)
  zonas: [
    {
      id: 'P-01',
      numeroMapa: '1',
      codigo: 'P-01',
      nome: 'Sala Expositiva — Ala Esquerda',
      edificio: 'palacio',
      edificioNome: 'Edifício nº 13 — Palácio Imperial (Térreo)',
      setorIbram: 'Expositivo',
      acervo: 'Mobiliário imperial em jacarandá, retratos a óleo e indumentária de corte',
      sensorId: 'LORA-SHT40-P01',
      ctId: 'SCT013-DH01',
      atuadorNome: 'Desumidificador DH-01 ( Portátil Silencioso )',
      potenciaKw: 0.85,
      volumeM3: 240,
      perfilPadrao: 'acervo_sensivel',
      urInicial: 51.8,
      tempInicial: 20.6,
      infiltracaoTaxa: 0.021,     // troca com exterior por intervalo de 10 min
      capacidadeDesum: 2.25,      // redução nominal de %UR por intervalo de 10 min ligado
      fatorVisitantes: 0.55,
      atenuacaoBaseDbm: -88,      // paredes espessas de pedra do Palácio
      bateriaInicial: 94,
      temVitrineSilica: false,
      posPlanta: { x: 326, y: 172 }
    },
    {
      id: 'P-02',
      numeroMapa: '2',
      codigo: 'P-02',
      nome: 'Sala Expositiva — Ala Direita',
      edificio: 'palacio',
      edificioNome: 'Edifício nº 13 — Palácio Imperial (Térreo)',
      setorIbram: 'Expositivo',
      acervo: 'Sala da Coroa, manuscritos imperiais, condecorações e vitrine selada com sílica gel',
      sensorId: 'LORA-SHT40-P02',
      ctId: 'SCT013-DH02',
      atuadorNome: 'Desumidificador DH-02 + Vitrine Sílica Gel',
      potenciaKw: 0.80,
      volumeM3: 230,
      perfilPadrao: 'reserva_operacional',
      urInicial: 51.2,
      tempInicial: 20.4,
      infiltracaoTaxa: 0.019,
      capacidadeDesum: 2.20,
      fatorVisitantes: 0.58,
      atenuacaoBaseDbm: -91,
      bateriaInicial: 89,
      temVitrineSilica: true,
      urVitrineSilica: 49.8,
      posPlanta: { x: 676, y: 172 }
    },
    {
      id: 'P-03',
      numeroMapa: '3',
      codigo: 'P-03',
      nome: 'Circulação Central / Vestíbulo',
      edificio: 'palacio',
      edificioNome: 'Edifício nº 13 — Palácio Imperial (Térreo)',
      setorIbram: 'Circulação',
      acervo: 'Hall monumental, escadaria histórica, esculturas e zona de amortecimento térmico',
      sensorId: 'LORA-SHT40-P03',
      ctId: 'SCT013-DH03',
      atuadorNome: 'Desumidificador DH-03 ( Alta Vazão )',
      potenciaKw: 1.15,
      volumeM3: 340,
      perfilPadrao: 'icom_geral',
      urInicial: 53.6,
      tempInicial: 20.9,
      infiltracaoTaxa: 0.032,     // maior troca pelas portas principais do pórtico
      capacidadeDesum: 2.55,
      fatorVisitantes: 0.85,
      atenuacaoBaseDbm: -79,      // mais próximo ao gateway
      bateriaInicial: 97,
      temVitrineSilica: false,
      posPlanta: { x: 500, y: 232 }
    },
    {
      id: 'RT-01',
      numeroMapa: 'R1',
      codigo: 'RT-01',
      nome: 'Reserva Técnica — Núcleo do Acervo (Sala Piloto)',
      edificio: 'reserva',
      edificioNome: 'Edifício nº 4 — 2º Pavimento (Museologia / Arquivo)',
      setorIbram: 'Reserva Técnica',
      acervo: 'Guarda principal (~300 mil itens: documentos históricos, têxteis, gravuras e madeira)',
      sensorId: 'LORA-SHT40-RT01',
      ctId: 'SCT013-DH04',
      atuadorNome: 'Desumidificador DH-04 ( Sala Piloto Principal )',
      potenciaKw: 0.95,
      volumeM3: 185,
      perfilPadrao: 'reserva_operacional',
      urInicial: 50.8,
      tempInicial: 19.8,
      infiltracaoTaxa: 0.018,
      capacidadeDesum: 2.20,
      fatorVisitantes: 0.08,      // acesso restrito à equipe técnica
      atenuacaoBaseDbm: -74,
      bateriaInicial: 98,
      temVitrineSilica: true,
      urVitrineSilica: 50.1,
      posPlanta: { x: 310, y: 185 }
    },
    {
      id: 'RT-02',
      numeroMapa: 'R2',
      codigo: 'RT-02',
      nome: 'Reserva Técnica — Perímetro e Aberturas Externas',
      edificio: 'reserva',
      edificioNome: 'Edifício nº 4 — 2º Pavimento (Parede Norte / Jardins)',
      setorIbram: 'Reserva Técnica',
      acervo: 'Sensor sentinela junto à parede externa sombreada (detecção precoce de infiltração e orvalho)',
      sensorId: 'LORA-SHT40-RT02',
      ctId: 'SCT013-DH05',
      atuadorNome: 'Desumidificador Auxiliar DH-05 ( Cortina Seca )',
      potenciaKw: 0.70,
      volumeM3: 130,
      perfilPadrao: 'reserva_operacional',
      urInicial: 51.9,
      tempInicial: 19.3,
      infiltracaoTaxa: 0.027,     // junto a esquadrias e parede fria externa
      capacidadeDesum: 2.30,
      fatorVisitantes: 0.06,
      atenuacaoBaseDbm: -77,
      bateriaInicial: 91,
      temVitrineSilica: false,
      posPlanta: { x: 645, y: 145 }
    },
    {
      id: 'RT-03',
      numeroMapa: 'R3',
      codigo: 'RT-03',
      nome: 'Arquivo Histórico & Mapoteca Climatizada',
      edificio: 'reserva',
      edificioNome: 'Edifício nº 4 — 2º Pavimento (Arquivo Histórico)',
      setorIbram: 'Reserva Técnica',
      acervo: 'Cartas imperiais, fotografias em albumina, pergaminhos em armários vedados com sílica gel',
      sensorId: 'LORA-SHT40-RT03',
      ctId: 'SCT013-DH06',
      atuadorNome: 'Desumidificador DH-06 + Armários de Sílica Gel',
      potenciaKw: 0.65,
      volumeM3: 150,
      perfilPadrao: 'reserva_operacional',
      urInicial: 50.4,
      tempInicial: 19.6,
      infiltracaoTaxa: 0.017,
      capacidadeDesum: 2.15,
      fatorVisitantes: 0.08,
      atenuacaoBaseDbm: -81,
      bateriaInicial: 86,
      temVitrineSilica: true,
      urVitrineSilica: 49.5,
      posPlanta: { x: 645, y: 275 }
    }
  ],

  // Cenários climáticos e operacionais de Petrópolis (~800m altitude)
  cenarios: {
    normal: {
      id: 'normal',
      nome: 'Dia Típico Serrano',
      icone: '',
      descricao: 'Clima ameno de Petrópolis (15°C–23°C), umidade elevada à noite (84%) e moderada à tarde (68%).',
      offsetUrExt: 0,
      offsetTempExt: 0,
      multVisitantes: 1.0,
      fatorSol: 1.0,
      cargaExtraComplexoKw: 0
    },
    nevoeiro: {
      id: 'nevoeiro',
      nome: 'Nevoeiro Serrano ("Ruço")',
      icone: '',
      descricao: 'Nevoeiro denso típico de Petrópolis: UR externa salta para 95%–98%, queda térmica e risco de condensação.',
      offsetUrExt: 18,
      offsetTempExt: -3.4,
      multVisitantes: 0.7,
      fatorSol: 0.22,
      cargaExtraComplexoKw: 0.6
    },
    chuva_verao: {
      id: 'chuva_verao',
      nome: 'Chuva Intensa de Verão',
      icone: '',
      descricao: 'Precipitação forte na Serra: alta pressão de vapor d’água externa (96% UR) e infiltração pelas aberturas.',
      offsetUrExt: 20,
      offsetTempExt: 1.8,
      multVisitantes: 0.5,
      fatorSol: 0.12,
      cargaExtraComplexoKw: 0.9
    },
    excursao: {
      id: 'excursao',
      nome: 'Pico de Visitantes (+Excursão)',
      icone: '',
      descricao: 'Alta visitação nas alas expositivas P-01/P-02/P-03 (referência: >400 mil visitantes/ano no complexo).',
      offsetUrExt: 4,
      offsetTempExt: 1.0,
      multVisitantes: 2.6,
      fatorSol: 0.95,
      cargaExtraComplexoKw: 1.4
    },
    som_e_luz: {
      id: 'som_e_luz',
      nome: 'Espetáculo Noturno "Som e Luz"',
      icone: '',
      descricao: 'Operação noturna nos jardins: eleva a demanda elétrica base do complexo, exigindo escalonamento rigoroso do MPC.',
      offsetUrExt: 11,
      offsetTempExt: -1.8,
      multVisitantes: 1.6,
      fatorSol: 0.0,
      cargaExtraComplexoKw: 8.5
    }
  },

  // Edificações do Mapa de Localização do Complexo (Figura 1 - página 4 do relatório)
  edificiosComplexo: [
    { num: 1, nome: 'Entrada / Saída Principal', x: 432, y: 378, tipo: 'acesso' },
    { num: 2, nome: 'Bilheteria Diurna', x: 355, y: 325, tipo: 'apoio' },
    { num: 3, nome: 'Cafeteria', x: 318, y: 248, tipo: 'apoio' },
    { num: 4, nome: 'Administração, Arquivo e Museologia (Reserva Técnica - 2º Pav.)', x: 318, y: 192, tipo: 'monitorado', targetView: 'reserva' },
    { num: 5, nome: 'Laboratório de Conservação e Restauração', x: 242, y: 155, tipo: 'tecnico' },
    { num: 6, nome: 'Pavilhão das Viaturas / Setor de Educação', x: 472, y: 122, tipo: 'expositivo' },
    { num: 7, nome: 'Cineteatro', x: 528, y: 92, tipo: 'apoio' },
    { num: 8, nome: 'Biblioteca / Sala Multimídia', x: 565, y: 98, tipo: 'tecnico' },
    { num: 9, nome: 'Jardins Históricos do Palácio (Clima Externo & Som e Luz)', x: 565, y: 298, tipo: 'jardim' },
    { num: 10, nome: 'Loja do Museu Imperial', x: 525, y: 185, tipo: 'apoio' },
    { num: 11, nome: 'Bilheteria Noturna / Guarda-volumes', x: 752, y: 255, tipo: 'apoio' },
    { num: 12, nome: 'Sanitários Públicos', x: 752, y: 298, tipo: 'apoio' },
    { num: 13, nome: 'Palácio Imperial de Petrópolis (Zonas P-01 a P-03)', x: 615, y: 215, tipo: 'monitorado', targetView: 'palacio' }
  ]
};
