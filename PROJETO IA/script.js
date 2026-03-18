const videoElement = document.getElementById('videoElement');
const cursor = document.getElementById('cursor-virtual');
const statusText = document.getElementById('status');

// Variável para evitar "cliques duplos" rápidos demais
let estaPincando = false;

// 1. Configurando a IA de Mãos do Google
const hands = new Hands({locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
}});

hands.setOptions({
    maxNumHands: 1, // Só precisamos de uma mão para o mouse
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.7
});

// 2. A Lógica que roda a cada frame do vídeo
hands.onResults((results) => {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        statusText.innerText = "Controle Ativo! Mova a mão, faça a pinça para clicar ou suba/desça para rolar.";
        statusText.style.color = "#00ffcc";

        // Pega os dados da primeira mão detectada
        const landmarks = results.multiHandLandmarks[0];

        // Ponto 8: Ponta do Dedo Indicador (Usamos ele para guiar o cursor)
        const pontaIndicador = landmarks[8];
        // Ponto 4: Ponta do Dedão (Usamos ele junto com o indicador para a pinça)
        const pontaDedao = landmarks[4];
        // Ponto 9: Junta central da mão (Usamos ele para medir a altura da mão para o scroll)
        const centroMao = landmarks[9];

        // --- A) MOVENDO O CURSOR VIRTUAL ---
        // A câmera lê de 0 a 1. Multiplicamos pelo tamanho da tela para achar o pixel exato.
        // Fazemos (1 - x) para criar o efeito "espelho", senão o mouse vai pro lado contrário.
        const cursorX = (1 - pontaIndicador.x) * window.innerWidth;
        const cursorY = pontaIndicador.y * window.innerHeight;

        // Atualiza a posição da bolinha neon no CSS
        cursor.style.left = `${cursorX}px`;
        cursor.style.top = `${cursorY}px`;

        // --- B) O CLIQUE (Movimento de Pinça) ---
        // Calculamos a distância Euclidiana entre o Dedão e o Indicador
        const distanciaDedos = Math.sqrt(
            Math.pow(pontaIndicador.x - pontaDedao.x, 2) + 
            Math.pow(pontaIndicador.y - pontaDedao.y, 2)
        );

        // Se a distância for muito pequena (menor que 0.05), eles se encostaram!
        if (distanciaDedos < 0.05) {
            if (!estaPincando) {
                estaPincando = true;
                cursor.classList.add('clicando'); // Muda o visual do cursor

                // Mágica do JS: Descobre qual botão do HTML está embaixo do cursor virtual e clica nele!
                const elementoEmbaixo = document.elementFromPoint(cursorX, cursorY);
                if (elementoEmbaixo && elementoEmbaixo.tagName === 'BUTTON') {
                    elementoEmbaixo.click();
                }
            }
        } else {
            estaPincando = false;
            cursor.classList.remove('clicando'); // Volta o cursor ao normal
        }

        // --- C) ROLAGEM DA PÁGINA (Scroll) ---
        // Analisamos a altura do centro da mão (Y varia de 0 no topo a 1 na base)
        if (centroMao.y < 0.3) {
            // Mão está na parte de CIMA da tela -> Rola a página para CIMA
            window.scrollBy(0, -20); 
        } else if (centroMao.y > 0.7) {
            // Mão está na parte de BAIXO da tela -> Rola a página para BAIXO
            window.scrollBy(0, 20);
        }

    } else {
        statusText.innerText = "Levante a mão para a câmera para ativar o controle touchless...";
        statusText.style.color = "#ccc";
    }
});

// 3. Ligando a Webcam
const camera = new Camera(videoElement, {
    onFrame: async () => {
        await hands.send({image: videoElement});
    },
    width: 640,
    height: 480
});

camera.start().then(() => {
    console.log("Sistema Touchless Iniciado!");
});