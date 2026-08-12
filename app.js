window.RT = window.RT || {};

const el = (id) => document.getElementById(id);
const gh = () => RT.github;

RT.state = {
  role: null,          // 'admin' | 'revisor'
  username: null,
  games: [],
  gamesSha: null,
  progressCache: {},   // chave "gameIdx/subpasta" -> {approved,total}
  cur: null,           // { gameIdx, subpasta, arquivo }
  file: null,          // dados do arquivo aberto na revisão
};

/* ---------------- toast ---------------- */
let toastTimer;
function toast(msg, kind = "ok") {
  const t = el("toast");
  t.textContent = msg;
  t.hidden = false;
  t.className = "toast toast--" + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3500);
}
function friendlyError(e) {
  if (e.status === 401) return "Token inválido ou sem permissão.";
  if (e.status === 404) return "Não encontrado (confira caminho/branch).";
  if (e.status === 409) return "Conflito: alguém salvou uma versão mais nova.";
  return e.message || "Erro desconhecido.";
}

/* =========================================================
   LOGIN
   ========================================================= */
const STORAGE_KEY = "rt-token-v1";

async function login(token) {
  RT.auth = { token };
  const user = await gh().getUser();
  RT.state.username = user.login;

  const perm = await gh().getPermission(TOOL_REPO.owner, TOOL_REPO.repo, user.login);
  RT.state.role = perm === "admin" ? "admin" : "revisor";

  const reposFile = await gh().getFile(TOOL_REPO.owner, TOOL_REPO.repo, "repos.json", TOOL_REPO.branch);
  RT.state.games = reposFile ? JSON.parse(reposFile.text) : [];
  RT.state.gamesSha = reposFile ? reposFile.sha : null;

  el("connStatus").innerHTML = `<span class="dot dot--on"></span><span>${user.login} · ${RT.state.role}</span>`;
  el("btnConfigNav").hidden = RT.state.role !== "admin";
  el("topbarSub").textContent = "confronto de texto original × tradução";

  el("screenLogin").hidden = true;
  showBrowse();
}

el("btnLogin").addEventListener("click", async () => {
  const token = el("loginToken").value.trim();
  el("loginError").textContent = "";
  if (!token) {
    el("loginError").textContent = "Cole um token válido.";
    return;
  }
  if (el("loginRemember").checked) localStorage.setItem(STORAGE_KEY, token);
  else localStorage.removeItem(STORAGE_KEY);
  try {
    await login(token);
  } catch (e) {
    el("loginError").textContent = friendlyError(e);
  }
});

(function autoLogin() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    el("loginToken").value = saved;
    el("loginRemember").checked = true;
    login(saved).catch((e) => (el("loginError").textContent = friendlyError(e)));
  }
})();

/* =========================================================
   TELAS (mostrar uma, esconder as outras)
   ========================================================= */
function hideAllScreens() {
  ["screenLogin", "screenConfig", "screenBrowse", "screenReview"].forEach((id) => (el(id).hidden = true));
}

/* =========================================================
   CONFIGURAÇÕES (admin) — cadastro de jogos
   ========================================================= */
el("btnConfigNav").addEventListener("click", showConfig);

function showConfig() {
  hideAllScreens();
  el("screenConfig").hidden = false;
  renderGamesList();
}

function renderGamesList() {
  const box = el("gamesList");
  box.innerHTML = "";
  RT.state.games.forEach((game, i) => {
    const card = document.createElement("div");
    card.className = "game-card";
    card.innerHTML = `
      <div class="game-card__head">
        <strong>${escapeHtml(game.nome)}</strong>
        <span class="game-card__repo">${escapeHtml(game.owner)}/${escapeHtml(game.repo)} · ${escapeHtml(game.branch || "main")}</span>
      </div>
      <div class="game-card__subs">
        ${(game.subpastas || [])
          .map((s) => `<span class="tag">${escapeHtml(s.caminho)} · ${s.formato}</span>`)
          .join("")}
      </div>
      <button class="btn btn--ghost btn--small gc-edit">Editar</button>
    `;
    card.querySelector(".gc-edit").addEventListener("click", () => openGameForm(i));
    box.appendChild(card);
  });
}

el("btnAddGame").addEventListener("click", () => openGameForm(null));

function openGameForm(index) {
  const tpl = el("tplGameForm").content.cloneNode(true);
  const form = tpl.querySelector(".game-form");
  const game = index === null ? { nome: "", owner: "", repo: "", branch: "main", subpastas: [] } : RT.state.games[index];

  form.querySelector(".gf-nome").value = game.nome;
  form.querySelector(".gf-owner").value = game.owner;
  form.querySelector(".gf-repo").value = game.repo;
  form.querySelector(".gf-branch").value = game.branch || "main";

  const subList = form.querySelector(".subpastas-list");
  const subTpl = form.querySelector(".tpl-subpasta");

  function addSubRow(sub) {
    const row = subTpl.content.cloneNode(true);
    const rowEl = row.querySelector(".subpasta-row");
    rowEl.querySelector(".sp-caminho").value = sub?.caminho || "";
    rowEl.querySelector(".sp-formato").value = sub?.formato || "json";
    rowEl.querySelector(".sp-campos").value = (sub?.campos || []).join(", ");
    rowEl.querySelector(".sp-remove").addEventListener("click", () => rowEl.remove());
    subList.appendChild(rowEl);
  }
  (game.subpastas || []).forEach(addSubRow);
  form.querySelector(".gf-add-sub").addEventListener("click", () => addSubRow());

  form.querySelector(".gf-cancel").addEventListener("click", () => renderGamesList());

  form.querySelector(".gf-delete").addEventListener("click", async () => {
    if (index === null) return renderGamesList();
    if (!confirm(`Remover "${game.nome}" do cadastro? Isso não apaga o repositório, só tira ele da ferramenta.`)) return;
    RT.state.games.splice(index, 1);
    await saveGames();
    renderGamesList();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const subpastas = Array.from(subList.querySelectorAll(".subpasta-row")).map((row) => ({
      caminho: row.querySelector(".sp-caminho").value.trim(),
      formato: row.querySelector(".sp-formato").value,
      campos: row
        .querySelector(".sp-campos")
        .value.split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    }));
    const updated = {
      nome: form.querySelector(".gf-nome").value.trim(),
      owner: form.querySelector(".gf-owner").value.trim(),
      repo: form.querySelector(".gf-repo").value.trim(),
      branch: form.querySelector(".gf-branch").value.trim() || "main",
      subpastas,
    };
    if (index === null) RT.state.games.push(updated);
    else RT.state.games[index] = updated;

    try {
      await saveGames();
      toast("Jogo salvo.");
      renderGamesList();
    } catch (err) {
      toast(friendlyError(err), "error");
    }
  });

  el("gamesList").innerHTML = "";
  el("gamesList").appendChild(form);
}

async function saveGames() {
  // busca a versão mais recente do repos.json antes de sobrescrever
  const latest = await gh().getFile(TOOL_REPO.owner, TOOL_REPO.repo, "repos.json", TOOL_REPO.branch);
  const sha = latest ? latest.sha : undefined;
  await gh().putFile(
    TOOL_REPO.owner,
    TOOL_REPO.repo,
    "repos.json",
    JSON.stringify(RT.state.games, null, 2),
    sha,
    TOOL_REPO.branch,
    `Atualiza cadastro de jogos — por ${RT.state.username}`
  );
  const refreshed = await gh().getFile(TOOL_REPO.owner, TOOL_REPO.repo, "repos.json", TOOL_REPO.branch);
  RT.state.gamesSha = refreshed.sha;
}

/* =========================================================
   NAVEGAÇÃO — jogo → subpasta → arquivo
   ========================================================= */
function showBrowse() {
  hideAllScreens();
  el("screenBrowse").hidden = false;
  RT.state.cur = null;
  renderCrumbs();
  renderGamesBrowse();
}

el("btnBackToBrowse").addEventListener("click", async () => {
  if (RT.state.file?.dirty && !confirm("Há alterações não salvas. Sair mesmo assim?")) return;
  await releasePresence();
  showBrowse();
});

function renderCrumbs() {
  const parts = [`<span class="crumb" data-nav="games">Jogos</span>`];
  const c = RT.state.cur;
  if (c) {
    const game = RT.state.games[c.gameIdx];
    parts.push(`<span class="crumb" data-nav="subpastas">${escapeHtml(game.nome)}</span>`);
    if (c.subpasta) parts.push(`<span class="crumb-current">${escapeHtml(c.subpasta.caminho)}</span>`);
  }
  el("crumbs").innerHTML = parts.join('<span class="crumb-sep">/</span>');
  el("crumbs").querySelectorAll(".crumb").forEach((b) =>
    b.addEventListener("click", () => {
      if (b.dataset.nav === "games") showBrowse();
      else if (b.dataset.nav === "subpastas") renderSubpastasBrowse(RT.state.cur.gameIdx);
    })
  );
}

function renderGamesBrowse() {
  const box = el("browseList");
  if (RT.state.games.length === 0) {
    box.innerHTML = `<p class="empty-state">Nenhum jogo cadastrado ainda.${
      RT.state.role === "admin" ? ' Vá em "Configurações" pra adicionar um.' : ""
    }</p>`;
    return;
  }
  box.innerHTML = "";
  RT.state.games.forEach((game, i) => {
    const card = document.createElement("div");
    card.className = "browse-card";
    card.innerHTML = `
      <div class="browse-card__main">
        <strong>${escapeHtml(game.nome)}</strong>
        <span class="browse-card__sub">${(game.subpastas || []).length} subpasta(s)</span>
      </div>
      <div class="browse-card__progress" data-key="${i}">
        <button class="btn btn--ghost btn--small gp-calc">calcular progresso</button>
      </div>
    `;
    card.querySelector(".browse-card__main").addEventListener("click", () => renderSubpastasBrowse(i));
    card.querySelector(".gp-calc").addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const holder = card.querySelector(".browse-card__progress");
      holder.innerHTML = `<span class="calc-loading">calculando...</span>`;
      const total = await computeGameProgress(i);
      holder.innerHTML = progressBarHtml(total);
    });
    box.appendChild(card);
  });
}

function renderSubpastasBrowse(gameIdx) {
  RT.state.cur = { gameIdx, subpasta: null };
  renderCrumbs();
  const game = RT.state.games[gameIdx];
  const box = el("browseList");
  if (!game.subpastas || game.subpastas.length === 0) {
    box.innerHTML = `<p class="empty-state">Esse jogo não tem subpastas cadastradas.</p>`;
    return;
  }
  box.innerHTML = "";
  game.subpastas.forEach((sub) => {
    const card = document.createElement("div");
    card.className = "browse-card";
    card.innerHTML = `
      <div class="browse-card__main">
        <strong>${escapeHtml(sub.caminho)}</strong>
        <span class="browse-card__sub">${sub.formato} · campos: ${escapeHtml((sub.campos || []).join(", "))}</span>
      </div>
      <div class="browse-card__progress">
        <button class="btn btn--ghost btn--small gp-calc">calcular progresso</button>
      </div>
    `;
    card.querySelector(".browse-card__main").addEventListener("click", () => renderFilesBrowse(gameIdx, sub));
    card.querySelector(".gp-calc").addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const holder = card.querySelector(".browse-card__progress");
      holder.innerHTML = `<span class="calc-loading">calculando...</span>`;
      const total = await computeSubpastaProgress(gameIdx, sub);
      holder.innerHTML = progressBarHtml(total);
    });
    box.appendChild(card);
  });
}

async function renderFilesBrowse(gameIdx, sub) {
  RT.state.cur = { gameIdx, subpasta: sub };
  renderCrumbs();
  const game = RT.state.games[gameIdx];
  const box = el("browseList");
  box.innerHTML = `<p class="empty-state">Carregando arquivos...</p>`;
  try {
    const items = await gh().listDir(game.owner, game.repo, `Traduzidas/${sub.caminho}`, game.branch);
    const files = items.filter((f) => f.type === "file" && f.name.toLowerCase().endsWith("." + sub.formato));
    if (files.length === 0) {
      box.innerHTML = `<p class="empty-state">Nenhum arquivo .${sub.formato} encontrado em Traduzidas/${escapeHtml(sub.caminho)}.</p>`;
      return;
    }
    box.innerHTML = "";
    files.forEach((f) => {
      const card = document.createElement("div");
      card.className = "browse-card";
      card.innerHTML = `<div class="browse-card__main"><strong>${escapeHtml(f.name)}</strong></div>`;
      card.addEventListener("click", () => openReview(gameIdx, sub, f.name));
      box.appendChild(card);
    });
  } catch (e) {
    box.innerHTML = `<p class="empty-state">Erro ao listar arquivos: ${escapeHtml(friendlyError(e))}</p>`;
  }
}

function progressBarHtml({ approved, total }) {
  const pct = total ? Math.round((approved / total) * 100) : 0;
  return `<div class="progress__bar progress__bar--inline"><div class="progress__fill" style="width:${pct}%"></div></div><span class="progress__text">${approved}/${total} (${pct}%)</span>`;
}

/* =========================================================
   PROGRESSO (calculado sob demanda, cacheado na sessão)
   ========================================================= */
async function computeFileProgress(game, sub, arquivo) {
  const translated = await gh().getFile(game.owner, game.repo, `Traduzidas/${sub.caminho}/${arquivo}`, game.branch);
  if (!translated) return { approved: 0, total: 0 };
  const { entries } = RT.parse.extract(sub.formato, translated.text, sub.campos);
  const metaFile = await gh().getFile(
    game.owner,
    game.repo,
    `Traduzidas/${sub.caminho}/.revisao/${arquivo}.json`,
    game.branch
  );
  const meta = metaFile ? JSON.parse(metaFile.text) : {};
  const approved = entries.filter((e) => meta[e.id]?.status === "approved").length;
  return { approved, total: entries.length };
}

async function computeSubpastaProgress(gameIdx, sub) {
  const game = RT.state.games[gameIdx];
  const items = await gh().listDir(game.owner, game.repo, `Traduzidas/${sub.caminho}`, game.branch);
  const files = items.filter((f) => f.type === "file" && f.name.toLowerCase().endsWith("." + sub.formato));
  let approved = 0,
    total = 0;
  for (const f of files) {
    const p = await computeFileProgress(game, sub, f.name);
    approved += p.approved;
    total += p.total;
  }
  const key = `${gameIdx}/${sub.caminho}`;
  RT.state.progressCache[key] = { approved, total };
  return { approved, total };
}

async function computeGameProgress(gameIdx) {
  const game = RT.state.games[gameIdx];
  let approved = 0,
    total = 0;
  for (const sub of game.subpastas || []) {
    const p = await computeSubpastaProgress(gameIdx, sub);
    approved += p.approved;
    total += p.total;
  }
  return { approved, total };
}

/* =========================================================
   PRESENÇA — quem está revisando o quê agora
   ========================================================= */
const PRESENCE_PATH = "presenca.json";
const PRESENCE_STALE_MS = 20 * 60 * 1000; // 20 minutos

async function readPresence() {
  const f = await gh().getFile(TOOL_REPO.owner, TOOL_REPO.repo, PRESENCE_PATH, TOOL_REPO.branch);
  const list = f ? JSON.parse(f.text) : [];
  const now = Date.now();
  return { list: list.filter((p) => now - new Date(p.desde).getTime() < PRESENCE_STALE_MS), sha: f?.sha };
}

async function writePresence(list, sha) {
  await gh().putFile(
    TOOL_REPO.owner,
    TOOL_REPO.repo,
    PRESENCE_PATH,
    JSON.stringify(list, null, 2),
    sha,
    TOOL_REPO.branch,
    "Atualiza presença de revisão"
  );
}

function filePathFor(gameIdx, sub, arquivo) {
  const game = RT.state.games[gameIdx];
  return `${game.nome}/${sub.caminho}/${arquivo}`;
}

async function registerPresence(pathLabel) {
  try {
    const { list, sha } = await readPresence();
    const others = list.filter((p) => p.arquivo !== pathLabel || p.usuario !== RT.state.username);
    others.push({ arquivo: pathLabel, usuario: RT.state.username, desde: new Date().toISOString() });
    await writePresence(others, sha);
    return list.find((p) => p.arquivo === pathLabel && p.usuario !== RT.state.username);
  } catch (e) {
    return null; // presença é best-effort — não bloqueia a revisão se falhar
  }
}

async function releasePresence() {
  if (!RT.state.file) return;
  try {
    const { list, sha } = await readPresence();
    const remaining = list.filter(
      (p) => !(p.arquivo === RT.state.file.pathLabel && p.usuario === RT.state.username)
    );
    if (remaining.length !== list.length) await writePresence(remaining, sha);
  } catch (e) {
    /* best-effort */
  }
}

/* =========================================================
   REVISÃO — abrir arquivo, renderizar, salvar
   ========================================================= */
async function openReview(gameIdx, sub, arquivo) {
  hideAllScreens();
  el("screenReview").hidden = false;
  el("entries").innerHTML = `<p class="empty-state">Carregando...</p>`;

  const game = RT.state.games[gameIdx];
  const pathLabel = filePathFor(gameIdx, sub, arquivo);

  const occupiedBy = await registerPresence(pathLabel);
  const banner = el("presenceBanner");
  if (occupiedBy) {
    banner.hidden = false;
    banner.innerHTML = `⚠️ <strong>${escapeHtml(occupiedBy.usuario)}</strong> já está revisando este arquivo (desde ${new Date(
      occupiedBy.desde
    ).toLocaleTimeString("pt-BR")}). Cuidado pra não sobrescrever o trabalho.`;
  } else {
    banner.hidden = true;
    banner.innerHTML = "";
  }

  try {
    const [original, translated, metaFile] = await Promise.all([
      gh().getFile(game.owner, game.repo, `Originais/${sub.caminho}/${arquivo}`, game.branch),
      gh().getFile(game.owner, game.repo, `Traduzidas/${sub.caminho}/${arquivo}`, game.branch),
      gh().getFile(game.owner, game.repo, `Traduzidas/${sub.caminho}/.revisao/${arquivo}.json`, game.branch),
    ]);

    if (!original || !translated) throw new Error("Arquivo original ou traduzido não encontrado.");

    const origExtract = RT.parse.extract(sub.formato, original.text, sub.campos);
    const transExtract = RT.parse.extract(sub.formato, translated.text, sub.campos);
    const meta = metaFile ? JSON.parse(metaFile.text) : {};
    const transById = new Map(transExtract.entries.map((e) => [e.id, e]));

    const entries = origExtract.entries.map((oe) => {
      const te = transById.get(oe.id);
      const m = meta[oe.id] || { status: "pending", comment: "", reviewer: "" };
      return {
        id: oe.id,
        original: oe.value,
        translation: te ? te.value : "",
        status: m.status,
        comment: m.comment,
        reviewer: m.reviewer,
        loadedTranslation: te ? te.value : "",
        loadedStatus: m.status,
        loadedComment: m.comment,
      };
    });

    RT.state.file = {
      gameIdx,
      sub,
      arquivo,
      pathLabel,
      game,
      translatedData: transExtract.data,
      translatedSha: translated.sha,
      metaSha: metaFile ? metaFile.sha : null,
      entries,
      filter: "all",
      search: "",
      dirty: false,
    };

    renderEntries();
  } catch (e) {
    el("entries").innerHTML = `<p class="empty-state">Erro ao carregar: ${escapeHtml(friendlyError(e))}</p>`;
  }
}

function renderEntries() {
  const f = RT.state.file;
  const container = el("entries");
  const list = f.entries.filter(passesFilter);

  if (list.length === 0) {
    container.innerHTML = `<p class="empty-state">Nenhuma entrada bate com o filtro/busca atual.</p>`;
  } else {
    container.innerHTML = "";
    list.forEach((e) => container.appendChild(renderEntryCard(e)));
  }
  updateProgress();
}

function passesFilter(e) {
  const f = RT.state.file;
  if (f.filter !== "all" && e.status !== f.filter) return false;
  if (f.search) {
    const q = f.search.toLowerCase();
    return e.original.toLowerCase().includes(q) || e.translation.toLowerCase().includes(q);
  }
  return true;
}

function renderEntryCard(e) {
  const card = document.createElement("article");
  card.className = "entry";
  card.dataset.status = e.status;

  card.innerHTML = `
    <div class="entry__col">
      <span class="entry__label">Original <span class="entry__id">#${escapeHtml(e.id)}</span></span>
      <div class="entry__original">${escapeHtml(e.original)}</div>
    </div>
    <div class="entry__col">
      <span class="entry__label">Tradução</span>
      <textarea class="entry__translation" rows="3">${escapeHtml(e.translation)}</textarea>
    </div>
    <div class="entry__footer">
      <div class="status-btns">
        <button class="status-btn ${e.status === "pending" ? "is-active" : ""}" data-s="pending">Pendente</button>
        <button class="status-btn ${e.status === "approved" ? "is-active" : ""}" data-s="approved">Aprovado</button>
        <button class="status-btn ${e.status === "flagged" ? "is-active" : ""}" data-s="flagged">A revisar</button>
      </div>
      <input class="entry__comment" placeholder="comentário..." value="${escapeAttr(e.comment)}">
      <span class="entry__reviewer">${e.reviewer ? "por " + escapeHtml(e.reviewer) : ""}</span>
    </div>
  `;

  card.querySelector(".entry__translation").addEventListener("input", (ev) => {
    e.translation = ev.target.value;
    markDirty();
  });
  card.querySelector(".entry__comment").addEventListener("input", (ev) => {
    e.comment = ev.target.value;
    markDirty();
  });
  card.querySelectorAll(".status-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      e.status = btn.dataset.s;
      e.reviewer = RT.state.username;
      card.dataset.status = e.status;
      card.querySelectorAll(".status-btn").forEach((b) => b.classList.toggle("is-active", b === btn));
      card.querySelector(".entry__reviewer").textContent = "por " + e.reviewer;
      markDirty();
      updateProgress();
    });
  });

  return card;
}

function markDirty() {
  RT.state.file.dirty = true;
  el("btnSave").disabled = false;
  el("dirtyNote").textContent = "há alterações não salvas";
}

function updateProgress() {
  const f = RT.state.file;
  const total = f.entries.length;
  const approved = f.entries.filter((e) => e.status === "approved").length;
  el("progressFill").style.width = total ? `${(approved / total) * 100}%` : "0%";
  el("progressText").textContent = `${approved} / ${total} aprovados`;
}

el("filterGroup").addEventListener("click", (e) => {
  const btn = e.target.closest(".chip");
  if (!btn) return;
  RT.state.file.filter = btn.dataset.filter;
  el("filterGroup").querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-active", c === btn));
  renderEntries();
});
el("searchBox").addEventListener("input", (e) => {
  RT.state.file.search = e.target.value;
  renderEntries();
});

/* ---------- salvar com mesclagem item a item ---------- */
async function saveReview() {
  const f = RT.state.file;
  el("btnSave").disabled = true;
  el("btnSave").textContent = "Salvando...";

  try {
    // 1. busca a versão mais recente de tradução + metadados
    const [latestTranslated, latestMetaFile] = await Promise.all([
      gh().getFile(f.game.owner, f.game.repo, `Traduzidas/${f.sub.caminho}/${f.arquivo}`, f.game.branch),
      gh().getFile(
        f.game.owner,
        f.game.repo,
        `Traduzidas/${f.sub.caminho}/.revisao/${f.arquivo}.json`,
        f.game.branch
      ),
    ]);
    const latestExtract = RT.parse.extract(f.sub.formato, latestTranslated.text, f.sub.campos);
    const latestTransById = new Map(latestExtract.entries.map((e) => [e.id, e.value]));
    const latestMeta = latestMetaFile ? JSON.parse(latestMetaFile.text) : {};

    const conflicts = [];
    const textEdits = new Map();
    const newMeta = { ...latestMeta };

    f.entries.forEach((e) => {
      const touchedText = e.translation !== e.loadedTranslation;
      const touchedMeta = e.status !== e.loadedStatus || e.comment !== e.loadedComment;
      if (!touchedText && !touchedMeta) return;

      const remoteText = latestTransById.get(e.id);
      if (touchedText) {
        if (remoteText !== undefined && remoteText !== e.loadedTranslation && remoteText !== e.translation) {
          conflicts.push({ id: e.id, campo: "tradução", seu: e.translation, remoto: remoteText });
        } else {
          textEdits.set(e.id, e.translation);
        }
      }

      if (touchedMeta) {
        const remoteM = latestMeta[e.id];
        const loadedM = { status: e.loadedStatus, comment: e.loadedComment };
        const remoteChanged = remoteM && (remoteM.status !== loadedM.status || remoteM.comment !== loadedM.comment);
        if (remoteChanged && (remoteM.status !== e.status || remoteM.comment !== e.comment)) {
          conflicts.push({ id: e.id, campo: "revisão", seu: `${e.status}: ${e.comment}`, remoto: `${remoteM.status}: ${remoteM.comment}` });
        } else {
          newMeta[e.id] = { status: e.status, comment: e.comment, reviewer: e.reviewer || RT.state.username };
        }
      }
    });

    // 2. aplica as edições de texto em cima dos dados MAIS RECENTES (não nos que tínhamos carregado)
    const newTranslatedText =
      textEdits.size > 0 ? RT.parse.apply(f.sub.formato, latestExtract.data, textEdits) : latestTranslated.text;

    if (textEdits.size > 0) {
      const res = await gh().putFile(
        f.game.owner,
        f.game.repo,
        `Traduzidas/${f.sub.caminho}/${f.arquivo}`,
        newTranslatedText,
        latestTranslated.sha,
        f.game.branch,
        `Revisão de tradução — por ${RT.state.username}`
      );
      f.translatedSha = res.content.sha;
    }

    await gh().putFile(
      f.game.owner,
      f.game.repo,
      `Traduzidas/${f.sub.caminho}/.revisao/${f.arquivo}.json`,
      JSON.stringify(newMeta, null, 2),
      latestMetaFile ? latestMetaFile.sha : undefined,
      f.game.branch,
      `Atualiza status de revisão — por ${RT.state.username}`
    );

    // 3. atualiza os "loaded*" locais pra refletir o que foi salvo de fato
    f.entries.forEach((e) => {
      if (textEdits.has(e.id)) e.loadedTranslation = e.translation;
      if (newMeta[e.id] && !conflicts.some((c) => c.id === e.id)) {
        e.loadedStatus = newMeta[e.id].status;
        e.loadedComment = newMeta[e.id].comment;
      }
    });

    if (conflicts.length > 0) {
      toast(`Salvo, mas ${conflicts.length} item(ns) tiveram conflito e não foram sobrescritos — recarregue pra ver a versão de outra pessoa.`, "error");
    } else {
      toast("Salvo no GitHub com sucesso.");
    }
    f.dirty = conflicts.length > 0;
    el("dirtyNote").textContent = f.dirty ? "alguns itens em conflito — veja o aviso acima" : "";
  } catch (e) {
    toast(friendlyError(e), "error");
    f.dirty = true;
  } finally {
    el("btnSave").textContent = "Salvar no GitHub";
    el("btnSave").disabled = !f.dirty;
  }
}
el("btnSave").addEventListener("click", saveReview);

/* ---------- utilidades ---------- */
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

window.addEventListener("beforeunload", (e) => {
  if (RT.state.file?.dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});
