# Aba Telão — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar ao admin uma aba "Telão" para gerenciar as pastas de apresentações de `announcements.sdarmorangevale.com`. As pastas novas são exibidas por um player genérico, e a página principal do site passa a abrir a pasta mais recente com data até hoje e com pelo menos um slide.

**Architecture:** O admin-api ganha um módulo `src/slides/` (sem Express) que lê e escreve a pasta de slides montada da VPS, mais um router `/api/slides` criado por uma fábrica que recebe o diretório, o que permite testá-lo com uma pasta temporária. Cada pasta editável tem um `slides.json` (fonte da verdade) e um `index.html` (player genérico copiado do template). O admin-ui ganha a página `Telao.jsx` com componentes em `src/telao/`. Por fim, o `app/index.html` do projeto `~/Developer/slides` (fora deste repositório) ganha a nova regra da página principal.

**Tech Stack:** Node 22 + Express 4 (CommonJS), `sharp` para ler as imagens, `multer` para upload, testes com `node:test` (embutido, sem dependência nova de teste). React 18 + Vite no admin-ui. nginx no site announcements.

**Spec:** `docs/superpowers/specs/2026-10-24-telao-slides-admin-design.md`

## Global Constraints

- **Pasta somente leitura**: uma pasta **sem** `slides.json` é somente leitura. O código nunca escreve nada nela, nem o `index.html`. Nenhum nome de pasta fica fixo no código.
- **Nomes de pasta**: `^\d{2}_\d{2}_\d{4}$` (`mm_dd_yyyy`). **Nomes de imagem**: `^[0-9a-f]{12}\.(png|jpe?g|webp)$`, com os 12 primeiros caracteres hex do sha256 do conteúdo e a extensão original. Validar os dois antes de montar qualquer caminho.
- **Imagens**: nunca recomprimir, converter ou redimensionar. Os bytes gravados são exatamente os enviados.
- **Validação**:
  - fundo: PNG, JPG ou WebP;
  - texto: PNG ou WebP, com canal alfa e pelo menos 20% dos pixels com alfa = 0;
  - o par precisa ter a mesma proporção, com tolerância de 1%;
  - até 25 MB por imagem;
  - abaixo de 1920×1080 só gera aviso.
  - Mensagem obrigatória: "A imagem de texto precisa ter fundo transparente".
- **`slides.json`**: `{ "version": 1, "slides": [{ "id", "background": "img/<file>", "text": "img/<file>", "addedAt" }] }`. Slides novos e copiados vão para o fim. A gravação é atômica: arquivo temporário na mesma pasta e depois `rename`.
- **Player**:
  - o fundo aparece com fade de cerca de 0,8 s e o texto aparece 1 s depois;
  - **sem avanço automático**;
  - "Pausar" congela as animações e o atraso de 1 s;
  - controles: Voltar, Avançar, Pausar, Recomeçar e Tela cheia (também pela tecla F), mais o contador `n / N`;
  - a barra de controles some 3,5 s depois do último movimento;
  - fundo da página `#080f1d`, imagens com `object-fit: contain`;
  - pasta vazia mostra "Nenhum slide nesta apresentação ainda.".
- **"Hoje"**: a data em `America/Los_Angeles`, calculada com `Intl.DateTimeFormat`. Nunca a data local do aparelho ou do servidor.
- **Diretório**: `SLIDES_DIR` (padrão `/app/slides`). No compose: `${SLIDES_HOST_DIR:-/opt/announcements/slides}:/app/slides`.
- **Aba**: chama "Telão" e fica no topo, depois de "Todos os Eventos". Usa só as variáveis e as classes de `admin-ui/src/styles.css`. CSS novo, só com `--ink-*` e `--accent`.
- **Gateway**: não tocar em `gateway/`.

## Review Focus

1. **Duas abas abertas**: duas abas do admin (ou o Rafael em dois aparelhos) adicionam slides na mesma pasta quase ao mesmo tempo. Nenhum slide pode sumir e o `slides.json` não pode corromper. → Serializar as escritas por pasta com uma fila em memória (Task 2, teste `concurrent adds keep both slides`).
2. **Mesma imagem como fundo e como texto**, ou o mesmo arquivo em dois slides: remover um slide não pode apagar um arquivo que outro slide ainda usa. → Task 2, teste `removing a slide keeps files still referenced`.
3. **Caminho malicioso ou malformado** na URL ou na referência `{folder, file}` (`../`, `10_24_2026/../x`, maiúsculas): deve responder 400 sem tocar no disco. → Task 4, teste `rejects traversal in folder and file params`.
4. **Upload que não é imagem**, por exemplo um PDF renomeado para `.png`, ou um arquivo truncado: deve virar um erro de validação legível, não um 500. → Task 1, teste `non-image buffer is rejected with message`.
5. **Pasta somente leitura** usada como **origem** em "Copiar slides" (ela não tem slides): responder 409 com uma mensagem clara, e as imagens avulsas dela continuam disponíveis no "Escolher de outra pasta". → Task 4, teste `copy from read-only folder is 409`.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `admin-api/src/slides/names.js` | Regex de pasta e de arquivo, conversão de data ↔ nome de pasta, "hoje" no fuso da igreja |
| `admin-api/src/slides/validate.js` | Ler os metadados com sharp e aplicar as regras de imagem e de par |
| `admin-api/src/slides/store.js` | Todas as operações de disco (pastas, manifesto, imagens, órfãos, player, pasta "no ar") |
| `admin-api/src/slides/player.html` | Template do player genérico |
| `admin-api/src/routes/slides.js` | `createSlidesRouter(slidesDir)`, a camada HTTP sobre o `store` |
| `admin-api/src/config.js`, `src/index.js` | `slidesDir` e montagem do router |
| `admin-api/test/*.test.js` | Testes com `node:test` |
| `admin-ui/src/api.js` | Chamadas às rotas `/api/slides` |
| `admin-ui/src/pages/Telao.jsx` | Página com a coluna de pastas e a área da pasta |
| `admin-ui/src/telao/*.jsx` | `FolderList`, `SlideGrid`, `NewFolderModal`, `AddSlideModal`, `ImageSource`, `CopySlidesModal` |
| `admin-ui/src/App.jsx`, `src/styles.css` | Item de topo e estilos novos |
| `docker-compose.yml`, `.gitignore` | Volume do admin-api; ignorar `.superpowers/` |
| `~/Developer/slides/app/index.html` | Regra da página principal (fora do repositório; deploy manual) |

---

### Task 1: Nomes e validação de imagens

**Files:**
- Create: `admin-api/src/slides/names.js`
- Create: `admin-api/src/slides/validate.js`
- Create: `admin-api/test/helpers.js`, `admin-api/test/validate.test.js`, `admin-api/test/names.test.js`
- Modify: `admin-api/package.json`. Adicionar `"test": "node --test test/"` em scripts e as dependências `sharp` e `multer` (a Task 4 usa o multer).

**Interfaces:**
- Produces (`names.js`):
  - `FOLDER_RE`, `FILE_RE` (RegExp);
  - `folderNameFromDate(isoDate: 'YYYY-MM-DD') -> 'MM_DD_YYYY'`, que lança erro se a data for inválida;
  - `folderDateKey(name) -> 'YYYYMMDD'`;
  - `todayKeyInTz(tz = 'America/Los_Angeles', now = new Date()) -> 'YYYYMMDD'`.
- Produces (`validate.js`):
  - `async inspectImage(buffer) -> { format: 'png'|'jpeg'|'webp', width, height, hasAlpha, transparentRatio }`, que lança `ValidationError` se o buffer não for imagem ou estiver em outro formato;
  - `validateRole(meta, role: 'background'|'text', size) -> { errors: string[], warnings: string[] }`;
  - `validatePair(bgMeta, textMeta) -> { errors, warnings }`;
  - `class ValidationError extends Error { errors: string[] }`.
- Produces (`test/helpers.js`): `async makePng({ width, height, transparentRatio = 0 }) -> Buffer` e `async makeJpeg({ width, height }) -> Buffer`, os dois feitos com `sharp({ create })`. Para o `transparentRatio`, compor um retângulo opaco sobre uma tela transparente.

- [ ] **Step 1: Instalar as dependências**

Run: `cd admin-api && npm install sharp multer`
Expected: `package.json` e `package-lock.json` atualizados; `node -e "require('sharp')"` sem erro.

- [ ] **Step 2: Escrever os testes que devem falhar**

`names.test.js`:
- `folderNameFromDate('2026-11-01') === '11_01_2026'`;
- `folderNameFromDate('2026-13-01')` lança erro;
- `folderDateKey('01_05_2027') > folderDateKey('12_31_2026')`;
- `todayKeyInTz('America/Los_Angeles', new Date('2026-10-25T05:00:00Z')) === '20261024'`, porque ainda é dia 24 na Califórnia;
- `FOLDER_RE` recusa `1_5_2026` e `10_24_2026/..`;
- `FILE_RE` aceita `ab12cd34ef56.png` e recusa `../x.png` e `AB12CD34EF56.png`.

`validate.test.js`:
- `text with 50% transparent passes`;
- `text with 10% transparent fails`: o erro contém exatamente "A imagem de texto precisa ter fundo transparente";
- `jpeg as text fails`;
- `jpeg as background passes`;
- `background over 25 MB fails` (passar `size = 25 * 1024 * 1024 + 1` com uma imagem pequena);
- `1280x720 background only warns`: `errors` vazio e `warnings.length === 1`;
- `pair 1920x1080 + 3840x2160 passes`;
- `pair 1920x1080 + 1920x1200 fails`;
- `non-image buffer is rejected with message`: `inspectImage(Buffer.from('%PDF-1.4'))` lança `ValidationError` com uma mensagem em português.

- [ ] **Step 3: Rodar e conferir que falham**

Run: `cd admin-api && npm test`
Expected: FAIL com "Cannot find module '../src/slides/names'".

- [ ] **Step 4: Implementar `names.js` e `validate.js`**

- **`todayKeyInTz`**: seguir o padrão de `getTodayInTz` em `admin-api/src/routes/birthdays.js`.
- **`transparentRatio`**: `sharp(buf).ensureAlpha().extractChannel('alpha').raw().toBuffer()` e contar os bytes iguais a 0 sobre o total. Imagens sem alfa dão 0.
- **Proporção**: `|w1/h1 − w2/h2| / (w1/h1) <= 0.01`.

- [ ] **Step 5: Rodar os testes**

Run: `cd admin-api && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add admin-api/package.json admin-api/package-lock.json admin-api/src/slides/names.js admin-api/src/slides/validate.js admin-api/test/
git commit -m "Add slide image validation for the Telão admin"
```

---

### Task 2: Store de pastas e slides

**Files:**
- Create: `admin-api/src/slides/store.js`
- Create: `admin-api/src/slides/player.html`. Nesta task, um placeholder mínimo com `<!-- telao-player -->`; o player de verdade vem na Task 3.
- Create: `admin-api/test/store.test.js`

**Interfaces:**
- Consumes: `names.js` e `validate.js` da Task 1.
- Produces: `createStore(slidesDir) -> store`, com:
  - `listFolders() -> [{ name, editable, count, live }]`, da mais nova para a mais antiga por `folderDateKey`. Ignora entradas fora de `FOLDER_RE`. `count` é o número de slides nas editáveis e o número de imagens em `img/` nas somente leitura. `live` é true só na pasta que `liveFolderName()` devolve.
  - `liveFolderName(todayKey = todayKeyInTz()) -> string|null`, com a mesma regra da página principal: a data mais nova com chave ≤ hoje que tenha conteúdo. Uma pasta somente leitura sempre tem conteúdo; uma editável precisa de `slides.length > 0`.
  - `getFolder(name) -> { name, editable: true, slides } | { name, editable: false, images: ['img/<file>'] }`.
  - `createFolder(isoDate) -> { name }`. Cria `slides.json` vazio, `img/` e o `index.html` copiado do template. Lança `ConflictError` se a pasta já existir.
  - `imagePath(name, file) -> absolute path`. Lança `NotFoundError` se o arquivo não existir.
  - `addSlide(name, { background, text }) -> slide`. `background` e `text` são `{ buffer }` (upload) ou `{ folder, file }` (referência). Roda `validateRole` nos dois e `validatePair`, e lança `ValidationError` se houver erro. Devolve `{ ...slide, warnings }`.
  - `replaceImage(name, id, role, source) -> slide`, com a mesma validação, inclusive o par contra a outra imagem do slide.
  - `removeSlide(name, id)`.
  - `copySlides(name, from, slideIds) -> slide[]`. Mantém a ordem da origem e gera ids novos.
  - Classes de erro exportadas: `NotFoundError`, `ConflictError` (para escrita em pasta somente leitura, pasta já existente e origem somente leitura) e `ValidationError` (reexportada).
- Regras internas:
  - nome do arquivo = `sha256(buffer).hex.slice(0,12) + '.' + ext` (`jpeg` → `jpg`);
  - não regravar um arquivo que já existe;
  - toda escrita numa pasta passa por uma fila de promessas por nome de pasta;
  - depois de qualquer mudança: gravar `slides.json` de forma atômica, apagar de `img/` os arquivos que nenhum slide usa e regravar o `index.html` a partir do template;
  - modos 0644 para arquivos e 0755 para diretórios.

- [ ] **Step 1: Escrever os testes que devem falhar** (cada teste usa uma pasta temporária com `fs.mkdtemp` e os buffers do `test/helpers.js`)

- `createFolder writes manifest, img dir and player`: as três coisas existem, e `slides.json` é igual a `{version:1,slides:[]}`.
- `createFolder twice is ConflictError`.
- `addSlide appends in insertion order`: depois de três `addSlide`, os ids ficam na ordem de inclusão.
- `addSlide with opaque text is ValidationError and writes nothing`: `img/` continua vazia.
- `addSlide by reference copies bytes identically`: o sha256 do arquivo na pasta de destino é igual ao da origem. Testar também com uma origem somente leitura (pasta com `img/x.png`, sem `slides.json`) usada como fundo.
- `replaceImage swaps background and deletes orphan`.
- `removing a slide keeps files still referenced`: dois slides com o mesmo fundo; remover um não apaga o arquivo.
- `concurrent adds keep both slides`: `Promise.all([addSlide(...), addSlide(...)])` termina com 2 slides.
- `read-only folder rejects every write with ConflictError`, e o `index.html` dela continua byte a byte igual.
- `copySlides keeps source order and new ids`.
- `copy from read-only folder is ConflictError`.
- `listFolders sorts by date across years`: `01_05_2027` vem antes de `12_31_2026`, e a pasta `notadate` fica de fora.
- `liveFolderName skips future and empty`: com as pastas `10_24_2026` (somente leitura), `10_31_2026` (vazia) e `11_07_2026` (com 1 slide), e hoje = `20261101`, o resultado é `10_24_2026`; com hoje = `20261107`, é `11_07_2026`.

- [ ] **Step 2: Rodar e conferir que falham**

Run: `cd admin-api && npm test`
Expected: FAIL com "Cannot find module '../src/slides/store'".

- [ ] **Step 3: Implementar `store.js`**

- [ ] **Step 4: Rodar os testes**

Run: `cd admin-api && npm test`
Expected: PASS em todos, incluindo os da Task 1.

- [ ] **Step 5: Commit**

```bash
git add admin-api/src/slides/store.js admin-api/src/slides/player.html admin-api/test/store.test.js
git commit -m "Add slide folder store with atomic manifest writes"
```

---

### Task 3: Player genérico

**Files:**
- Modify: `admin-api/src/slides/player.html`, substituindo o placeholder.
- Test: `admin-api/test/player.test.js`

**Interfaces:**
- Consumes: o `slides.json` da pasta, buscado com `fetch('slides.json', { cache: 'no-store' })` relativo à página.
- Produces: um único HTML estático, sem dependências externas, que contém a string `<!-- telao-player -->`.

O comportamento segue as Global Constraints do player. Tomar como referência de controles e estilo a apresentação feita à mão (`/opt/announcements/slides/10_24_2026/index.html` na VPS, ou `~/Developer/slides/slides/10_24_2026/index.html`): a barra `.controls`, os textos dos botões, o atalho de teclado e a pausa com `animation-play-state`.

Estrutura dos passos: o slide `i` tem dois passos, `2i` (só o fundo) e `2i+1` (fundo + texto). Entrar num passo par agenda a ida para `2i+1` em 1 s. Avançar ou clicar vai para o passo seguinte. Pausar também suspende esse temporizador: guardar o tempo restante e retomar ao continuar.

Antes de mostrar o primeiro slide, pré-carregar todas as imagens (`new Image()` mais `decode()`), exibindo "Carregando…".

- [ ] **Step 1: Escrever o teste que deve falhar**

`player.test.js` lê o template e verifica que:
- ele contém `<!-- telao-player -->`, `slides.json`, `#080f1d`, `object-fit:contain` ou `object-fit: contain` e "Nenhum slide nesta apresentação ainda.";
- não tem `<script src=` nem `<link`, ou seja, nenhuma dependência externa.

- [ ] **Step 2: Rodar e conferir que falha**

Run: `cd admin-api && node --test test/player.test.js`
Expected: FAIL, porque o placeholder não tem `slides.json`.

- [ ] **Step 3: Implementar o player**

- [ ] **Step 4: Rodar o teste**

Run: `cd admin-api && node --test test/player.test.js`
Expected: PASS.

- [ ] **Step 5: Verificar no navegador**

Montar uma pasta temporária com o `store` (por exemplo, um script de uma linha em `node -e` com `createFolder` e dois `addSlide` usando os helpers de teste) e servi-la com o preview do Browser (uma configuração temporária em `.claude/launch.json` com `python3 -m http.server`, removida no fim). Conferir:
- o fundo aparece e o texto surge 1 s depois;
- a seta direita avança;
- Pausar durante o atraso de 1 s impede o texto de aparecer até clicar em Continuar;
- o contador mostra `1 / 2`;
- a pasta vazia mostra a mensagem.

- [ ] **Step 6: Commit**

```bash
git add admin-api/src/slides/player.html admin-api/test/player.test.js
git commit -m "Add generic Telão slide player"
```

---

### Task 4: Rotas `/api/slides`

**Files:**
- Create: `admin-api/src/routes/slides.js`
- Modify: `admin-api/src/config.js`, adicionando `slidesDir: process.env.SLIDES_DIR || '/app/slides'`.
- Modify: `admin-api/src/index.js`, adicionando `app.use('/api/slides', createSlidesRouter(config.slidesDir))` junto às outras rotas.
- Test: `admin-api/test/routes.test.js`

**Interfaces:**
- Consumes: `createStore` e as classes de erro da Task 2.
- Produces: `createSlidesRouter(slidesDir) -> express.Router`. As rotas e o formato das respostas:

| Método e rota | Corpo | Resposta |
|---|---|---|
| `GET /folders` | | `200 [{ name, editable, count, live }]` |
| `POST /folders` | JSON `{ date: 'YYYY-MM-DD' }` | `201 { name }` |
| `GET /folders/:name` | | `200` com o formato de `getFolder` |
| `GET /folders/:name/img/:file` | | o arquivo, com `Cache-Control: private, max-age=300` |
| `POST /folders/:name/slides` | multipart: campos de arquivo `background` e `text`, **ou** campos de texto `backgroundRef` e `textRef` com o JSON `{folder,file}` | `201 slide` (com `warnings`) |
| `PUT /folders/:name/slides/:id/:role` | `role` ∈ `background`, `text`; multipart: campo de arquivo `image` **ou** campo de texto `imageRef` | `200 slide` |
| `DELETE /folders/:name/slides/:id` | | `204` |
| `POST /folders/:name/copy` | JSON `{ from, slideIds }` | `201 slide[]` |

- **Mapeamento de erros**: `ValidationError` → `422 { error, errors }`; `ConflictError` → `409 { error }`; `NotFoundError` → `404`; nome inválido → `400`.
- **Multer**: `memoryStorage`, com `limits.fileSize = 25 * 1024 * 1024`. O erro `LIMIT_FILE_SIZE` vira `422` com "Imagem maior que 25 MB".

- [ ] **Step 1: Escrever os testes que devem falhar**

Cada teste monta `express()` com o router sobre uma pasta temporária, faz `listen(0)` e usa o `fetch` e o `FormData` embutidos:
- `create folder then add slide via upload`: a pasta é criada com 201, o upload devolve 201 e o `GET` mostra 1 slide.
- `add slide via references`.
- `opaque text returns 422 with message`.
- `rejects traversal in folder and file params`: `GET /folders/..%2F..%2Fetc/img/x.png` e `backgroundRef={"folder":"10_24_2026/..","file":"x.png"}` respondem 400.
- `write to read-only folder is 409`.
- `copy from read-only folder is 409`.
- `oversized upload is 422`: mandar um buffer de 25 MB + 1 byte.

- [ ] **Step 2: Rodar e conferir que falham**

Run: `cd admin-api && npm test`
Expected: FAIL com "Cannot find module '../src/routes/slides'".

- [ ] **Step 3: Implementar o router e montá-lo em `index.js`**

- [ ] **Step 4: Rodar os testes**

Run: `cd admin-api && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add admin-api/src/routes/slides.js admin-api/src/config.js admin-api/src/index.js admin-api/test/routes.test.js
git commit -m "Add /api/slides routes for the Telão admin"
```

---

### Task 5: Interface — lista de pastas, grade e nova pasta

**Files:**
- Modify: `admin-ui/src/api.js`. Acrescentar `getSlideFolders()`, `createSlideFolder(date)`, `getSlideFolder(name)`, `slideImageUrl(name, path)` (que devolve a string `/api/slides/folders/${name}/${path}`), `addSlide(name, formData)`, `replaceSlideImage(name, id, role, formData)`, `deleteSlide(name, id)` e `copySlides(name, from, slideIds)`. Para o multipart, chamar `fetch` sem o header `Content-Type`, porque o `request()` atual força JSON. Usar a mesma extração de `body.error`.
- Modify: `admin-ui/src/App.jsx`, com o novo grupo `telao` e o botão "Telão" depois de "Todos os Eventos".
- Create: `admin-ui/src/pages/Telao.jsx`, `admin-ui/src/telao/FolderList.jsx`, `admin-ui/src/telao/SlideGrid.jsx` e `admin-ui/src/telao/NewFolderModal.jsx`.
- Modify: `admin-ui/src/styles.css`, com as classes novas sob o prefixo `telao-`.

**Interfaces:**
- Consumes: as rotas da Task 4.
- Produces:
  - `<SlideGrid folder onChanged onAddSlide onReplace(id, role) />`, usado pela Task 6. Ele renderiza o cartão "+ Adicionar slide", que chama `onAddSlide`, e as ações "Trocar fundo" e "Trocar texto", que chamam `onReplace`.
  - `Telao` guarda o estado `selected` (nome da pasta) e recarrega a pasta com `reload()` depois de qualquer mudança.

Layout (opção A do spec):
- **Coluna esquerda**: o botão `btn-primary` "+ Nova pasta" e a lista de pastas. Cada item mostra o nome e "N slides" ("N imagens" nas somente leitura), com uma `pill` "só leitura" ou "no ar" quando for o caso.
- **Área direita**: um `page-head` com o nome da pasta, um `btn-ghost` "Copiar slides de outra pasta" (só nas editáveis; nesta task fica desabilitado) e um link `btn-ghost` "Abrir no site ↗" para `https://announcements.sdarmorangevale.com/<pasta>/` (com `target="_blank"`).
- **Cartão de slide**: o número; as miniaturas do fundo e do texto lado a lado, com o texto sobre um xadrez CSS (`repeating-conic-gradient` com `--ink-800` e `--ink-850`); e as ações. "Remover" usa o padrão `confirm-row` que já existe.
- **Pasta somente leitura**: grade simples só com as imagens, sem ações.
- **Nova pasta**: modal no padrão `modal-overlay`, `modal`, `modal-head` e `modal-actions` do `EventFormModal.jsx`, com um `<input type="date">` dentro de `field`. Em caso de 409, mostrar a mensagem da API.

- [ ] **Step 1: Rodar o admin localmente**

Criar uma pasta de teste com uma subpasta somente leitura (copiar `~/Developer/slides/slides/10_24_2026`) e uma editável criada pela API. Subir o admin-api com `SLIDES_DIR=<pasta de teste>` e o admin-ui por uma configuração temporária em `.claude/launch.json` (a de `admin-ui` já existe; adicionar uma para o admin-api na porta 3000 e removê-la no fim).

Expected: `GET /api/slides/folders` responde no proxy do Vite.

- [ ] **Step 2: Implementar os componentes e os estilos**

- [ ] **Step 3: Build**

Run: `cd admin-ui && npm run build`
Expected: o build termina sem erros.

- [ ] **Step 4: Verificar no navegador**

Conferir:
- a aba "Telão" aparece depois de "Todos os Eventos";
- a lista vem em ordem de data, com as etiquetas "só leitura" e "no ar";
- clicar numa pasta mostra a grade;
- criar a pasta `11_01_2026` pelo modal a faz aparecer na lista;
- criar a mesma de novo mostra o erro;
- Remover com confirmação funciona;
- a tela fica correta nos temas claro e escuro (`ThemeToggle`);
- `read_console_messages` não mostra erros.

Tirar um print da tela.

- [ ] **Step 5: Commit**

```bash
git add admin-ui/src/api.js admin-ui/src/App.jsx admin-ui/src/pages/Telao.jsx admin-ui/src/telao/ admin-ui/src/styles.css
git commit -m "Add Telão tab with folder list and slide grid"
```

---

### Task 6: Interface — adicionar, trocar e copiar

**Files:**
- Create: `admin-ui/src/telao/ImageSource.jsx`, `admin-ui/src/telao/AddSlideModal.jsx` e `admin-ui/src/telao/CopySlidesModal.jsx`
- Modify: `admin-ui/src/pages/Telao.jsx`, para ligar os modais e habilitar "Copiar slides".

**Interfaces:**
- Consumes: `SlideGrid` (`onAddSlide` e `onReplace`) da Task 5 e as funções de `api.js`.
- Produces:
  - `<ImageSource label role value onChange folders currentFolder />`. Duas abas, "Enviar arquivo" (`<input type="file" accept="image/png,image/jpeg,image/webp">`) e "Escolher de outra pasta" (seletor de pasta mais grade de miniaturas de todas as imagens dela). O `value` é `{ file }` ou `{ ref: { folder, file } }`.
  - `AddSlideModal`, que serve tanto para adicionar um slide quanto para trocar uma imagem (`mode: 'add' | {replace: role, slide}`):
    - **Prévia**: o texto sobreposto ao fundo, em proporção real.
    - **Envio**: no add, monta um `FormData` com `background` e `text` (ou `backgroundRef` e `textRef`); no replace, com `image` ou `imageRef`.
    - **Erros 422**: a lista `errors` da resposta aparece no modal, e o modal continua aberto.
    - **Avisos**: `warnings` do slide salvo aparecem como aviso depois de salvar.
  - `CopySlidesModal`: seletor só com as pastas editáveis (menos a atual), lista de slides com checkbox e o botão "Copiar N slides".

- [ ] **Step 1: Implementar os três componentes**

- [ ] **Step 2: Build**

Run: `cd admin-ui && npm run build`
Expected: sem erros.

- [ ] **Step 3: Verificar no navegador**, com o mesmo ambiente local da Task 5

1. Adicionar um slide com upload (gerar um fundo e um texto transparente com `test/helpers.js`): ele aparece no fim da grade.
2. Tentar um texto opaco: a mensagem "A imagem de texto precisa ter fundo transparente" aparece no modal.
3. Adicionar um slide usando como fundo uma imagem da pasta somente leitura, escolhida em "Escolher de outra pasta".
4. Tentar usar uma imagem da somente leitura como texto: aparece o erro de transparência.
5. Trocar o texto de um slide.
6. Copiar 2 slides de outra pasta editável: eles entram no fim, na ordem da origem.
7. Abrir `<SLIDES_DIR>/<pasta>/index.html` servido localmente: o player mostra os slides.

Tirar um print.

- [ ] **Step 4: Commit**

```bash
git add admin-ui/src/telao/ admin-ui/src/pages/Telao.jsx
git commit -m "Add slide upload, replace and copy to the Telão tab"
```

---

### Task 7: Infra e página principal do site

**Files:**
- Modify: `docker-compose.yml`, adicionando ao serviço `admin-api` o volume `- ${SLIDES_HOST_DIR:-/opt/announcements/slides}:/app/slides`, ao lado do volume do `service-account.json`.
- Modify: `.gitignore`, adicionando `.superpowers/`.
- Modify (fora do repositório, sem git): `~/Developer/slides/app/index.html`.

**Interfaces:**
- Consumes: o formato do `slides.json` e a mesma regra de `liveFolderName` da Task 2, reimplementada no navegador.

Página principal (`app/index.html`):
- buscar `/_dates/`, filtrar `^\d{2}_\d{2}_\d{4}$` e ordenar pela chave `yyyymmdd`, da mais nova para a mais antiga;
- descartar as chaves maiores que hoje no fuso `America/Los_Angeles` (com `Intl.DateTimeFormat('en-CA', { timeZone, year:'numeric', month:'2-digit', day:'2-digit' })`, que dá `YYYY-MM-DD`);
- para cada candidata, em ordem, buscar `/<pasta>/slides.json` com `cache: 'no-store'`. Resposta **404** = pasta somente leitura = elegível. Resposta 200 com `slides.length > 0` = elegível. Qualquer outro caso: passar para a próxima;
- redirecionar com `location.replace('/<pasta>/')`. Sem nenhuma elegível, mostrar "Nenhuma apresentação disponível.".

- [ ] **Step 1: Testar a regra com node antes de publicar**

Extrair a escolha para uma função pura `pickLive(names, todayKey, hasContent)` no próprio `app/index.html` e testá-la com um `node -e` que carrega o trecho. Usar os mesmos três casos do teste `liveFolderName` da Task 2.

Expected: `10_24_2026` com hoje = `20261101`, e `11_07_2026` com hoje = `20261107`.

- [ ] **Step 2: Publicar o site announcements**

Run: `rsync -a --exclude .env --exclude slides ~/Developer/slides/ root@srv1318351.hstgr.cloud:/opt/announcements/`
Depois: `ssh root@srv1318351.hstgr.cloud 'cd /opt/announcements && docker compose up -d --build'`

O `--exclude slides` é obrigatório. A pasta `slides/` da VPS passa a ser escrita pelo admin, e o rsync não pode sobrescrevê-la.

- [ ] **Step 3: Verificar o site público**

Abrir `https://announcements.sdarmorangevale.com/`: ele deve redirecionar para `/10_24_2026/`, a única pasta hoje.

Depois, na VPS, criar `slides/12_31_2030/` com `slides.json` vazio, abrir `/` de novo, confirmar que ainda vai para `/10_24_2026/` e **apagar a pasta de teste**.

- [ ] **Step 4: Commit da parte do repositório**

```bash
git add docker-compose.yml .gitignore
git commit -m "Mount announcements slides into admin-api"
```

- [ ] **Step 5: Deploy do whatsapp-bots e verificação final** (só com o OK do Rafael para o push)

O push para `main` dispara `.github/workflows/deploy.yml`.

Depois do deploy:
- `ssh root@srv1318351.hstgr.cloud 'docker inspect -f "{{range .Mounts}}{{.Source}} -> {{.Destination}} rw={{.RW}}\n{{end}}" admin-api'` deve listar `/opt/announcements/slides -> /app/slides rw=true`;
- em `https://admin.sdarmorangevale.com`, a aba Telão deve listar `10_24_2026` com as etiquetas "só leitura" e "no ar".
