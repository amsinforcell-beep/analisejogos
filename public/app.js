const form = document.getElementById("match-form");
const submitBtn = document.getElementById("submit-btn");
const statusLine = document.getElementById("status-line");
const analysisCard = document.getElementById("analysis-card");
const resultCard = document.getElementById("result-card");
const resultContent = document.getElementById("result-content");
const progressFill = document.getElementById("progress-fill");
const stageLabel = document.getElementById("stage-label");
const thinkingFeed = document.getElementById("thinking-feed");
const scene3dCanvas = document.getElementById("scene-3d");
const downloadBtn = document.getElementById("download-btn");

let currentInput = null;

function pct(value) {
  return `${Math.round(Number(value) * 100)}%`;
}

/* =========================================================================
   BARRA DE PROGRESSO
   Avança por estágios reais recebidos do servidor (não é tempo fake).
   Dentro de cada estágio, sobe devagar até o teto do estágio enquanto
   esperamos o próximo evento, pra nunca parecer travada.
   ========================================================================= */
const STAGE_TARGETS = {
  "Coletando contexto da partida": 10,
  "Consultando modelos gratuitos em paralelo": 55,
  "IA de raciocínio consolidando o consenso": 82,
  "Consolidando boletim final": 96,
};

let currentTarget = 4;
let creepInterval = null;

function setStage(label) {
  stageLabel.textContent = label;
  currentTarget = STAGE_TARGETS[label] || currentTarget;
}

function startProgressCreep() {
  let value = 4;
  progressFill.style.width = "4%";
  clearInterval(creepInterval);
  creepInterval = setInterval(() => {
    const ceiling = currentTarget - 2;
    if (value < ceiling) {
      value += Math.max(0.15, (ceiling - value) * 0.02);
      progressFill.style.width = `${value}%`;
    }
  }, 120);
}

function finishProgress() {
  clearInterval(creepInterval);
  progressFill.style.width = "100%";
}

/* =========================================================================
   CENA 3D AMBIENTE (durante a análise)
   Visual decorativo que representa "processamento em andamento": uma bola
   em wireframe girando com partículas de dados orbitando. Não representa
   números reais — os números reais só existem quando o resultado chega.
   ========================================================================= */
let ambientScene = null;

function startAmbientScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.z = 6;

  function resize() {
    const size = canvas.parentElement.clientWidth;
    renderer.setSize(size, size, false);
    camera.aspect = 1;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener("resize", resize);

  const ball = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.7, 1),
    new THREE.MeshBasicMaterial({ color: 0xe3b23c, wireframe: true, transparent: true, opacity: 0.85 })
  );
  scene.add(ball);

  const innerBall = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.15, 0),
    new THREE.MeshBasicMaterial({ color: 0xc1443a, wireframe: true, transparent: true, opacity: 0.5 })
  );
  scene.add(innerBall);

  // Partículas orbitando representando "pontos de dado" sendo processados
  const particleCount = 60;
  const positions = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    const radius = 2.4 + Math.random() * 0.6;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = radius * Math.cos(phi);
  }
  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const particles = new THREE.Points(
    particleGeo,
    new THREE.PointsMaterial({ color: 0xece8d9, size: 0.05 })
  );
  scene.add(particles);

  let frameId;
  const clock = new THREE.Clock();
  function animate() {
    frameId = requestAnimationFrame(animate);
    const t = clock.getElapsedTime();
    ball.rotation.y = t * 0.35;
    ball.rotation.x = t * 0.18;
    innerBall.rotation.y = -t * 0.5;
    particles.rotation.y = t * 0.12;
    renderer.render(scene, camera);
  }
  animate();

  return {
    stop() {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      renderer.dispose();
    },
  };
}

/* =========================================================================
   GRÁFICO 3D DE RESULTADO
   Barras 3D reais: altura proporcional à probabilidade de cada resultado.
   ========================================================================= */
function renderProbabilityChart(canvas, probs) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  const scene = new THREE.Scene();

  const size = canvas.parentElement.clientWidth;
  const height = canvas.parentElement.clientHeight;
  renderer.setSize(size, height, false);

  const camera = new THREE.PerspectiveCamera(38, size / height, 0.1, 100);
  camera.position.set(3.2, 2.6, 5.2);
  camera.lookAt(0, 0.6, 0);

  const colors = [0xe3b23c, 0xa9bbac, 0xc1443a];
  const values = [probs.casa, probs.empate, probs.fora];

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(4.4, 0.08, 1.6),
    new THREE.MeshBasicMaterial({ color: 0x2e5238 })
  );
  base.position.set(0, -0.04, 0);
  scene.add(base);

  const barWidth = 0.9;
  const gap = 0.5;
  const startX = -(barWidth + gap);

  values.forEach((v, i) => {
    const h = Math.max(0.15, v * 3.2);
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(barWidth, h, 0.9),
      new THREE.MeshStandardMaterial({ color: colors[i] })
    );
    bar.position.set(startX + i * (barWidth + gap), h / 2, 0);
    scene.add(bar);
  });

  const light = new THREE.DirectionalLight(0xffffff, 1.1);
  light.position.set(3, 5, 4);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));

  let frameId;
  const clock = new THREE.Clock();
  function animate() {
    frameId = requestAnimationFrame(animate);
    const t = clock.getElapsedTime();
    scene.rotation.y = Math.sin(t * 0.25) * 0.35;
    renderer.render(scene, camera);
  }
  animate();

  return {
    stop() {
      cancelAnimationFrame(frameId);
      renderer.dispose();
    },
  };
}

/* =========================================================================
   BLOCO DE CONSENSO ENTRE MODELOS
   Mostra quantos dos modelos gratuitos concordaram no mesmo favorito
   (número calculado no servidor, não é opinião da IA) e a lista individual
   de cada modelo que participou do ensemble.
   ========================================================================= */
const FAVORITO_LABEL = { casa: "casa", fora: "fora", equilibrado: "equilíbrio" };

function renderConsensusBlock(consenso, detalhesModelos) {
  if (!consenso) return "";

  const pctConcordancia = Math.round((consenso.concordanciaFavorito || 0) * 100);

  const linhasModelos = (detalhesModelos || [])
    .map(
      (m) => `
      <div class="list-row">
        <span class="name">${m.model}</span>
        <span class="side">${FAVORITO_LABEL[m.favorito] || m.favorito}</span>
        <span class="pct">${m.placarMaisProvavel.casa}×${m.placarMaisProvavel.fora}</span>
      </div>`
    )
    .join("");

  return `
    <div class="subsection">
      <h3>Consenso entre modelos</h3>
      <div class="stat-row">
        <div class="stat-box">
          <div class="stat-value">${consenso.modelosValidos}/${consenso.modelosConsultados}</div>
          <div class="stat-label">Modelos válidos no ensemble</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${pctConcordancia}%</div>
          <div class="stat-label">Concordância no favorito "${FAVORITO_LABEL[consenso.favoritoMajoritario] || consenso.favoritoMajoritario}"</div>
        </div>
      </div>
      ${
        consenso.probabilidadeMedia
          ? `<div class="list-row"><span class="name">Média das probabilidades (casa / empate / fora)</span><span class="pct">${pct(consenso.probabilidadeMedia.casa)} / ${pct(consenso.probabilidadeMedia.empate)} / ${pct(consenso.probabilidadeMedia.fora)}</span></div>`
          : ""
      }
      ${linhasModelos}
    </div>
  `;
}

/* =========================================================================
   RENDERIZAÇÃO DO RESULTADO FINAL
   ========================================================================= */
function renderResult(data, input) {
  currentInput = input;
  const r = data.resultado;

  const alternativos = (data.placaresAlternativos || [])
    .map(
      (p) => `
      <div class="list-row">
        <span class="name">${p.casa} × ${p.fora}</span>
        <span class="pct">${pct(p.probabilidade)}</span>
      </div>`
    )
    .join("");

  const artilheiros = (data.artilheirosProvaveis || [])
    .map(
      (a) => `
      <div class="list-row">
        <span class="name">${a.jogador}</span>
        <span class="side">${a.time === "casa" ? input.timeCasa : input.timeFora}</span>
        <span class="pct">${pct(a.probabilidadeMarcar)}</span>
      </div>`
    )
    .join("");

  const cartoes = (data.cartoesPrevistos || [])
    .map(
      (c) => `
      <div class="list-row">
        <span class="card-chip ${c.tipo}"></span>
        <span class="name">${c.jogador}</span>
        <span class="side">${c.time === "casa" ? input.timeCasa : input.timeFora}</span>
        <span class="pct">${pct(c.probabilidade)}</span>
      </div>`
    )
    .join("");

  resultContent.innerHTML = `
    <div class="scoreboard">
      <span class="team-name">${input.timeCasa}</span>
      <div class="digits">
        <span class="digit">${data.placarMaisProvavel.casa}</span>
        <span class="digit">${data.placarMaisProvavel.fora}</span>
      </div>
      <span class="team-name">${input.timeFora}</span>
    </div>

    <div class="chart-3d-frame"><canvas id="chart-3d"></canvas></div>

    <div class="prob-legend" style="margin-bottom:1.5rem;">
      <div class="prob-legend-row">
        <span class="prob-dot" style="background:#E3B23C"></span>
        <span class="prob-legend-label">Vitória ${input.timeCasa}</span>
        <span class="prob-legend-value">${pct(r.probabilidadeVitoriaCasa)}</span>
      </div>
      <div class="prob-legend-row">
        <span class="prob-dot" style="background:#A9BBAC"></span>
        <span class="prob-legend-label">Empate</span>
        <span class="prob-legend-value">${pct(r.probabilidadeEmpate)}</span>
      </div>
      <div class="prob-legend-row">
        <span class="prob-dot" style="background:#C1443A"></span>
        <span class="prob-legend-label">Vitória ${input.timeFora}</span>
        <span class="prob-legend-value">${pct(r.probabilidadeVitoriaFora)}</span>
      </div>
    </div>

    <div class="stat-row">
      <div class="stat-box">
        <div class="stat-value">${pct(data.ambosMarcam.probabilidade)}</div>
        <div class="stat-label">Ambos marcam</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${data.totalGolsEsperado.media}</div>
        <div class="stat-label">Média de gols esperada</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${data.totalCartoesEsperado.minimo}–${data.totalCartoesEsperado.maximo}</div>
        <div class="stat-label">Cartões esperados</div>
      </div>
    </div>

    ${alternativos ? `<div class="subsection"><h3>Placares alternativos</h3>${alternativos}</div>` : ""}
    ${artilheiros ? `<div class="subsection"><h3>Artilheiros prováveis</h3>${artilheiros}</div>` : ""}
    ${cartoes ? `<div class="subsection"><h3>Cartões previstos</h3>${cartoes}</div>` : ""}

    <div class="analysis-block">${data.analiseResumida}</div>

    ${renderConsensusBlock(data.consenso, data.detalhesModelos)}

    <div class="confidence-row">
      <span>Consolidado por: ${data.modeloUsado}</span>
      <span class="confidence-chip ${data.nivelConfianca}">Confiança ${data.nivelConfianca}</span>
    </div>

    <p class="disclaimer">${data.aviso}</p>
  `;

  resultCard.hidden = false;
  renderProbabilityChart(document.getElementById("chart-3d"), {
    casa: r.probabilidadeVitoriaCasa,
    empate: r.probabilidadeEmpate,
    fora: r.probabilidadeVitoriaFora,
  });
  resultCard.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* =========================================================================
   FLUXO PRINCIPAL: envia o formulário e consome o streaming (SSE via fetch)
   ========================================================================= */
/* =========================================================================
   DOWNLOAD DO BOLETIM COMO IMAGEM (PNG)
   Captura só o conteúdo do resultado (sem o próprio botão) usando
   html2canvas. O gráfico 3D usa preserveDrawingBuffer pra não sair em
   branco na captura.
   ========================================================================= */
function slugify(text) {
  return (text || "time")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "time";
}

downloadBtn.addEventListener("click", async () => {
  if (typeof html2canvas === "undefined") {
    statusLine.textContent = "Não foi possível carregar o gerador de imagem. Verifique sua conexão.";
    statusLine.classList.add("error");
    return;
  }

  const originalLabel = downloadBtn.innerHTML;
  downloadBtn.disabled = true;
  downloadBtn.innerHTML = "<span>Gerando imagem...</span>";

  try {
    const canvas = await html2canvas(resultContent, {
      backgroundColor: "#16301F",
      useCORS: true,
      scale: Math.min(window.devicePixelRatio || 1, 2) + 0.5,
    });

    const dataUrl = canvas.toDataURL("image/png");
    const nomeCasa = slugify(currentInput?.timeCasa);
    const nomeFora = slugify(currentInput?.timeFora);

    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `boletim-tatico-${nomeCasa}-x-${nomeFora}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch (err) {
    statusLine.textContent = "Falha ao gerar a imagem do boletim.";
    statusLine.classList.add("error");
  } finally {
    downloadBtn.disabled = false;
    downloadBtn.innerHTML = originalLabel;
  }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const formData = new FormData(form);
  const input = Object.fromEntries(formData.entries());

  if (!input.timeCasa || !input.timeFora) {
    statusLine.textContent = "Informe os dois times para gerar o boletim.";
    statusLine.classList.add("error");
    return;
  }

  submitBtn.disabled = true;
  statusLine.classList.remove("error");
  statusLine.textContent = "";
  resultCard.hidden = true;
  analysisCard.hidden = false;
  thinkingFeed.innerHTML = "";
  setStage("Coletando contexto da partida");
  startProgressCreep();

  if (ambientScene) ambientScene.stop();
  ambientScene = startAmbientScene(scene3dCanvas);

  try {
    const response = await fetch("/api/predict-stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!response.ok || !response.body) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.erro || "Falha ao iniciar a análise.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalData = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split("\n\n");
      buffer = parts.pop();

      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith("data:")) continue;
        const event = JSON.parse(line.slice(5).trim());

        if (event.type === "stage") {
          setStage(event.label);
          const marker = document.createElement("div");
          marker.textContent = `» ${event.label}`;
          marker.style.color = "#E3B23C";
          marker.style.margin = "0.3rem 0";
          thinkingFeed.appendChild(marker);
          thinkingFeed.scrollTop = thinkingFeed.scrollHeight;
        }

        if (event.type === "thinking") {
          thinkingFeed.append(event.text);
          thinkingFeed.scrollTop = thinkingFeed.scrollHeight;
        }

        if (event.type === "result") {
          finalData = event.data;
        }

        if (event.type === "error") {
          throw new Error(event.message);
        }
      }
    }
    if (!finalData) throw new Error("A análise terminou sem gerar um resultado.");

    finishProgress();
    setStage("Boletim pronto");
    await new Promise((r) => setTimeout(r, 350));

    if (ambientScene) {
      ambientScene.stop();
      ambientScene = null;
    }
    analysisCard.hidden = true;
    renderResult(finalData, input);
  } catch (err) {
    statusLine.textContent = `Erro: ${err.message}`;
    statusLine.classList.add("error");
    analysisCard.hidden = true;
    if (ambientScene) {
      ambientScene.stop();
      ambientScene = null;
    }
  } finally {
    submitBtn.disabled = false;
  }
});
