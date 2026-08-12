/* =========================================================
   Extração de texto revisável de arquivos .json e .xml.

   A ideia: original e traduzido têm a MESMA estrutura, só o
   texto muda. Então a gente varre os dois usando o mesmo
   "caminho" e casa um com o outro. Só extraímos valores cujo
   nome de campo/tag está na lista configurada pra aquela
   subpasta (ex: "text", "msg_string", "Text").
   ========================================================= */
window.RT = window.RT || {};

RT.parse = (() => {
  /* ---------------- JSON ---------------- */
  function walkJSON(node, fields, path = [], out = []) {
    if (node === null || typeof node !== "object") return out;
    if (Array.isArray(node)) {
      node.forEach((item, i) => walkJSON(item, fields, [...path, i], out));
    } else {
      for (const [k, v] of Object.entries(node)) {
        if (typeof v === "string" && fields.has(k)) {
          out.push({ id: [...path, k].join("."), path: [...path, k], value: v });
        } else if (v !== null && typeof v === "object") {
          walkJSON(v, fields, [...path, k], out);
        }
      }
    }
    return out;
  }

  function getAtPath(root, path) {
    let n = root;
    for (const p of path) n = n?.[p];
    return n;
  }
  function setAtPath(root, path, value) {
    let n = root;
    for (let i = 0; i < path.length - 1; i++) n = n[path[i]];
    n[path[path.length - 1]] = value;
  }

  function extractJSON(text, fields) {
    const data = JSON.parse(text);
    const entries = walkJSON(data, fields);
    return { data, entries };
  }

  function applyJSON(data, edits) {
    // edits: Map(id -> novoTexto)
    edits.forEach((value, id) => {
      const path = id.split(".").map((p) => (/^\d+$/.test(p) ? Number(p) : p));
      setAtPath(data, path, value);
    });
    return JSON.stringify(data, null, 2);
  }

  /* ---------------- XML ---------------- */
  // path = lista de índices (posição entre os filhos diretos) da raiz até o elemento.
  // id = "3.1.0" (texto) ou "3.1.0@nome-do-atributo" (atributo)
  function walkXML(el, fields, path = [], out = []) {
    const children = Array.from(el.children);
    children.forEach((child, i) => {
      const childPath = [...path, i];
      if (fields.has(child.tagName) && child.children.length === 0) {
        out.push({ id: childPath.join("."), path: childPath, kind: "text", value: child.textContent });
      }
      Array.from(child.attributes || []).forEach((attr) => {
        if (fields.has(attr.name)) {
          out.push({
            id: childPath.join(".") + "@" + attr.name,
            path: childPath,
            kind: "attr",
            attr: attr.name,
            value: attr.value,
          });
        }
      });
      walkXML(child, fields, childPath, out);
    });
    return out;
  }

  function nodeAtPath(root, path) {
    let node = root.documentElement;
    for (const i of path) node = node.children[i];
    return node;
  }

  function extractXML(text, fields) {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    const parseError = doc.querySelector("parsererror");
    if (parseError) throw new Error("XML inválido: " + parseError.textContent.slice(0, 200));
    const entries = walkXML(doc.documentElement, fields);
    return { data: doc, entries };
  }

  function applyXML(doc, edits) {
    edits.forEach((value, id) => {
      const [pathStr, attr] = id.split("@");
      const path = pathStr.split(".").map(Number);
      const node = nodeAtPath(doc, path);
      if (attr) node.setAttribute(attr, value);
      else node.textContent = value;
    });
    return new XMLSerializer().serializeToString(doc);
  }

  /* ---------------- despachante por formato ---------------- */
  function extract(format, text, fieldsArr) {
    const fields = new Set(fieldsArr);
    if (format === "json") return extractJSON(text, fields);
    if (format === "xml") return extractXML(text, fields);
    throw new Error("Formato não suportado: " + format);
  }

  function apply(format, data, edits) {
    if (format === "json") return applyJSON(data, edits);
    if (format === "xml") return applyXML(data, edits);
    throw new Error("Formato não suportado: " + format);
  }

  return { extract, apply };
})();
