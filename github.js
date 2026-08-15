/* =========================================================
   GitHub API — camada fina sobre a Contents API + afins.
   Tudo aqui usa o token da pessoa logada (window.RT.auth.token).
   ========================================================= */
window.RT = window.RT || {};

RT.github = (() => {
  function token() {
    return RT.auth?.token;
  }

  async function req(path, opts = {}) {
    const res = await fetch(`https://api.github.com${path}`, {
      ...opts,
      cache: "no-store", // nunca usar resposta guardada em cache pelo navegador — sempre busca a versão real e atual
      headers: {
        Authorization: `token ${token()}`,
        Accept: "application/vnd.github+json",
        ...(opts.headers || {}),
      },
    });
    if (!res.ok) {
      let msg = res.statusText;
      try {
        msg = (await res.json()).message || msg;
      } catch (_) {}
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    if (res.status === 204) return null;
    return res.json();
  }

  function b64encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin);
  }
  function b64decode(b64) {
    const bin = atob(b64.replace(/\n/g, ""));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    let text = new TextDecoder().decode(bytes);
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // remove BOM, se houver
    return text;
  }

  async function getUser() {
    return req("/user");
  }

  /** 'admin' | 'write' | 'read' | 'none' */
  async function getPermission(owner, repo, username) {
    try {
      const r = await req(`/repos/${owner}/${repo}/collaborators/${username}/permission`);
      return r.permission;
    } catch (e) {
      return "none";
    }
  }

  async function listDir(owner, repo, path, branch) {
    const items = await req(`/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`);
    return Array.isArray(items) ? items : [items];
  }

  /** Lista TODOS os arquivos (recursivamente) cujo caminho comece com `prefix`.
   *  Usa a Git Trees API — uma chamada só, mesmo pra pastas com subpastas aninhadas. */
  async function listRecursive(owner, repo, branch, prefix) {
    const tree = await req(`/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
    const files = tree.tree.filter((t) => t.type === "blob" && t.path.startsWith(prefix));
    return { files, truncated: !!tree.truncated };
  }

  /** retorna { text, sha } ou null se o arquivo não existir.
   *  Arquivos maiores que 1MB não vêm com conteúdo pela Contents API
   *  (só os metadados) — nesse caso busca o conteúdo pela Blobs API,
   *  que suporta arquivos bem maiores. */
  async function getFile(owner, repo, path, branch) {
    try {
      const data = await req(`/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`);
      let content = data.content;
      if (!content && data.sha) {
        const blob = await req(`/repos/${owner}/${repo}/git/blobs/${data.sha}`);
        content = blob.content;
      }
      if (!content) throw new Error(`Não foi possível ler o conteúdo de "${path}" (arquivo vazio ou grande demais).`);
      return { text: b64decode(content), sha: data.sha };
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  }

  async function putFile(owner, repo, path, text, sha, branch, message) {
    return req(`/repos/${owner}/${repo}/contents/${path}`, {
      method: "PUT",
      body: JSON.stringify({
        message,
        content: b64encode(text),
        sha: sha || undefined,
        branch,
      }),
    });
  }

  /** Grava vários arquivos NUM COMMIT SÓ (atômico) — ou todos mudam, ou
   *  nenhum muda. Usa a Git Data API de baixo nível (blob → tree →
   *  commit → atualiza a branch), em vez de um PUT por arquivo.
   *  Se a branch tiver avançado entre o começo e o fim (outro commit
   *  qualquer aconteceu nesse meio tempo), tenta de novo em cima da
   *  base mais recente, até um limite de tentativas. */
  async function commitMultipleFiles(owner, repo, branch, message, files, maxAttempts = 5) {
    let lastErr;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 150 + Math.random() * 350));

      const ref = await req(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
      const baseCommitSha = ref.object.sha;
      const baseCommit = await req(`/repos/${owner}/${repo}/git/commits/${baseCommitSha}`);
      const baseTreeSha = baseCommit.tree.sha;

      const blobs = await Promise.all(
        files.map(async (f) => {
          const blob = await req(`/repos/${owner}/${repo}/git/blobs`, {
            method: "POST",
            body: JSON.stringify({ content: b64encode(f.content), encoding: "base64" }),
          });
          return { path: f.path, sha: blob.sha };
        })
      );

      const newTree = await req(`/repos/${owner}/${repo}/git/trees`, {
        method: "POST",
        body: JSON.stringify({
          base_tree: baseTreeSha,
          tree: blobs.map((b) => ({ path: b.path, mode: "100644", type: "blob", sha: b.sha })),
        }),
      });

      const newCommit = await req(`/repos/${owner}/${repo}/git/commits`, {
        method: "POST",
        body: JSON.stringify({ message, tree: newTree.sha, parents: [baseCommitSha] }),
      });

      try {
        await req(`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
          method: "PATCH",
          body: JSON.stringify({ sha: newCommit.sha, force: false }),
        });
        return { sha: newCommit.sha };
      } catch (e) {
        if (e.status === 422 || e.status === 409) {
          lastErr = e;
          continue; // a branch mudou no meio do caminho — tenta de novo em cima da base atual
        }
        throw e;
      }
    }
    throw lastErr || new Error("Não foi possível commitar depois de várias tentativas.");
  }

  return { req, getUser, getPermission, listDir, listRecursive, getFile, putFile, commitMultipleFiles };
})();
