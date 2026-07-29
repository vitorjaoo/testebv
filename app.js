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
  fontFamily: "'Arial Black', Arial, sans-serif",
  headlineYPct: 0.08,
  audioSource: "clip",
  outputFormat: "mp4",
  pairingMode: "sequential",
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
const fontSelect = document.getElementById("fontSelect");
const formatSelect = document.getElementById("formatSelect");
const pairingSelect = document.getElementById("pairingSelect");

fontSelect.addEventListener("change", () => {
  state.fontFamily = fontSelect.value;
});
formatSelect.addEventListener("change", () => {
  state.outputFormat = formatSelect.value;
});
pairingSelect.addEventListener("change", () => {
  state.pairingMode = pairingSelect.value;
});

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
  ctx.font = `900 ${fontSize}px ${state.fontFamily}`;
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

// Alguns arquivos (principalmente .webm gravados por outra ferramenta, ou .mp4 com
// metadados incompletos) reportam video.duration como Infinity/NaN até serem "buscados"
// uma vez. Sem essa correção, o loop de renderização nunca detecta o fim do clipe e
// trava o lote inteiro silenciosamente no vídeo problemático — foi isso que fez
// "sobrarem" vídeos sem gerar. Essa função força o navegador a calcular a duração real.
function getReliableDuration(video) {
  return new Promise((resolve) => {
    if (isFinite(video.duration) && video.duration > 0) {
      resolve(video.duration);
      return;
    }
    const onTimeUpdate = () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.currentTime = 0;
      if (isFinite(video.duration) && video.duration > 0) {
        resolve(video.duration);
      } else {
        resolve(10); // fallback de segurança para nunca travar indefinidamente
      }
    };
    video.addEventListener("timeupdate", onTimeUpdate);
    video.currentTime = 1e10; // hack conhecido: força o navegador a indexar o arquivo inteiro
  });
}

// Detecta se o navegador consegue gravar MP4 nativamente com o MediaRecorder
// (Chrome/Edge recentes suportam; Firefox/Safari geralmente não). Quando suportado,
// isso é MUITO mais rápido do que gravar em WebM e converter depois com FFmpeg,
// porque pula inteiramente o passo de conversão.
const NATIVE_MP4_MIME = (() => {
  const candidates = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=avc1,mp4a",
    "video/mp4",
  ];
  for (const mime of candidates) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return null;
})();

function updateStatus(msg) { statusText.textContent = msg; }
function updateProgress(fraction) { progressFill.style.width = `${Math.round(fraction * 100)}%`; }

// FFmpeg.wasm é carregado sob demanda (só se o usuário escolher exportar em MP4),
// já que é um pacote pesado (~25MB) baixado e rodado inteiramente no navegador.
let ffmpegInstance = null;
async function getFfmpeg() {
  if (ffmpegInstance) return ffmpegInstance;
  const { createFFmpeg } = FFmpeg;
  ffmpegInstance = createFFmpeg({
    log: false,
    corePath: "https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js",
  });
  await ffmpegInstance.load();
  return ffmpegInstance;
}

async function convertWebmToMp4(webmBlob, fileNameBase) {
  const ffmpeg = await getFfmpeg();
  const inputName = `${fileNameBase}.webm`;
  const outputName = `${fileNameBase}.mp4`;

  const arrayBuffer = await webmBlob.arrayBuffer();
  ffmpeg.FS("writeFile", inputName, new Uint8Array(arrayBuffer));

  await ffmpeg.run(
    "-i", inputName,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "23",
    "-c:a", "aac",
    "-pix_fmt", "yuv420p",
    outputName
  );

  const data = ffmpeg.FS("readFile", outputName);
  ffmpeg.FS("unlink", inputName);
  ffmpeg.FS("unlink", outputName);

  return new Blob([data.buffer], { type: "video/mp4" });
}

async function renderSingleVideo(backgroundImage, clipVideo, headlineText, audioContext) {
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_W;
  canvas.height = OUTPUT_H;
  const ctx = canvas.getContext("2d");

  const duration = await getReliableDuration(clipVideo); // duração final = duração real do vídeo menor

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

  const useNativeMp4 = state.outputFormat === "mp4" && NATIVE_MP4_MIME;
  const recorderMime = useNativeMp4 ? NATIVE_MP4_MIME : "video/webm;codecs=vp9,opus";

  const recorder = new MediaRecorder(combinedStream, {
    mimeType: recorderMime,
    videoBitsPerSecond: 8_000_000,
  });

  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  const recordingDone = new Promise((resolve) => {
    recorder.onstop = () => resolve({
      blob: new Blob(chunks, { type: useNativeMp4 ? "video/mp4" : "video/webm" }),
      isNativeMp4: useNativeMp4,
    });
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

  await Promise.race([
    new Promise((resolve) => {
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
    }),
    // Rede de segurança: nunca deixa um clipe travar o lote inteiro por mais que sua duração + 15s
    new Promise((resolve) => setTimeout(resolve, (duration + 15) * 1000)),
  ]);

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

    const totalPairs = state.pairingMode === "sequential"
      ? Math.min(headlines.length, state.clipFiles.length)
      : state.clipFiles.length; // "cycle" e "same" sempre geram 1 vídeo por clipe

    // Resolve qual headline usar em cada vídeo, conforme o modo escolhido
    function headlineForIndex(i) {
      if (state.pairingMode === "same") return headlines[0];
      if (state.pairingMode === "cycle") return headlines[i % headlines.length];
      return headlines[i]; // sequential
    }

    if (state.pairingMode === "sequential" && headlines.length !== state.clipFiles.length) {
      const msg = `Você colou ${headlines.length} headline(s) mas selecionou ${state.clipFiles.length} vídeo(s) de recorte.\n\nSerão gerados apenas ${totalPairs} vídeo(s) (o par é feito 1 a 1, e para quando o grupo menor acabar).\n\nSe quiser gerar todos os ${state.clipFiles.length} vídeos, adicione mais headlines, ou troque o "Modo de pareamento" para "Repetir em ciclo" ou "Mesma headline em todos".`;
      alert(msg);
      updateStatus(`Aviso: ${headlines.length} headlines e ${state.clipFiles.length} vídeos. Gerando ${totalPairs} vídeo(s) pareados.`);
    }

    generateBtn.disabled = true;
    generateBtn.textContent = "Renderizando...";
    updateProgress(0);

    // Garante que a fonte escolhida já está carregada antes de desenhar qualquer frame
    updateStatus("Carregando fonte selecionada...");
    try {
      await document.fonts.load(`900 100px ${state.fontFamily}`);
    } catch (e) { /* segue mesmo se falhar o preload; o navegador usa fallback */ }

    if (state.outputFormat === "mp4" && NATIVE_MP4_MIME) {
      updateStatus("Seu navegador grava MP4 nativamente — sem conversão extra, bem mais rápido.");
    } else if (state.outputFormat === "mp4") {
      updateStatus("Seu navegador não grava MP4 nativo — usando conversão via FFmpeg (mais lento). Considere usar Chrome ou Edge.");
    }

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const zip = new JSZip();

    // Carrega a imagem de fundo uma única vez (reutilizada em todos os pares)
    const backgroundImage = await loadImageElement(state.backgroundFile);

    let successCount = 0;
    const errors = [];

    for (let i = 0; i < totalPairs; i++) {
      const fileBase = `video_${String(i + 1).padStart(2, "0")}`;
      updateStatus(`Renderizando ${i + 1}/${totalPairs}: ${fileBase}...`);

      try {
        const clipVideo = await loadVideoElement(state.clipFiles[i]);
        const { blob, isNativeMp4 } = await renderSingleVideo(backgroundImage, clipVideo, headlineForIndex(i), audioContext);

        if (state.outputFormat === "mp4" && !isNativeMp4) {
          // Fallback: navegador não grava mp4 nativamente (ex: Firefox) — converte via FFmpeg
          updateStatus(`Convertendo ${i + 1}/${totalPairs} para MP4 (pode levar um tempo)...`);
          const mp4Blob = await convertWebmToMp4(blob, fileBase);
          zip.file(`${fileBase}.mp4`, mp4Blob);
        } else if (state.outputFormat === "mp4") {
          zip.file(`${fileBase}.mp4`, blob); // já veio em mp4 direto da gravação, sem conversão
        } else {
          zip.file(`${fileBase}.webm`, blob);
        }

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

    let summary = `Concluído! ${successCount}/${totalPairs} vídeos (.${state.outputFormat}) gerados com sucesso. Download do .zip iniciado.`;
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
