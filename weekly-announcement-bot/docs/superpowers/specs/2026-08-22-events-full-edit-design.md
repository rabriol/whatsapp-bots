# Edição Completa de Eventos + Construtor de Recorrência — Design Spec

**Date:** 2026-08-22
**Status:** Approved
**Branch:** main

---

## Overview

Expande o formulário de criar/editar evento do admin-ui (`EventFormModal.jsx`, `admin-api/src/routes/events.js`) para cobrir todos os campos de conteúdo reais da aba `Events` da planilha compartilhada com `events-sync`/`church-calendar`, e substitui o campo de recorrência (hoje um texto cru de RRULE) por um construtor visual no estilo Google Calendar, incluindo um gerenciador de datas de exceção (EXDATE).

Contexto: o formulário atual (commit `9a6aa48`) já cobre `title`, `description`, `location`, `start_date`, `start_time`, `end_date`, `end_time`, `all_day`, `recurrence_rule` (texto cru), `status`, `zoom_url`, `youtube_url`, `is_live`. Este spec cobre o que falta.

---

## Goals

- Todo campo de **conteúdo** real da aba Events (não as colunas de bookkeeping do events-sync) fica editável pelo admin-ui.
- Recorrência deixa de exigir que o usuário escreva RRULE à mão — vira uma UI de seleção, no estilo já familiar de quem usa Google Calendar (esses eventos são sincronizados pra lá).
- Cobre 100% dos padrões de recorrência já presentes na planilha real, inclusive exceções (EXDATE).

## Non-Goals

- Colunas de bookkeeping do events-sync (`sync_action`, `event_id`, `last_synced_at`, `last_error`, `checksum`, `program_sheet_id`) continuam fora do formulário — não são campos que um humano preenche, são estado interno do processo de sincronização (ver `admin-api/src/routes/events.js:43-48`, decisão já validada no commit anterior).
- `row_id` continua gerado automaticamente, não editável.
- Editor WYSIWYG para `html_description` — vira um textarea de HTML puro, sem editor rico.
- Suporte pleno a todo o RFC5545 (ex: `BYWEEKNO`, `BYYEARDAY`) — o construtor cobre os padrões já usados na planilha real (semanal com dias, mensal por dia-do-mês, mensal por "enésima ocorrência de um dia da semana", restrição a um mês do ano, término por data/contagem, exceções). Como a geração da string usa a biblioteca `rrule`, um RRULE mais exótico editado fora do app continuaria sendo lido/preservado no modo avançado (ver abaixo), só não seria *criável* pela UI.

---

## Campos novos no formulário

| Campo API | Coluna na planilha | Widget | Observação |
|---|---|---|---|
| `timezone` | `timezone` | dropdown | `America/Los_Angeles`, `America/Denver`, `America/Chicago`, `America/New_York`, `Pacific/Honolulu`, `America/Anchorage` — padrão `America/Los_Angeles` (único valor visto nos dados reais) |
| `attendees` | `attendees` | texto simples | E-mails separados por vírgula |
| `reminders` | `reminders` | lista repetível | Cada item: dropdown tipo (`popup`/`email`) + minutos antes. Serializado como `tipo:minutos` separado por vírgula quando há mais de um. **Risco/suposição:** só existe exemplo real com 1 lembrete (`popup:30`); o delimitador pra múltiplos não está confirmado em nenhum dado real — vamos testar empiricamente como fizemos com `sync_action`/`event_id` antes de confiar nisso |
| `visibility` | `visibility` | dropdown | `default` / `public` / `private` / `confidential` (enum exato da API do Google Calendar) |
| `color_id` | `color_id` | dropdown com amostra de cor | 11 cores nomeadas do Google Calendar: lavender, sage, grape, flamingo, banana, tangerine, peacock, graphite, blueberry, basil, tomato |
| `html_description` | `html_description` | textarea | HTML puro, sem preview renderizado |

Todos entram em `EDITABLE_FIELD_MAP` em `admin-api/src/routes/events.js`, seguindo o mesmo padrão read-merge-write já usado (preserva as colunas de bookkeeping intactas).

---

## Construtor de Recorrência

### Descoberta técnica: formato não é iCalendar padrão

Nos dados reais, quando existe exceção, RRULE e EXDATE vêm **na mesma célula, separados por um espaço**:

```
RRULE:FREQ=MONTHLY;BYDAY=SA;BYSETPOS=1;UNTIL=20261226T235959Z EXDATE:20260606T190000,20260801T190000
```

Isso não é RFC5545 padrão (que usaria linhas/propriedades separadas dentro de um VEVENT). Não dá pra jogar a célula inteira em `rrulestr()` da biblioteca `rrule`. O parsing/geração precisa:

1. Separar a célula pelo literal `" EXDATE:"` (regex) em `rrulePart` e `exdatePart` (este último pode não existir).
2. `rrulePart` → `RRule.fromString(rrulePart)` da biblioteca `rrule` (já usada em `admin-api` e `weekly-announcement-bot`, versão `^2.8.1` — adicionar a mesma versão em `admin-ui`).
3. `exdatePart` → split por vírgula, cada item é uma data-hora **sem sufixo `Z`** (horário local, não UTC — diferente de `UNTIL`, que tem `Z`). Formato: `YYYYMMDDTHHMMSS`.
4. Ao salvar, remontar: `rrule.toString()` + (se houver exceções) `" EXDATE:" + exdates.join(',')`.

### UI (estilo Google Calendar)

1. **Frequência**: Não repete / Diariamente / Semanalmente / Mensalmente
2. **Intervalo**: "a cada [N]" (dias/semanas/meses conforme frequência)
3. **Semanalmente** → chips de dia da semana (múltipla escolha)
4. **Mensalmente** → escolha entre:
   - "no dia [X] do mês" (`BYMONTHDAY`)
   - "no [1º/2º/3º/4º/último] [dia da semana]" (`BYSETPOS` + `BYDAY`)
5. **Restringir a um mês do ano** (opcional, usado em 1 evento real hoje — ex: só em maio): checkbox + dropdown de mês → `BYMONTH`
6. **Término**: Nunca / Em [data] (`UNTIL`) / Depois de [N] ocorrências (`COUNT`)
7. **Exceções (EXDATE)**: lista das datas já excluídas (se houver), cada uma com botão remover; date-picker + botão "adicionar exceção"
8. Campo somente-leitura abaixo mostrando a string RRULE final gerada, pra transparência/debug

### Modo avançado (fallback de segurança)

Se, ao abrir o formulário de edição, a célula `recurrence_rule` não puder ser totalmente representada pelos controles acima (ex: um padrão exótico editado manualmente na planilha), a UI cai automaticamente para um textarea de texto cru pré-preenchido com o valor atual, com um aviso indicando que o padrão é complexo demais pro construtor visual. Isso evita que a UI "trave" ou corrompa um valor que não sabe interpretar.

---

## Plano de verificação

Mesma disciplina usada no commit anterior (`9a6aa48`): antes de considerar pronto,
1. Criar um evento de teste real com cada campo novo preenchido (incluindo múltiplos lembretes, timezone diferente do padrão, cor, visibilidade, e uma recorrência com exceção).
2. Inspecionar a linha crua na planilha via Sheets API (não só a resposta do admin-api) pra confirmar que o formato gravado bate com o que os outros eventos já sincronizados usam.
3. Confirmar que as colunas de bookkeeping do events-sync continuam intocadas.
4. Apagar a linha de teste.
5. Rodar o build do admin-ui e checar visualmente o construtor de recorrência contra pelo menos 3 padrões reais já existentes na planilha (incluindo um com `BYSETPOS` e um com `EXDATE`), confirmando que abrir pra editar e salvar sem mudar nada produz a mesma string (round-trip).

---

## Arquivos afetados

- `admin-api/src/routes/events.js` — `EDITABLE_FIELD_MAP` expandido, novos campos no POST/PUT
- `admin-ui/src/EventFormModal.jsx` — novos campos de formulário
- `admin-ui/src/RecurrenceBuilder.jsx` (novo) — componente do construtor de recorrência
- `admin-ui/package.json` — nova dependência `rrule@^2.8.1`
