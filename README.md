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
  StarlightTool/          (criada e mantida automaticamente pela ferramenta)
    revisao/
      <subpasta>/
        arquivo1.json.json
        arquivo2.xml.json
    progresso.json
    presenca.json
    glossario.json
```

A pasta `Traduzidas/` fica sempre limpa — a ferramenta nunca mexe nela além
do texto dos itens em si, então o jogo continua lendo os arquivos
normalmente. Tudo que é "da ferramenta" (status/comentário/revisor de cada
item, cache de progresso, quem está revisando o quê agora) fica dentro de
`StarlightTool/`, separado das pastas de tradução de verdade. Isso também
significa que quem tem permissão de escrita no repositório do jogo (o
mínimo necessário pra revisar) automaticamente já consegue gravar esses
arquivos também — não depende de nenhuma permissão extra no repositório da
ferramenta.

## 3. Cadastrando um jogo

Na tela de Configurações (só aparece pra quem tem permissão **admin** no
repositório da ferramenta), cada jogo tem:

- **Nome**, **owner/repo/branch** do repositório de tradução dele.
- Uma ou mais **subpastas**, cada uma com:
  - **Caminho**: nome da subpasta dentro de `Originais/`/`Traduzidas/`.
  - **Formato**: `json`, `xml`, `txt` ou `csv`.
  - **Campos**: o que isso significa muda por formato —
    - `json`: nomes das chaves que contêm o texto (ex: `text, msg_string`).
    - `xml`: nomes das tags ou atributos (ex: `Text`).
    - `txt`: nomes das chaves em linhas no formato `chave: valor` ou
      `chave=valor` (ex: `msg_001, msg_002`). **Se deixar em branco**, a
      ferramenta trata **cada linha do arquivo como um item**, sem
      exigir esse formato de chave — útil pra `.txt` que é só texto puro,
      uma frase por linha.
    - `csv`: **números das colunas**, começando em 0 (ex: `0, 2` pra
      pegar a primeira e a terceira coluna). CSV não tem nome de campo,
      só posição.

A ferramenta varre o arquivo original e o traduzido em paralelo (eles
precisam ter a mesma estrutura) e casa um trecho de texto do original com o
correspondente no traduzido. Pra `.csv`, isso significa que as linhas
precisam estar na mesma ordem nos dois arquivos (linha N do original casa
com linha N do traduzido).

⚠️ Se o `.csv` tiver uma linha de cabeçalho (nomes das colunas), ela
também aparece como um item revisável — a ferramenta não distingue
cabeçalho de dado. Não atrapalha nada, só sobra um item a mais pra
ignorar/marcar como não aplicável.

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

Ao clicar em "Salvar", a ferramenta te leva de volta pra listagem **na
hora** — o commit continua rodando em segundo plano, e o arquivo fica
travado (pra você também, não só pros outros) até o commit terminar de
verdade. Um toast avisa quando o salvamento conclui (com sucesso ou erro).

Nesse meio tempo, ela busca a versão mais recente do arquivo e do arquivo
de revisão, e aplica só os itens que você mexeu **por cima** dessa versão
mais recente — não sobrescreve o arquivo inteiro. Só dá conflito de
verdade se duas pessoas mexeram exatamente no mesmo item pra valores
diferentes; nesse caso, aquele item específico não é salvo e a ferramenta
avisa quais itens precisam ser refeitos.

Além disso, ao abrir um arquivo a ferramenta registra sua presença num
arquivo compartilhado (`presenca.json`) e avisa se outra pessoa já estiver
revisando o mesmo arquivo. Enquanto você estiver com ele aberto, ela manda
um "sinal de vida" a cada 1 minuto pra renovar essa marca — ela só expira
de verdade (depois de 3 minutos sem sinal) se você fechar a aba ou cair a
conexão, cobrindo esse caso sem deixar o arquivo travado por muito tempo.

## 8. Rascunho automático (proteção contra refresh)

Enquanto você edita um arquivo, a ferramenta salva automaticamente um
rascunho no `localStorage` do seu navegador (fica só na sua máquina, não
sai daí). Se a página recarregar ou fechar sem querer antes de você
clicar em "Salvar no GitHub", ao reabrir o mesmo arquivo a ferramenta
recupera esse rascunho sozinha e avisa quantos itens foram restaurados.

O rascunho é apagado automaticamente quando você salva com sucesso, ou
quando você escolhe "Sair mesmo assim" ao tentar voltar com alterações
pendentes (nesse caso a intenção já é descartar).

## 9. Proteção contra concorrência (fila, retry e commit atômico)

Como vários revisores mexem nos mesmos arquivos compartilhados
(`presenca.json`, `progresso.json`, `glossario.json`, `repos.json`) ao
mesmo tempo, a ferramenta tem algumas camadas de proteção:

- **Fila de escrita**: dentro do seu próprio navegador, toda gravação
  passa por uma fila — nunca duas ao mesmo tempo, mesmo se você disparar
  ações rapidinho uma atrás da outra (abrir um arquivo logo após salvar
  outro, por exemplo). Um indicador "sincronizando..." aparece no topo da
  página sempre que tem algo pendente nessa fila.
- **Atraso + nova tentativa entre pessoas diferentes**: antes de gravar,
  a ferramenta espera um atrasinho aleatório (curto, imperceptível) —
  isso reduz a chance de duas pessoas em navegadores diferentes caírem no
  mesmíssimo instante. Se mesmo assim colidir (o GitHub recusa porque
  alguém gravou primeiro), ela busca a versão mais nova e tenta de novo
  automaticamente, várias vezes se precisar — sem perder o que ninguém
  fez.
- **Reconferência em disputas de verdade** (como duas pessoas tentando
  abrir o mesmo arquivo ao mesmo tempo): em vez de só tentar gravar de
  novo cegamente, a ferramenta relê a regra a cada tentativa — só quem
  realmente "ganhou a corrida" no GitHub fica dono do arquivo, o outro
  descobre isso na hora, sem sobrescrever ninguém.
- **Sinal de vida da presença**: enquanto você está com um arquivo aberto,
  a ferramenta atualiza sua presença sozinha a cada 1 minuto. A trava
  expira em 3 minutos — dá margem pra até duas atualizações falharem
  (rede lenta, por exemplo) antes de considerar que você sumiu de
  verdade. Se você realmente fechar a aba ou perder a conexão, o arquivo
  se libera sozinho depois desses 3 minutos.
- **Commit atômico**: ao salvar uma revisão, o texto traduzido e o status
  (`.revisao`) são gravados **num commit só**, usando a API de baixo nível
  do Git — ou os dois mudam juntos, ou nenhum muda. Isso evita ficar um
  "meio-termo" (texto atualizado mas status não) se a página fechar bem
  no meio do salvamento.
- **Aviso de fechar a aba**: o navegador avisa antes de fechar/recarregar
  sempre que tiver qualquer coisa pendente na fila (não só a revisão
  atual) — abrir arquivo, salvar, progresso, glossário, o que for.

## 10. Progresso automático e presença bloqueante

Os % de **Tradução** e **Revisão** aparecem sozinhos nos cards de jogo,
subpasta e arquivo — não precisa mais clicar em nenhum botão:

- **Tradução**: calculada na hora, olhando só a árvore de arquivos do
  repositório (rápido, sem ler o conteúdo de nada).
- **Revisão**: vem de um cache (`StarlightTool/progresso.json`, salvo
  DENTRO do repositório de cada jogo) que é atualizado automaticamente
  sempre que alguém **abre ou salva** uma revisão. Isso também alimenta o
  painel de **% revisado por pessoa**, que aparece ao entrar num jogo.

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
tentar abrir mostra um aviso em vez de deixar entrar. Assim como o
progresso, isso é salvo em `StarlightTool/presenca.json`, dentro do
repositório do jogo — não no repositório da ferramenta. Isso é proposital:
quem revisa já precisa ter permissão de escrita no repositório do jogo pra
salvar a tradução, então esse mesmo acesso garante que presença e
progresso funcionam pra qualquer revisor, sem depender de nenhuma
permissão extra no repositório da ferramenta (que a maioria dos revisores
nem tem).

## 11. Filtro de acesso por jogo

Ao entrar, a ferramenta verifica em qual repositório de jogo você tem
permissão de verdade (checando direto com o GitHub) e só mostra na lista
os jogos onde você tem acesso. Se você não tiver permissão em nenhum dos
jogos cadastrados, aparece um aviso pedindo pra um administrador te
adicionar como colaborador no repositório do jogo que você quer revisar.

Isso vale só pra tela de navegação/revisão — quem é **admin** continua
vendo todos os jogos na tela de Configurações, mesmo sem acesso pessoal ao
repositório de tradução deles, já que ali o que importa é gerenciar o
cadastro, não revisar.

## 12. Glossário

Cada jogo tem seu próprio glossário — uma tabela de termos com **original**,
**tradução** e uma **observação/contexto** opcional, pra manter consistência
entre revisores diferentes. Fica salvo em `StarlightTool/glossario.json`,
dentro do repositório do jogo.

Qualquer pessoa com permissão de escrita no repositório do jogo (ou seja,
qualquer revisor que já consegue revisar aquele jogo) pode adicionar,
editar ou remover termos — não é uma função exclusiva de admin.

O botão **"📖 Glossário"** aparece assim que você entra num jogo, na tela de
navegação, abrindo a tabela completa (com busca, edição e remoção).

Dentro da própria tela de revisão, tem um **painel fixo na lateral
direita** com uma busca rápida (mostra até 5 termos por vez) e um atalho
pra adicionar um termo novo sem sair de onde você está revisando. Ele fica
"grudado" na tela, acompanhando a rolagem junto com o menu da esquerda. No
fim desse painel tem um link "Ver glossário completo" que leva pra tabela
inteira, se precisar editar ou remover algo.

## 13. Marcar/desmarcar pasta como revisada (admin)

Pra facilitar quando uma tradução já está encaminhada/pronta e só falta
"bater o carimbo", quem é **admin** vê dois mini-botões (**✓** e **✕**)
dentro de cada card de pasta 📁 na navegação — não é um botão único pra
tudo, é por pasta específica (incluindo o que tiver dentro dela, se tiver
subpastas aninhadas).

Duas regras importantes pra não atropelar revisão de verdade:

- **✓ (marcar)** só afeta itens que **ainda não estão aprovados** — um
  item já aprovado por alguém, item por item, nunca é sobrescrito. Itens
  marcados assim não ficam com nome de revisor associado (por isso não
  entram na % por pessoa).
- **✕ (desmarcar)** só reverte itens que foram **marcados em massa**
  (reconhecidos justamente por não terem revisor associado) — revisões
  feitas de verdade, item por item, continuam intactas.

Arquivos que alguém está revisando naquele momento são pulados
automaticamente, e a ferramenta avisa no final quantos foram atualizados e
quantos foram pulados. Em pastas com mais de 150 arquivos, ela avisa antes
que pode demorar.

Tudo isso vira **um commit só** (usando a mesma técnica de commit atômico
do salvamento normal) — não importa se são 5 ou 500 arquivos, o histórico
do repositório não fica poluído com um commit por arquivo.

## 14. Ícone da página

O mesmo `img/icon.jpg` usado no topo também aparece como favicon (o
iconezinho da aba do navegador).

## 15. Painel de status do jogo

Ao entrar num jogo (antes de escolher uma subpasta), aparece um painel na
lateral direita com:

- **Linhas revisadas**: aprovados / total, vindo do mesmo cache de
  progresso de sempre.
- **Linhas traduzidas**: quantas linhas estão dentro de arquivos que já
  têm versão traduzida (não compara texto com o original — só verifica
  se o arquivo existe, é mais rápido). Quando nem todos os arquivos do
  jogo já foram abertos/escaneados, esse número vem com **"~"** na
  frente — é uma estimativa, calculada a partir da média de linhas por
  arquivo já conhecida, multiplicada pelo total de arquivos. Depois de
  rodar o "Escanear progresso completo" em tudo, o "~" some e o número
  fica exato.
- **% revisado por pessoa** (o mesmo painel que já existia, só que agora
  fica aqui do lado em vez de em cima da lista de subpastas).

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
