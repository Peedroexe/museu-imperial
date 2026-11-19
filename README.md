# SISMIP — Simulador de Eficiência Energética e Controle Preditivo (Museu Imperial / Ibram)

**UFCI/RJ — Campus Petrópolis | Bacharelado em Engenharia da Computação**  
**Avaliação P2: Tecnologia para Sustentabilidade (2026)**

---

> Versão 2 (reorganizada): mesma simulação da versão original, com cabeçalho, abas, textos e gráficos reorganizados. Dá para abrir direto numa aba pelo endereço: `index.html#mpc`, `#lorawan`, `#solar` (acrescente `-claro` para o modo projetor, ex.: `#mpc-claro`).

## Slides + simulador

Abra **`slides.html`** para apresentar. O botão **Abrir simulador** (ou a tecla **S**) abre o simulador por cima dos slides, na mesma janela, sem sair da tela cheia. No simulador, **Voltar aos slides** (ou **Esc**) retorna ao mesmo slide em que você estava. O simulador continua rodando de onde parou se for aberto de novo.

## Como Executar (Zero Configuração)

O sistema foi construído para funcionar **100% offline** em qualquer computador ou notebook da faculdade, sem precisar instalar Node.js, Python ou banco de dados:

1. Basta dar **duplo clique em `index.html`** (ou em `Iniciar_Simulador.bat`).
2. Dica para projetor de sala de aula: no canto superior direito há o botão **Modo projetor**, que alterna para um tema claro de alto contraste caso o projetor da sala deixe cores escuras lavadas.

---

## Roteiro Rápido Sugerido para Apresentação (2 a 3 min)

1. **Planta & Supervisório IoT (aba 1)**:
   - Mostre a **Planta de Setorização do Térreo do Palácio Imperial (Figura 3)** com as zonas **P-01 (Ala Esquerda)**, **P-02 (Ala Direita + Sílica Gel)** e **P-03 (Circulação Central)** comunicando via **LoRaWAN 915 MHz** sem furos ou obras (Portaria IPHAN nº 289/2025).
   - Clique em **Umidade** para alternar entre as cores oficiais do Ibram e o mapa microclimático.
   - Alterne para **Reserva técnica** (mostrando a Sala Piloto RT-01 em 48%–54% UR, o sensor perimetral RT-02 e os armários de sílica gel RT-03) e para **Complexo**.
2. **Simulação de Eventos de Petrópolis**:
   - Na linha "Cenário", clique em **Nevoeiro serrano** ou **Excursão de visitantes** e observe a reação preventiva dos desumidificadores e o monitoramento do **Ponto de Orvalho de Magnus**.
   - No inspetor à direita, clique em **Simular queda do sinal LoRa nesta zona** para demonstrar a entrada automática em **Modo Seguro (Higrostato Local)** e o disparo imediato do alerta no **Telegram**.
3. **Motor MPC das 64 Combinações (aba 2)**:
   - Mostre o gráfico do **Leque das 64 Trajetórias** para os próximos 60 min (6 intervalos de 10 min) e como o sistema antecipa o **Horário de Ponta Enel (18h–21h)**, atingindo a meta de **25% a 35% de economia** em relação ao higrostato convencional.
4. **Injeção API & Exportação CSV (aba 3)** e **Viabilidade Solar com Microinversores (aba 4)**:
   - Envie uma leitura manual elevada (ex.: `62% UR`), baixe o arquivo `.CSV` ao vivo e mostre na aba 4 a diferença entre **Microinversores MLPE** e **Inversor String** sob o sombreamento parcial das árvores dos jardins do Edifício nº 4, contabilizada separadamente da economia do controle.
