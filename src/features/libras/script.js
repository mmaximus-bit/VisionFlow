(() => {
    const dom = {
        video: document.getElementById("videoElement"),
        landmarkCanvas: document.getElementById("landmarkCanvas"),
        effectsCanvas: document.getElementById("effectsCanvas"),
        toast: document.getElementById("notification-toast"),
        consentModal: document.getElementById("consent-modal"),
        acceptConsentBtn: document.getElementById("accept-consent"),
        denyConsentBtn: document.getElementById("deny-consent"),
        currentLetter: document.getElementById("current-letter"),
        confidenceFill: document.getElementById("confidence-fill"),
        confidenceText: document.getElementById("confidence-text"),
        qualityText: document.getElementById("quality-text"),
        cameraStatus: document.getElementById("camera-status"),
        handStatus: document.getElementById("hand-status"),
        engineStatus: document.getElementById("engine-status"),
        toggleCameraBtn: document.getElementById("toggle-camera"),
        toggleLandmarksBtn: document.getElementById("toggle-landmarks"),
        toggleContrastBtn: document.getElementById("toggle-contrast"),
        resetSessionBtn: document.getElementById("reset-session"),
        sliderStability: document.getElementById("slider-stability"),
        sliderConfidence: document.getElementById("slider-confidence"),
        sliderCooldown: document.getElementById("slider-cooldown"),
        sliderSmoothing: document.getElementById("slider-smoothing"),
        valueStability: document.getElementById("value-stability"),
        valueConfidence: document.getElementById("value-confidence"),
        valueCooldown: document.getElementById("value-cooldown"),
        valueSmoothing: document.getElementById("value-smoothing"),
        customLabelInput: document.getElementById("custom-label-input"),
        recordTemplateBtn: document.getElementById("record-template"),
        saveTemplateBtn: document.getElementById("save-template"),
        clearTemplatesBtn: document.getElementById("clear-templates"),
        templateStatus: document.getElementById("template-status"),
        templateList: document.getElementById("template-list"),
        outputText: document.getElementById("output-text"),
        suggestions: document.getElementById("suggestions"),
        recognitionLog: document.getElementById("recognition-log"),
        actionSpaceBtn: document.getElementById("action-space"),
        actionBackspaceBtn: document.getElementById("action-backspace"),
        actionClearBtn: document.getElementById("action-clear"),
        actionCopyBtn: document.getElementById("action-copy"),
        actionExportBtn: document.getElementById("action-export"),
        visualGrid: document.getElementById("visual-grid"),
        clearGridBtn: document.getElementById("clear-grid-btn"),
        fpsBadgeText: document.getElementById("fps-badge-text"),
        wordHistoryList: document.getElementById("word-history-list"),
        clearWordHistoryBtn: document.getElementById("clear-word-history")
    };

    if (!dom.video || !dom.landmarkCanvas || !dom.effectsCanvas || !dom.outputText) {
        return;
    }

    const settingsStorageKey = "visionflow-libras-settings-v1";
    const templatesStorageKey = "visionflow-libras-templates-v1";
    const transcriptStorageKey = "visionflow-libras-transcript-v1";

    // ─── Feature 6: Word History ────────────────────────────
    const wordHistory = [];
    const audioCtxLibras = new (window.AudioContext || window.webkitAudioContext)();

    function addWordToHistory(word) {
        if (!word || word.trim().length < 2) return;
        if (wordHistory[0] === word) return; // evita duplicata consecutiva
        wordHistory.unshift(word);
        if (wordHistory.length > 20) wordHistory.pop();
        renderWordHistory();
    }

    function renderWordHistory() {
        if (!dom.wordHistoryList) return;
        dom.wordHistoryList.innerHTML = "";
        wordHistory.forEach(w => {
            const chip = document.createElement("span");
            chip.className = "word-chip";
            chip.textContent = w;
            chip.title = "Clique para reinserir";
            chip.addEventListener("click", () => {
                if (dom.outputText) {
                    dom.outputText.classList.remove("placeholder");
                    dom.outputText.textContent += w;
                }
            });
            dom.wordHistoryList.appendChild(chip);
        });
    }

    // ─── Feature 7: Confetti ───────────────────────────────
    function spawnConfetti(x, y) {
        const colors = ["#0b7f72", "#f08a4b", "#38d4bf", "#ffb067", "#7fffec", "#ff7f65"];
        for (let i = 0; i < 18; i++) {
            const piece = document.createElement("div");
            piece.className = "confetti-piece";
            piece.style.left = `${x + (Math.random() - 0.5) * 100}px`;
            piece.style.top = `${y + (Math.random() - 0.5) * 40}px`;
            piece.style.background = colors[Math.floor(Math.random() * colors.length)];
            piece.style.transform = `rotate(${Math.random() * 360}deg)`;
            document.body.appendChild(piece);
            setTimeout(() => piece.remove(), 1300);
        }
    }

    // ─── Feature 8: Grid Key Hover Sound ──────────────────
    function playGridHoverSound() {
        if (audioCtxLibras.state === "suspended") audioCtxLibras.resume();
        const osc = audioCtxLibras.createOscillator();
        const gain = audioCtxLibras.createGain();
        osc.connect(gain);
        gain.connect(audioCtxLibras.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(900, audioCtxLibras.currentTime);
        gain.gain.setValueAtTime(0.04, audioCtxLibras.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtxLibras.currentTime + 0.06);
        osc.start();
        osc.stop(audioCtxLibras.currentTime + 0.06);
    }

    // ─── Feature 9: Clear Grid ────────────────────────────
    function clearGrid() {
        document.querySelectorAll(".grid-key").forEach(k => k.classList.remove("active"));
    }

    // ─── Feature 10: FPS Badge ───────────────────────────
    function updateFpsBadge(fps) {
        if (dom.fpsBadgeText) {
            dom.fpsBadgeText.textContent = `${fps} FPS`;
        }
    }

    // ──────────────────────────────────────────────────────────────────
    // OTIMIZAÇÃO 1 — Canvas com { willReadFrequently: true }
    // O Studio Libras processa frames de vídeo com alta frequência. Ao sinalizar
    // willReadFrequently, o browser mantém o framebuffer na CPU, evitando
    // read-back GPU→CPU que bloqueia a thread principal por milissegundos.
    // ──────────────────────────────────────────────────────────────────
    const landmarkCtx = dom.landmarkCanvas.getContext("2d", { willReadFrequently: true });
    const effectsCtx  = dom.effectsCanvas.getContext("2d",  { willReadFrequently: true });

    // ──────────────────────────────────────────────────────────────────
    // OTIMIZAÇÃO 1b — Canvas offscreen de baixa resolução
    // O Libras usa 960×720 no Camera. Reduzimos para 480×360 (¼ dos pixels)
    // no canvas offscreen antes de enviar ao modelo. Isso diminui significativamente
    // o trabalho de decodificação de imagem feito pelo WASM do MediaPipe.
    // ──────────────────────────────────────────────────────────────────
    const LIBRAS_OFFSCREEN_W = 480;
    const LIBRAS_OFFSCREEN_H = 360;
    /** Canvas interno de baixa resolução usado como pré-processador de frame. */
    const librasOffscreenCanvas = document.createElement("canvas");
    librasOffscreenCanvas.width  = LIBRAS_OFFSCREEN_W;
    librasOffscreenCanvas.height = LIBRAS_OFFSCREEN_H;
    /** Contexto offscreen — marcado willReadFrequently pois vamos ler pixels. */
    const librasOffscreenCtx = librasOffscreenCanvas.getContext("2d", { willReadFrequently: true });

    // ──────────────────────────────────────────────────────────────────
    // OTIMIZAÇÃO 2 — Throttle de FPS (pipeline de inferência)
    // Controla quantos frames por segundo são enviados ao modelo.
    // ──────────────────────────────────────────────────────────────────
    /** Máximo de FPS de inferência — 20 FPS reduz CPU ~50% vs 60 FPS nativo. */
    const LIBRAS_MAX_INFERENCE_FPS = 20;
    /** Intervalo mínimo (ms) entre envios ao modelo. */
    const LIBRAS_MIN_INTERVAL_MS = Math.round(1000 / LIBRAS_MAX_INFERENCE_FPS);
    /** Timestamp do último frame enviado — usado pelo throttle. */
    let librasLastSentAt = 0;
    /** Flag de pipeline ocupado — impede envio simultâneo de frames. */
    let librasSending = false;

    const HAND_CONNECTIONS = [
        [0, 1], [1, 2], [2, 3], [3, 4],
        [0, 5], [5, 6], [6, 7], [7, 8],
        [5, 9], [9, 10], [10, 11], [11, 12],
        [9, 13], [13, 14], [14, 15], [15, 16],
        [13, 17], [17, 18], [18, 19], [19, 20],
        [0, 17]
    ];

    const DICTIONARY = [
        "OLA",
        "OI",
        "TUDO",
        "BEM",
        "BOM",
        "DIA",
        "BOA",
        "NOITE",
        "COMO",
        "VOCE",
        "ESTA",
        "EU",
        "PRECISO",
        "AJUDA",
        "POR",
        "FAVOR",
        "OBRIGADO",
        "OBRIGADA",
        "GESTOS",
        "LIBRAS",
        "ACESSIBILIDADE",
        "VISIONFLOW",
        "CAMERA",
        "FUNCIONANDO",
        "SIM",
        "NAO",
        "AGORA",
        "DEPOIS",
        "TESTE",
        "PRONTO"
    ];

    const config = {
        minDetectionConfidence: 0.62,
        minTrackingConfidence: 0.62,
        handLossGraceFrames: 16,
        stabilityMs: 620,
        confidenceThreshold: 0.78,
        cooldownMs: 420,
        smoothingAlpha: 0.62,
        consensusWindowMs: 420,
        maxLogItems: 18,
        templateMinFrames: 24,
        templateMaxFrames: 260,
        templateRecordingMaxMs: 4000,
        motionEmaAlpha: 0.18,
        qualityScale: 0.028,
        waveformMax: 8,
        settingsVersion: 1
    };

    const state = {
        consentAccepted: false,
        cameraRunning: false,
        handVisible: false,
        showLandmarks: false,
        highContrast: false,
        framesWithoutHand: 0,
        transcript: "",
        currentLabel: "",
        currentScore: 0,
        stableLabel: "",
        stableSince: 0,
        lastCommitAt: 0,
        predictions: [],
        templates: [],
        quality: 0,
        motionEma: 0,
        previousLandmarks: null,
        effects: [],
        recording: {
            active: false,
            label: "",
            startedAt: 0,
            samples: [],
            pendingTemplate: null
        },
        handsInstance: null,
        cameraInstance: null,
        loopRafId: 0
    };

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function normalizeLabel(value) {
        if (typeof value !== "string") {
            return "";
        }

        return value
            .normalize("NFD")
            .replace(/\p{Diacritic}/gu, "")
            .replace(/[^A-Z0-9_ ]/gi, "")
            .replace(/\s+/g, " ")
            .trim()
            .toUpperCase()
            .slice(0, 24);
    }

    function formatTime(date = new Date()) {
        return date.toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        });
    }

    function saveSettings() {
        const payload = {
            version: config.settingsVersion,
            stabilityMs: config.stabilityMs,
            confidenceThreshold: config.confidenceThreshold,
            cooldownMs: config.cooldownMs,
            smoothingAlpha: config.smoothingAlpha,
            showLandmarks: state.showLandmarks,
            highContrast: state.highContrast
        };

        try {
            localStorage.setItem(settingsStorageKey, JSON.stringify(payload));
        } catch {
            return;
        }
    }

    function loadSettings() {
        try {
            const raw = localStorage.getItem(settingsStorageKey);
            if (!raw) {
                return;
            }

            const payload = JSON.parse(raw);
            if (typeof payload.stabilityMs === "number") {
                config.stabilityMs = clamp(payload.stabilityMs, 320, 1400);
            }
            if (typeof payload.confidenceThreshold === "number") {
                config.confidenceThreshold = clamp(payload.confidenceThreshold, 0.5, 0.96);
            }
            if (typeof payload.cooldownMs === "number") {
                config.cooldownMs = clamp(payload.cooldownMs, 220, 1200);
            }
            if (typeof payload.smoothingAlpha === "number") {
                config.smoothingAlpha = clamp(payload.smoothingAlpha, 0.35, 0.9);
            }
            if (typeof payload.showLandmarks === "boolean") {
                state.showLandmarks = payload.showLandmarks;
            }
            if (typeof payload.highContrast === "boolean") {
                state.highContrast = payload.highContrast;
            }
        } catch {
            return;
        }
    }

    function saveTemplates() {
        try {
            localStorage.setItem(templatesStorageKey, JSON.stringify(state.templates));
        } catch {
            return;
        }
    }

    function loadTemplates() {
        try {
            const raw = localStorage.getItem(templatesStorageKey);
            if (!raw) {
                state.templates = [];
                return;
            }

            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                state.templates = [];
                return;
            }

            state.templates = parsed.filter((entry) => {
                return entry
                    && typeof entry.label === "string"
                    && Array.isArray(entry.embedding)
                    && entry.embedding.length >= 16;
            }).map((entry) => ({
                id: entry.id || `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
                label: normalizeLabel(entry.label),
                embedding: entry.embedding.map((value) => Number(value) || 0),
                createdAt: Number(entry.createdAt) || Date.now(),
                sampleCount: Number(entry.sampleCount) || 0
            }));
        } catch {
            state.templates = [];
        }
    }

    function saveTranscript() {
        try {
            localStorage.setItem(transcriptStorageKey, state.transcript);
        } catch {
            return;
        }
    }

    function loadTranscript() {
        try {
            const raw = localStorage.getItem(transcriptStorageKey);
            if (typeof raw === "string") {
                state.transcript = raw;
            }
        } catch {
            state.transcript = "";
        }
    }

    function setCanvasSize() {
        dom.landmarkCanvas.width = window.innerWidth;
        dom.landmarkCanvas.height = window.innerHeight;
        dom.effectsCanvas.width = window.innerWidth;
        dom.effectsCanvas.height = window.innerHeight;
    }

    function showToast(message) {
        if (!dom.toast) {
            return;
        }

        dom.toast.textContent = message;
        dom.toast.style.display = "block";
        window.clearTimeout(showToast.timer);
        showToast.timer = window.setTimeout(() => {
            dom.toast.style.display = "none";
        }, 2200);
    }
    showToast.timer = 0;

    function pushLog(message, tone = "info") {
        if (!dom.recognitionLog) {
            return;
        }

        const li = document.createElement("li");
        li.className = `log-item ${tone}`;

        const time = document.createElement("span");
        time.className = "log-time";
        time.textContent = formatTime();

        const msg = document.createElement("span");
        msg.className = "log-msg";
        msg.textContent = message;

        li.appendChild(time);
        li.appendChild(msg);
        dom.recognitionLog.prepend(li);

        while (dom.recognitionLog.children.length > config.maxLogItems) {
            dom.recognitionLog.removeChild(dom.recognitionLog.lastElementChild);
        }
    }

    function setStatusText(element, text, stateClass = "") {
        if (!element) {
            return;
        }

        element.textContent = text;
        element.classList.remove("detectado", "perdido");
        if (stateClass) {
            element.classList.add(stateClass);
        }
    }

    function updateCameraButtonLabel() {
        if (dom.toggleCameraBtn) {
            dom.toggleCameraBtn.textContent = state.cameraRunning ? "Parar camera" : "Iniciar camera";
        }
    }

    function updateLandmarksButtonLabel() {
        if (dom.toggleLandmarksBtn) {
            dom.toggleLandmarksBtn.textContent = state.showLandmarks ? "Ocultar landmarks" : "Mostrar landmarks";
        }
    }

    function updateContrastButtonLabel() {
        if (dom.toggleContrastBtn) {
            dom.toggleContrastBtn.textContent = state.highContrast ? "Contraste alto: on" : "Contraste alto: off";
        }
    }

    function setLandmarksVisibility(enabled) {
        state.showLandmarks = enabled;
        dom.landmarkCanvas.style.display = enabled ? "block" : "none";
        if (!enabled) {
            clearLandmarks();
        }
        updateLandmarksButtonLabel();
        saveSettings();
    }

    function setContrast(enabled) {
        state.highContrast = enabled;
        document.body.classList.toggle("high-contrast", enabled);
        updateContrastButtonLabel();
        saveSettings();
    }

    function syncSettingsUI() {
        if (dom.sliderStability) {
            dom.sliderStability.value = String(config.stabilityMs);
        }
        if (dom.sliderConfidence) {
            dom.sliderConfidence.value = String(Math.round(config.confidenceThreshold * 100));
        }
        if (dom.sliderCooldown) {
            dom.sliderCooldown.value = String(config.cooldownMs);
        }
        if (dom.sliderSmoothing) {
            dom.sliderSmoothing.value = String(config.smoothingAlpha.toFixed(2));
        }

        if (dom.valueStability) {
            dom.valueStability.textContent = `${Math.round(config.stabilityMs)}ms`;
        }
        if (dom.valueConfidence) {
            dom.valueConfidence.textContent = `${Math.round(config.confidenceThreshold * 100)}%`;
        }
        if (dom.valueCooldown) {
            dom.valueCooldown.textContent = `${Math.round(config.cooldownMs)}ms`;
        }
        if (dom.valueSmoothing) {
            dom.valueSmoothing.textContent = config.smoothingAlpha.toFixed(2);
        }
    }

    function updateLiveRecognitionUI(label = "", score = 0) {
        const textLabel = label || "-";
        const confidence = clamp(score, 0, 1);

        if (dom.currentLetter) {
            dom.currentLetter.textContent = textLabel;
        }
        if (dom.confidenceFill) {
            dom.confidenceFill.style.width = `${Math.round(confidence * 100)}%`;
        }
        if (dom.confidenceText) {
            dom.confidenceText.textContent = `Confianca ${Math.round(confidence * 100)}%`;
        }
    }

    function updateQualityText() {
        if (!dom.qualityText) {
            return;
        }

        if (!state.cameraRunning) {
            dom.qualityText.textContent = "Qualidade aguardando camera";
            return;
        }

        if (!state.handVisible) {
            dom.qualityText.textContent = "Qualidade aguardando mao";
            return;
        }

        const percent = Math.round(state.quality * 100);
        if (percent >= 72) {
            dom.qualityText.textContent = `Qualidade alta ${percent}%`;
            return;
        }
        if (percent >= 45) {
            dom.qualityText.textContent = `Qualidade media ${percent}%`;
            return;
        }
        dom.qualityText.textContent = `Qualidade baixa ${percent}%`;
    }

    function renderOutput() {
        if (!dom.outputText) {
            return;
        }

        if (!state.transcript) {
            dom.outputText.classList.add("placeholder");
            dom.outputText.textContent = "Aguardando reconhecimento de sinais...";
            return;
        }

        dom.outputText.classList.remove("placeholder");
        dom.outputText.textContent = state.transcript;
    }

    function getCurrentTokenRange() {
        const text = state.transcript;
        const lastSpace = text.lastIndexOf(" ");
        const start = lastSpace >= 0 ? lastSpace + 1 : 0;
        const token = text.slice(start);
        return { start, token };
    }

    function renderSuggestions() {
        if (!dom.suggestions) {
            return;
        }

        dom.suggestions.innerHTML = "";

        const { token } = getCurrentTokenRange();
        const normalizedToken = normalizeLabel(token);
        if (!normalizedToken || normalizedToken.length < 1) {
            const empty = document.createElement("span");
            empty.className = "empty-chip";
            empty.textContent = "Comece uma palavra para ver sugestoes.";
            dom.suggestions.appendChild(empty);
            return;
        }

        const matches = DICTIONARY.filter((word) => word.startsWith(normalizedToken)).slice(0, 7);
        if (!matches.length) {
            const empty = document.createElement("span");
            empty.className = "empty-chip";
            empty.textContent = "Sem sugestoes para este prefixo.";
            dom.suggestions.appendChild(empty);
            return;
        }

        for (let i = 0; i < matches.length; i += 1) {
            const word = matches[i];
            const button = document.createElement("button");
            button.className = "chip";
            button.textContent = word;
            button.type = "button";
            button.addEventListener("click", () => {
                applySuggestion(word);
            });
            dom.suggestions.appendChild(button);
        }
    }

    function applySuggestion(word) {
        const normalizedWord = normalizeLabel(word);
        if (!normalizedWord) {
            return;
        }

        const { start } = getCurrentTokenRange();
        state.transcript = `${state.transcript.slice(0, start)}${normalizedWord}`;
        saveTranscript();
        renderOutput();
        renderSuggestions();
        pushLog(`Sugestao aplicada: ${normalizedWord}.`, "info");
        showToast(`Sugestao aplicada: ${normalizedWord}`);
    }

    function addEffectPulse(x, y, color = "rgba(11, 127, 114, 0.75)") {
        state.effects.push({
            x,
            y,
            radius: 2,
            maxRadius: 74,
            opacity: 1,
            color
        });

        if (state.effects.length > config.waveformMax) {
            state.effects.shift();
        }
    }

    function drawEffects() {
        effectsCtx.clearRect(0, 0, dom.effectsCanvas.width, dom.effectsCanvas.height);

        for (let i = 0; i < state.effects.length; i += 1) {
            const effect = state.effects[i];
            effect.radius += 3.9;
            effect.opacity = 1 - effect.radius / effect.maxRadius;
            if (effect.opacity <= 0) {
                continue;
            }

            effectsCtx.strokeStyle = effect.color.replace("0.75", String(effect.opacity));
            effectsCtx.lineWidth = 2;
            effectsCtx.beginPath();
            effectsCtx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
            effectsCtx.stroke();
        }

        state.effects = state.effects.filter((effect) => effect.opacity > 0);
    }

    function clearLandmarks() {
        landmarkCtx.clearRect(0, 0, dom.landmarkCanvas.width, dom.landmarkCanvas.height);
    }

    function drawLandmarks(landmarks) {
        if (!state.showLandmarks) {
            return;
        }

        landmarkCtx.clearRect(0, 0, dom.landmarkCanvas.width, dom.landmarkCanvas.height);

        const points = landmarks.map((point) => ({
            x: (1 - point.x) * dom.landmarkCanvas.width,
            y: point.y * dom.landmarkCanvas.height
        }));

        for (let i = 0; i < HAND_CONNECTIONS.length; i += 1) {
            const [from, to] = HAND_CONNECTIONS[i];
            const p1 = points[from];
            const p2 = points[to];
            if (!p1 || !p2) {
                continue;
            }
            landmarkCtx.strokeStyle = "rgba(11, 127, 114, 0.78)";
            landmarkCtx.lineWidth = 2;
            landmarkCtx.beginPath();
            landmarkCtx.moveTo(p1.x, p1.y);
            landmarkCtx.lineTo(p2.x, p2.y);
            landmarkCtx.stroke();
        }

        for (let i = 0; i < points.length; i += 1) {
            const point = points[i];
            landmarkCtx.fillStyle = i === 8 ? "rgba(240, 138, 75, 0.95)" : "rgba(11, 127, 114, 0.9)";
            landmarkCtx.beginPath();
            landmarkCtx.arc(point.x, point.y, i === 8 ? 5 : 3.2, 0, Math.PI * 2);
            landmarkCtx.fill();
        }
    }

    function distanceBetween(a, b) {
        return Math.hypot(a.x - b.x, a.y - b.y);
    }

    function getPalmScale(landmarks) {
        const wrist = landmarks[0];
        const indexMcp = landmarks[5];
        const middleMcp = landmarks[9];
        const pinkyMcp = landmarks[17];

        if (!wrist || !indexMcp || !middleMcp || !pinkyMcp) {
            return 0.16;
        }

        const horizontalSpan = distanceBetween(indexMcp, pinkyMcp);
        const verticalSpan = distanceBetween(wrist, middleMcp);
        return clamp(Math.max(horizontalSpan, verticalSpan, 0.08), 0.08, 0.34);
    }

    function cloneLandmarks(landmarks) {
        return landmarks.map((point) => ({
            x: point.x,
            y: point.y,
            z: point.z
        }));
    }

    function smoothLandmarks(rawLandmarks) {
        if (!state.previousLandmarks || state.previousLandmarks.length !== rawLandmarks.length) {
            const cloned = cloneLandmarks(rawLandmarks);
            state.previousLandmarks = cloned;
            state.motionEma = 0;
            state.quality = 1;
            return cloned;
        }

        const alpha = config.smoothingAlpha;
        const smoothed = [];
        let totalMotion = 0;

        for (let i = 0; i < rawLandmarks.length; i += 1) {
            const prev = state.previousLandmarks[i];
            const curr = rawLandmarks[i];
            const dx = curr.x - prev.x;
            const dy = curr.y - prev.y;
            const dz = (curr.z || 0) - (prev.z || 0);
            const magnitude = Math.hypot(dx, dy, dz);
            totalMotion += magnitude;

            smoothed.push({
                x: prev.x + dx * alpha,
                y: prev.y + dy * alpha,
                z: (prev.z || 0) + dz * alpha
            });
        }

        state.previousLandmarks = smoothed;

        const avgMotion = totalMotion / Math.max(1, rawLandmarks.length);
        state.motionEma = state.motionEma + (avgMotion - state.motionEma) * config.motionEmaAlpha;
        state.quality = clamp(1 - state.motionEma / config.qualityScale, 0, 1);

        return smoothed;
    }

    function computeFingerExtensions(landmarks) {
        const wrist = landmarks[0];
        const palmScale = getPalmScale(landmarks);

        const extension = (tip, pip) => {
            const tipPoint = landmarks[tip];
            const pipPoint = landmarks[pip];
            if (!tipPoint || !pipPoint || !wrist) {
                return 0;
            }
            return (distanceBetween(tipPoint, wrist) - distanceBetween(pipPoint, wrist)) / Math.max(palmScale, 0.0001);
        };

        const thumbTip = landmarks[4];
        const thumbIp = landmarks[3];
        const indexTip = landmarks[8];
        const middleTip = landmarks[12];
        const ringTip = landmarks[16];
        const pinkyTip = landmarks[20];

        const indexMcp = landmarks[5];
        const middleMcp = landmarks[9];
        const ringMcp = landmarks[13];
        const pinkyMcp = landmarks[17];

        const thumbIndexDist = thumbTip && indexTip ? distanceBetween(thumbTip, indexTip) / Math.max(palmScale, 0.0001) : 1;
        const thumbMiddleDist = thumbTip && middleTip ? distanceBetween(thumbTip, middleTip) / Math.max(palmScale, 0.0001) : 1;
        const thumbRingDist = thumbTip && ringTip ? distanceBetween(thumbTip, ringTip) / Math.max(palmScale, 0.0001) : 1;
        const thumbPinkyDist = thumbTip && pinkyTip ? distanceBetween(thumbTip, pinkyTip) / Math.max(palmScale, 0.0001) : 1;
        const indexMiddleDist = indexTip && middleTip ? distanceBetween(indexTip, middleTip) / Math.max(palmScale, 0.0001) : 0;
        const thumbIpDist = thumbTip && thumbIp ? distanceBetween(thumbTip, thumbIp) / Math.max(palmScale, 0.0001) : 0;
        const indexMiddleMcpDist = indexMcp && middleMcp ? distanceBetween(indexMcp, middleMcp) / Math.max(palmScale, 0.0001) : 0;

        const relTipDirectionY = (tip, mcp) => {
            if (!tip || !mcp) {
                return 0;
            }
            return (tip.y - mcp.y) / Math.max(palmScale, 0.0001);
        };

        const extThumb = thumbIpDist;
        const extIndex = extension(8, 6);
        const extMiddle = extension(12, 10);
        const extRing = extension(16, 14);
        const extPinky = extension(20, 18);

        const open = {
            thumb: extThumb > 0.22,
            index: extIndex > 0.11,
            middle: extMiddle > 0.11,
            ring: extRing > 0.1,
            pinky: extPinky > 0.1
        };

        const closed = {
            thumb: extThumb < 0.14,
            index: extIndex < 0.06,
            middle: extMiddle < 0.06,
            ring: extRing < 0.06,
            pinky: extPinky < 0.06
        };

        const semi = {
            thumb: !open.thumb && !closed.thumb,
            index: !open.index && !closed.index,
            middle: !open.middle && !closed.middle,
            ring: !open.ring && !closed.ring,
            pinky: !open.pinky && !closed.pinky
        };

        return {
            palmScale,
            thumbIndexDist,
            thumbMiddleDist,
            thumbRingDist,
            thumbPinkyDist,
            indexMiddleDist,
            indexMiddleMcpDist,
            ext: {
                thumb: extThumb,
                index: extIndex,
                middle: extMiddle,
                ring: extRing,
                pinky: extPinky
            },
            open,
            closed,
            semi,
            tipDirY: {
                index: relTipDirectionY(indexTip, indexMcp),
                middle: relTipDirectionY(middleTip, middleMcp),
                ring: relTipDirectionY(ringTip, ringMcp),
                pinky: relTipDirectionY(pinkyTip, pinkyMcp)
            }
        };
    }

    function scorePattern(actual, expected) {
        const keys = Object.keys(expected);
        if (!keys.length) {
            return 0;
        }

        let score = 0;
        for (let i = 0; i < keys.length; i += 1) {
            const key = keys[i];
            if (actual[key] === expected[key]) {
                score += 1;
            }
        }

        return score / keys.length;
    }

    function classifyBuiltInLibras(landmarks) {
        const fingers = computeFingerExtensions(landmarks);
        const open = fingers.open;
        const closed = fingers.closed;
        const semi = fingers.semi;
        const ext = fingers.ext;
        const tipDirY = fingers.tipDirY;
        const candidates = [];

        const addCandidate = (label, pattern, bonus = 0, gate = true) => {
            if (!gate) {
                return;
            }
            const base = scorePattern(open, pattern);
            candidates.push({ label, score: clamp(base + bonus, 0, 1) });
        };

        const addDirect = (label, score, gate = true) => {
            if (!gate) {
                return;
            }
            candidates.push({ label, score: clamp(score, 0, 1) });
        };

        const closedFour = closed.index && closed.middle && closed.ring && closed.pinky;
        const closedThree = closed.middle && closed.ring && closed.pinky;
        const twoFingerChord = open.index && open.middle && !open.ring && !open.pinky;

        addCandidate("A", { thumb: true, index: false, middle: false, ring: false, pinky: false }, ext.index < 0.08 && ext.middle < 0.08 ? 0.17 : 0);
        addCandidate("B", { thumb: false, index: true, middle: true, ring: true, pinky: true }, fingers.thumbIndexDist > 0.5 ? 0.16 : 0);
        addCandidate("C", { thumb: true, index: true, middle: true, ring: true, pinky: true }, fingers.thumbIndexDist > 0.24 && fingers.thumbIndexDist < 0.56 ? 0.14 : 0);
        addCandidate("D", { thumb: false, index: true, middle: false, ring: false, pinky: false }, ext.middle < 0.08 && ext.ring < 0.08 ? 0.17 : 0);
        addCandidate("E", { thumb: false, index: false, middle: false, ring: false, pinky: false }, fingers.thumbIndexDist < 0.43 && ext.thumb < 0.2 ? 0.16 : 0);
        addCandidate("F", { thumb: false, index: false, middle: true, ring: true, pinky: true }, fingers.thumbIndexDist < 0.32 ? 0.2 : 0);
        addCandidate("I", { thumb: false, index: false, middle: false, ring: false, pinky: true }, ext.index < 0.08 ? 0.15 : 0);
        addCandidate("L", { thumb: true, index: true, middle: false, ring: false, pinky: false }, fingers.thumbIndexDist > 0.44 && tipDirY.index < -0.12 ? 0.2 : 0);
        addCandidate("O", { thumb: false, index: false, middle: false, ring: false, pinky: false }, fingers.thumbIndexDist < 0.27 ? 0.24 : 0);
        addCandidate("S", { thumb: false, index: false, middle: false, ring: false, pinky: false }, ext.thumb > 0.18 && fingers.thumbIndexDist > 0.28 && fingers.thumbIndexDist < 0.5 ? 0.18 : 0);
        addCandidate("T", { thumb: false, index: false, middle: false, ring: false, pinky: false }, fingers.thumbIndexDist < 0.3 && fingers.thumbMiddleDist < 0.33 && ext.thumb > 0.15 ? 0.18 : 0);
        addCandidate("M", { thumb: false, index: false, middle: false, ring: false, pinky: false }, closedFour && fingers.thumbRingDist < 0.42 && fingers.thumbPinkyDist < 0.45 ? 0.19 : 0);
        addCandidate("N", { thumb: false, index: false, middle: false, ring: false, pinky: false }, closedFour && fingers.thumbMiddleDist < 0.41 && fingers.thumbRingDist > 0.38 ? 0.17 : 0);

        addCandidate("R", { thumb: false, index: true, middle: true, ring: false, pinky: false }, fingers.indexMiddleDist < 0.12 ? 0.2 : 0, twoFingerChord);
        addCandidate("U", { thumb: false, index: true, middle: true, ring: false, pinky: false }, fingers.indexMiddleDist >= 0.12 && fingers.indexMiddleDist < 0.2 ? 0.17 : 0, twoFingerChord);
        addCandidate("V", { thumb: false, index: true, middle: true, ring: false, pinky: false }, fingers.indexMiddleDist >= 0.2 && fingers.indexMiddleDist < 0.32 ? 0.19 : 0, twoFingerChord);
        addCandidate("H", { thumb: false, index: true, middle: true, ring: false, pinky: false }, fingers.indexMiddleDist >= 0.32 ? 0.16 : 0, twoFingerChord);
        addCandidate("K", { thumb: true, index: true, middle: true, ring: false, pinky: false }, fingers.thumbMiddleDist < 0.4 && fingers.indexMiddleDist >= 0.16 ? 0.2 : 0);
        addCandidate("P", { thumb: true, index: true, middle: true, ring: false, pinky: false }, tipDirY.index > 0.1 && tipDirY.middle > 0.08 ? 0.2 : 0);
        addCandidate("W", { thumb: false, index: true, middle: true, ring: true, pinky: false }, ext.ring > 0.12 ? 0.16 : 0);
        addCandidate("Y", { thumb: true, index: false, middle: false, ring: false, pinky: true }, ext.index < 0.08 && ext.middle < 0.08 ? 0.17 : 0);
        addCandidate("G", { thumb: true, index: true, middle: false, ring: false, pinky: false }, closedThree && tipDirY.index > -0.06 && tipDirY.index < 0.14 && fingers.thumbIndexDist > 0.28 ? 0.17 : 0);
        addCandidate("Q", { thumb: true, index: true, middle: false, ring: false, pinky: false }, closedThree && tipDirY.index > 0.14 ? 0.17 : 0);
        addCandidate("X", { thumb: false, index: false, middle: false, ring: false, pinky: false }, semi.index && closed.middle && closed.ring && closed.pinky && ext.index > 0.04 ? 0.2 : 0);

        addDirect("U", 0.9, twoFingerChord && fingers.indexMiddleDist >= 0.12 && fingers.indexMiddleDist < 0.2 && fingers.thumbIndexDist > 0.34);
        addDirect("V", 0.92, twoFingerChord && fingers.indexMiddleDist >= 0.2 && fingers.indexMiddleDist < 0.32 && fingers.thumbIndexDist > 0.34);
        addDirect("R", 0.93, twoFingerChord && fingers.indexMiddleDist < 0.12);
        addDirect("X", 0.9, semi.index && closed.middle && closed.ring && closed.pinky && !open.index);

        candidates.sort((a, b) => b.score - a.score);
        const best = candidates[0];
        const second = candidates[1] ? candidates[1].score : 0;

        if (!best) {
            return { label: "", score: 0, source: "builtin" };
        }

        const margin = best.score - second;
        const minMargin = best.score >= 0.9 ? 0.035 : 0.07;

        if (best.score < 0.74 || margin < minMargin) {
            return { label: "", score: best.score, source: "builtin" };
        }

        return {
            label: best.label,
            score: best.score,
            source: "builtin"
        };
    }

    function createEmbedding(landmarks, handednessLabel = "Right") {
        const wrist = landmarks[0];
        const palmScale = getPalmScale(landmarks);
        const indices = [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 12, 13, 14, 16, 17, 18, 20];
        const mirror = handednessLabel === "Left" ? -1 : 1;

        if (!wrist) {
            return [];
        }

        const embedding = [];
        for (let i = 0; i < indices.length; i += 1) {
            const point = landmarks[indices[i]];
            if (!point) {
                embedding.push(0, 0);
                continue;
            }

            const nx = ((point.x - wrist.x) / Math.max(palmScale, 0.0001)) * mirror;
            const ny = (point.y - wrist.y) / Math.max(palmScale, 0.0001);
            embedding.push(nx, ny);
        }

        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];
        const middleTip = landmarks[12];
        const pinkyTip = landmarks[20];

        const thumbIndex = thumbTip && indexTip ? distanceBetween(thumbTip, indexTip) / Math.max(palmScale, 0.0001) : 0;
        const indexMiddle = indexTip && middleTip ? distanceBetween(indexTip, middleTip) / Math.max(palmScale, 0.0001) : 0;
        const thumbPinky = thumbTip && pinkyTip ? distanceBetween(thumbTip, pinkyTip) / Math.max(palmScale, 0.0001) : 0;

        embedding.push(thumbIndex, indexMiddle, thumbPinky);
        return embedding;
    }

    function averageEmbedding(samples) {
        if (!samples.length) {
            return [];
        }

        const size = samples[0].length;
        const sum = new Array(size).fill(0);

        for (let i = 0; i < samples.length; i += 1) {
            const vector = samples[i];
            for (let j = 0; j < size; j += 1) {
                sum[j] += vector[j] || 0;
            }
        }

        return sum.map((value) => value / samples.length);
    }

    function embeddingDistance(a, b) {
        if (!a.length || !b.length || a.length !== b.length) {
            return Number.POSITIVE_INFINITY;
        }

        let total = 0;
        for (let i = 0; i < a.length; i += 1) {
            const diff = a[i] - b[i];
            total += diff * diff;
        }

        return Math.sqrt(total / a.length);
    }

    function matchTemplate(embedding) {
        if (!state.templates.length || !embedding.length) {
            return { label: "", score: 0, source: "template" };
        }

        let best = { label: "", score: 0, distance: Number.POSITIVE_INFINITY };

        for (let i = 0; i < state.templates.length; i += 1) {
            const template = state.templates[i];
            const distance = embeddingDistance(embedding, template.embedding);
            if (!Number.isFinite(distance)) {
                continue;
            }

            const score = clamp(1 - distance / 0.62, 0, 1);
            if (score > best.score) {
                best = { label: template.label, score, distance };
            }
        }

        if (best.score < 0.72) {
            return { label: "", score: best.score, source: "template" };
        }

        return {
            label: best.label,
            score: best.score,
            source: "template"
        };
    }

    function choosePrediction(builtin, template) {
        if (template.label && builtin.label && template.label === builtin.label) {
            return {
                label: template.label,
                score: clamp(template.score * 0.55 + builtin.score * 0.45 + 0.06, 0, 1),
                source: "hybrid"
            };
        }

        if (template.label && template.score >= builtin.score + 0.05) {
            return template;
        }

        if (builtin.label && builtin.score >= template.score + 0.02) {
            return builtin;
        }

        if (builtin.label && template.label) {
            return {
                label: "",
                score: Math.max(builtin.score, template.score) * 0.72,
                source: "ambiguous"
            };
        }

        if (template.label) {
            return template;
        }

        return { label: "", score: Math.max(builtin.score, template.score), source: "none" };
    }

    function appendPrediction(label, score, now) {
        state.predictions.push({ label, score, t: now });
        state.predictions = state.predictions.filter((entry) => now - entry.t <= config.consensusWindowMs);
    }

    function getConsensus(now) {
        state.predictions = state.predictions.filter((entry) => now - entry.t <= config.consensusWindowMs);

        if (!state.predictions.length) {
            return { label: "", score: 0 };
        }

        const weighted = new Map();
        let totalWeight = 0;

        for (let i = 0; i < state.predictions.length; i += 1) {
            const item = state.predictions[i];
            if (!item.label || item.score < 0.52) {
                continue;
            }
            const w = Math.pow(clamp(item.score, 0.2, 1.3), 1.6);
            totalWeight += w;
            const current = weighted.get(item.label) || { weight: 0, count: 0 };
            weighted.set(item.label, {
                weight: current.weight + w,
                count: current.count + 1
            });
        }

        if (!weighted.size || totalWeight <= 0) {
            return { label: "", score: 0 };
        }

        let bestLabel = "";
        let bestWeight = 0;
        let bestCount = 0;

        for (const [label, bucket] of weighted.entries()) {
            if (bucket.weight > bestWeight) {
                bestLabel = label;
                bestWeight = bucket.weight;
                bestCount = bucket.count;
            }
        }

        const consensusScore = clamp(bestWeight / totalWeight, 0, 1);
        if (bestCount < 2 && consensusScore < 0.74) {
            return { label: "", score: consensusScore };
        }

        return {
            label: bestLabel,
            score: consensusScore
        };
    }

    function commitLabel(label) {
        const normalized = normalizeLabel(label);
        if (!normalized) {
            return false;
        }

        if (normalized === "ESPACO" || normalized === "SPACE") {
            insertSpace();
            return true;
        }

        if (normalized === "APAGAR" || normalized === "BACKSPACE") {
            backspaceTranscript();
            return true;
        }

        if (normalized.length === 1 && /[A-Z0-9]/.test(normalized)) {
            state.transcript += normalized;
            saveTranscript();
            renderOutput();
            renderSuggestions();
            addEffectPulse(window.innerWidth * 0.55, 120, "rgba(11, 127, 114, 0.75)");
            // Feature 7: Confetti no commit de letra
            spawnConfetti(window.innerWidth * 0.55, 120);
            return true;
        }

        if (normalized.length > 1 && normalized.length <= 24) {
            if (state.transcript && !state.transcript.endsWith(" ")) {
                state.transcript += " ";
            }
            state.transcript += normalized;
            saveTranscript();
            renderOutput();
            renderSuggestions();
            addEffectPulse(window.innerWidth * 0.55, 120, "rgba(240, 138, 75, 0.75)");
            return true;
        }

        return false;
    }

    function insertSpace() {
        if (!state.transcript || state.transcript.endsWith(" ")) {
            return;
        }

        // Feature 6: Salva palavra no histórico antes de adicionar espaço
        const lastWord = state.transcript.trim().split(" ").pop();
        addWordToHistory(lastWord);

        state.transcript += " ";
        saveTranscript();
        renderOutput();
        renderSuggestions();
        pushLog("Espaco inserido.", "info");
    }

    function backspaceTranscript() {
        if (!state.transcript) {
            return;
        }

        state.transcript = state.transcript.slice(0, -1);
        saveTranscript();
        renderOutput();
        renderSuggestions();
        pushLog("Ultimo caractere removido.", "info");
    }

    function clearTranscript() {
        state.transcript = "";
        saveTranscript();
        renderOutput();
        renderSuggestions();
        pushLog("Frase resetada.", "warn");
    }

    async function copyTranscript() {
        if (!state.transcript) {
            showToast("Nada para copiar");
            return;
        }

        try {
            await navigator.clipboard.writeText(state.transcript);
            showToast("Frase copiada");
            pushLog("Frase copiada para area de transferencia.", "success");
        } catch {
            showToast("Falha ao copiar");
        }
    }

    function exportTranscript() {
        if (!state.transcript) {
            showToast("Nada para exportar");
            return;
        }

        const content = [
            "VisionFlow Libras - Exportacao",
            `Gerado em: ${new Date().toLocaleString("pt-BR")}`,
            "",
            state.transcript
        ].join("\n");

        const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `visionflow-libras-${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast("Arquivo exportado");
        pushLog("Frase exportada em TXT.", "success");
    }

    function updateTemplateStatus(message) {
        if (dom.templateStatus) {
            dom.templateStatus.textContent = message;
        }
    }

    function renderTemplates() {
        if (!dom.templateList) {
            return;
        }

        dom.templateList.innerHTML = "";

        if (!state.templates.length) {
            const li = document.createElement("li");
            li.className = "template-item";
            li.innerHTML = "<div><strong>Nenhum template salvo</strong><small>Grave sinais personalizados para ampliar cobertura.</small></div>";
            dom.templateList.appendChild(li);
            return;
        }

        for (let i = 0; i < state.templates.length; i += 1) {
            const item = state.templates[i];
            const li = document.createElement("li");
            li.className = "template-item";

            const info = document.createElement("div");
            const created = new Date(item.createdAt).toLocaleDateString("pt-BR");
            info.innerHTML = `<strong>${item.label}</strong><small>${item.sampleCount} frames · ${created}</small>`;

            const removeBtn = document.createElement("button");
            removeBtn.className = "mini";
            removeBtn.type = "button";
            removeBtn.textContent = "Excluir";
            removeBtn.addEventListener("click", () => {
                state.templates = state.templates.filter((entry) => entry.id !== item.id);
                saveTemplates();
                renderTemplates();
                pushLog(`Template ${item.label} removido.`, "warn");
                showToast(`Template ${item.label} removido`);
            });

            li.appendChild(info);
            li.appendChild(removeBtn);
            dom.templateList.appendChild(li);
        }
    }

    function startTemplateRecording() {
        if (!state.cameraRunning || !state.handVisible) {
            showToast("Ative a camera e posicione a mao antes de gravar");
            return;
        }

        const label = normalizeLabel(dom.customLabelInput ? dom.customLabelInput.value : "");
        if (!label) {
            showToast("Digite o rotulo do sinal");
            return;
        }

        state.recording.active = true;
        state.recording.label = label;
        state.recording.startedAt = performance.now();
        state.recording.samples = [];
        state.recording.pendingTemplate = null;

        if (dom.recordTemplateBtn) {
            dom.recordTemplateBtn.textContent = "Parar captura";
        }

        updateTemplateStatus(`Capturando sinal ${label}... mantenha a mao estavel.`);
        pushLog(`Captura iniciada para ${label}.`, "info");
    }

    function stopTemplateRecording(autoStop = false) {
        if (!state.recording.active) {
            return;
        }

        state.recording.active = false;
        if (dom.recordTemplateBtn) {
            dom.recordTemplateBtn.textContent = "Iniciar captura";
        }

        const samples = state.recording.samples;
        if (samples.length < config.templateMinFrames) {
            updateTemplateStatus("Captura curta. Grave novamente com mais estabilidade.");
            showToast("Poucos frames capturados");
            state.recording.samples = [];
            return;
        }

        const embedding = averageEmbedding(samples);
        state.recording.pendingTemplate = {
            id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            label: state.recording.label,
            embedding,
            createdAt: Date.now(),
            sampleCount: samples.length
        };

        updateTemplateStatus(`Captura pronta para ${state.recording.label}. Clique em Salvar template.`);
        showToast(autoStop ? "Captura finalizada automaticamente" : "Captura finalizada");
        pushLog(`Captura concluida para ${state.recording.label} com ${samples.length} frames.`, "success");
    }

    function savePendingTemplate() {
        const pending = state.recording.pendingTemplate;
        if (!pending) {
            showToast("Nenhuma captura pronta para salvar");
            return;
        }

        state.templates = state.templates.filter((item) => item.label !== pending.label);
        state.templates.push(pending);
        state.templates.sort((a, b) => a.label.localeCompare(b.label));
        saveTemplates();
        renderTemplates();

        updateTemplateStatus(`Template ${pending.label} salvo com sucesso.`);
        pushLog(`Template ${pending.label} salvo.`, "success");
        showToast(`Template ${pending.label} salvo`);

        state.recording.pendingTemplate = null;
    }

    function clearAllTemplates() {
        if (!state.templates.length) {
            showToast("Nao ha templates para limpar");
            return;
        }

        const confirmClear = window.confirm("Deseja remover todos os templates personalizados?");
        if (!confirmClear) {
            return;
        }

        state.templates = [];
        state.recording.pendingTemplate = null;
        saveTemplates();
        renderTemplates();
        updateTemplateStatus("Todos os templates foram removidos.");
        pushLog("Todos os templates personalizados foram removidos.", "warn");
        showToast("Templates removidos");
    }

    function processRecordingFrame(embedding, now) {
        if (!state.recording.active) {
            return;
        }

        if (!embedding.length) {
            return;
        }

        state.recording.samples.push(embedding);

        const elapsed = now - state.recording.startedAt;
        if (state.recording.samples.length >= config.templateMaxFrames || elapsed >= config.templateRecordingMaxMs) {
            stopTemplateRecording(true);
            return;
        }

        updateTemplateStatus(
            `Capturando ${state.recording.label}: ${state.recording.samples.length} frames (${Math.round(elapsed)}ms).`
        );
    }

    function resetRecognitionState() {
        state.currentLabel = "";
        state.currentScore = 0;
        state.stableLabel = "";
        state.stableSince = 0;
        state.predictions = [];
        state.previousLandmarks = null;
        state.motionEma = 0;
        state.quality = 0;
        updateLiveRecognitionUI("", 0);
        updateQualityText();
    }

    function processRecognitionFrame(rawLandmarks, handednessLabel, now) {
        const smoothed = smoothLandmarks(rawLandmarks);

        const builtin = classifyBuiltInLibras(smoothed);
        const embedding = createEmbedding(smoothed, handednessLabel);
        processRecordingFrame(embedding, now);

        const template = matchTemplate(embedding);
        const chosen = choosePrediction(builtin, template);

        const qualityFactor = 0.72 + state.quality * 0.28;
        let filteredLabel = chosen.label;
        let filteredScore = clamp(chosen.score * qualityFactor, 0, 1);

        if (state.quality < 0.22 && filteredScore < 0.88) {
            filteredLabel = "";
            filteredScore *= 0.65;
        }

        state.currentLabel = filteredLabel;
        state.currentScore = filteredScore;
        updateLiveRecognitionUI(filteredLabel, filteredScore);
        updateQualityText();

        appendPrediction(filteredLabel, filteredScore, now);
        const consensus = getConsensus(now);

        if (consensus.label !== state.stableLabel) {
            state.stableLabel = consensus.label;
            state.stableSince = now;
        }

        const hasStableLabel = Boolean(state.stableLabel);
        const stableEnough = hasStableLabel && now - state.stableSince >= config.stabilityMs;
        const confidenceEnough = consensus.score >= config.confidenceThreshold;
        const cooldownDone = now - state.lastCommitAt >= config.cooldownMs;

        if (stableEnough && confidenceEnough && cooldownDone) {
            const committed = commitLabel(state.stableLabel);
            if (committed) {
                state.lastCommitAt = now;
                pushLog(`Sinal confirmado: ${state.stableLabel} (${Math.round(consensus.score * 100)}%).`, "success");
                showToast(`Sinal: ${state.stableLabel}`);
                renderSuggestions();
            }
            state.predictions = [];
            state.stableLabel = "";
            state.stableSince = now;
        }

        if (dom.engineStatus) {
            dom.engineStatus.textContent = hasStableLabel
                ? `Interpretando ${state.currentLabel || "..."}`
                : "Aguardando estabilidade";
            dom.engineStatus.classList.remove("detectado", "perdido");
            dom.engineStatus.classList.add(hasStableLabel ? "detectado" : "perdido");
        }

        drawLandmarks(smoothed);
    }

    async function startCamera() {
        if (!state.consentAccepted) {
            openConsentModal();
            return;
        }

        if (state.cameraRunning) {
            return;
        }

        if (typeof Hands !== "function" || typeof Camera !== "function") {
            setStatusText(dom.cameraStatus, "Bibliotecas ausentes", "perdido");
            setStatusText(dom.engineStatus, "Nao foi possivel iniciar", "perdido");
            showToast("Falha ao carregar MediaPipe");
            return;
        }

        const hands = new Hands({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });

        hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: config.minDetectionConfidence,
            minTrackingConfidence: config.minTrackingConfidence,
            staticImageMode: false
        });

        hands.onResults((results) => {
            const now = performance.now();
            const hasHand = Boolean(results.multiHandLandmarks && results.multiHandLandmarks.length > 0);
            const handedness = results.multiHandedness && results.multiHandedness[0] && results.multiHandedness[0].label
                ? results.multiHandedness[0].label
                : "Right";

            if (hasHand) {
                state.framesWithoutHand = 0;
                if (!state.handVisible) {
                    state.handVisible = true;
                    setStatusText(dom.handStatus, "Detectada", "detectado");
                    pushLog("Mao detectada, reconhecimento iniciado.", "info");
                }
                processRecognitionFrame(results.multiHandLandmarks[0], handedness, now);
                return;
            }

            state.framesWithoutHand += 1;
            if (state.framesWithoutHand > config.handLossGraceFrames && state.handVisible) {
                state.handVisible = false;
                setStatusText(dom.handStatus, "Nao detectada", "perdido");
                if (dom.engineStatus) {
                    setStatusText(dom.engineStatus, "Aguardando mao", "perdido");
                }
                resetRecognitionState();
                clearLandmarks();
                pushLog("Mao fora de quadro.", "warn");
            }
        });

        const camera = new Camera(dom.video, {
            width: 960,
            height: 720,
            onFrame: async () => {
                const now = performance.now();

                // ────────────────────────────────────────────────────
                // OTIMIZAÇÃO 2 — Throttle de FPS
                // Frames intermediários são simplesmente descartados.
                // O modelo roda a no máximo 20 FPS, poupando ciclos de CPU
                // que seriam desperdiçados em frames que não agregam valor.
                // ────────────────────────────────────────────────────
                if (librasSending || now - librasLastSentAt < LIBRAS_MIN_INTERVAL_MS) {
                    return; // frame descartado — throttle ativo
                }

                // ────────────────────────────────────────────────────
                // OTIMIZAÇÃO 1b — Redimensionamento do frame
                // O frame do vídeo (960×720) é desenhado em escala 480×360.
                // Isso reduz em 75% o número de pixels processados pelo WASM.
                // ────────────────────────────────────────────────────
                librasOffscreenCtx.drawImage(dom.video, 0, 0, LIBRAS_OFFSCREEN_W, LIBRAS_OFFSCREEN_H);

                librasSending = true;
                librasLastSentAt = now;
                try {
                    // Enviamos o canvas redimensionado, não o vídeo bruto
                    await hands.send({ image: librasOffscreenCanvas });
                } finally {
                    // ──────────────────────────────────────────────────
                    // OTIMIZAÇÃO 3 — Gerenciamento de memória
                    // finally garante liberação mesmo em caso de exceção.
                    // clearRect limpa o framebuffer do canvas offscreen para
                    // que o garbage collector recupere a memória alocada.
                    // ──────────────────────────────────────────────────
                    librasSending = false;
                    librasOffscreenCtx.clearRect(0, 0, LIBRAS_OFFSCREEN_W, LIBRAS_OFFSCREEN_H);
                }
            }
        });

        try {
            await camera.start();
            state.cameraRunning = true;
            state.cameraInstance = camera;
            state.handsInstance = hands;
            state.framesWithoutHand = 0;
            setStatusText(dom.cameraStatus, "Ativa", "detectado");
            setStatusText(dom.engineStatus, "Aguardando mao", "perdido");
            updateCameraButtonLabel();
            showToast("Camera iniciada");
            pushLog("Camera iniciada com sucesso.", "success");
        } catch {
            state.cameraRunning = false;
            state.cameraInstance = null;
            state.handsInstance = null;
            setStatusText(dom.cameraStatus, "Sem permissao", "perdido");
            setStatusText(dom.engineStatus, "Erro de inicializacao", "perdido");
            updateCameraButtonLabel();
            showToast("Sem permissao de camera");
            pushLog("Falha ao iniciar camera.", "warn");
        }
    }

    function stopCamera(reason = "Camera parada") {
        if (state.cameraInstance && typeof state.cameraInstance.stop === "function") {
            try {
                state.cameraInstance.stop();
            } catch {
                return;
            }
        }

        state.cameraRunning = false;
        state.cameraInstance = null;
        state.handsInstance = null;
        state.handVisible = false;
        state.framesWithoutHand = 0;
        clearLandmarks();
        resetRecognitionState();

        setStatusText(dom.cameraStatus, "Desligada", "perdido");
        setStatusText(dom.handStatus, "Nao detectada", "perdido");
        setStatusText(dom.engineStatus, "Pausado", "perdido");
        updateCameraButtonLabel();

        if (state.recording.active) {
            stopTemplateRecording(true);
        }

        showToast(reason);
        pushLog(reason, "warn");
    }

    function toggleCameraFlow() {
        if (state.cameraRunning) {
            stopCamera();
            return;
        }

        startCamera();
    }

    function openConsentModal() {
        if (dom.consentModal) {
            dom.consentModal.classList.remove("hidden");
        }
    }

    function closeConsentModal() {
        if (dom.consentModal) {
            dom.consentModal.classList.add("hidden");
        }
    }

    function bindSettingsEvents() {
        if (dom.sliderStability) {
            dom.sliderStability.addEventListener("input", (event) => {
                config.stabilityMs = clamp(Number(event.target.value), 320, 1400);
                if (dom.valueStability) {
                    dom.valueStability.textContent = `${Math.round(config.stabilityMs)}ms`;
                }
                saveSettings();
            });
        }

        if (dom.sliderConfidence) {
            dom.sliderConfidence.addEventListener("input", (event) => {
                config.confidenceThreshold = clamp(Number(event.target.value) / 100, 0.5, 0.96);
                if (dom.valueConfidence) {
                    dom.valueConfidence.textContent = `${Math.round(config.confidenceThreshold * 100)}%`;
                }
                saveSettings();
            });
        }

        if (dom.sliderCooldown) {
            dom.sliderCooldown.addEventListener("input", (event) => {
                config.cooldownMs = clamp(Number(event.target.value), 220, 1200);
                if (dom.valueCooldown) {
                    dom.valueCooldown.textContent = `${Math.round(config.cooldownMs)}ms`;
                }
                saveSettings();
            });
        }

        if (dom.sliderSmoothing) {
            dom.sliderSmoothing.addEventListener("input", (event) => {
                config.smoothingAlpha = clamp(Number(event.target.value), 0.35, 0.9);
                if (dom.valueSmoothing) {
                    dom.valueSmoothing.textContent = config.smoothingAlpha.toFixed(2);
                }
                saveSettings();
            });
        }
    }

    function bindTemplateEvents() {
        if (dom.recordTemplateBtn) {
            dom.recordTemplateBtn.addEventListener("click", () => {
                if (state.recording.active) {
                    stopTemplateRecording(false);
                    return;
                }
                startTemplateRecording();
            });
        }

        if (dom.saveTemplateBtn) {
            dom.saveTemplateBtn.addEventListener("click", () => {
                savePendingTemplate();
            });
        }

        if (dom.clearTemplatesBtn) {
            dom.clearTemplatesBtn.addEventListener("click", () => {
                clearAllTemplates();
            });
        }
    }

    function bindComposerEvents() {
        if (dom.actionSpaceBtn) {
            dom.actionSpaceBtn.addEventListener("click", () => {
                insertSpace();
            });
        }

        if (dom.actionBackspaceBtn) {
            dom.actionBackspaceBtn.addEventListener("click", () => {
                backspaceTranscript();
            });
        }

        if (dom.actionClearBtn) {
            dom.actionClearBtn.addEventListener("click", () => {
                clearTranscript();
            });
        }

        if (dom.actionCopyBtn) {
            dom.actionCopyBtn.addEventListener("click", () => {
                copyTranscript();
            });
        }

        if (dom.actionExportBtn) {
            dom.actionExportBtn.addEventListener("click", () => {
                exportTranscript();
            });
        }
    }

    function bindCoreEvents() {
        if (dom.acceptConsentBtn) {
            dom.acceptConsentBtn.addEventListener("click", () => {
                state.consentAccepted = true;
                closeConsentModal();
                startCamera();
            });
        }

        if (dom.denyConsentBtn) {
            dom.denyConsentBtn.addEventListener("click", () => {
                state.consentAccepted = false;
                closeConsentModal();
                stopCamera("Modo sem camera ativo");
            });
        }

        if (dom.toggleCameraBtn) {
            dom.toggleCameraBtn.addEventListener("click", () => {
                toggleCameraFlow();
            });
        }

        if (dom.toggleLandmarksBtn) {
            dom.toggleLandmarksBtn.addEventListener("click", () => {
                setLandmarksVisibility(!state.showLandmarks);
                showToast(state.showLandmarks ? "Landmarks ligados" : "Landmarks desligados");
            });
        }

        if (dom.toggleContrastBtn) {
            dom.toggleContrastBtn.addEventListener("click", () => {
                setContrast(!state.highContrast);
                showToast(state.highContrast ? "Contraste alto ligado" : "Contraste alto desligado");
            });
        }

        if (dom.resetSessionBtn) {
            dom.resetSessionBtn.addEventListener("click", () => {
                const wasRunning = state.cameraRunning;
                clearTranscript();
                resetRecognitionState();
                state.recording.pendingTemplate = null;
                updateTemplateStatus("Sessao resetada.");
                if (wasRunning) {
                    pushLog("Sessao de Libras resetada com camera ativa.", "warn");
                } else {
                    pushLog("Sessao de Libras resetada.", "warn");
                }
                showToast("Sessao resetada");
            });
        }

        window.addEventListener("resize", () => {
            setCanvasSize();
        });

        window.addEventListener("keydown", (event) => {
            const target = event.target;
            const inInput = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
            if (inInput) {
                return;
            }

            const key = event.key.toLowerCase();
            if (!event.altKey) {
                return;
            }

            if (key === "s") {
                event.preventDefault();
                insertSpace();
            }

            if (key === "b") {
                event.preventDefault();
                backspaceTranscript();
            }

            if (key === "l") {
                event.preventDefault();
                setLandmarksVisibility(!state.showLandmarks);
                showToast(state.showLandmarks ? "Landmarks ligados" : "Landmarks desligados");
            }

            if (key === "r") {
                event.preventDefault();
                clearTranscript();
                showToast("Frase resetada");
            }

            if (key === "c") {
                event.preventDefault();
                setContrast(!state.highContrast);
                showToast(state.highContrast ? "Contraste alto ligado" : "Contraste alto desligado");
            }
        });
    }

    function initEffectsLoop() {
        let fpsFrames = 0;
        let fpsLastTick = performance.now();

        const loop = (now) => {
            drawEffects();
            fpsFrames++;
            if (now - fpsLastTick >= 1000) {
                updateFpsBadge(fpsFrames);
                fpsFrames = 0;
                fpsLastTick = now;
            }
            state.loopRafId = window.requestAnimationFrame(loop);
        };

        if (state.loopRafId) {
            window.cancelAnimationFrame(state.loopRafId);
        }

        state.loopRafId = window.requestAnimationFrame(loop);
    }

    function init() {
        loadSettings();
        loadTemplates();
        loadTranscript();

        setCanvasSize();
        syncSettingsUI();
        setLandmarksVisibility(state.showLandmarks);
        setContrast(state.highContrast);
        updateCameraButtonLabel();
        updateLandmarksButtonLabel();
        updateContrastButtonLabel();
        renderTemplates();
        renderOutput();
        renderSuggestions();
        updateLiveRecognitionUI("", 0);
        updateQualityText();

        setStatusText(dom.cameraStatus, "Desligada", "perdido");
        setStatusText(dom.handStatus, "Nao detectada", "perdido");
        setStatusText(dom.engineStatus, "Pronto para iniciar", "perdido");

        updateTemplateStatus("Nenhuma captura em andamento.");

        bindCoreEvents();
        bindSettingsEvents();
        bindTemplateEvents();
        bindComposerEvents();
        initEffectsLoop();

        // Inicializar Grid do Alfabeto (Feature 9: Clear Grid + Feature 8: Hover Sound)
        if (dom.visualGrid) {
            const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
            dom.visualGrid.innerHTML = "";
            alphabet.forEach(letter => {
                const div = document.createElement("div");
                div.className = "grid-key";
                div.id = `grid-key-${letter}`;
                div.textContent = letter;
                div.addEventListener("mouseenter", () => playGridHoverSound());
                dom.visualGrid.appendChild(div);
            });
        }

        // Feature 9: Botão Clear Grid
        if (dom.clearGridBtn) {
            dom.clearGridBtn.addEventListener("click", () => {
                clearGrid();
                showToast("Grid limpo");
            });
        }

        // Feature 6: Clear Word History
        if (dom.clearWordHistoryBtn) {
            dom.clearWordHistoryBtn.addEventListener("click", () => {
                wordHistory.length = 0;
                renderWordHistory();
                showToast("Histórico limpo");
            });
        }

        // Feature 9: Alt+G para limpar grid
        document.addEventListener("keydown", (e) => {
            if (e.altKey && e.key.toLowerCase() === "g") {
                e.preventDefault();
                clearGrid();
                showToast("Grid limpo");
            }
        });

        pushLog("Studio Libras inicializado.", "success");
        showToast("Studio Libras pronto");
    }

    init();
})();
