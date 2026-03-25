# VisionFlow 👁️

> **Touchless UX & Privacy-Centric Web Interface**

O **VisionFlow** é uma interface web consciente projetada para a trilha "AI Experience". O projeto utiliza Visão Computacional de última geração para redefinir a interação humano-computador (HCI), eliminando a dependência de periféricos físicos e priorizando a segurança e privacidade do usuário em tempo real.

---

## 💡 A Solução

O VisionFlow opera através do processamento paralelo de dois fluxos críticos de Inteligência Artificial via WebCam:

1.  **Navegação Sem Toque (Hand Tracking):** Mapeamento de 21 pontos de referência da mão (Hand Landmarks) para controle de cursor, cliques e gestos de scroll, garantindo acessibilidade para usuários com mobilidade reduzida.
2.  **Privacidade Adaptativa (Face Sensing):** Algoritmo de detecção de presença e atenção facial. Aplica camadas de desfoque (Blur) instantâneo no conteúdo sensível da tela caso o usuário desvie o olhar ou se ausente da frente do dispositivo.

---

## 🛠️ Tecnologias e Arquitetura

ESTÁ SENDO UTILIZADO PARA DESENVOLVIMENTO ATÉ ENTÃO JAVASCRIPT E HTML
---

## 🔧 Funcionalidades Principais

-   **Cursor Control:** Movimentação baseada no centro da palma ou dedo indicador.
-   **Gesture Commands:** "Pinça" para clique esquerdo; mão fechada para "drag and drop".
-   **Eye-Contact Privacy:** Se o modelo não detectar a íris ou face voltada para a tela, o `canvas` ou `div` principal é ofuscado via CSS Filter.
-   **Low Latency Pipeline:** Otimização de frames para evitar fadiga visual e atraso de resposta.
