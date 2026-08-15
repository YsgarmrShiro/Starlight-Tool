/* =========================================================
   Extração de texto revisável de arquivos .json e .xml.

   A ideia: original e traduzido têm a MESMA estrutura, só o
   texto muda. Só extraímos valores cujo nome de campo/tag está
   na lista configurada pra aquela subpasta (ex: "text",
   "msg_string", "Text").
   ========================================================= */
window.RT = window.RT || {};

RT.parse = (() => {
  /* ---------------- JSON ----------------
     Arquivos desse tipo (saídos de ferramentas como o KuroTools)
     costumam ter números em hexadecimal (0x2, 0xffffffff) e outras
     coisas que não são JSON estrito — JSON.parse rejeita isso.
     Em vez de parsear o arquivo inteiro, a gente LOCALIZA no texto
     cru só os pares "campo": "valor" dos campos configurados, e
     troca só o conteúdo entre aspas. O resto do arquivo (incluindo
     os hexadecimais) nunca é tocado nem reformatado. */
  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function scanJSONFields(text, fields) {
    const entries = [];
    fields.forEach((key) => {
      const re = new RegExp(`"${escapeRegExp(key)}"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*")`, "g");
      let m;
      let i = 0;
      while ((m = re.exec(text)) !== null) {
        const quoted = m[1];
        const start = m.index + m[0].length - quoted.length;
        const end = start + quoted.length;
        let value;
        try {
          value = JSON.parse(quoted);
        } catch (_) {
          value = quoted.slice(1, -1);
        }
        const id = `${key}#${i}`;
        i++; // sempre incrementa, mesmo se pular — mantém o índice alinhado entre original e traduzido
        if (value.trim() === "") continue; // campo vazio — não vira item de revisão
        entries.push({ id, value, start, end });
      }
    });
    // ordena pela posição no arquivo, só por conveniência de leitura
    entries.sort((a, b) => a.start - b.start);
    return entries;
  }

  function extractJSON(text, fields) {
    return { data: text, entries: scanJSONFields(text, fields) };
  }

  function applyJSON(text, edits, fieldsArr) {
    const entries = scanJSONFields(text, new Set(fieldsArr));
    const targets = entries.filter((e) => edits.has(e.id)).sort((a, b) => b.start - a.start);
    let result = text;
    targets.forEach((e) => {
      const newQuoted = JSON.stringify(edits.get(e.id));
      result = result.slice(0, e.start) + newQuoted + result.slice(e.end);
    });
    return result;
  }

  /* ---------------- XML ---------------- */
  // path = lista de índices (posição entre os filhos diretos) da raiz até o elemento.
  // id = "3.1.0" (texto) ou "3.1.0@nome-do-atributo" (atributo)
  function walkXML(el, fields, path = [], out = []) {
    const children = Array.from(el.children);
    children.forEach((child, i) => {
      const childPath = [...path, i];
      if (fields.has(child.tagName) && child.children.length === 0 && child.textContent.trim() !== "") {
        out.push({ id: childPath.join("."), path: childPath, kind: "text", value: child.textContent });
      }
      Array.from(child.attributes || []).forEach((attr) => {
        if (fields.has(attr.name) && attr.value.trim() !== "") {
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
    const firstTag = text.indexOf("<");
    const cleanText = firstTag > 0 ? text.slice(firstTag) : text;
    const doc = new DOMParser().parseFromString(cleanText, "application/xml");
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

  function apply(format, data, edits, fieldsArr) {
    if (format === "json") return applyJSON(data, edits, fieldsArr);
    if (format === "xml") return applyXML(data, edits);
    throw new Error("Formato não suportado: " + format);
  }

  return { extract, apply };
})();

