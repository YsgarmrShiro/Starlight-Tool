# Revisor de Traduções (v1)

Ferramenta estática (HTML/CSS/JS puro) pra equipe revisar traduções de fãs de
vários jogos, direto pelo GitHub Pages. Nenhum dado passa por servidor
externo — tudo é lido e salvo direto nos repositórios via API do GitHub.

## 1. Publicar a ferramenta

1. Edite `tool.config.js` e coloque o owner/repo/branch de ONDE VOCÊ VAI
   HOSPEDAR esta própria ferramenta. É nesse repositório que ficam:
   - `repos.json` — cadastro dos jogos
   - `presenca.json` — quem está revisando o quê agora
2. Suba os arquivos (`index.html`, `style.css`, `app.js`, `github.js`,
   `parse.js`, `tool.config.js`) pra esse repositório.
3. Ative o GitHub Pages em **Settings → Pages**.
4. Dê permissão **admin** nesse repositório pra quem vai poder cadastrar
   jogos, e pelo menos permissão de leitura pros demais.

⚠️ Se o repositório for público, a página fica acessível a qualquer pessoa
com o link. Isso é normal — quem não tiver token válido só consegue ver,
não consegue salvar nada em lugar nenhum.

## 2. Estrutura esperada em cada repositório de tradução

```
NomeDoRepo/
  Originais/
    <subpasta>/
      arquivo1.json
      arquivo2.xml
  Traduzidas/
    <subpasta>/
      arquivo1.json      (mesmo nome, texto já traduzido)
      arquivo2.xml
      .revisao/          (criado automaticamente pela ferramenta)
        arquivo1.json.json
        arquivo2.xml.json
```

A pasta `.revisao/` guarda status, comentário e revisor de cada item —
**nunca** mexe no arquivo de tradução em si além do texto, então o jogo
continua lendo o arquivo normalmente.

## 3. Cadastrando um jogo

Na tela de Configurações (só aparece pra quem tem permissão **admin** no
repositório da ferramenta), cada jogo tem:

- **Nome**, **owner/repo/branch** do repositório de tradução dele.
- Uma ou mais **subpastas**, cada uma com:
  - **Caminho**: nome da subpasta dentro de `Originais/`/`Traduzidas/`.
  - **Formato**: `json` ou `xml`.
  - **Campos**: nomes das chaves (json) ou tags/atributos (xml) que
    contêm o texto a revisar — ex: `text, msg_string` ou `Text`.

A ferramenta varre o arquivo original e o traduzido em paralelo (eles
precisam ter a mesma estrutura) e casa um trecho de texto do original com o
correspondente no traduzido.

## 4. Permissões

Não existe login com usuário/senha próprio — a identidade e a permissão de
cada pessoa vêm do token pessoal do GitHub dela:

- **Admin no repositório da ferramenta** → vê e usa a tela de Configurações.
- **Qualquer token válido** → pode revisar, mas só consegue de fato salvar
  nos repositórios de tradução onde tiver permissão de escrita (o próprio
  GitHub barra quem não tem).

## 5. Conflitos entre revisores

Ao salvar, a ferramenta busca a versão mais recente do arquivo e do arquivo
de revisão, e aplica só os itens que você mexeu **por cima** dessa versão
mais recente — não sobrescreve o arquivo inteiro. Só dá conflito de
verdade se duas pessoas mexeram exatamente no mesmo item pra valores
diferentes; nesse caso, aquele item específico não é salvo e a ferramenta
avisa quais itens precisam ser refeitos.

Além disso, ao abrir um arquivo a ferramenta registra sua presença num
arquivo compartilhado (`presenca.json`) e avisa se outra pessoa já estiver
revisando o mesmo arquivo. Essa marca expira sozinha depois de 20 minutos
(pra cobrir o caso de alguém fechar a aba sem clicar em "voltar").

## Limitações conhecidas desta primeira versão (pra ajustar depois)

- O progresso (%) não é calculado automaticamente ao navegar — tem um botão
  "calcular progresso" porque isso exige ler todos os arquivos daquela
  pasta, o que pode ser lento em pastas com muitos arquivos. Dá pra evoluir
  isso depois com algum tipo de cache persistente.
- A marca de presença gera um commit extra a cada arquivo aberto/fechado
  no repositório da ferramenta — pouco tráfego, mas gera histórico "poluído"
  nesse repositório especificamente (os repositórios de tradução não são
  afetados).
- O casamento entre original e traduzido assume que a estrutura dos dois
  arquivos é idêntica (só o texto muda). Se algum arquivo tiver estrutura
  diferente entre as duas versões, alguns itens podem não casar direito.
