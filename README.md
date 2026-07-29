# Estúdio de Vídeos em Massa — versão Web

App 100% client-side: roda inteiramente no navegador do usuário. Nenhum vídeo
é enviado a um servidor — a renderização acontece com `<canvas>` +
`MediaRecorder` + Web Audio API, direto na máquina de quem está usando.

## Rodar localmente

Não precisa de build. Basta servir os arquivos estáticos:

```bash
npx serve .
# ou
python3 -m http.server 8080
```

Abra `http://localhost:8080` (ou a porta indicada) no Chrome/Edge (melhor
suporte a `MediaRecorder` + `captureStream`).

## Deploy na Vercel

**Opção A — via CLI (mais rápido):**
```bash
npm i -g vercel
cd web-studio
vercel --prod
```

**Opção B — via GitHub:**
1. Suba esta pasta (`index.html`, `app.js`, `vercel.json`) para um repositório no GitHub.
2. Em https://vercel.com, clique em "Add New Project" e importe o repositório.
3. Framework Preset: **Other** (é site estático puro, sem build step).
4. Deploy.

Não há variáveis de ambiente nem backend — é literalmente HTML/CSS/JS estático.

## Como funciona por baixo dos panos

- **Preview em tempo real**: dois elementos `<video>` ocultos (fundo e
  primeiro recorte) tocam em loop e são desenhados a cada frame no
  `<canvas>` de 360×640 via `drawImage`, recortados no estilo "cover"
  (equivalente ao crop-resize do MoviePy).
- **Renderização em lote**: para cada par headline+recorte, cria um
  `<canvas>` offscreen de 1080×1920, desenha fundo + recorte sobreposto +
  headline (com sombra e contorno grosso) frame a frame durante a duração
  do vídeo menor, captura esse canvas com `canvas.captureStream(30)` e grava
  com `MediaRecorder` (codec VP9/Opus, contêiner `.webm`).
- **Áudio**: a trilha escolhida (recorte ou fundo) é roteada via
  `AudioContext.createMediaElementSource` → `MediaStreamDestination`, e essa
  stream de áudio é injetada junto com a stream de vídeo do canvas antes de
  gravar — assim o navegador nunca precisa reproduzir em alto-falante.
- **Empacotamento**: todos os `.webm` gerados são adicionados a um `JSZip` e
  baixados de uma vez como `videos_gerados.zip`.

## Limitações conhecidas (browser vs. desktop/MoviePy)

- **Formato de saída**: o navegador grava em `.webm` (VP9/Opus), não `.mp4`
  nativamente. Para converter em lote para `.mp4` depois, use `ffmpeg`:
  ```bash
  for f in *.webm; do ffmpeg -i "$f" -c:v libx264 -c:a aac "${f%.webm}.mp4"; done
  ```
- **Performance**: como tudo roda no navegador, vídeos muito longos ou em
  lotes muito grandes podem ficar lentos dependendo da máquina do usuário —
  não há paralelismo real (a renderização é sequencial, um vídeo por vez).
- **Compatibilidade**: `MediaRecorder` + `captureStream` funcionam bem em
  Chrome, Edge e Firefox recentes. Safari tem suporte mais limitado a alguns
  codecs — recomenda-se Chrome/Edge para melhores resultados.
- **Fonte**: o texto usa `Arial Black` (com fallback para `Arial`), já que
  fontes customizadas exigiriam `@font-face` com arquivo próprio — dá pra
  adicionar facilmente se você tiver o `.woff2` da fonte desejada.
