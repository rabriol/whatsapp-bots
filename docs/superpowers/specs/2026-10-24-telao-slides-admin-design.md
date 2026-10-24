# Aba "Telão" no admin: gerenciar as apresentações de announcements

Data: 2026-10-24

## Intenção

O site `announcements.sdarmorangevale.com` é projetado no telão da igreja. As apresentações ficam na VPS em `/opt/announcements/slides/<mm_dd_yyyy>/`, e a página principal do site redireciona para a pasta de data mais recente (veja "Estado atual").

Hoje, mudar uma apresentação exige editar HTML à mão e copiar arquivos para a VPS pelo terminal. O Rafael quer fazer tudo pelo admin portal (`admin.sdarmorangevale.com`): ver as pastas, ver as imagens, criar pastas novas, adicionar ou remover imagens e reaproveitar imagens de outras pastas. Ele mesmo prepara as imagens e sempre consegue gerar os dois arquivos no formato esperado.

## Objetivos

1. **Aba nova** "Telão" no topo do admin, ao lado de "Todos os Eventos".
2. **Pastas**: listar todas as pastas de data; ao clicar numa, ver os slides ou as imagens dela.
3. **Nova pasta**: criar uma pasta para uma data.
4. **Adicionar slide** numa pasta editável: um slide = imagem de **fundo** + imagem de **texto**. Cada uma vem de upload ou é escolhida de outra pasta.
5. **Remover slide** e **trocar** o fundo ou o texto de um slide existente.
6. **Copiar slides** inteiros de outra pasta editável para a pasta atual.
7. **Validar as imagens** antes de salvar.
8. **Apresentação automática**: o site exibe as pastas novas sem ninguém escrever HTML.
9. **Página principal**: abre a pasta mais recente com data até hoje e com pelo menos um slide.

## Não-objetivos

- **Pasta `10_24_2026`**: não editar. Ela é uma apresentação feita à mão, com camadas e animações específicas, e fica exatamente como está.
- **Apagar pastas** pelo admin (decisão minha, do Claude: evita apagar uma apresentação inteira sem querer).
- **Reordenar slides** arrastando. A ordem é a de inclusão (decisão do Rafael).
- **Editar imagens**: nada de recortar, comprimir, converter ou redimensionar. O arquivo é guardado exatamente como foi enviado.
- **Backup** automático das pastas.
- **Login próprio**: o admin já fica atrás do Cloudflare Access.

## Anti-objetivos (seria um fracasso mesmo funcionando)

- **Qualidade**: qualquer perda de qualidade nas imagens. Elas vão para o telão.
- **Telão vazio**: um slide aparecer sem imagem ou com buraco durante o culto.
- **Pasta especial**: mexer na `10_24_2026`, nem que seja só reescrever o `index.html` dela.
- **Visual destoante**: a aba parecer de outro sistema. Ela precisa seguir o visual das outras páginas do admin.
- **Gateway**: tocar no `gateway/` do whatsapp-bots (regra permanente do projeto).

## Estado atual (relevante para o builder)

### Site announcements (fora deste repositório)

- **Código-fonte**: `~/Developer/slides` no Mac do Rafael, sem git. Na VPS fica em `/opt/announcements/`.
- **Container `announcements`**: nginx 1.27-alpine com `./slides` montado em `/usr/share/nginx/html:ro`. Ele entra na rede externa `whatsapp-bots_whatsapp-net` e o `cloudflared` deste repositório o publica.
- **Rotas do nginx**:
  - `/` serve `app/index.html` (que vem da imagem Docker). Essa página busca `/_dates/` (autoindex JSON da pasta `slides/`), filtra os nomes `^\d{2}_\d{2}_\d{4}$`, ordena por ano, mês e dia e redireciona para a mais recente.
  - Arquivos inexistentes dão 404.
  - `Cache-Control: public, max-age=300` no conteúdo.
- **`slides/10_24_2026/`**: um `index.html` feito à mão mais `img/<sha256-12>.png`, com 22 imagens. Não tem `slides.json`.

### whatsapp-bots

- **`admin-api`**: Express 4, CommonJS. Hoje só fala com Google Sheets. Também serve o build do `admin-ui` (Dockerfile em duas etapas). Não tem testes automatizados.
- **`admin-ui`**: React 18 + Vite.
  - Navegação de topo em `App.jsx` (`group`: `bots` | `allEvents`), com os estilos em `src/styles.css`. Classes existentes: `content`, `page-head`, `card`, `card-head`, `btn-primary`, `btn-ghost`, `btn-danger`, `icon-btn`, `field`, `pill`, `confirm-row`, e os modais de `EventFormModal.jsx`, entre outras.
  - Já existe uma sub-aba **"Anúncios"** em Bots, que é do bot de WhatsApp. Por isso a aba nova se chama **"Telão"**.
- **Deploy**: `.github/workflows/deploy.yml` faz SSH na VPS, executa `git pull` em `/opt/whatsapp-bots`, regenera todos os `.env` e roda `docker compose build && up -d`.

## Design

### Modelo de dados em disco

Cada pasta **editável** fica em `slides/<mm_dd_yyyy>/` com:

```
slides.json     ← fonte da verdade da apresentação
index.html      ← o player genérico (o mesmo para todas as pastas editáveis)
img/<hash>.<ext>
```

`slides.json`:

```json
{
  "version": 1,
  "slides": [
    { "id": "<uuid>", "background": "img/ab12cd34ef56.jpg", "text": "img/9f8e7d6c5b4a.png", "addedAt": "2026-10-24T18:00:00Z" }
  ]
}
```

- **Ordem**: é a ordem do array. Slide novo, incluindo os copiados, entra no fim.
- **Nome dos arquivos**: os primeiros 12 caracteres hex do sha256 do conteúdo, mais a extensão original. Assim a mesma imagem nunca é guardada duas vezes na mesma pasta, e uma cópia entre pastas é um arquivo idêntico.
- **Escrita atômica**: o `slides.json` é gravado num arquivo temporário na mesma pasta e depois renomeado.
- **Arquivos órfãos**: depois de remover ou trocar um slide, apagar de `img/` os arquivos que nenhum slide da pasta usa mais.

**Regra editável × somente leitura**: uma pasta **com** `slides.json` é editável. Uma pasta **sem** ele, como a `10_24_2026`, é somente leitura. O admin lista as imagens de `img/` dela só para visualizar e copiar, e nunca escreve nada nela. Não existe nenhum nome de pasta fixo no código.

**Nome das pastas**: `mm_dd_yyyy`, gerado a partir de uma data escolhida num seletor de data. Tentar criar uma pasta que já existe dá erro e mostra a mensagem correspondente.

### Player genérico (`index.html` das pastas editáveis)

É um HTML estático, com CSS e JS inline e sem dependências. Ele lê `slides.json` (relativo à pasta, com `cache: 'no-store'`) e monta os slides. O comportamento copia a apresentação atual, que o Rafael já usa no telão:

- **Ritmo**: o fundo aparece (fade de cerca de 0,8 s) e, 1 s depois, a imagem de texto aparece por cima com um fade.
- **Avançar**: no primeiro avanço, se o texto ainda não apareceu, ele aparece; senão, vai para o próximo slide. Funciona pelo botão "Avançar", clique na tela, seta direita, PageDown, Espaço ou Enter.
- **Voltar**: botão "Voltar", seta esquerda, PageUp ou Backspace.
- **Sem avanço automático**: os slides só passam quando alguém avança. A apresentação atual também é assim: o único temporizador dela é o atraso de 1 s antes de o texto aparecer.
- **Outros controles**:
  - "Pausar" congela as animações em andamento, incluindo o fade e o atraso de 1 s antes do texto. Na apresentação atual ele faz isso com `animation-play-state: paused`.
  - "Recomeçar" volta ao primeiro slide.
  - "Tela cheia" também funciona pela tecla F.
  - O contador mostra `n / N`.
- **Controles**: ficam numa barra inferior que some 3,5 s depois do último movimento do mouse.
- **Proporção**: o fundo e o texto ficam empilhados na mesma área, com `object-fit: contain`, centralizados sobre um fundo escuro (`#080f1d`), sem distorcer.
- **Pré-carregamento**: carregar todas as imagens da pasta ao abrir, para nenhum slide aparecer vazio. Enquanto não terminar, mostrar um indicador discreto.
- **Pasta vazia**: mostrar a mensagem "Nenhum slide nesta apresentação ainda."

O template fica no admin-api, por exemplo em `admin-api/src/slides/player.html`. O admin grava esse `index.html` na pasta ao criá-la e o regrava sempre que salva uma alteração naquela pasta, para que pastas antigas recebam melhorias do player.

### Validação das imagens (no servidor; repetir no cliente para dar retorno rápido é opcional)

| Regra | Fundo | Texto | Tipo |
|---|---|---|---|
| Formato | PNG, JPG ou WebP | PNG, JPG ou WebP | bloqueia |
| Proporção fundo × texto | precisam ter a mesma proporção (tolerância de 1%) | | bloqueia |
| Tamanho do arquivo | até 25 MB por imagem | | bloqueia |
| Resolução | menor que 1920×1080 | | **só avisa**, deixa salvar |

As mesmas regras valem quando a imagem é escolhida de outra pasta.

**Atualização (2026-10-24, decisão do Rafael):** a imagem de texto **não** precisa ter fundo transparente. Uma imagem de texto opaca cobre o fundo quando aparece, e o efeito vira uma transição do fundo para o cartaz.


### API (admin-api, novas rotas em `/api/slides`)

Este esboço é sugestão; os detalhes ficam a critério do builder:

- `GET /api/slides/folders` → `[{ name, date, editable, slideCount | imageCount }]`, da data mais nova para a mais antiga.
- `POST /api/slides/folders` `{ date: "2026-11-01" }` → cria a pasta com `slides.json` vazio e o `index.html`.
- `GET /api/slides/folders/:name` → as editáveis devolvem `{ editable: true, slides: [...] }`; as somente leitura devolvem `{ editable: false, images: [...] }`.
- `GET /api/slides/folders/:name/img/:file` → serve a imagem para as miniaturas do admin.
- `POST /api/slides/folders/:name/slides` (multipart) → recebe `background` e `text`, cada um como arquivo **ou** referência `{ folder, file }`. Valida e acrescenta o slide no fim.
- `PUT /api/slides/folders/:name/slides/:id/background` e `.../text` → troca uma das imagens, com a mesma validação.
- `DELETE /api/slides/folders/:name/slides/:id`.
- `POST /api/slides/folders/:name/copy` `{ from, slideIds: [...] }` → copia os slides, na ordem em que estão na origem, para o fim da pasta atual.
- **Escrita em pasta somente leitura**: responde `409` com uma mensagem clara.

**Segurança**: validar `:name` contra `^\d{2}_\d{2}_\d{4}$` e `:file` contra `^[0-9a-f]{12}\.(png|jpe?g|webp)$` antes de montar qualquer caminho. Nunca concatenar texto vindo do usuário num caminho sem essa validação.

**Configuração**: o diretório das pastas vem de `SLIDES_DIR` (padrão `/app/slides` no container). Em desenvolvimento local, pode apontar para uma pasta qualquer.

### Infra

- **`docker-compose.yml`** do whatsapp-bots: no serviço `admin-api`, adicionar o volume `${SLIDES_HOST_DIR:-/opt/announcements/slides}:/app/slides`, em leitura e escrita. Como o padrão fica no próprio compose, não precisa de um secret novo no `deploy.yml`.
- **Permissões**: o admin-api roda como root no container. Os arquivos criados devem ficar legíveis pelo nginx (modos 644 e 755).
- **Container `announcements`**: nada muda nele. Ele já serve tudo o que está em `slides/`.
- **Tamanho do upload**: o Cloudflare aceita até 100 MB por requisição, e um slide tem no máximo 2 × 25 MB. Usar multipart, com `multer` ou equivalente; `express.json()` não serve para isso.

### Interface (opção A, escolhida pelo Rafael)

- **Item de topo** "Telão" em `App.jsx`, depois de "Todos os Eventos".
- **Coluna esquerda**:
  - botão primário "+ Nova pasta", que abre um seletor de data num modal no mesmo estilo dos modais existentes;
  - abaixo, a lista de pastas, da data mais nova para a mais antiga, com o número de slides. As pastas somente leitura têm a etiqueta "só leitura".
- **Área direita** com a pasta selecionada:
  - **Cabeçalho**: o nome da pasta, o botão "Copiar slides de outra pasta" (só nas editáveis) e o botão "Abrir no site ↗", que leva a `https://announcements.sdarmorangevale.com/<pasta>/`.
  - **Grade de slides**: cada cartão mostra o número, a miniatura do fundo e a do texto lado a lado (o texto sobre um xadrez que mostra a transparência), e as ações "Trocar fundo", "Trocar texto" e "Remover". "Remover" pede confirmação no padrão `confirm-row`.
  - **Último cartão**: "+ Adicionar slide". Abre um modal com dois espaços, Fundo e Texto. Cada espaço oferece "Enviar arquivo" ou "Escolher de outra pasta", mostra uma prévia do texto sobre o fundo e lista os erros e avisos de validação antes de salvar.
  - **Pasta somente leitura**: grade simples só com as imagens, sem ações.
- **Estilo**: usar só as variáveis e as classes de `styles.css` e seguir o padrão visual das páginas existentes, nos temas claro e escuro. CSS novo só para o que não existe, como a grade de miniaturas e o xadrez, usando as variáveis `--ink-*` e `--accent`.

### Página principal do site (mudança no projeto `~/Developer/slides`, fora deste repositório)

Decisão do Rafael: a página principal abre a **pasta mais recente com data até hoje e que tenha pelo menos um slide**. Pastas futuras ou vazias ficam de fora até a data chegar, mas continuam acessíveis pelo endereço direto (`/<mm_dd_yyyy>/`), para conferir antes.

- **"Hoje"**: a data no fuso `America/Los_Angeles`, calculada com `Intl.DateTimeFormat` e nunca com a data local do aparelho.
- **"Pelo menos um slide"**: o `slides.json` da pasta tem `slides.length > 0`. Uma pasta **sem** `slides.json`, como a `10_24_2026`, conta como tendo conteúdo.
- **Ordem da busca**: percorrer as datas candidatas da mais nova para a mais antiga e parar na primeira que tiver conteúdo.
- **Nenhuma elegível**: mostrar "Nenhuma apresentação disponível." (decisão do Claude).
- **Onde muda**: em `app/index.html`. Como esse arquivo vai dentro da imagem Docker, o deploy é manual: copiar o projeto para `/opt/announcements` e rodar `docker compose up -d --build` lá. O Claude tem acesso SSH à VPS e faz isso. Atualizar também a cópia em `~/Developer/slides`.
- **No admin**: na lista de pastas, marcar com uma etiqueta "no ar" a pasta que a página principal está mostrando agora, usando a mesma regra. Isso é decisão do Claude e é opcional, mas ajuda a saber o que vai aparecer no telão.

## Decisões que ficam com o builder

- A biblioteca de leitura de imagem no servidor (por exemplo, `sharp` funciona em `node:22-alpine`).
- Os detalhes de layout do player.
- A estrutura dos componentes React.
- Os nomes exatos das rotas.

## Riscos conhecidos

- **Cópia no Mac**: `~/Developer/slides/slides/` deixa de ser a fonte da verdade. Um `rsync --delete` do Mac para a VPS apagaria o que foi feito pelo admin.
