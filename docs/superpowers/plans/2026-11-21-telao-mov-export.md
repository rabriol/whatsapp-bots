# Exportação MOV/ZIP da Telão Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O player de slides da Telão ganha dois botões, "Baixar slide (MOV)" e "Baixar todos (ZIP)", que geram no navegador os MOVs (com a animação do player) para importar no ProPresenter.

**Architecture:** Módulos ESM novos em `admin-api/src/slides/export/` (matemática dos quadros, geração do MOV e do ZIP) são copiados para cada pasta editável, junto com as bibliotecas `mediabunny` e `fflate`, pelo mesmo `writePlayer` que já copia o `index.html`. O player só carrega esses módulos com `import()` quando o usuário clica em baixar. Cada quadro é desenhado num canvas com as curvas de fade do CSS do player e codificado por WebCodecs.

**Tech Stack:** Node 22 (`node:test`), ESM no navegador, `mediabunny@1.66.2` (MOV via WebCodecs, MPL-2.0), `fflate@0.8.3` (ZIP, MIT), `sharp` só nos testes existentes.

**Spec:** `docs/superpowers/specs/2026-11-21-telao-mov-export-design.md` (contexto geral: `docs/superpowers/specs/2026-10-24-telao-slides-admin-design.md`).

## Global Constraints

- MOV em H.264 (`avc`), 1920×1080, 30 quadros por segundo, sem áudio, escrito com `MovOutputFormat({ fastStart: 'in-memory' })`.
- Linha do tempo de cada MOV: fundo de 0 a 0,8 s com `ease-out`; texto de 1,0 a 1,8 s com `ease`; fim em 2,0 s (60 quadros, `t = i/30`, o último fica 0,2 s com tudo visível). As curvas são as do CSS: `ease-out` = `cubic-bezier(0, 0, 0.58, 1)`, `ease` = `cubic-bezier(0.25, 0.1, 0.25, 1)`.
- Enquadramento `contain` sobre `#080f1d`, como o player; imagens maiores são reduzidas.
- Nomes: MOVs `01.mov`, `02.mov`… pela ordem dos slides; ZIP `anuncios-<mm_dd_yyyy>.zip`.
- Sem CDN e sem `<script src>` ou `<link>` no `player.html`. Os módulos novos vêm da mesma pasta, por `import('./export/…')`, e só no clique.
- Sem mudança no servidor além de copiar arquivos no `writePlayer`. Sem `ffmpeg`.
- Os botões só existem em pastas criadas pela Telão (as únicas que recebem o `player.html`).
- Textos em português: `Seu navegador não consegue gerar vídeo. Use Chrome, Edge ou Safari recentes.` e progresso `Gerando 3 / 22…`. Botões desativados enquanto gera.
- Os arquivos copiados para a pasta usam a extensão `.js` (não `.mjs`): o nginx só serve `.js` com tipo MIME de JavaScript de forma garantida, e o navegador recusa módulos com outro tipo.

## Review Focus

1. Navegador sem WebCodecs ou sem H.264: mostrar a mensagem de "sem suporte", sem travar a página (Task 3).
2. Uma imagem de um slide falha ao carregar no meio do ZIP: erro que cita o número do slide e nenhum ZIP parcial (Task 4).
3. Imagens que não são 16:9, como 1098×561: faixas `#080f1d`, sem distorcer (Task 1).
4. Mais de 99 slides: nomes continuam ordenáveis, `001.mov` (Tasks 1 e 4).
5. Clique duplo ou clique no outro botão durante a geração: ignorado, sem duas gerações ao mesmo tempo (Task 3).

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `admin-api/src/slides/export/package.json` | `{"type":"module"}`, para o Node tratar os `.js` desta pasta como ESM (o navegador não olha este arquivo) |
| `admin-api/src/slides/export/frames.js` | Matemática pura: tempos, opacidade, enquadramento, nomes |
| `admin-api/src/slides/export/exporter.js` | Geração do MOV, ZIP, suporte do navegador, trava de clique duplo |
| `admin-api/src/slides/exportAssets.js` | Lista (CJS) dos arquivos que vão para `<pasta>/export/` |
| `admin-api/src/slides/store.js` | `writePlayer` passa a copiar esses arquivos |
| `admin-api/src/slides/player.html` | Os dois botões e o código que chama os módulos |
| `admin-api/test/frames.test.js`, `exportAssets.test.js`, `exporter.test.js` | Testes novos |
| `admin-api/test/store.test.js`, `player.test.js` | Testes existentes, ampliados |

Os testes são CJS (como os atuais) e carregam os módulos com `await import(...)`.

---

### Task 1: Matemática dos quadros (`frames.js`)

**Files:**
- Create: `admin-api/src/slides/export/package.json`, `admin-api/src/slides/export/frames.js`
- Test: `admin-api/test/frames.test.js`

**Interfaces:**
- Produces (todas exportadas por `frames.js`):
  - Constantes: `WIDTH = 1920`, `HEIGHT = 1080`, `FPS = 30`, `DURATION = 2`, `BACKDROP = '#080f1d'`.
  - `opacityAt(layer: 'background' | 'text', t: number): number` — 0 a 1, curvas do CSS, `t` em segundos.
  - `frameCount(): number` (60) e `frameTimestamp(i: number): number` (`i / FPS`).
  - `containRect(srcW, srcH, boxW = WIDTH, boxH = HEIGHT): { x, y, width, height }`.
  - `movFileName(index: number, total: number): string` (`index` base 0; padding de pelo menos 2 dígitos, ou o necessário para `total`).
  - `zipFileName(folder: string): string`.
  - `folderFromPath(pathname: string): string | null` — extrai `mm_dd_yyyy` do caminho da página.
  - `activeSlideIndex(step: number): number` — `Math.floor(step / 2)`, o mesmo cálculo do player.

- [ ] **Step 1: Escrever os testes** em `test/frames.test.js`, todos com `const f = await import('../src/slides/export/frames.js')`:
  - `opacityAt` do fundo: `0` em `t=0`, `1` em `t=0.8` e em `t=5`; monótona não decrescente de 0 a 2 s em passos de 1/30; maior que `0.5` em `t=0.4` (ease-out).
  - `opacityAt` do texto: `0` em `t=0`, em `0.99` e em `1.0`; `1` em `1.8`; em `t=1.4` fica a menos de 0,01 de `0.8024` (o `ease` do CSS em 50%).
  - `frameCount() === 60`; `opacityAt('background', frameTimestamp(59)) === 1` e idem para o texto.
  - `containRect(1920, 1080)` → `{x:0,y:0,width:1920,height:1080}`; `containRect(1098, 561)` → largura `1920`, altura `981` (±0,5), `x = 0`, `y = 49.5` (±0,5); `containRect(1080, 1080)` → `width 1080`, `x 420`.
  - `movFileName(0, 22) === '01.mov'`, `movFileName(21, 22) === '22.mov'`, `movFileName(0, 101) === '001.mov'`, `movFileName(100, 101) === '101.mov'`.
  - `zipFileName('10_10_2026') === 'anuncios-10_10_2026.zip'`.
  - `folderFromPath('/10_10_2026/') === '10_10_2026'`; `'/10_10_2026/index.html'` idem; `'/'` e `'/abc/'` → `null`.
  - `activeSlideIndex(0) === 0`, `(1) === 0`, `(2) === 1`, `(5) === 2`.
- [ ] **Step 2: Rodar e ver falhar:** `cd admin-api && node --test test/frames.test.js`. Esperado: falha por módulo não encontrado.
- [ ] **Step 3: Implementar `frames.js`** com as assinaturas acima, mais o `package.json` com `{"type":"module"}`. A opacidade resolve a Bézier cúbica do CSS (encontrar `t` para o `x` dado, por bisseção ou Newton) e devolve o `y`; dentro da janela `[start, start + 0.8]` usa o progresso normalizado, antes disso `0`, depois `1`.
- [ ] **Step 4: Rodar e ver passar:** `node --test test/frames.test.js`. Esperado: todos os testes `ok`.
- [ ] **Step 5: Commit**

```bash
git add admin-api/src/slides/export/package.json admin-api/src/slides/export/frames.js admin-api/test/frames.test.js
git commit -m "Add frame timing math for Telão MOV export"
```

---

### Task 2: Dependências e cópia dos módulos para a pasta

**Files:**
- Modify: `admin-api/package.json`, `admin-api/package-lock.json` (via npm), `admin-api/src/slides/store.js` (`writePlayer`, em torno da linha 70)
- Create: `admin-api/src/slides/exportAssets.js`
- Test: `admin-api/test/exportAssets.test.js`, `admin-api/test/store.test.js`

**Interfaces:**
- Consumes: os `.js` de `src/slides/export/` (Task 1).
- Produces: `exportAssets(): { name: string, from: string }[]` em `exportAssets.js` (CJS). A lista contém cada `.js` de `src/slides/export/` (menos `package.json`) mais `mediabunny.js` e `fflate.js`. O `writePlayer` copia cada item para `<pasta>/export/<name>`. Tasks 3 e 4 só acrescentam arquivos em `src/slides/export/` e a lista se atualiza sozinha.

- [ ] **Step 1: Instalar as bibliotecas:** `cd admin-api && npm install --save-exact mediabunny@1.66.2 fflate@0.8.3`. Elas ficam em `dependencies` (o `Dockerfile` usa `npm ci --omit=dev`).
- [ ] **Step 2: Escrever os testes**
  - `exportAssets.test.js`: `exportAssets()` inclui os nomes `frames.js`, `mediabunny.js` e `fflate.js`, e cada `from` existe e não está vazio.
  - `store.test.js`: `createFolder` cria `export/frames.js`, `export/mediabunny.js` e `export/fflate.js` com conteúdo; apagar `export/frames.js` e chamar `addSlide` na pasta o recria; uma pasta feita à mão (o helper já existente) **não** ganha a pasta `export/`.
- [ ] **Step 3: Rodar e ver falhar:** `node --test test/exportAssets.test.js test/store.test.js`.
- [ ] **Step 4: Implementar `exportAssets()`.** O `mediabunny.js` vem do arquivo `mediabunny.min.mjs` que fica na mesma pasta do `require.resolve('mediabunny')`; o `fflate.js` vem do build ESM de navegador do pacote (`esm/browser.js`). Confirmar os caminhos no `node_modules` instalado. O MPL-2.0 do `mediabunny` exige manter o aviso de licença: se o `.mjs` não trouxer o cabeçalho, copiar também o `LICENSE` do pacote como `export/LICENSE-mediabunny.txt`.
- [ ] **Step 5: Alterar `writePlayer`** para criar `<pasta>/export/` (modo `0o755`) e copiar cada arquivo da lista com modo `0o644`, depois do `index.html`.
- [ ] **Step 6: Rodar tudo:** `npm test`. Esperado: todos `ok`, sem quebrar os testes antigos.
- [ ] **Step 7: Commit**

```bash
git add admin-api/package.json admin-api/package-lock.json admin-api/src/slides/exportAssets.js admin-api/src/slides/store.js admin-api/test/exportAssets.test.js admin-api/test/store.test.js
git commit -m "Copy MOV export modules into editable Telão folders"
```

---

### Task 3: Gerar o MOV e o botão "Baixar slide (MOV)" (verificação técnica)

**Files:**
- Create: `admin-api/src/slides/export/exporter.js`
- Modify: `admin-api/src/slides/player.html`
- Test: `admin-api/test/exporter.test.js`, `admin-api/test/player.test.js`

**Interfaces:**
- Consumes: `frames.js` (Task 1) e a cópia para a pasta (Task 2).
- Produces em `exporter.js`:
  - `isExportSupported(mb, env = globalThis): Promise<boolean>` — `false` se `env.VideoEncoder` ou `env.OffscreenCanvas` não existir; senão `mb.canEncodeVideo('avc', { width: WIDTH, height: HEIGHT })`.
  - `renderMov({ mb, loadImage, slide, baseUrl }): Promise<Uint8Array>` — `slide = { background, text }` com caminhos relativos; `loadImage(url)` devolve um `ImageBitmap` (ou imagem desenhável) e quem chama fornece. O MOV segue as Global Constraints.
  - `createExclusive(): { run(fn): Promise<{ ran: boolean, value?: any }> }` — se já houver uma execução, devolve `{ ran: false }` sem chamar `fn`; libera a trava mesmo se `fn` rejeitar (a rejeição sobe).
- No `player.html`: o botão `#dl-one` e `let manifestSlides = []` (guarda a lista do `slides.json` para os caminhos das imagens).

- [ ] **Step 1: Escrever os testes**
  - `exporter.test.js`: `isExportSupported` devolve `false` com `env = {}`; `false` com `env = { VideoEncoder: class {}, OffscreenCanvas: class {} }` e `mb.canEncodeVideo` retornando `false`; `true` quando retorna `true`. `createExclusive`: duas chamadas `run` simultâneas executam `fn` uma só vez e a segunda devolve `{ ran: false }`; depois de uma `fn` que rejeita, um novo `run` volta a executar.
  - `player.test.js`: manter os testes atuais (continuam passando: `import()` não é `<script src>`). Acrescentar: o HTML contém `id="dl-one"`; todo `import('...')` aponta para `./export/`; não existe `http` dentro de nenhum `import(`.
- [ ] **Step 2: Rodar e ver falhar:** `node --test test/exporter.test.js test/player.test.js`.
- [ ] **Step 3: Implementar `isExportSupported`, `createExclusive` e `renderMov`.** Para `renderMov`: desenhar num `OffscreenCanvas(WIDTH, HEIGHT)`; para cada `i` de 0 a `frameCount() - 1`, limpar com `BACKDROP`, desenhar o fundo com `globalAlpha = opacityAt('background', t)` e o texto com `opacityAt('text', t)`, ambos em `containRect` da própria imagem, e chamar `source.add(t, 1 / FPS)` com `t = frameTimestamp(i)`. Saída: `new mb.Output({ format: new mb.MovOutputFormat({ fastStart: 'in-memory' }), target: new mb.BufferTarget() })`, `CanvasSource(canvas, { codec: 'avc', quality: mb.QUALITY_HIGH })`, `output.addVideoTrack(source, { frameRate: FPS })`, `await output.start()` … `await output.finalize()`; devolver `new Uint8Array(target.buffer)`. Fechar o `ImageBitmap` no fim.
- [ ] **Step 4: Alterar o `player.html`.** Acrescentar `<button id="dl-one">Baixar slide (MOV)</button>` à barra de controles. No script, guardar `manifestSlides = list` em `start()`. Ao clicar: dentro de um `createExclusive().run`, importar `./export/exporter.js`, `./export/frames.js` e `./export/mediabunny.js`; se `!(await isExportSupported(mb))`, mostrar a mensagem de "sem suporte" no `.status` e parar; senão gerar o MOV do slide `activeSlideIndex(step)` (capturado no clique), mostrar `Gerando…` no `.status`, e baixar o arquivo (`Blob` + link com `download`, nome `movFileName(índice, total)`). Desativar `#dl-one` enquanto gera e limpar o `.status` ao fim; erros aparecem no `.status`. O `loadImage` é `fetch` + `createImageBitmap`.
- [ ] **Step 5: Rodar tudo:** `npm test`. Esperado: todos `ok`.
- [ ] **Step 6: Commit**

```bash
git add admin-api/src/slides/export/exporter.js admin-api/src/slides/player.html admin-api/test/exporter.test.js admin-api/test/player.test.js
git commit -m "Add single-slide MOV download to the Telão player"
```

- [ ] **Step 7: PARAR: verificação com o Rafael (não seguir para a Task 4 antes).** Gerar uma pasta de teste e servi-la:
  1. Num script descartável fora do repositório (na pasta de rascunho), usar `createStore(<pasta temporária>)`, `createFolder('2026-11-01')` e `addSlide` com dois PNGs de 1920×1080 feitos por `test/helpers.js` (`makePng`), um para o fundo e outro com o texto.
  2. Servir a pasta temporária com `python3 -m http.server` e abrir `http://localhost:<porta>/11_01_2026/` no Chrome.
  3. Clicar em "Baixar slide (MOV)". Esperado: baixa `01.mov` em poucos segundos, sem travar a aba.
  4. Rafael abre o arquivo no QuickTime e no ProPresenter e confirma: toca; fundo entra, texto surge ~1 s depois, termina em ~2 s; cores iguais ao telão; o ProPresenter fica parado no último quadro.
  Se o arquivo não abrir ou as cores diferirem, voltar à escolha da biblioteca antes de continuar.

---

### Task 4: ZIP com todos os slides e o botão "Baixar todos (ZIP)"

**Files:**
- Modify: `admin-api/src/slides/export/exporter.js`, `admin-api/src/slides/player.html`
- Test: `admin-api/test/exporter.test.js`, `admin-api/test/player.test.js`

**Interfaces:**
- Consumes: `renderMov`, `createExclusive`, `isExportSupported` (Task 3); `movFileName`, `zipFileName`, `folderFromPath` (Task 1).
- Produces em `exporter.js`:
  - `class ExportError extends Error` com `slideNumber: number` (base 1).
  - `zipMovs(fflate, files: { name: string, data: Uint8Array }[]): Uint8Array` — `fflate.zipSync` sem compressão (`level: 0`).
  - `exportFolder({ render, fflate, slides, folder, onProgress }): Promise<{ name: string, data: Uint8Array }>` — chama `onProgress(current, total)` (`current` base 1) antes de gerar cada slide; `render(slide)` devolve o MOV; junta tudo em `{ name: zipFileName(folder), data }`. Se `render` rejeitar, rejeita com `ExportError` (mensagem `Não foi possível gerar o slide N.`, `slideNumber = N`) e não devolve ZIP. Lista vazia rejeita com `Error('Nenhum slide para exportar.')`.

- [ ] **Step 1: Escrever os testes** em `exporter.test.js` (com `render` falso e `fflate` real, `import * as fflate from 'fflate'`):
  - Com 3 slides, `onProgress` recebe `[1,3]`, `[2,3]`, `[3,3]` nessa ordem; `name === 'anuncios-10_10_2026.zip'`; `fflate.unzipSync(data)` tem exatamente as chaves `01.mov`, `02.mov`, `03.mov`, com o conteúdo que o `render` falso devolveu.
  - Se `render` rejeita no slide 2: rejeita com `ExportError`, `slideNumber === 2`, e `render` não é chamado para o slide 3.
  - Com 101 slides e `render` falso: as chaves incluem `001.mov` e `101.mov`.
  - Lista vazia rejeita com `Nenhum slide para exportar.`.
  - Em `player.test.js`: o HTML contém `id="dl-all"`.
- [ ] **Step 2: Rodar e ver falhar:** `node --test test/exporter.test.js test/player.test.js`.
- [ ] **Step 3: Implementar `ExportError`, `zipMovs` e `exportFolder`** com as assinaturas acima.
- [ ] **Step 4: Alterar o `player.html`.** Acrescentar `<button id="dl-all">Baixar todos (ZIP)</button>`. O clique usa o mesmo `createExclusive`, os mesmos módulos e a mesma checagem de suporte da Task 3, importa também `./export/fflate.js`, chama `exportFolder` com `render = (slide) => renderMov({ mb, loadImage, slide, baseUrl: location.href })` e `folder = folderFromPath(location.pathname)`, mostra `Gerando n / N…` no `.status` via `onProgress`, e baixa o ZIP. Os dois botões ficam desativados enquanto qualquer geração roda; erros (incluindo o `ExportError`) aparecem no `.status` e nada é baixado.
- [ ] **Step 5: Rodar tudo:** `npm test`. Esperado: todos `ok`.
- [ ] **Step 6: Commit**

```bash
git add admin-api/src/slides/export/exporter.js admin-api/src/slides/player.html admin-api/test/exporter.test.js admin-api/test/player.test.js
git commit -m "Add ZIP download with every Telão slide as MOV"
```

- [ ] **Step 7: Verificação manual do ZIP** na pasta de teste da Task 3 com 3 slides: o clique baixa `anuncios-11_01_2026.zip` com `01.mov`, `02.mov`, `03.mov`; o progresso aparece e os botões ficam desativados; apagar uma imagem da pasta de teste e baixar de novo mostra `Não foi possível gerar o slide N.` e não baixa nada.

---

### Task 5: Conferência de entrega

**Files:**
- Modify: `admin-api/README.md` (uma seção curta sobre a exportação, se o README já descreve as rotas e a Telão; senão, nada)

- [ ] **Step 1: Rodar a suíte completa** em `admin-api`: `npm test`. Esperado: todos `ok`.
- [ ] **Step 2: Conferir que a imagem de produção terá as bibliotecas:** `npm ls --omit=dev mediabunny fflate`. Esperado: as duas listadas, nas versões fixadas.
- [ ] **Step 3: Conferir que `COPY admin-api/src/ ./src/` do `Dockerfile` leva a pasta `src/slides/export/`** (ela está dentro de `src/`, nada a mudar).
- [ ] **Step 4: Registrar no resumo final** (para o Rafael): o deploy do `admin-api` segue o fluxo existente; pastas já existentes só recebem os botões quando forem salvas de novo pelo painel (o `writePlayer` roda a cada gravação); as pastas feitas à mão não ganham botões.
- [ ] **Step 5: Commit** (só se o README mudou)

```bash
git add admin-api/README.md
git commit -m "Document Telão MOV export"
```
