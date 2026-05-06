(() => {
    const dom = {
        video: document.getElementById("videoElement"),
        cursor: document.getElementById("cursor-virtual"),
        status: document.getElementById("status"),
        cameraStatus: document.getElementById("camera-status"),
        handStatus: document.getElementById("hand-status"),
        fallbackStatus: document.getElementById("fallback-status"),
        landmarkCanvas: document.getElementById("landmarkCanvas"),
        effectsCanvas: document.getElementById("effectsCanvas"),
        toast: document.getElementById("notification-toast"),
        consentModal: document.getElementById("consent-modal"),
        acceptConsentBtn: document.getElementById("accept-consent"),
        denyConsentBtn: document.getElementById("deny-consent"),
        toggleCameraBtn: document.getElementById("toggle-camera"),
        toggleLandmarksBtn: document.getElementById("toggle-landmarks"),
        sliderSmoothing: document.getElementById("slider-smoothing"),
        sliderPinch: document.getElementById("slider-pinch"),
        sliderScroll: document.getElementById("slider-scroll"),
        valueSmoothing: document.getElementById("value-smoothing"),
        valuePinch: document.getElementById("value-pinch"),
        valueScroll: document.getElementById("value-scroll"),
        cursorSpeed: document.getElementById("cursor-speed"),
        detectionConfidence: document.getElementById("detection-confidence"),
        totalClicks: document.getElementById("total-clicks"),
        totalScrolls: document.getElementById("total-scrolls"),
        handUptime: document.getElementById("hand-uptime"),
        fpsCounter: document.getElementById("fps-counter"),
        action1Btn: document.getElementById("btn-action-1"),
        action2Btn: document.getElementById("btn-action-2"),
        action3Btn: document.getElementById("btn-action-3")
    };

    if (!dom.video || !dom.cursor || !dom.status || !dom.cameraStatus || !dom.handStatus || !dom.fallbackStatus) {
        return;
    }

    const localStorageKey = "visionflow-lite-settings-v1";

    // ─────────────────────────────────────────────────────────────────────────
    // OTIMIZAÇÃO 1 — Canvas com { willReadFrequently: true }
    // Quando o navegador sabe que leremos pixels do canvas com frequência
    // (getImageData), ele mantém o buffer na CPU em vez da GPU,
    // evitando transferências lentas a cada frame.
    // ─────────────────────────────────────────────────────────────────────────
    const landmarkCtx = dom.landmarkCanvas
        ? dom.landmarkCanvas.getContext("2d", { willReadFrequently: true })
        : null;
    const effectsCtx = dom.effectsCanvas
        ? dom.effectsCanvas.getContext("2d", { willReadFrequently: true })
        : null;

    // ─────────────────────────────────────────────────────────────────────────
    // OTIMIZAÇÃO 1b — Canvas offscreen de baixa resolução para pré-processamento
    // Em vez de enviar o frame original (640×480) ao MediaPipe, desenhamos
    // primeiro em um canvas 320×240 (¼ dos pixels → ¼ da memória), aliviando
    // a leitura e transferência de dados da IA.
    // ─────────────────────────────────────────────────────────────────────────
    const OFFSCREEN_W = 320;
    const OFFSCREEN_H = 240;
    /** @type {HTMLCanvasElement} Canvas interno de baixa resolução. */
    const offscreenCanvas = document.createElement("canvas");
    offscreenCanvas.width  = OFFSCREEN_W;
    offscreenCanvas.height = OFFSCREEN_H;
    /** Contexto do canvas offscreen — também marcado willReadFrequently. */
    const offscreenCtx = offscreenCanvas.getContext("2d", { willReadFrequently: true });

    const HAND_CONNECTIONS = [
        [0, 1], [1, 2], [2, 3], [3, 4],
        [0, 5], [5, 6], [6, 7], [7, 8],
        [5, 9], [9, 10], [10, 11], [11, 12],
        [9, 13], [13, 14], [14, 15], [15, 16],
        [13, 17], [17, 18], [18, 19], [19, 20],
        [0, 17]
    ];

    const config = {
        smoothFactor: 0.24,
        maxAdaptiveSmooth: 0.58,
        pinchClose: 0.055,
        pinchOpenOffset: 0.022,
        pinchHoldMs: 48,
        pinchCooldownMs: 150,
        pinchEmaAlpha: 0.34,
        pinchReferenceSpan: 0.18,
        pinchScaleMin: 0.72,
        pinchScaleMax: 1.44,
        pinchClickMinGapMs: 42,
        pinchDepthWeight: 0.58,
        cameraWidth: 640,
        cameraHeight: 480,
        // ─────────────────────────────────────────────────────────────────
        // OTIMIZAÇÃO 2 — Frame Rate Throttling
        // maxProcessingFps limita quantas vezes por segundo enviamos um frame
        // ao modelo de IA. 20 FPS é suficiente para detecção fluida e reduz
        // o uso de CPU/GPU em ~50% comparado a 42 FPS.
        // ─────────────────────────────────────────────────────────────────
        maxProcessingFps: 20,
        scrollMaxSpeedPx: 16,
        scrollDeadZoneMin: 0.38,
        scrollDeadZoneMax: 0.62,
        scrollSmoothing: 0.18,
        handLossGraceFrames: 18,
        statsIntervalMs: 120,
        keyboardMoveSpeed: 11,
        sleepModeTimeoutMs: 10000,
        doublePinchMaxMs: 300
    };

    const state = {
        consentAccepted: false,
        cameraRunning: false,
        fallbackMode: true,
        showLandmarks: false,
        handVisible: false,
        framesWithoutHand: 0,
        pinchClosed: false,
        pinchClosedAt: 0,
        lastPinchAt: 0,
        pinchDistanceEma: 0,
        pinchTriggeredInCycle: false,
        lastPinchClickAt: 0,
        cursor: {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2
        },
        lastCursor: {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2
        },
        stats: {
            clicks: 0,
            scrolls: 0,
            confidence: 0,
            handStartAt: 0,
            cursorSpeed: 0,
            fps: 0
        },
        fps: {
            frames: 0,
            lastTick: performance.now()
        },
        scroll: {
            targetX: 0,
            targetY: 0,
            velocityX: 0,
            velocityY: 0,
            rafId: null,
            lastCountAt: 0
        },
        keyboard: {
            left: false,
            right: false,
            up: false,
            down: false
        },
        waves: [],
        pipeline: {
            sending: false,
            lastSentAt: 0,
            minIntervalMs: Math.round(1000 / config.maxProcessingFps)
        },
        cameraInstance: null,
        handsInstance: null,
        lastStatsAt: 0,
        lastActivityAt: performance.now()
    };

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    function playSound(type) {
        if (audioCtx.state === "suspended") audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        if (type === "click") {
            osc.type = "sine";
            osc.frequency.setValueAtTime(800, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.05);
            gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.1);
        } else if (type === "double-click") {
            osc.type = "square";
            osc.frequency.setValueAtTime(1000, audioCtx.currentTime);
            gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.15);
        }
    }

    function saveSettings() {
        try {
            localStorage.setItem(localStorageKey, JSON.stringify({
                smoothFactor: config.smoothFactor,
                pinchClose: config.pinchClose,
                scrollMaxSpeedPx: config.scrollMaxSpeedPx,
                showLandmarks: state.showLandmarks
            }));
        } catch {
            return;
        }
    }

    function loadSettings() {
        try {
            const raw = localStorage.getItem(localStorageKey);
            if (!raw) {
                return;
            }
            const settings = JSON.parse(raw);
            if (typeof settings.smoothFactor === "number") {
                config.smoothFactor = clamp(settings.smoothFactor, 0.12, 0.45);
            }
            if (typeof settings.pinchClose === "number") {
                config.pinchClose = clamp(settings.pinchClose, 0.035, 0.09);
            }
            if (typeof settings.scrollMaxSpeedPx === "number") {
                config.scrollMaxSpeedPx = clamp(settings.scrollMaxSpeedPx, 8, 30);
            }
            if (typeof settings.showLandmarks === "boolean") {
                state.showLandmarks = settings.showLandmarks;
            }
        } catch {
            return;
        }
    }

    function setCanvasSize() {
        if (dom.landmarkCanvas) {
            dom.landmarkCanvas.width = window.innerWidth;
            dom.landmarkCanvas.height = window.innerHeight;
        }
        if (dom.effectsCanvas) {
            dom.effectsCanvas.width = window.innerWidth;
            dom.effectsCanvas.height = window.innerHeight;
        }
    }

    function showNotification(message) {
        if (!dom.toast) {
            return;
        }
        dom.toast.textContent = message;
        dom.toast.style.display = "block";
        window.clearTimeout(showNotification.timer);
        showNotification.timer = window.setTimeout(() => {
            dom.toast.style.display = "none";
        }, 2200);
    }
    showNotification.timer = null;

    function setCameraStatus(text, tone) {
        dom.cameraStatus.textContent = text;
        dom.cameraStatus.classList.remove("detectado", "perdido");
        if (tone) {
            dom.cameraStatus.classList.add(tone);
        }
    }

    function setHandStatus(text, tone) {
        dom.handStatus.textContent = text;
        dom.handStatus.classList.remove("detectado", "perdido");
        if (tone) {
            dom.handStatus.classList.add(tone);
        }
    }

    function setFallbackMode(enabled) {
        state.fallbackMode = enabled;
        dom.fallbackStatus.textContent = enabled ? "Teclado ativo" : "Em espera";
        dom.fallbackStatus.classList.remove("detectado", "perdido");
        dom.fallbackStatus.classList.add(enabled ? "detectado" : "perdido");
    }

    function setLandmarksVisibility(enabled) {
        state.showLandmarks = enabled;
        if (dom.landmarkCanvas) {
            dom.landmarkCanvas.style.display = enabled ? "block" : "none";
        }
        if (!enabled) {
            clearLandmarks();
        }
        if (dom.toggleLandmarksBtn) {
            dom.toggleLandmarksBtn.textContent = enabled ? "Ocultar landmarks" : "Mostrar landmarks";
        }
        saveSettings();
    }

    function syncCalibrationUI() {
        if (dom.sliderSmoothing) {
            dom.sliderSmoothing.value = String(config.smoothFactor);
        }
        if (dom.sliderPinch) {
            dom.sliderPinch.value = String(config.pinchClose);
        }
        if (dom.sliderScroll) {
            dom.sliderScroll.value = String(config.scrollMaxSpeedPx);
        }
        if (dom.valueSmoothing) {
            dom.valueSmoothing.textContent = config.smoothFactor.toFixed(2);
        }
        if (dom.valuePinch) {
            dom.valuePinch.textContent = config.pinchClose.toFixed(3);
        }
        if (dom.valueScroll) {
            dom.valueScroll.textContent = String(Math.round(config.scrollMaxSpeedPx));
        }
    }

    function syncCameraButtonLabel() {
        if (!dom.toggleCameraBtn) {
            return;
        }
        dom.toggleCameraBtn.textContent = state.cameraRunning ? "Parar camera" : "Iniciar camera";
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

    function positionCursor(x, y) {
        state.cursor.x = clamp(x, 0, window.innerWidth);
        state.cursor.y = clamp(y, 0, window.innerHeight);
        dom.cursor.style.left = `${Math.round(state.cursor.x)}px`;
        dom.cursor.style.top = `${Math.round(state.cursor.y)}px`;

        // Aura: atualiza classe visual do cursor
        const isScrolling = Math.abs(state.scroll.velocityY) > 2 || Math.abs(state.scroll.velocityX) > 2;
        if (state.handVisible) {
            dom.cursor.classList.remove("tracking-low");
            if (isScrolling) {
                dom.cursor.classList.add("scroll-mode");
            } else {
                dom.cursor.classList.remove("scroll-mode");
            }
        } else {
            dom.cursor.classList.add("tracking-low");
            dom.cursor.classList.remove("scroll-mode");
        }
    }

    function addWave(x, y) {
        state.waves.push({ x, y, radius: 2, maxRadius: 72, opacity: 1 });
        if (state.waves.length > 6) {
            state.waves.shift();
        }
    }

    function drawEffects() {
        if (!effectsCtx || !dom.effectsCanvas) {
            return;
        }

        effectsCtx.clearRect(0, 0, dom.effectsCanvas.width, dom.effectsCanvas.height);

        for (let i = 0; i < state.waves.length; i += 1) {
            const wave = state.waves[i];
            wave.radius += 3.7;
            wave.opacity = 1 - wave.radius / wave.maxRadius;
            if (wave.opacity <= 0) {
                continue;
            }

            effectsCtx.strokeStyle = `rgba(244, 162, 97, ${wave.opacity})`;
            effectsCtx.lineWidth = 2;
            effectsCtx.beginPath();
            effectsCtx.arc(wave.x, wave.y, wave.radius, 0, Math.PI * 2);
            effectsCtx.stroke();
        }

        state.waves = state.waves.filter((wave) => wave.opacity > 0);
    }

    function clearLandmarks() {
        if (!landmarkCtx || !dom.landmarkCanvas) {
            return;
        }
        landmarkCtx.clearRect(0, 0, dom.landmarkCanvas.width, dom.landmarkCanvas.height);
    }

    function drawLandmarks(landmarks) {
        if (!state.showLandmarks || !landmarkCtx || !dom.landmarkCanvas) {
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
            landmarkCtx.strokeStyle = "rgba(31, 111, 120, 0.75)";
            landmarkCtx.lineWidth = 2;
            landmarkCtx.beginPath();
            landmarkCtx.moveTo(p1.x, p1.y);
            landmarkCtx.lineTo(p2.x, p2.y);
            landmarkCtx.stroke();
        }

        for (let i = 0; i < points.length; i += 1) {
            const p = points[i];
            landmarkCtx.fillStyle = i === 8 ? "rgba(244, 162, 97, 0.95)" : "rgba(31, 111, 120, 0.9)";
            landmarkCtx.beginPath();
            landmarkCtx.arc(p.x, p.y, i === 8 ? 5 : 3.2, 0, Math.PI * 2);
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
            return config.pinchReferenceSpan;
        }

        const horizontalSpan = distanceBetween(indexMcp, pinkyMcp);
        const verticalSpan = distanceBetween(wrist, middleMcp);
        return clamp(Math.max(horizontalSpan, verticalSpan, 0.08), 0.08, 0.34);
    }

    function getAdaptivePinchThresholds(landmarks) {
        const indexMcp = landmarks[5];
        const pinkyMcp = landmarks[17];
        const span = indexMcp && pinkyMcp
            ? distanceBetween(indexMcp, pinkyMcp)
            : config.pinchReferenceSpan;

        const scale = clamp(
            span / config.pinchReferenceSpan,
            config.pinchScaleMin,
            config.pinchScaleMax
        );

        const closeAbs = clamp(config.pinchClose * scale, 0.044, 0.096);
        const openAbs = clamp((config.pinchClose + config.pinchOpenOffset) * scale, closeAbs + 0.012, 0.128);

        const ratioBase = clamp((config.pinchClose / config.pinchReferenceSpan) * 1.28, 0.32, 0.5);
        const ratioClose = ratioBase;
        const ratioOpen = clamp(ratioClose + 0.15, ratioClose + 0.08, 0.72);

        return { closeAbs, openAbs, ratioClose, ratioOpen };
    }

    function smoothPinchDistance(rawDistance) {
        if (!state.pinchDistanceEma) {
            state.pinchDistanceEma = rawDistance;
            return rawDistance;
        }

        state.pinchDistanceEma = state.pinchDistanceEma + (rawDistance - state.pinchDistanceEma) * config.pinchEmaAlpha;
        return state.pinchDistanceEma;
    }

    function updateScrollTarget(indexY, palmY, indexX, palmX) {
        if (!Number.isFinite(indexY) || !Number.isFinite(palmY)) {
            state.scroll.targetY = 0;
            state.scroll.targetX = 0;
            return;
        }

        const controlY = indexY * 0.76 + palmY * 0.24;
        const controlX = indexX * 0.76 + palmX * 0.24;

        if (controlY < config.scrollDeadZoneMin) {
            state.scroll.targetY = -config.scrollMaxSpeedPx * clamp((config.scrollDeadZoneMin - controlY) / config.scrollDeadZoneMin, 0, 1);
        } else if (controlY > config.scrollDeadZoneMax) {
            state.scroll.targetY = config.scrollMaxSpeedPx * clamp((controlY - config.scrollDeadZoneMax) / (1 - config.scrollDeadZoneMax), 0, 1);
        } else {
            state.scroll.targetY = 0;
        }

        if (controlX < config.scrollDeadZoneMin) {
            state.scroll.targetX = -config.scrollMaxSpeedPx * clamp((config.scrollDeadZoneMin - controlX) / config.scrollDeadZoneMin, 0, 1);
        } else if (controlX > config.scrollDeadZoneMax) {
            state.scroll.targetX = config.scrollMaxSpeedPx * clamp((controlX - config.scrollDeadZoneMax) / (1 - config.scrollDeadZoneMax), 0, 1);
        } else {
            state.scroll.targetX = 0;
        }
    }

    function triggerClickAtCursor() {
        const pickElementNearCursor = () => {
            const offsets = [
                [0, 0],
                [10, 0],
                [-10, 0],
                [0, 10],
                [0, -10],
                [16, 8],
                [-16, 8],
                [16, -8],
                [-16, -8]
            ];

            for (let i = 0; i < offsets.length; i += 1) {
                const [ox, oy] = offsets[i];
                const x = clamp(state.cursor.x + ox, 0, window.innerWidth - 1);
                const y = clamp(state.cursor.y + oy, 0, window.innerHeight - 1);
                const candidate = document.elementFromPoint(x, y);
                if (candidate) {
                    return { el: candidate, x, y };
                }
            }

            return null;
        };

        const sampled = pickElementNearCursor();
        if (!sampled || !sampled.el) {
            return false;
        }

        const el = sampled.el;

        const rangeInput = el.closest("input[type='range']");
        if (rangeInput) {
            const rect = rangeInput.getBoundingClientRect();
            if (rect.width > 0) {
                const ratio = clamp((state.cursor.x - rect.left) / rect.width, 0, 1);
                const min = Number(rangeInput.min || 0);
                const max = Number(rangeInput.max || 100);
                const parsedStep = Number(rangeInput.step || 1);
                const step = Number.isFinite(parsedStep) && parsedStep > 0 ? parsedStep : 1;
                const value = min + ratio * (max - min);
                const roundedSteps = Math.round((value - min) / step);
                const snapped = clamp(min + roundedSteps * step, min, max);
                const decimals = step.toString().includes(".") ? step.toString().split(".")[1].length : 0;

                rangeInput.value = snapped.toFixed(decimals);
                rangeInput.dispatchEvent(new Event("input", { bubbles: true }));
                rangeInput.dispatchEvent(new Event("change", { bubbles: true }));
                return true;
            }
        }

        const clickable = el.closest("button, a, [role='button'], input[type='button'], input[type='submit']");
        if (!clickable) {
            return false;
        }

        if (typeof clickable.focus === "function") {
            clickable.focus({ preventScroll: true });
        }

        const clickEventInit = {
            bubbles: true,
            cancelable: true,
            clientX: sampled.x,
            clientY: sampled.y,
            view: window
        };

        clickable.dispatchEvent(new MouseEvent("mousedown", clickEventInit));
        clickable.dispatchEvent(new MouseEvent("mouseup", clickEventInit));
        clickable.dispatchEvent(new MouseEvent("click", clickEventInit));

        if (typeof clickable.click === "function") {
            clickable.click();
        }

        return true;
    }

    function handleClickFeedback(clicked, source, isDouble = false) {
        if (!clicked) {
            return;
        }

        state.stats.clicks += 1;
        dom.cursor.classList.add("clicando");
        addWave(state.cursor.x, state.cursor.y);
        
        if (isDouble) {
            playSound("double-click");
            showNotification("Double Pinch Realizado");
            addWave(state.cursor.x, state.cursor.y); // onda extra
        } else {
            playSound("click");
            if (source === "gesture") showNotification("Clique por gesto");
        }

        window.setTimeout(() => {
            dom.cursor.classList.remove("clicando");
        }, 140);
    }

    function processHandLandmarks(landmarks, now) {
        const indexTip = landmarks[8];
        const thumbTip = landmarks[4];
        const palmBase = landmarks[0];
        if (!indexTip || !thumbTip || !palmBase) {
            return;
        }

        const rawX = (1 - indexTip.x) * window.innerWidth;
        const rawY = indexTip.y * window.innerHeight;

        const cursorDelta = Math.hypot(rawX - state.cursor.x, rawY - state.cursor.y);
        const adaptiveSmooth = clamp(
            config.smoothFactor + cursorDelta / 900,
            config.smoothFactor,
            config.maxAdaptiveSmooth
        );

        positionCursor(
            state.cursor.x + (rawX - state.cursor.x) * adaptiveSmooth,
            state.cursor.y + (rawY - state.cursor.y) * adaptiveSmooth
        );

        const pinchDepth = ((indexTip.z || 0) - (thumbTip.z || 0)) * config.pinchDepthWeight;
        const pinchDistanceRaw = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y, pinchDepth);
        const pinchDistance = smoothPinchDistance(pinchDistanceRaw);
        const pinchThresholds = getAdaptivePinchThresholds(landmarks);
        const palmScale = getPalmScale(landmarks);
        const pinchRatio = pinchDistance / Math.max(palmScale, 0.0001);
        const pinchIsClose = pinchDistance <= pinchThresholds.closeAbs || pinchRatio <= pinchThresholds.ratioClose;
        const pinchIsOpen = pinchDistance >= pinchThresholds.openAbs || pinchRatio >= pinchThresholds.ratioOpen;
        const pinchCanReset = pinchIsOpen
            || pinchDistance >= pinchThresholds.closeAbs + 0.012
            || pinchRatio >= pinchThresholds.ratioClose + 0.08;

        if (pinchIsClose) {
            state.scroll.targetX = 0;
            state.scroll.targetY = 0;
            if (!state.pinchClosed) {
                state.pinchClosed = true;
                state.pinchClosedAt = now;
                state.pinchTriggeredInCycle = false;
            }

            const heldMs = now - state.pinchClosedAt;
            const canTriggerInCycle = !state.pinchTriggeredInCycle
                && heldMs >= config.pinchHoldMs
                && now - state.lastPinchAt >= config.pinchCooldownMs
                && now - state.lastPinchClickAt >= config.pinchClickMinGapMs;

            if (canTriggerInCycle) {
                const isDouble = (now - state.lastPinchClickAt < config.doublePinchMaxMs);
                const didClick = triggerClickAtCursor();
                if (didClick) {
                    state.lastPinchAt = now;
                    state.lastPinchClickAt = now;
                    state.pinchTriggeredInCycle = true;
                    handleClickFeedback(true, "gesture", isDouble);
                }
            }
        } else if (state.pinchClosed && pinchCanReset) {
            state.pinchClosed = false;
            state.pinchClosedAt = 0;
            state.pinchTriggeredInCycle = false;
        }

        if (!pinchIsClose) {
            updateScrollTarget(indexTip.y, palmBase.y, indexTip.x, palmBase.x);
        }

        drawLandmarks(landmarks);
    }

    function applyKeyboardMovement() {
        if (!state.fallbackMode) {
            return;
        }

        let moveX = 0;
        let moveY = 0;

        if (state.keyboard.left) {
            moveX -= 1;
        }
        if (state.keyboard.right) {
            moveX += 1;
        }
        if (state.keyboard.up) {
            moveY -= 1;
        }
        if (state.keyboard.down) {
            moveY += 1;
        }

        if (!moveX && !moveY) {
            return;
        }

        positionCursor(
            state.cursor.x + moveX * config.keyboardMoveSpeed,
            state.cursor.y + moveY * config.keyboardMoveSpeed
        );
    }

    function updateStats(now) {
        state.fps.frames += 1;
        if (now - state.fps.lastTick >= 1000) {
            state.stats.fps = state.fps.frames;
            state.fps.frames = 0;
            state.fps.lastTick = now;
        }

        if (now - state.lastStatsAt < config.statsIntervalMs) {
            return;
        }
        state.lastStatsAt = now;

        const dx = state.cursor.x - state.lastCursor.x;
        const dy = state.cursor.y - state.lastCursor.y;
        state.stats.cursorSpeed = Math.round(Math.hypot(dx, dy) * 60);
        state.lastCursor.x = state.cursor.x;
        state.lastCursor.y = state.cursor.y;

        const uptime = state.stats.handStartAt ? Math.floor((Date.now() - state.stats.handStartAt) / 1000) : 0;

        if (dom.cursorSpeed) {
            dom.cursorSpeed.textContent = `${state.stats.cursorSpeed} px/s`;
        }
        if (dom.detectionConfidence) {
            dom.detectionConfidence.textContent = `${Math.round(state.stats.confidence * 100)}%`;
        }
        if (dom.totalClicks) {
            dom.totalClicks.textContent = String(state.stats.clicks);
        }
        if (dom.totalScrolls) {
            dom.totalScrolls.textContent = String(state.stats.scrolls);
        }
        if (dom.handUptime) {
            dom.handUptime.textContent = `${uptime}s`;
        }
        if (dom.fpsCounter) {
            dom.fpsCounter.textContent = `${state.stats.fps} FPS`;
        }
    }

    function runLoop() {
        // ──────────────────────────────────────────────────────────────────
        // OTIMIZAÇÃO 4 — requestAnimationFrame eficiente com timestamp nativo
        // O rAF já entrega `now` (DOMHighResTimeStamp) sem custo adicional.
        // Usamos esse valor em toda a lógica de scroll, sleep e stats,
        // evitando chamadas extras a performance.now() dentro do loop.
        // O loop é cancelado antes de ser recriado para evitar múltiplos
        // rAFs rodando simultaneamente (memory leak de loop duplicado).
        // ──────────────────────────────────────────────────────────────────
        const tick = (now) => {
            // Suavização de scroll vetorial (EMA bidirecional)
            state.scroll.velocityY += (state.scroll.targetY - state.scroll.velocityY) * config.scrollSmoothing;
            state.scroll.velocityX += (state.scroll.targetX - state.scroll.velocityX) * config.scrollSmoothing;

            // Zera velocidades abaixo do limiar para evitar micro-drifts infinitos
            if (Math.abs(state.scroll.velocityY) < 0.08) state.scroll.velocityY = 0;
            if (Math.abs(state.scroll.velocityX) < 0.08) state.scroll.velocityX = 0;

            if (Math.abs(state.scroll.velocityY) > 0 || Math.abs(state.scroll.velocityX) > 0) {
                window.scrollBy(state.scroll.velocityX, state.scroll.velocityY);
                if ((Math.abs(state.scroll.velocityY) > 1.2 || Math.abs(state.scroll.velocityX) > 1.2) && now - state.scroll.lastCountAt >= 120) {
                    state.stats.scrolls += 1;
                    state.scroll.lastCountAt = now;
                }
            }

            applyKeyboardMovement();
            drawEffects();
            updateStats(now);

            // Auto-Sleep Mode: fade da interface após inatividade
            if (state.handVisible || state.keyboard.left || state.keyboard.right || state.keyboard.up || state.keyboard.down) {
                state.lastActivityAt = now;
                document.body.style.opacity = "1";
            } else if (now - state.lastActivityAt > config.sleepModeTimeoutMs) {
                document.body.style.opacity = "0.4";
                document.body.style.transition = "opacity 1s ease";
            }

            // Reagenda o próximo tick — o ID é guardado para cancelamento
            state.scroll.rafId = window.requestAnimationFrame(tick);
        };

        // Cancela loop anterior antes de criar novo para evitar duplicatas
        if (state.scroll.rafId) {
            window.cancelAnimationFrame(state.scroll.rafId);
        }

        state.scroll.rafId = window.requestAnimationFrame(tick);
    }

    function setHandDetectedUI() {
        setHandStatus("Detectada", "detectado");
        dom.status.textContent = "Controle por gesto ativo. Mova a mao, use pinca para clique e altura para scroll.";
    }

    function setHandLostUI() {
        setHandStatus("Nao detectada", "perdido");
        if (state.cameraRunning) {
            dom.status.textContent = "Camera ativa. Mostre a mao para retomar o controle por gesto.";
        } else {
            dom.status.textContent = "Camera desligada. Fallback por teclado ativo para acessibilidade.";
        }
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
            setCameraStatus("Biblioteca ausente", "perdido");
            dom.status.textContent = "MediaPipe indisponivel. Continue no fallback por teclado.";
            setFallbackMode(true);
            showNotification("Falha ao carregar camera");
            return;
        }

        const hands = new Hands({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });

        hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 0,
            minDetectionConfidence: 0.6,
            minTrackingConfidence: 0.6,
            staticImageMode: false
        });

        hands.onResults((results) => {
            const now = performance.now();
            const hasHand = Boolean(results.multiHandLandmarks && results.multiHandLandmarks.length > 0);

            if (hasHand) {
                state.framesWithoutHand = 0;
                if (!state.handVisible) {
                    state.handVisible = true;
                    state.stats.handStartAt = Date.now();
                    setHandDetectedUI();
                }

                if (results.multiHandedness && results.multiHandedness[0] && Number.isFinite(results.multiHandedness[0].score)) {
                    state.stats.confidence = clamp(results.multiHandedness[0].score, 0, 1);
                }

                processHandLandmarks(results.multiHandLandmarks[0], now);
                return;
            }

            state.framesWithoutHand += 1;
            state.scroll.targetX = 0;
            state.scroll.targetY = 0;
            if (state.framesWithoutHand > config.handLossGraceFrames && state.handVisible) {
                state.handVisible = false;
                state.stats.confidence = 0;
                state.pinchClosed = false;
                state.pinchDistanceEma = 0;
                state.pinchTriggeredInCycle = false;
                setHandLostUI();
                clearLandmarks();
                dom.cursor.classList.remove("clicando");
            }
        });

        const camera = new Camera(dom.video, {
            width: config.cameraWidth,
            height: config.cameraHeight,
            onFrame: async () => {
                const now = performance.now();

                // ──────────────────────────────────────────────────────────
                // OTIMIZAÇÃO 2 — Throttle de FPS no pipeline de inferência
                // Se ainda estamos processando o frame anterior (sending) ou
                // o intervalo mínimo ainda não passou, descartamos este frame.
                // Isso evita enfileirar trabalho e afundar a thread principal.
                // ──────────────────────────────────────────────────────────
                if (state.pipeline.sending || now - state.pipeline.lastSentAt < state.pipeline.minIntervalMs) {
                    return; // frame ignorado — CPU poupada
                }

                // ──────────────────────────────────────────────────────────
                // OTIMIZAÇÃO 1b — Redimensionamento do frame antes da IA
                // Desenhamos o frame do vídeo em escala reduzida (320×240)
                // no canvas offscreen. O MediaPipe recebe uma imagem menor,
                // o que reduz a quantidade de pixels analisados em ~75%.
                // ──────────────────────────────────────────────────────────
                offscreenCtx.drawImage(dom.video, 0, 0, OFFSCREEN_W, OFFSCREEN_H);

                state.pipeline.sending = true;
                state.pipeline.lastSentAt = now;
                try {
                    // Enviamos o canvas comprimido, não o vídeo bruto
                    await hands.send({ image: offscreenCanvas });
                } finally {
                    // ──────────────────────────────────────────────────────
                    // OTIMIZAÇÃO 3 — Gerenciamento de memória
                    // Liberamos o flag de envio no bloco finally para garantir
                    // que mesmo em caso de erro o pipeline não trava.
                    // Limpamos também o canvas offscreen para evitar retenção
                    // de dados de imagem entre frames (memory leak implícito).
                    // ──────────────────────────────────────────────────────
                    state.pipeline.sending = false;
                    offscreenCtx.clearRect(0, 0, OFFSCREEN_W, OFFSCREEN_H);
                }
            }
        });

        try {
            await camera.start();
            state.cameraInstance = camera;
            state.handsInstance = hands;
            state.cameraRunning = true;
            state.framesWithoutHand = 0;
            state.pipeline.sending = false;
            state.pipeline.lastSentAt = 0;
            setCameraStatus("Ativa", "detectado");
            setFallbackMode(false);
            syncCameraButtonLabel();
            dom.status.textContent = "Camera ativa. Mostre a mao para iniciar o controle touchless.";
            showNotification("Camera iniciada");
        } catch {
            state.cameraRunning = false;
            setCameraStatus("Sem permissao", "perdido");
            setFallbackMode(true);
            syncCameraButtonLabel();
            dom.status.textContent = "Nao foi possivel acessar a camera. Fallback por teclado ativo.";
            showNotification("Sem acesso a camera");
        }
    }

    function stopCamera(reason) {
        if (state.cameraInstance && typeof state.cameraInstance.stop === "function") {
            try {
                state.cameraInstance.stop();
            } catch {
                return;
            }
        }

        state.cameraInstance = null;
        state.handsInstance = null;
        state.cameraRunning = false;
        state.handVisible = false;
        state.framesWithoutHand = 0;
        state.pinchClosed = false;
        state.pinchDistanceEma = 0;
        state.pinchTriggeredInCycle = false;
        state.scroll.targetX = 0;
        state.scroll.targetY = 0;
        state.scroll.velocityX = 0;
        state.scroll.velocityY = 0;
        state.stats.confidence = 0;
        state.pipeline.sending = false;
        state.pipeline.lastSentAt = 0;

        clearLandmarks();
        dom.cursor.classList.remove("clicando");
        setCameraStatus("Desligada", "perdido");
        setHandLostUI();
        setFallbackMode(true);
        syncCameraButtonLabel();

        if (reason) {
            showNotification(reason);
        }
    }

    function toggleCameraFlow() {
        if (state.cameraRunning) {
            stopCamera("Camera parada");
            return;
        }

        startCamera();
    }

    function bindKeyboardFallback() {
        const mapDirection = (key, pressed) => {
            const k = key.toLowerCase();
            if (k === "arrowleft" || k === "a") {
                state.keyboard.left = pressed;
            }
            if (k === "arrowright" || k === "d") {
                state.keyboard.right = pressed;
            }
            if (k === "arrowup" || k === "w") {
                state.keyboard.up = pressed;
            }
            if (k === "arrowdown" || k === "s") {
                state.keyboard.down = pressed;
            }
        };

        window.addEventListener("keydown", (event) => {
            const target = event.target;
            const isTypingField = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
            if (isTypingField) {
                return;
            }

            mapDirection(event.key, true);

            if (!state.fallbackMode) {
                return;
            }

            const lower = event.key.toLowerCase();
            const isActionKey = lower === "enter" || lower === " " || lower === "spacebar";
            const isMoveKey = lower.startsWith("arrow") || lower === "w" || lower === "a" || lower === "s" || lower === "d";

            if (isMoveKey || isActionKey) {
                event.preventDefault();
            }

            if (isActionKey && !event.repeat) {
                handleClickFeedback(triggerClickAtCursor(), "keyboard");
                showNotification("Clique por teclado");
            }
        });

        window.addEventListener("keyup", (event) => {
            mapDirection(event.key, false);
        });
    }

    function bindUIEvents() {
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
                stopCamera();
                dom.status.textContent = "Voce escolheu continuar sem camera. Fallback por teclado ativo.";
                showNotification("Fallback por teclado ativo");
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
            });
        }

        if (dom.sliderSmoothing) {
            dom.sliderSmoothing.addEventListener("input", (event) => {
                const value = Number(event.target.value);
                config.smoothFactor = clamp(value, 0.12, 0.45);
                if (dom.valueSmoothing) {
                    dom.valueSmoothing.textContent = config.smoothFactor.toFixed(2);
                }
                saveSettings();
            });
        }

        if (dom.sliderPinch) {
            dom.sliderPinch.addEventListener("input", (event) => {
                const value = Number(event.target.value);
                config.pinchClose = clamp(value, 0.035, 0.09);
                if (dom.valuePinch) {
                    dom.valuePinch.textContent = config.pinchClose.toFixed(3);
                }
                saveSettings();
            });
        }

        if (dom.sliderScroll) {
            dom.sliderScroll.addEventListener("input", (event) => {
                const value = Number(event.target.value);
                config.scrollMaxSpeedPx = clamp(value, 8, 30);
                if (dom.valueScroll) {
                    dom.valueScroll.textContent = String(Math.round(config.scrollMaxSpeedPx));
                }
                saveSettings();
            });
        }

        if (dom.action1Btn) {
            dom.action1Btn.addEventListener("click", () => {
                showNotification("Trilha de codigo selecionada");
            });
        }

        if (dom.action2Btn) {
            dom.action2Btn.addEventListener("click", () => {
                showNotification("Trilha maker selecionada");
            });
        }

        if (dom.action3Btn) {
            dom.action3Btn.addEventListener("click", () => {
                showNotification("Atalho: use WASD e Enter no fallback");
            });
        }

        window.addEventListener("resize", () => {
            setCanvasSize();
            positionCursor(state.cursor.x, state.cursor.y);
        });
    }

    function init() {
        loadSettings();
        setCanvasSize();
        syncCalibrationUI();
        setLandmarksVisibility(state.showLandmarks);
        syncCameraButtonLabel();
        setCameraStatus("Desligada", "perdido");
        setHandStatus("Nao detectada", "perdido");
        setFallbackMode(true);
        positionCursor(state.cursor.x, state.cursor.y);
        bindUIEvents();
        bindKeyboardFallback();
        runLoop();
        showNotification("VisionFlow pronto");
    }

    init();
})();
