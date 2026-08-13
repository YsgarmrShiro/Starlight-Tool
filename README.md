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

## 4. O repositório de tradução precisa ser público?

**Não.** A API do GitHub funciona normalmente com repositórios privados,
contanto que o token usado pertença a alguém com acesso a ele. A única
coisa que precisa ficar pública (ou acessível ao pessoal certo) é o
**repositório da própria ferramenta**, se você quiser publicá-lo via GitHub
Pages — aí sim, se ele for público, a página HTML fica acessível a
qualquer um com o link (mas sem token válido, ninguém consegue ler ou
escrever nos repositórios de tradução em si).

## 5. Permissões

Não existe login com usuário/senha próprio — a identidade e a permissão de
cada pessoa vêm do token pessoal do GitHub dela:

- **Admin no repositório da ferramenta** → vê e usa a tela de Configurações.
- **Qualquer token válido** → pode revisar, mas só consegue de fato salvar
  nos repositórios de tradução onde tiver permissão de escrita (o próprio
  GitHub barra quem não tem).

## 6. Busca de arquivos

A ferramenta varre **recursivamente** tudo que estiver dentro de
`Originais/<subpasta>/` e `Traduzidas/<subpasta>/`, incluindo pastas
aninhadas. Cada arquivo original é casado com seu equivalente traduzido
pelo caminho relativo (ex: `Originais/dialogos/capitulo1/a.json` casa com
`Traduzidas/dialogos/capitulo1/a.json`). Se não existir um arquivo
traduzido correspondente, ele aparece na lista marcado como **"sem
tradução"** e não pode ser aberto pra revisão.

## 7. Conflitos entre revisores

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

## 8. Rascunho automático (proteção contra refresh)

Enquanto você edita um arquivo, a ferramenta salva automaticamente um
rascunho no `localStorage` do seu navegador (fica só na sua máquina, não
sai daí). Se a página recarregar ou fechar sem querer antes de você
clicar em "Salvar no GitHub", ao reabrir o mesmo arquivo a ferramenta
recupera esse rascunho sozinha e avisa quantos itens foram restaurados.

O rascunho é apagado automaticamente quando você salva com sucesso, ou
quando você escolhe "Sair mesmo assim" ao tentar voltar com alterações
pendentes (nesse caso a intenção já é descartar).

## 9. Progresso automático e presença bloqueante

Os % de **Tradução** e **Revisão** aparecem sozinhos nos cards de jogo,
subpasta e arquivo — não precisa mais clicar em nenhum botão:

- **Tradução**: calculada na hora, olhando só a árvore de arquivos do
  repositório (rápido, sem ler o conteúdo de nada).
- **Revisão**: vem de um cache (`progresso.json`, salvo no repositório da
  própria ferramenta) que é atualizado automaticamente sempre que alguém
  **abre ou salva** uma revisão. Isso também alimenta o painel de **%
  revisado por pessoa**, que aparece ao entrar num jogo.

  Importante: um arquivo só entra na conta depois de ser aberto pelo menos
  uma vez (é só assim que a ferramenta sabe quantos itens ele tem). Quem é
  **admin** vê, ao entrar numa subpasta, quantos arquivos já têm dado no
  cache (ex: "12/1683 arq. no cache") e o botão **"Escanear progresso
  completo"** — que lê todos os arquivos traduzidos daquela subpasta de uma
  vez e recalcula tudo. Pode demorar em pastas muito grandes (a ferramenta
  avisa antes se forem mais de 150 arquivos). Esse botão e o contador só
  aparecem pra admin — revisores não veem, pra não poluir a tela.

Presença agora **bloqueia de verdade**: se alguém já está revisando um
arquivo, ele aparece cinza com a etiqueta "em revisão: fulano" na lista, e
tentar abrir mostra um aviso em vez de deixar entrar.

## 10. Filtro de acesso por jogo

Ao entrar, a ferramenta verifica em qual repositório de jogo você tem
permissão de verdade (checando direto com o GitHub) e só mostra na lista
os jogos onde você tem acesso. Se você não tiver permissão em nenhum dos
jogos cadastrados, aparece um aviso pedindo pra um administrador te
adicionar como colaborador no repositório do jogo que você quer revisar.

Isso vale só pra tela de navegação/revisão — quem é **admin** continua
vendo todos os jogos na tela de Configurações, mesmo sem acesso pessoal ao
repositório de tradução deles, já que ali o que importa é gerenciar o
cadastro, não revisar.

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
