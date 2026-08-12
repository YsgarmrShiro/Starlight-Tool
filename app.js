window.RT = window.RT || {};

const el = (id) => document.getElementById(id);
const gh = () => RT.github;

RT.state = {
  role: null,          // 'admin' | 'revisor'
  username: null,
  games: [],
  gamesSha: null,
  progressData: {},    // cache persistido: gameKey -> { arquivos: { "subpasta/rel": {total,aprovados,porUsuario} } }
  treeCache: {},        // gameKey -> lista de arquivos do repo (evita rebuscar a árvore inteira toda hora)
  cur: null,            // { gameIdx, subpasta }
  file: null,           // dados do arquivo aberto na revisão
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

/* ---------------- modal de confirmação (substitui o confirm() nativo) ---------------- */
function confirmDialog(message) {
  return new Promise((resolve) => {
    el("modalMessage").textContent = message;
    el("modalOverlay").hidden = false;
    const confirmBtn = el("modalConfirm");
    const cancelBtn = el("modalCancel");
    function cleanup(result) {
      el("modalOverlay").hidden = true;
      confirmBtn.removeEventListener("click", onConfirm);
      cancelBtn.removeEventListener("click", onCancel);
      resolve(result);
    }
    function onConfirm() {
      cleanup(true);
    }
    function onCancel() {
      cleanup(false);
    }
    confirmBtn.addEventListener("click", onConfirm);
    cancelBtn.addEventListener("click", onCancel);
  });
}

/* =========================================================
   TELAS
   ========================================================= */
function hideAllScreens() {
  ["screenLogin", "screenConfig", "screenBrowse", "screenReview"].forEach((id) => (el(id).hidden = true));
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

  const progressFile = await gh().getFile(TOOL_REPO.owner, TOOL_REPO.repo, PROGRESS_PATH, TOOL_REPO.branch);
  RT.state.progressData = progressFile ? JSON.parse(progressFile.text) : {};

  el("connStatus").innerHTML = `<span class="dot dot--on"></span><span>${user.login} · ${RT.state.role}</span>`;
  el("btnConfigNav").hidden = RT.state.role !== "admin";

  showBrowse();
}

el("btnLogin").addEventListener("click", async () => {
  const token = el("loginToken").value.trim();
  el("loginError").textContent = "";
  if (!token) {
    el("loginError").textContent = "Cole um token válido.";
    return;
  }
  el("btnLogin").disabled = true;
  el("btnLogin").textContent = "Entrando...";
  try {
    if (el("loginRemember").checked) localStorage.setItem(STORAGE_KEY, token);
    else localStorage.removeItem(STORAGE_KEY);
    await login(token);
  } catch (e) {
    el("loginError").textContent = friendlyError(e);
  } finally {
    el("btnLogin").disabled = false;
    el("btnLogin").textContent = "Entrar";
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
   CONFIGURAÇÕES (admin) — cadastro de jogos
   ========================================================= */
el("btnConfigNav").addEventListener("click", showConfig);
el("btnConfigBack").addEventListener("click", showBrowse);

function showConfig() {
  hideAllScreens();
  el("screenConfig").hidden = false;
  renderGamesList();
}

function renderGamesList() {
  const box = el("gamesList");
  box.innerHTML = "";
  if (RT.state.games.length === 0) {
    box.innerHTML = `<p class="empty-state">Nenhum jogo cadastrado ainda.</p>`;
  }
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
    const ok = await confirmDialog(`Remover "${game.nome}" do cadastro? Isso não apaga o repositório, só tira ele da ferramenta.`);
    if (!ok) return;
    RT.state.games.splice(index, 1);
    await saveGames();
    renderGamesList();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const subpastas = Array.from(subList.querySelectorAll(".subpasta-row")).map((row) => ({
      caminho: row.querySelector(".sp-caminho").value.trim().replace(/^\/+|\/+$/g, ""),
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
  el("btnBrowseBack").hidden = true;
  renderGamesBrowse();
}

el("btnBackToBrowse").addEventListener("click", async () => {
  try {
    if (RT.state.file?.dirty) {
      const ok = await confirmDialog("Há alterações não salvas. Sair mesmo assim? (o rascunho local será descartado)");
      if (!ok) return;
      clearDraft(RT.state.file);
    }
    clearTimeout(draftTimer);
    await releasePresence();
    backToFileListing();
  } catch (e) {
    toast("Erro ao voltar: " + friendlyError(e), "error");
  }
});

function backToFileListing() {
  const c = RT.state.cur;
  hideAllScreens();
  el("screenBrowse").hidden = false;
  if (c && c.subpasta && c.rows) {
    el("btnBrowseBack").hidden = false;
    renderCrumbs();
    renderFolderLevel();
  } else if (c) {
    renderSubpastasBrowse(c.gameIdx);
  } else {
    showBrowse();
  }
}

el("btnBrowseBack").addEventListener("click", () => {
  const c = RT.state.cur;
  if (!c) return showBrowse();
  if (c.folderPath && c.folderPath.length > 0) {
    c.folderPath.pop();
    renderCrumbs();
    renderFolderLevel();
  } else if (c.subpasta) {
    renderSubpastasBrowse(c.gameIdx);
  } else {
    showBrowse();
  }
});

function renderCrumbs() {
  const parts = [`<span class="crumb" data-nav="games">Jogos</span>`];
  const c = RT.state.cur;
  if (c) {
    const game = RT.state.games[c.gameIdx];
    parts.push(`<span class="crumb" data-nav="subpastas">${escapeHtml(game.nome)}</span>`);
    if (c.subpasta) {
      parts.push(`<span class="crumb" data-nav="subroot">${escapeHtml(c.subpasta.caminho)}</span>`);
      (c.folderPath || []).forEach((seg, i) => {
        const isLast = i === c.folderPath.length - 1;
        parts.push(
          isLast
            ? `<span class="crumb-current">${escapeHtml(seg)}</span>`
            : `<span class="crumb" data-nav="folder" data-idx="${i}">${escapeHtml(seg)}</span>`
        );
      });
    }
  }
  el("crumbs").innerHTML = parts.join('<span class="crumb-sep">/</span>');
  el("crumbs").querySelectorAll(".crumb").forEach((b) =>
    b.addEventListener("click", () => {
      const nav = b.dataset.nav;
      if (nav === "games") showBrowse();
      else if (nav === "subpastas") renderSubpastasBrowse(RT.state.cur.gameIdx);
      else if (nav === "subroot") {
        RT.state.cur.folderPath = [];
        renderCrumbs();
        renderFolderLevel();
      } else if (nav === "folder") {
        RT.state.cur.folderPath = RT.state.cur.folderPath.slice(0, Number(b.dataset.idx) + 1);
        renderCrumbs();
        renderFolderLevel();
      }
    })
  );
}

function makeCard({ title, subtitle, badgeHtml = "", progressHtml = "", disabled = false, onClick }) {
  const card = document.createElement("div");
  card.className = "browse-card" + (disabled ? " browse-card--disabled" : "");
  card.innerHTML = `
    <div class="browse-card__main">
      <strong>${title}</strong>
      ${subtitle ? `<span class="browse-card__sub">${subtitle}</span>` : ""}
    </div>
    <div class="browse-card__progress">${badgeHtml}${progressHtml}</div>
    ${disabled ? "" : `<span class="browse-card__arrow">›</span>`}
  `;
  if (!disabled && onClick) {
    card.addEventListener("click", () => onClick());
  }
  return card;
}

function renderGamesBrowse() {
  const box = el("browseList");
  box.innerHTML = "";
  if (RT.state.games.length === 0) {
    box.innerHTML = `<p class="empty-state">Nenhum jogo cadastrado ainda.${
      RT.state.role === "admin" ? ' Vá em "Configurações" pra adicionar um.' : ""
    }</p>`;
    return;
  }
  RT.state.games.forEach((game, i) => {
    const rev = reviewStatsForGame(game);
    const card = makeCard({
      title: escapeHtml(game.nome),
      subtitle: `${(game.subpastas || []).length} subpasta(s)`,
      progressHtml: `<span class="calc-loading">calculando tradução...</span>${pctChip("Revisão", rev.aprovados, rev.total)}`,
      onClick: () => renderSubpastasBrowse(i),
    });
    box.appendChild(card);
    computeGameTranslationCoverage(game)
      .then(({ total, matched }) => {
        const holder = card.querySelector(".browse-card__progress");
        holder.innerHTML = pctChip("Tradução", matched, total) + pctChip("Revisão", rev.aprovados, rev.total);
      })
      .catch(() => {
        const holder = card.querySelector(".browse-card__progress");
        holder.innerHTML = pctChip("Revisão", rev.aprovados, rev.total);
      });
  });
}

function renderSubpastasBrowse(gameIdx) {
  RT.state.cur = { gameIdx, subpasta: null };
  renderCrumbs();
  el("btnBrowseBack").hidden = false;
  const game = RT.state.games[gameIdx];
  const box = el("browseList");
  box.innerHTML = "";

  const { porUsuario, total } = userBreakdownForGame(game);
  const userNames = Object.keys(porUsuario).sort((a, b) => porUsuario[b] - porUsuario[a]);
  if (userNames.length > 0) {
    const panel = document.createElement("div");
    panel.className = "user-breakdown";
    panel.innerHTML =
      `<span class="sidebar__label">% revisado por pessoa</span><div class="user-breakdown__list">` +
      userNames
        .map((u) => {
          const pct = total ? Math.round((porUsuario[u] / total) * 100) : 0;
          return `<span class="pct-chip pct-chip--user">${escapeHtml(u)} ${pct}%</span>`;
        })
        .join("") +
      `</div>`;
    box.appendChild(panel);
  }

  if (!game.subpastas || game.subpastas.length === 0) {
    box.innerHTML += `<p class="empty-state">Esse jogo não tem subpastas cadastradas.</p>`;
    return;
  }
  game.subpastas.forEach((sub) => {
    const rev = reviewStatsForSub(game, sub);
    const card = makeCard({
      title: escapeHtml(sub.caminho),
      subtitle: `${sub.formato} · campos: ${escapeHtml((sub.campos || []).join(", "))}`,
      progressHtml: `<span class="calc-loading">calculando...</span>`,
      onClick: () => openSubpasta(gameIdx, sub),
    });
    box.appendChild(card);
    computeSubTranslationCoverage(game, sub)
      .then(({ total, matched }) => {
        card.querySelector(".browse-card__progress").innerHTML =
          pctChip("Tradução", matched, total) + pctChip("Revisão", rev.aprovados, rev.total);
      })
      .catch(() => {
        card.querySelector(".browse-card__progress").innerHTML = pctChip("Revisão", rev.aprovados, rev.total);
      });
  });
}

async function openSubpasta(gameIdx, sub) {
  RT.state.cur = { gameIdx, subpasta: sub, folderPath: [], rows: null, presence: [] };
  renderCrumbs();
  el("btnBrowseBack").hidden = false;
  const box = el("browseList");
  box.innerHTML = `<p class="empty-state">Carregando arquivos (buscando em todas as subpastas)...</p>`;
  try {
    const game = RT.state.games[gameIdx];
    const [rows, presenceResult] = await Promise.all([listFilesWithMatch(game, sub), readPresence()]);
    RT.state.cur.rows = rows;
    RT.state.cur.presence = presenceResult.list;
    renderFolderLevel();
  } catch (e) {
    box.innerHTML = `<p class="empty-state">Erro ao listar arquivos: ${escapeHtml(friendlyError(e))}</p>`;
  }
}

/** Mostra o conteúdo do "nível de pasta" atual (RT.state.cur.folderPath),
 *  agrupando os itens em pastas e arquivos como um explorador normal —
 *  tudo calculado em cima da lista já buscada (sem chamadas extras à API). */
function renderFolderLevel() {
  const c = RT.state.cur;
  const game = RT.state.games[c.gameIdx];
  const prefix = c.folderPath.length ? c.folderPath.join("/") + "/" : "";
  const box = el("browseList");
  box.innerHTML = "";

  const folders = new Map(); // nome -> { total, traduzidos }
  const files = [];

  c.rows.forEach((r) => {
    if (prefix && !r.rel.startsWith(prefix)) return;
    const rest = r.rel.slice(prefix.length);
    if (!rest) return;
    const slash = rest.indexOf("/");
    if (slash === -1) {
      files.push({ ...r, name: rest });
    } else {
      const folderName = rest.slice(0, slash);
      const info = folders.get(folderName) || { total: 0, traduzidos: 0 };
      info.total++;
      if (r.hasTranslation) info.traduzidos++;
      folders.set(folderName, info);
    }
  });

  if (folders.size === 0 && files.length === 0) {
    box.innerHTML = `<p class="empty-state">Nenhum arquivo .${c.subpasta.formato} encontrado aqui.</p>`;
    return;
  }

  Array.from(folders.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([name, info]) => {
      const folderPrefix = prefix + name + "/";
      const rev = reviewStatsForFolderPrefix(game, c.subpasta, folderPrefix);
      box.appendChild(
        makeCard({
          title: "📁 " + escapeHtml(name),
          subtitle: `${info.total} arquivo(s) · ${info.traduzidos} traduzido(s)`,
          progressHtml: pctChip("Revisão", rev.aprovados, rev.total),
          onClick: () => {
            c.folderPath.push(name);
            renderCrumbs();
            renderFolderLevel();
          },
        })
      );
    });

  files
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((f) => {
      const pathLabel = filePathFor(c.gameIdx, c.subpasta, f.rel);
      const occupant = c.presence.find((p) => p.arquivo === pathLabel && p.usuario !== RT.state.username);
      const isBlocked = !!occupant;
      const stats = f.hasTranslation ? reviewStatsForFile(game, c.subpasta, f.rel) : null;

      let badgeHtml;
      if (!f.hasTranslation) badgeHtml = `<span class="badge badge--missing">Sem tradução</span>`;
      else if (isBlocked) badgeHtml = `<span class="badge badge--busy">em revisão: ${escapeHtml(occupant.usuario)}</span>`;
      else badgeHtml = `<span class="badge badge--ok">Disponível</span>`;

      const progressHtml = f.hasTranslation && !isBlocked ? pctChip("Revisão", stats?.aprovados || 0, stats?.total || 0) : "";

      box.appendChild(
        makeCard({
          title: escapeHtml(f.name),
          badgeHtml,
          progressHtml,
          disabled: !f.hasTranslation || isBlocked,
          onClick: f.hasTranslation && !isBlocked ? () => openReview(c.gameIdx, c.subpasta, f.rel) : null,
        })
      );
    });
}

function reviewStatsForFolderPrefix(game, sub, folderPrefix) {
  const entry = RT.state.progressData[gameKey(game)];
  if (!entry) return { total: 0, aprovados: 0 };
  const keyPrefix = sub.caminho + "/" + folderPrefix;
  let total = 0,
    aprovados = 0;
  Object.entries(entry.arquivos || {}).forEach(([k, f]) => {
    if (!k.startsWith(keyPrefix)) return;
    total += f.total || 0;
    aprovados += f.aprovados || 0;
  });
  return { total, aprovados };
}

/** Varre Originais/<sub> e Traduzidas/<sub> recursivamente (todas as subpastas
 *  dentro delas) e casa cada arquivo original com seu equivalente traduzido
 *  pelo caminho relativo. */
async function listFilesWithMatch(game, sub) {
  const origPrefix = `Originais/${sub.caminho}/`;
  const transPrefix = `Traduzidas/${sub.caminho}/`;
  const ext = "." + sub.formato;

  const [origResult, transResult] = await Promise.all([
    gh().listRecursive(game.owner, game.repo, game.branch, origPrefix),
    gh().listRecursive(game.owner, game.repo, game.branch, transPrefix),
  ]);

  // mapeia caminho relativo -> tamanho em bytes (o tamanho já vem de graça
  // na listagem, então dá pra descartar arquivos traduzidos vazios sem
  // precisar buscar o conteúdo de cada um)
  const transSizes = new Map(
    transResult.files
      .filter((f) => f.path.toLowerCase().endsWith(ext))
      .map((f) => [f.path.slice(transPrefix.length), f.size])
  );

  const rows = origResult.files
    .filter((f) => f.path.toLowerCase().endsWith(ext))
    .map((f) => {
      const rel = f.path.slice(origPrefix.length);
      const size = transSizes.get(rel);
      return { rel, hasTranslation: size !== undefined && size > 0 };
    })
    .sort((a, b) => a.rel.localeCompare(b.rel));

  return rows;
}

function progressBarHtml({ approved, total }) {
  const pct = total ? Math.round((approved / total) * 100) : 0;
  return `<div class="progress__bar progress__bar--inline"><div class="progress__fill" style="width:${pct}%"></div></div><span class="progress__text">${approved}/${total} (${pct}%)</span>`;
}

/* =========================================================
   PROGRESSO — reformulado.

   Duas métricas separadas:
   - "Tradução": quantos arquivos originais têm um traduzido
     correspondente. Calculada ao vivo a partir da árvore do
     repositório (rápida — 1 chamada por jogo, sem ler conteúdo).
   - "Revisão": quantos itens estão aprovados. Vem de um cache
     persistido (progresso.json, no repositório da ferramenta)
     que é atualizado automaticamente toda vez que alguém salva
     uma revisão — não precisa reprocessar tudo pra exibir.
   ========================================================= */
const PROGRESS_PATH = "progresso.json";

function gameKey(game) {
  return `${game.owner}/${game.repo}`;
}
function fileKey(sub, rel) {
  return `${sub.caminho}/${rel}`;
}

async function saveProgressEntry(game, sub, rel, stats) {
  try {
    const latest = await gh().getFile(TOOL_REPO.owner, TOOL_REPO.repo, PROGRESS_PATH, TOOL_REPO.branch);
    const data = latest ? JSON.parse(latest.text) : {};
    const gk = gameKey(game);
    data[gk] = data[gk] || { arquivos: {} };
    data[gk].arquivos[fileKey(sub, rel)] = { ...stats, atualizadoEm: new Date().toISOString() };
    await gh().putFile(
      TOOL_REPO.owner,
      TOOL_REPO.repo,
      PROGRESS_PATH,
      JSON.stringify(data, null, 2),
      latest ? latest.sha : undefined,
      TOOL_REPO.branch,
      "Atualiza cache de progresso"
    );
    RT.state.progressData = data; // mantém a cópia local em dia
  } catch (e) {
    /* best-effort — não impede o salvamento da revisão em si */
  }
}

/** Busca a árvore completa do repositório do jogo UMA VEZ e reaproveita
 *  (jogo → subpastas todas usam a mesma árvore, sem chamadas extras). */
async function getGameTree(game) {
  const key = gameKey(game);
  if (!RT.state.treeCache[key]) {
    const result = await gh().listRecursive(game.owner, game.repo, game.branch, "");
    RT.state.treeCache[key] = result.files;
  }
  return RT.state.treeCache[key];
}

async function computeSubTranslationCoverage(game, sub) {
  const tree = await getGameTree(game);
  const origPrefix = `Originais/${sub.caminho}/`;
  const transPrefix = `Traduzidas/${sub.caminho}/`;
  const ext = "." + sub.formato;
  const transSizes = new Map(
    tree.filter((f) => f.path.startsWith(transPrefix) && f.path.toLowerCase().endsWith(ext)).map((f) => [f.path.slice(transPrefix.length), f.size])
  );
  let total = 0,
    matched = 0;
  tree
    .filter((f) => f.path.startsWith(origPrefix) && f.path.toLowerCase().endsWith(ext))
    .forEach((f) => {
      total++;
      const rel = f.path.slice(origPrefix.length);
      const size = transSizes.get(rel);
      if (size !== undefined && size > 0) matched++;
    });
  return { total, matched };
}

async function computeGameTranslationCoverage(game) {
  let total = 0,
    matched = 0;
  for (const sub of game.subpastas || []) {
    const r = await computeSubTranslationCoverage(game, sub);
    total += r.total;
    matched += r.matched;
  }
  return { total, matched };
}

function reviewStatsForGame(game) {
  const entry = RT.state.progressData[gameKey(game)];
  if (!entry) return { total: 0, aprovados: 0 };
  let total = 0,
    aprovados = 0;
  Object.values(entry.arquivos || {}).forEach((f) => {
    total += f.total || 0;
    aprovados += f.aprovados || 0;
  });
  return { total, aprovados };
}

function reviewStatsForSub(game, sub) {
  const entry = RT.state.progressData[gameKey(game)];
  if (!entry) return { total: 0, aprovados: 0 };
  const prefix = sub.caminho + "/";
  let total = 0,
    aprovados = 0;
  Object.entries(entry.arquivos || {}).forEach(([k, f]) => {
    if (!k.startsWith(prefix)) return;
    total += f.total || 0;
    aprovados += f.aprovados || 0;
  });
  return { total, aprovados };
}

function reviewStatsForFile(game, sub, rel) {
  const entry = RT.state.progressData[gameKey(game)];
  return entry?.arquivos?.[fileKey(sub, rel)] || null;
}

function userBreakdownForGame(game) {
  const entry = RT.state.progressData[gameKey(game)];
  const porUsuario = {};
  let total = 0;
  if (entry) {
    Object.values(entry.arquivos || {}).forEach((f) => {
      total += f.total || 0;
      Object.entries(f.porUsuario || {}).forEach(([u, n]) => {
        porUsuario[u] = (porUsuario[u] || 0) + n;
      });
    });
  }
  return { porUsuario, total };
}

function pctChip(label, num, den) {
  const pct = den ? Math.round((num / den) * 100) : 0;
  return `<span class="pct-chip">${label} ${pct}%</span>`;
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

function filePathFor(gameIdx, sub, rel) {
  const game = RT.state.games[gameIdx];
  return `${game.nome}/${sub.caminho}/${rel}`;
}

/** Verifica se alguém (que não seja você) já está revisando esse arquivo.
 *  Se estiver livre (ou for você mesmo reabrindo), registra sua presença
 *  e libera a entrada. Se estiver ocupado por outra pessoa, NÃO registra
 *  nada e retorna quem está com ele — quem chamou deve bloquear a entrada. */
async function registerPresence(pathLabel) {
  try {
    const { list, sha } = await readPresence();
    const occupant = list.find((p) => p.arquivo === pathLabel && p.usuario !== RT.state.username);
    if (occupant) return { blocked: true, occupant };

    const others = list.filter((p) => p.arquivo !== pathLabel);
    others.push({ arquivo: pathLabel, usuario: RT.state.username, desde: new Date().toISOString() });
    await writePresence(others, sha);
    return { blocked: false };
  } catch (e) {
    return { blocked: false }; // presença é best-effort — não impede a revisão se a checagem falhar
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
   RASCUNHO AUTOMÁTICO — evita perder edições se a página
   recarregar sem querer. Salva no localStorage do navegador
   (não sai da sua máquina), com um pequeno atraso a cada
   edição pra não gravar a cada letra digitada.
   ========================================================= */
const DRAFT_PREFIX = "rt-draft-v1:";

function draftKeyFor(f) {
  return `${DRAFT_PREFIX}${f.game.owner}/${f.game.repo}/${f.game.branch}/${f.sub.caminho}/${f.rel}`;
}

function saveDraftNow() {
  const f = RT.state.file;
  if (!f) return;
  const changed = {};
  f.entries.forEach((e) => {
    if (e.translation !== e.loadedTranslation || e.status !== e.loadedStatus || e.comment !== e.loadedComment) {
      changed[e.id] = { translation: e.translation, status: e.status, comment: e.comment };
    }
  });
  if (Object.keys(changed).length === 0) {
    localStorage.removeItem(draftKeyFor(f));
    return;
  }
  localStorage.setItem(
    draftKeyFor(f),
    JSON.stringify({ savedAt: new Date().toISOString(), usuario: RT.state.username, changed })
  );
}

let draftTimer;
function scheduleDraftSave() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(saveDraftNow, 400);
}

function loadDraft(f) {
  try {
    const raw = localStorage.getItem(draftKeyFor(f));
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function clearDraft(f) {
  localStorage.removeItem(draftKeyFor(f));
}

/* =========================================================
   REVISÃO — abrir arquivo, renderizar, salvar
   ========================================================= */
async function openReview(gameIdx, sub, rel) {
  const game = RT.state.games[gameIdx];
  const pathLabel = filePathFor(gameIdx, sub, rel);

  const presenceResult = await registerPresence(pathLabel);
  if (presenceResult.blocked) {
    toast(
      `Este arquivo já está sendo revisado por ${presenceResult.occupant.usuario} agora. Tente outro arquivo ou aguarde.`,
      "error"
    );
    return; // nem entra na tela de revisão
  }

  hideAllScreens();
  el("screenReview").hidden = false;
  el("entries").innerHTML = `<p class="empty-state">Carregando...</p>`;
  el("presenceBanner").hidden = true;
  el("presenceBanner").innerHTML = "";

  try {
    const [original, translated, metaFile] = await Promise.all([
      gh().getFile(game.owner, game.repo, `Originais/${sub.caminho}/${rel}`, game.branch),
      gh().getFile(game.owner, game.repo, `Traduzidas/${sub.caminho}/${rel}`, game.branch),
      gh().getFile(game.owner, game.repo, `Traduzidas/${sub.caminho}/.revisao/${rel}.json`, game.branch),
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
      rel,
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

    const draft = loadDraft(RT.state.file);
    if (draft && Object.keys(draft.changed).length > 0) {
      let restored = 0;
      entries.forEach((e) => {
        const d = draft.changed[e.id];
        if (d) {
          e.translation = d.translation;
          e.status = d.status;
          e.comment = d.comment;
          restored++;
        }
      });
      if (restored > 0) {
        RT.state.file.dirty = true;
        toast(`Recuperado um rascunho não salvo de ${new Date(draft.savedAt).toLocaleString("pt-BR")} (${restored} item(ns)).`);
      }
    }

    renderEntries();
    el("btnSave").disabled = !RT.state.file.dirty;
    el("dirtyNote").textContent = RT.state.file.dirty ? "há alterações não salvas (rascunho local)" : "";
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
  el("dirtyNote").textContent = "há alterações não salvas (rascunho local)";
  scheduleDraftSave();
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
    const [latestTranslated, latestMetaFile] = await Promise.all([
      gh().getFile(f.game.owner, f.game.repo, `Traduzidas/${f.sub.caminho}/${f.rel}`, f.game.branch),
      gh().getFile(
        f.game.owner,
        f.game.repo,
        `Traduzidas/${f.sub.caminho}/.revisao/${f.rel}.json`,
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

    const newTranslatedText =
      textEdits.size > 0 ? RT.parse.apply(f.sub.formato, latestExtract.data, textEdits, f.sub.campos) : latestTranslated.text;

    if (textEdits.size > 0) {
      const res = await gh().putFile(
        f.game.owner,
        f.game.repo,
        `Traduzidas/${f.sub.caminho}/${f.rel}`,
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
      `Traduzidas/${f.sub.caminho}/.revisao/${f.rel}.json`,
      JSON.stringify(newMeta, null, 2),
      latestMetaFile ? latestMetaFile.sha : undefined,
      f.game.branch,
      `Atualiza status de revisão — por ${RT.state.username}`
    );

    f.entries.forEach((e) => {
      if (textEdits.has(e.id)) e.loadedTranslation = e.translation;
      if (newMeta[e.id] && !conflicts.some((c) => c.id === e.id)) {
        e.loadedStatus = newMeta[e.id].status;
        e.loadedComment = newMeta[e.id].comment;
      }
    });

    // atualiza o cache de progresso (usado pros % automáticos na navegação)
    const porUsuario = {};
    let aprovados = 0;
    Object.values(newMeta).forEach((m) => {
      if (m.status === "approved") {
        aprovados++;
        if (m.reviewer) porUsuario[m.reviewer] = (porUsuario[m.reviewer] || 0) + 1;
      }
    });
    await saveProgressEntry(f.game, f.sub, f.rel, { total: f.entries.length, aprovados, porUsuario });

    if (conflicts.length > 0) {
      toast(`Salvo, mas ${conflicts.length} item(ns) tiveram conflito e não foram sobrescritos — recarregue pra ver a versão de outra pessoa.`, "error");
    } else {
      toast("Salvo no GitHub com sucesso.");
    }
    f.dirty = conflicts.length > 0;
    el("dirtyNote").textContent = f.dirty ? "alguns itens em conflito — veja o aviso acima" : "";
    saveDraftNow(); // limpa o rascunho (ou mantém só o que ainda ficou pendente por conflito)
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
