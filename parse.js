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

  /* ---------------- TXT (chave: valor / chave=valor, uma por linha —
     ou, se nenhuma chave for configurada, uma linha inteira = um item) ---------------- */
  function lineStartsWithAny(line, prefixes) {
    if (!prefixes || prefixes.length === 0) return false;
    const trimmed = line.replace(/^[ \t]+/, "");
    return prefixes.some((p) => p && trimmed.startsWith(p));
  }

  function scanTXTFields(text, fields, ignorarPrefixos) {
    const entries = [];
    fields.forEach((key) => {
      const re = new RegExp(`^([ \\t]*${escapeRegExp(key)}[ \\t]*[:=][ \\t]*)(.*)$`, "gm");
      let m;
      let i = 0;
      while ((m = re.exec(text)) !== null) {
        const prefix = m[1];
        const value = m[2].replace(/\r$/, "");
        const start = m.index + prefix.length;
        const end = start + value.length;
        const id = `${key}#${i}`;
        i++; // sempre incrementa, mesmo se pular — mantém o índice alinhado
        if (value.trim() === "" || lineStartsWithAny(m[0], ignorarPrefixos)) continue;
        entries.push({ id, value, start, end });
      }
    });
    entries.sort((a, b) => a.start - b.start);
    return entries;
  }

  /** Sem nenhuma chave configurada: cada linha do arquivo vira um item,
   *  do jeito que ela está (sem exigir "chave: valor"). Linhas que
   *  começam com algum dos prefixos configurados (ex: um marcador de
   *  seção) são puladas — nunca viram item nem são tocadas ao salvar. */
  function scanTXTLines(text, ignorarPrefixos) {
    const entries = [];
    let i = 0;
    let lineNum = 0;
    const n = text.length;
    while (i < n) {
      const start = i;
      while (i < n && text[i] !== "\n") i++;
      let end = i;
      if (end > start && text[end - 1] === "\r") end--;
      const value = text.slice(start, end);
      if (value.trim() !== "" && !lineStartsWithAny(value, ignorarPrefixos)) {
        entries.push({ id: `line#${lineNum}`, value, start, end });
      }
      lineNum++;
      if (text[i] === "\n") i++;
    }
    return entries;
  }

  function extractTXT(text, fields, ignorarPrefixos) {
    const entries = fields.size === 0 ? scanTXTLines(text, ignorarPrefixos) : scanTXTFields(text, fields, ignorarPrefixos);
    return { data: text, entries };
  }

  function applyTXT(text, edits, fieldsArr, ignorarPrefixos) {
    const entries =
      fieldsArr.length === 0 ? scanTXTLines(text, ignorarPrefixos) : scanTXTFields(text, new Set(fieldsArr), ignorarPrefixos);
    const targets = entries.filter((e) => edits.has(e.id)).sort((a, b) => b.start - a.start);
    let result = text;
    targets.forEach((e) => {
      result = result.slice(0, e.start) + edits.get(e.id) + result.slice(e.end);
    });
    return result;
  }

  /* ---------------- CSV (colunas identificadas por número, começando em 0) ---------------- */
  function encodeCSVField(value) {
    if (/[",\n\r]/.test(value)) return '"' + value.replace(/"/g, '""') + '"';
    return value;
  }

  function scanCSVFields(text, fieldIndices) {
    const wanted = new Set(Array.from(fieldIndices).map(String));
    const entries = [];
    let i = 0;
    let row = 0;
    const n = text.length;
    while (i < n) {
      let col = 0;
      let fieldStart = i;
      let cur = "";
      let inQuotes = false;
      while (i < n) {
        const c = text[i];
        if (inQuotes) {
          if (c === '"') {
            if (text[i + 1] === '"') {
              cur += '"';
              i += 2;
              continue;
            }
            inQuotes = false;
            i++;
            continue;
          }
          cur += c;
          i++;
          continue;
        }
        if (c === '"' && cur === "") {
          inQuotes = true;
          i++;
          continue;
        }
        if (c === ",") {
          if (wanted.has(String(col))) entries.push({ id: `${col}#${row}`, value: cur, start: fieldStart, end: i });
          col++;
          i++;
          fieldStart = i;
          cur = "";
          continue;
        }
        if (c === "\n" || c === "\r") break;
        cur += c;
        i++;
      }
      if (wanted.has(String(col))) entries.push({ id: `${col}#${row}`, value: cur, start: fieldStart, end: i });
      if (text[i] === "\r") i++;
      if (text[i] === "\n") i++;
      row++;
    }
    return entries.filter((e) => e.value.trim() !== "");
  }

  function extractCSV(text, fields) {
    return { data: text, entries: scanCSVFields(text, fields) };
  }

  function applyCSV(text, edits, fieldsArr) {
    const entries = scanCSVFields(text, new Set(fieldsArr));
    const targets = entries.filter((e) => edits.has(e.id)).sort((a, b) => b.start - a.start);
    let result = text;
    targets.forEach((e) => {
      result = result.slice(0, e.start) + encodeCSVField(edits.get(e.id)) + result.slice(e.end);
    });
    return result;
  }

  /* ---------------- despachante por formato ---------------- */
  function extract(format, text, fieldsArr, ignorarPrefixos = []) {
    const fields = new Set(fieldsArr);
    if (format === "json") return extractJSON(text, fields);
    if (format === "xml") return extractXML(text, fields);
    if (format === "txt") return extractTXT(text, fields, ignorarPrefixos);
    if (format === "csv") return extractCSV(text, fields);
    throw new Error("Formato não suportado: " + format);
  }

  function apply(format, data, edits, fieldsArr, ignorarPrefixos = []) {
    if (format === "json") return applyJSON(data, edits, fieldsArr);
    if (format === "xml") return applyXML(data, edits);
    if (format === "txt") return applyTXT(data, edits, fieldsArr, ignorarPrefixos);
    if (format === "csv") return applyCSV(data, edits, fieldsArr);
    throw new Error("Formato não suportado: " + format);
  }

  return { extract, apply };
})();

