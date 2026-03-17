# VisionFlow

# 👁️ VisionFlow: Touchless UX & Privacy AI

O **VisionFlow** é um projeto de interface web consciente desenvolvido para a trilha "AI Experience". Ele utiliza Visão Computacional para eliminar a necessidade de periféricos físicos, focando em **Acessibilidade** e **Segurança de Dados**.

## 💡 A Solução
O projeto utiliza a câmera do dispositivo para processar dois fluxos simultâneos de IA:
1. **Navegação Sem Toque:** Controle do cursor e cliques através do rastreamento de pontos da mão.
2. **Privacidade Adaptativa:** Monitoramento de presença facial que aplica desfoque (*blur*) automático na tela quando o usuário não está olhando ou se ausenta.

## 🛠️ Tecnologias
* **Backend:** Python 3.x, Flask, Flask-SocketIO
* **IA:** MediaPipe (Hand Landmarking & Face Detection), OpenCV
* **Frontend:** HTML5, CSS3, JavaScript (Socket.io-client)

