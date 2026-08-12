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
    return new TextDecoder().decode(bytes);
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

  /** retorna { text, sha } ou null se o arquivo não existir */
  async function getFile(owner, repo, path, branch) {
    try {
      const data = await req(`/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`);
      return { text: b64decode(data.content), sha: data.sha };
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

  return { req, getUser, getPermission, listDir, getFile, putFile };
})();
