# Exportar slides da Telão como MOV para o ProPresenter: design

Data: 2026-11-21. Complementa `2026-10-24-telao-slides-admin-design.md`. Tamanho: mudança pequena, com uma verificação técnica no começo.

## Intenção

O Rafael usa o ProPresenter no culto e quer levar os anúncios do dia para lá sem refazer os slides. Hoje cada slide da Telão é um par de imagens (fundo e texto) que o player mostra com uma animação. Ele quer baixar esse mesmo resultado como vídeo MOV: um arquivo por slide e um ZIP com todos os slides do dia.

## Objetivos

- Botão **Baixar este slide (MOV)** no player: gera e baixa o MOV do slide que está na tela.
- Botão **Baixar todos (ZIP)**: gera os MOVs de todos os slides da pasta e baixa um ZIP.
- O MOV reproduz a animação do player: o fundo entra, 1 s depois o texto surge, e o vídeo termina em cerca de 2 s.
- Tudo acontece no navegador de quem baixa, no momento do clique.

## Fora do escopo

- Nenhuma mudança de comportamento no servidor, sem `ffmpeg` no Docker, sem MOVs guardados em disco.
- Pastas feitas à mão (sem `slides.json`), como a `10_10_2026`: não têm os pares de imagens e continuam sem botões.
- Transparência (alpha), áudio, ProRes, escolha de resolução ou de duração, botão de cancelar.

## O que seria um fracasso, mesmo funcionando

- O MOV não bater com o que a igreja vê no telão (tempo, curvas de fade, enquadramento).
- O ProPresenter não abrir o arquivo, ou abrir com tela preta ou cor diferente.
- O download travar a aba do player durante o culto sem aviso de progresso.

## Restrições

- O player é uma página estática servida pelo nginx e copiada para cada pasta (`index.html`). Não há servidor nem login na frente dele.
- O player precisa continuar funcionando sem internet. O teste atual `player has no external dependencies` proíbe `<script src>` e `<link>`; a biblioteca nova não pode vir de CDN.
- As pastas criadas pela Telão recebem o player novo na próxima vez que forem salvas pelo painel (regra existente do `writePlayer`).

## Abordagens consideradas

| Caminho | Vantagem | Custo |
|---|---|---|
| **A. Navegador com WebCodecs, ao clicar** (escolhido) | Sem mudança no servidor, sem arquivos guardados, funciona na página estática. | Depende de Chrome, Edge ou Safari recentes e do computador de quem baixa. |
| B. Servidor com `ffmpeg`, gerado ao salvar | Qualquer navegador, qualidade previsível, link para arquivo pronto. | Mais ~60–100 MB na imagem, disco, regerar a cada alteração. |
| C. `ffmpeg.wasm` no navegador | Nenhuma | Download de ~30 MB e minutos de espera. Descartado. |

O Rafael escolheu o A. O B fica como reforço futuro se algum navegador não funcionar.

## Como funciona (decisões)

Decididas pelo Rafael: animação do player dentro do MOV (fundo entra, texto surge 1 s depois, fim em ~2 s); um MOV por slide; um ZIP com todos; geração no navegador no clique.

Escolhas do Claude (o Rafael pode corrigir):

- **Quadros desenhados num canvas, sem capturar a tela.** Cada quadro é calculado com as mesmas regras do CSS do player: fundo `0 → 0,8 s` com `ease-out`, texto `1,0 → 1,8 s` com `ease`, fim em 2,0 s (o último quadro fica 0,2 s parado). Isso torna o resultado exato e independente do navegador.
- **Formato:** MOV, H.264, 1920×1080, 30 quadros por segundo, sem áudio. A imagem é encaixada com `contain` sobre `#080f1d`, como no player, então proporções diferentes de 16:9 ganham as mesmas faixas escuras. Imagens maiores são reduzidas.
- **Codificação:** `VideoEncoder` (WebCodecs) e uma biblioteca de empacotamento que escreva MOV. A preferida é a `mediabunny`; a escolha final é do builder, depois da verificação abaixo.
- **ZIP:** sem compressão (os MOVs já são comprimidos), com uma biblioteca pequena como a `fflate`. Nome do ZIP: `anuncios-<mm_dd_yyyy>.zip`. Nomes dos MOVs pela ordem dos slides: `01.mov`, `02.mov`… (assim o ProPresenter importa na ordem).
- **Um clipe por vez**, para não estourar a memória, com texto de progresso (`Gerando 3 / 22…`) e botões desativados enquanto trabalha.
- **Biblioteca vendorizada:** vem das dependências do `admin-api` e é copiada para a pasta do slide junto com o `index.html` no `writePlayer`, e carregada com `import()` só quando o usuário clica em baixar. Assim o player continua sem CDN e sem custo na reprodução. O teste de "sem dependências externas" é ajustado para permitir só esse arquivo da mesma pasta.
- **Navegador sem suporte:** se `VideoEncoder` ou H.264 não estiver disponível, os botões mostram "Seu navegador não consegue gerar vídeo. Use Chrome, Edge ou Safari recentes."
- **Posição:** os dois botões entram na barra de controles do player, que some após 3,5 s, e só aparecem em pastas com `slides.json`.

## Primeiro passo: verificação técnica (antes de construir o resto)

1. Gerar um MOV de um slide real e confirmar que a biblioteca escolhida escreve MOV (QuickTime) de verdade, com o `moov` no início.
2. O Rafael abre esse arquivo no ProPresenter e confirma: toca, cores iguais ao telão, para no último quadro.
3. Só então construir o ZIP, o progresso e os testes.

## Testes

- As partes puras (cálculo da opacidade por instante, quantidade de quadros, nomes de arquivo, nome do ZIP) ficam em funções separadas e testadas em Node.
- A geração do vídeo em si só se verifica num navegador real; o `ffprobe` não está instalado neste Mac, então a conferência do MOV é feita no ProPresenter ou no QuickTime.

## Fica com o builder

- A biblioteca de MOV e a de ZIP, desde que atendam às restrições acima.
- Como organizar o código novo dentro do `player.html` e como copiá-lo no `writePlayer`.
- O texto exato das mensagens e o aspecto dos botões, seguindo os botões existentes.

## Riscos

- O codificador H.264 do navegador pode variar entre computadores; por isso a verificação inicial e a mensagem de "sem suporte".
- Gerar 20+ clipes em computadores fracos pode demorar; o progresso mostra que a página não travou.
