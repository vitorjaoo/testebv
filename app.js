/* =============================================================================
   ESTÚDIO DE VÍDEOS EM MASSA — motor client-side
   Tudo roda no navegador: Canvas 2D para composição, MediaRecorder para
   capturar o resultado, Web Audio API para escolher a trilha de áudio,
   e JSZip para empacotar o lote final em um único .zip para download.
============================================================================= */

const OUTPUT_W = 1080;
const OUTPUT_H = 1920;

// ---------------------------------------------------------------------------
// Estado da UI
// ---------------------------------------------------------------------------
const state = {
  backgroundFile: null,
  clipFiles: [],
  scalePct: 0.70,
  clipYPct: 0.35,
  fontSize: 55,
  headlineYPct: 0.08,
  audioSource: "clip",
};

// Fundo agora é uma IMAGEM estática (não vídeo). O clipe menor continua sendo <video>.
const previewBgImage = new Image();
const previewClipVideo = document.createElement("video");
previewClipVideo.muted = true;
previewClipVideo.loop = true;
previewClipVideo.playsInline = true;

// ---------------------------------------------------------------------------
// Referências DOM
// ---------------------------------------------------------------------------
const bgInput = document.getElementById("bgInput");
const bgLabel = document.getElementById("bgLabel");
const bgBtn = document.getElementById("bgBtn");
const clipsInput = document.getElementById("clipsInput");
const clipsLabel = document.getElementById("clipsLabel");
const clipsBtn = document.getElementById("clipsBtn");
const headlinesBox = document.getElementById("headlinesBox");

const scaleSlider = document.getElementById("scaleSlider");
const clipYSlider = document.getElementById("clipYSlider");
const fontSlider = document.getElementById("fontSlider");
const headlineYSlider = document.getElementById("headlineYSlider");

const scaleVal = document.getElementById("scaleVal");
const clipYVal = document.getElementById("clipYVal");
const fontVal = document.getElementById("fontVal");
const headlineYVal = document.getElementById("headlineYVal");

const generateBtn = document.getElementById("generateBtn");
const progressFill = document.getElementById("progressFill");
const statusText = document.getElementById("statusText");
const previewCanvas = document.getElementById("previewCanvas");
const pctx = previewCanvas.getContext("2d");

// ---------------------------------------------------------------------------
// Seleção de arquivos
// ---------------------------------------------------------------------------
bgBtn.addEventListener("click", () => bgInput.click());
clipsBtn.addEventListener("click", () => clipsInput.click());

bgInput.addEventListener("change", () => {
  if (bgInput.files.length) {
    state.backgroundFile = bgInput.files[0];
    bgLabel.textContent = state.backgroundFile.name;
    bgBtn.classList.add("filled");
    previewBgImage.src = URL.createObjectURL(state.backgroundFile);
  }
});

clipsInput.addEventListener("change", () => {
  if (clipsInput.files.length) {
    state.clipFiles = Array.from(clipsInput.files);
    clipsLabel.textContent = `${state.clipFiles.length} arquivo(s) selecionado(s)`;
    clipsBtn.classList.add("filled");
    previewClipVideo.src = URL.createObjectURL(state.clipFiles[0]);
    previewClipVideo.play().catch(() => {});
  }
});

document.querySelectorAll('input[name="audio"]').forEach(r => {
  r.addEventListener("change", (e) => { state.audioSource = e.target.value; });
});

// ---------------------------------------------------------------------------
// Sliders (atualizam estado + label + preview)
// ---------------------------------------------------------------------------
scaleSlider.addEventListener("input", () => {
  state.scalePct = scaleSlider.value / 100;
  scaleVal.textContent = `${scaleSlider.value}%`;
});
clipYSlider.addEventListener("input", () => {
  state.clipYPct = clipYSlider.value / 100;
  clipYVal.textContent = `${clipYSlider.value}%`;
});
fontSlider.addEventListener("input", () => {
  state.fontSize = parseInt(fontSlider.value);
  fontVal.textContent = `${fontSlider.value}px`;
});
headlineYSlider.addEventListener("input", () => {
  state.headlineYPct = headlineYSlider.value / 100;
  headlineYVal.textContent = `${headlineYSlider.value}%`;
});

// ---------------------------------------------------------------------------
// Utilitário: desenha um vídeo cortado ("cover") num retângulo do canvas
// ---------------------------------------------------------------------------
function drawCover(ctx, media, dx, dy, dw, dh) {
  // Funciona tanto para <video> (videoWidth/videoHeight) quanto para <img> (naturalWidth/naturalHeight)
  const mediaW = media.videoWidth || media.naturalWidth;
  const mediaH = media.videoHeight || media.naturalHeight;
  if (!mediaW) return;

  const mRatio = mediaW / mediaH;
  const dRatio = dw / dh;
  let sx, sy, sw, sh;
  if (mRatio > dRatio) {
    sh = mediaH;
    sw = sh * dRatio;
    sx = (mediaW - sw) / 2;
    sy = 0;
  } else {
    sw = mediaW;
    sh = sw / dRatio;
    sx = 0;
    sy = (mediaH - sh) / 2;
  }
  ctx.drawImage(media, sx, sy, sw, sh, dx, dy, dw, dh);
}

// Quebra de texto simples para caber na largura do canvas
function wrapText(ctx, text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    const test = current ? current + " " + word : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawHeadline(ctx, text, canvasW, canvasH, fontSizeAtOutputScale, yPct) {
  const fontSize = fontSizeAtOutputScale;
  ctx.font = `900 ${fontSize}px 'Arial Black', Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  const maxWidth = canvasW * 0.88;
  const lines = wrapText(ctx, text, maxWidth);
  const lineHeight = fontSize * 1.2;
  const startY = canvasH * yPct;

  lines.forEach((line, i) => {
    const y = startY + i * lineHeight;
    const x = canvasW / 2;

    // Sombra (leve deslocamento)
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillText(line, x + fontSize * 0.03, y + fontSize * 0.06);

    // Contorno preto grosso (impacto tipo legenda de Reels)
    ctx.lineWidth = Math.max(2, fontSize * 0.09);
    ctx.strokeStyle = "black";
    ctx.lineJoin = "round";
    ctx.strokeText(line, x, y);

    // Texto branco por cima
    ctx.fillStyle = "white";
    ctx.fillText(line, x, y);
  });
}

// ---------------------------------------------------------------------------
// PREVIEW EM TEMPO REAL (loop de desenho no canvas 360x640)
// ---------------------------------------------------------------------------
function renderPreviewFrame() {
  const w = previewCanvas.width, h = previewCanvas.height;
  pctx.clearRect(0, 0, w, h);

  // Fundo (imagem estática)
  if (previewBgImage.naturalWidth) {
    drawCover(pctx, previewBgImage, 0, 0, w, h);
  } else {
    pctx.fillStyle = "#1f3a5f";
    pctx.fillRect(0, 0, w, h);
    pctx.fillStyle = "#7fb3ff";
    pctx.font = "12px Arial";
    pctx.textAlign = "center";
    pctx.fillText("VÍDEO DE FUNDO", w / 2, 30);
  }

  // Vídeo menor sobreposto
  const clipW = w * state.scalePct;
  const clipH = clipW * (16 / 9);
  const clipX = (w - clipW) / 2;
  const clipY = h * state.clipYPct;

  if (previewClipVideo.videoWidth) {
    pctx.save();
    pctx.beginPath();
    pctx.rect(clipX, clipY, clipW, clipH);
    pctx.clip();
    drawCover(pctx, previewClipVideo, clipX, clipY, clipW, clipH);
    pctx.restore();
    pctx.strokeStyle = "#27ae60";
    pctx.lineWidth = 2;
    pctx.strokeRect(clipX, clipY, clipW, clipH);
  } else {
    pctx.fillStyle = "#27ae60";
    pctx.fillRect(clipX, clipY, clipW, clipH);
    pctx.fillStyle = "white";
    pctx.font = "bold 11px Arial";
    pctx.textAlign = "center";
    pctx.fillText("VÍDEO MENOR", w / 2, clipY + clipH / 2);
  }

  // Headline de exemplo (escala proporcional ao preview)
  const previewFontSize = state.fontSize * (w / OUTPUT_W);
  drawHeadline(pctx, "Headline de Exemplo Aqui", w, h, previewFontSize, state.headlineYPct);

  requestAnimationFrame(renderPreviewFrame);
}
requestAnimationFrame(renderPreviewFrame);

// ---------------------------------------------------------------------------
// MOTOR DE RENDERIZAÇÃO FINAL (offscreen, 1080x1920, por par headline+clipe)
// ---------------------------------------------------------------------------

// Carrega um File em um elemento <video> e resolve quando os metadados estão prontos
function loadVideoElement(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.src = URL.createObjectURL(file);
    video.muted = false;
    video.playsInline = true;
    video.addEventListener("loadedmetadata", () => resolve(video), { once: true });
    video.addEventListener("error", () => reject(new Error(`Falha ao carregar ${file.name}`)), { once: true });
  });
}

// Carrega um File de imagem e resolve quando estiver pronta para desenhar
function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Falha ao carregar imagem ${file.name}`));
  });
}

function updateStatus(msg) { statusText.textContent = msg; }
function updateProgress(fraction) { progressFill.style.width = `${Math.round(fraction * 100)}%`; }

async function renderSingleVideo(backgroundImage, clipVideo, headlineText, audioContext) {
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_W;
  canvas.height = OUTPUT_H;
  const ctx = canvas.getContext("2d");

  const duration = clipVideo.duration; // duração final = duração do vídeo menor (fundo é imagem, não tem duração própria)

  // --- Prepara áudio (Web Audio API) — só existe áudio do vídeo menor, já que o fundo é imagem ---
  const destination = audioContext.createMediaStreamDestination();
  let audioSourceNode = null;
  if (state.audioSource === "clip") {
    clipVideo.muted = false;
    try {
      audioSourceNode = audioContext.createMediaElementSource(clipVideo);
      audioSourceNode.connect(destination);
      // Não conecta ao alto-falante para evitar eco duplo durante a gravação
    } catch (e) {
      console.warn("Áudio indisponível para este par:", e);
    }
  }

  // --- Stream combinado: vídeo do canvas + áudio escolhido (se houver) ---
  const canvasStream = canvas.captureStream(30);
  const combinedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...destination.stream.getAudioTracks(),
  ]);

  const recorder = new MediaRecorder(combinedStream, {
    mimeType: "video/webm;codecs=vp9,opus",
    videoBitsPerSecond: 8_000_000,
  });

  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  const recordingDone = new Promise((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
  });

  // Posiciona o clipe no início e toca (a imagem de fundo não precisa tocar, é estática)
  clipVideo.currentTime = 0;
  clipVideo.loop = false;
  await clipVideo.play();

  recorder.start();

  const clipW = OUTPUT_W * state.scalePct;
  const clipH = clipW * (16 / 9);
  const clipX = (OUTPUT_W - clipW) / 2;
  const clipY = OUTPUT_H * state.clipYPct;

  await new Promise((resolve) => {
    const startTime = performance.now();

    function drawFrame() {
      const elapsed = (performance.now() - startTime) / 1000;
      if (elapsed >= duration) {
        resolve();
        return;
      }

      ctx.clearRect(0, 0, OUTPUT_W, OUTPUT_H);
      drawCover(ctx, backgroundImage, 0, 0, OUTPUT_W, OUTPUT_H); // fundo estático, redesenhado a cada frame

      ctx.save();
      ctx.beginPath();
      ctx.rect(clipX, clipY, clipW, clipH);
      ctx.clip();
      drawCover(ctx, clipVideo, clipX, clipY, clipW, clipH);
      ctx.restore();

      drawHeadline(ctx, headlineText, OUTPUT_W, OUTPUT_H, state.fontSize, state.headlineYPct);

      requestAnimationFrame(drawFrame);
    }
    requestAnimationFrame(drawFrame);
  });

  recorder.stop();
  clipVideo.pause();
  if (audioSourceNode) audioSourceNode.disconnect();

  return await recordingDone;
}

// ---------------------------------------------------------------------------
// LOOP EM LOTE: lê headlines + clipes, pareia, renderiza, empacota em .zip
// ---------------------------------------------------------------------------
generateBtn.addEventListener("click", async () => {
  try {
    if (!state.backgroundFile) {
      alert("Selecione uma imagem de fundo.");
      return;
    }
    if (!state.clipFiles.length) {
      alert("Selecione ao menos um vídeo de recorte.");
      return;
    }
    const headlines = headlinesBox.value.split("\n").map(l => l.trim()).filter(Boolean);
    if (!headlines.length) {
      alert("Cole ao menos uma headline.");
      return;
    }

    const totalPairs = Math.min(headlines.length, state.clipFiles.length);
    if (headlines.length !== state.clipFiles.length) {
      updateStatus(`Aviso: ${headlines.length} headlines e ${state.clipFiles.length} vídeos. Gerando ${totalPairs} vídeo(s) pareados.`);
    }

    generateBtn.disabled = true;
    generateBtn.textContent = "Renderizando...";
    updateProgress(0);

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const zip = new JSZip();

    // Carrega a imagem de fundo uma única vez (reutilizada em todos os pares)
    const backgroundImage = await loadImageElement(state.backgroundFile);

    let successCount = 0;
    const errors = [];

    for (let i = 0; i < totalPairs; i++) {
      const fileName = `video_${String(i + 1).padStart(2, "0")}.webm`;
      updateStatus(`Renderizando ${i + 1}/${totalPairs}: ${fileName}...`);

      try {
        const clipVideo = await loadVideoElement(state.clipFiles[i]);
        const blob = await renderSingleVideo(backgroundImage, clipVideo, headlines[i], audioContext);
        zip.file(fileName, blob);
        successCount++;
        URL.revokeObjectURL(clipVideo.src);
      } catch (err) {
        console.error(err);
        errors.push(`Vídeo ${i + 1}: ${err.message}`);
      }

      updateProgress((i + 1) / totalPairs);
    }

    updateStatus("Compactando arquivos em .zip...");
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const zipUrl = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = zipUrl;
    a.download = "videos_gerados.zip";
    a.click();
    URL.revokeObjectURL(zipUrl);

    let summary = `Concluído! ${successCount}/${totalPairs} vídeos gerados com sucesso. Download do .zip iniciado.`;
    if (errors.length) summary += `\n${errors.length} erro(s):\n` + errors.join("\n");
    updateStatus(summary);

  } catch (err) {
    console.error(err);
    updateStatus(`Erro inesperado: ${err.message}`);
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = "🎬 GERAR VÍDEOS EM MASSA";
  }
});
