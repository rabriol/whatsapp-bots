# Church Events Bot — Design Spec

**Date:** 2026-03-21
**Status:** Approved
**Branch:** experiment

---

## Overview

Node.js bot que lê eventos de uma planilha Google Sheets, filtra os próximos eventos (hoje + 2 meses), formata uma mensagem no estilo "Upcoming Events" e envia para um grupo do WhatsApp todo sábado às 11:00 AM PST via `whatsapp-gateway`.

---

## Goals

- Automatizar o envio semanal da lista de eventos da igreja
- Reutilizar a infraestrutura existente do `whatsapp-gateway` (sem segunda sessão Baileys)
- Zero intervenção manual após configuração

---

## Architecture

**Stack:** Node.js, node-cron, axios (HTTP para gateway)
**Dados:** Google Sheets público via CSV export (sem API key)
**Envio:** POST HTTP para `whatsapp-gateway` existente
**Deploy:** Docker container na mesma rede do gateway

```
church-events-bot/
├── src/
│   ├── index.js      — entry point: inicializa cron e conecta módulos
│   ├── scheduler.js  — configura job cron (sábado 11h PST)
│   ├── sheets.js     — busca CSV do Google Sheets e parseia linhas
│   ├── events.js     — filtra e formata eventos para mensagem
│   └── sender.js     — envia mensagem via HTTP POST ao whatsapp-gateway
├── Dockerfile
├── .env.example
├── package.json
└── docker-compose.yml
```

---

## Environment Variables

```
SHEET_ID=1_gwn-4tW7H4-2VBT5qM0xJAKG-ZIkvy_dEIHt9CnO6w
GATEWAY_URL=http://whatsapp-gateway:3000
GATEWAY_TOKEN=seu_token
WHATSAPP_GROUP_ID=seu_grupo@g.us
```

---

## Google Sheets — Colunas Usadas

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `title` | string | Nome do evento |
| `start_date` | M/D/YYYY | Data de início |
| `end_date` | M/D/YYYY | Data de fim (igual a start_date se for 1 dia) |
| `recurrence_rule` | RRULE string | Regra de recorrência no formato Google Calendar (ex: `RRULE:FREQ=WEEKLY;BYDAY=TU`) |

---

## Data Flow

```
[Cron: sábado 11h PST]
    │
    ▼
sheets.js: GET https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv
    │ falhou → loga erro, encerra silenciosamente
    ▼
events.js: filtra eventos com start_date (ou ocorrências RRULE) dentro de [hoje, hoje + 2 meses]
    │ lista vazia → não envia, encerra silenciosamente
    ▼
events.js: formata mensagem (ver Formatação)
    ▼
sender.js: POST {jid: WHATSAPP_GROUP_ID, message: texto} ao gateway
    │ falhou → loga erro
    ▼
loga sucesso
```

---

## Formatação de Eventos

### Tipos

| Tipo | Condição | Formato |
|------|----------|---------|
| Dia único | start_date == end_date, sem recurrence_rule | `Mar 27 Event Name` |
| Intervalo | start_date != end_date, mesmo mês | `Mar 27-29 Event Name` |
| Intervalo entre meses | start_date != end_date, meses diferentes | `Mar 30-Apr 1 Event Name` |
| Recorrente | recurrence_rule presente | `May (Tuesdays) Event Name` |

**Eventos recorrentes:** parseados via biblioteca `rrule`. Apenas `FREQ=WEEKLY` com `BYDAY` é suportado — outros padrões de RRULE são ignorados silenciosamente. Para cada mês dentro da janela em que houver ao menos uma ocorrência, o evento aparece uma linha com o dia da semana extraído de `BYDAY`. Exemplo: recorrência que cobre maio e junho gera duas linhas — `May (Tuesdays) ...` e `Jun (Tuesdays) ...`.

### Mensagem Final

```
📅 *Upcoming Events*

Mar 27-29 Family Evangelism Seminar
Apr 4 Young Adults Communion Service
Apr 19 Children's Hike
May (Tuesdays) Career Development Sessions
May 1-3 NCC Women's Retreat
```

- Header: `📅 *Upcoming Events*` (negrito WhatsApp via asteriscos)
- Eventos ordenados por data de início
- Linha em branco após o header

---

## Agendamento

```javascript
// node-cron — todo sábado às 11:00 AM America/Los_Angeles
cron.schedule('0 11 * * 6', runJob, { timezone: 'America/Los_Angeles' });
```

Lida automaticamente com PST/PDT (horário de verão).

---

## Error Handling

- Linha do CSV com `title` ausente ou `start_date` inválido → linha ignorada silenciosamente (sem crash)
- Falha no fetch do Sheets → `console.error`, sem envio, sem crash
- Lista de eventos vazia → sem envio, sem erro
- Falha no POST ao gateway → `console.error`, sem crash
- O bot nunca termina o processo por erro — apenas loga e aguarda o próximo ciclo

---

## Deploy

```yaml
# docker-compose.yml
services:
  church-events-bot:
    build: .
    restart: unless-stopped
    env_file: .env
    networks:
      - whatsapp-net

networks:
  whatsapp-net:
    external: true  # mesma rede do whatsapp-gateway
```

---

## Dependencies

```json
{
  "node-cron": "^3.0.3",
  "axios": "^1.6.0",
  "rrule": "^2.8.1"
}
```

---

## Out of Scope

- Autenticação WhatsApp própria (delegado ao whatsapp-gateway)
- Marcar eventos como novos/antigos
- Envio para múltiplos grupos
- Interface de administração
- Persistência de estado entre execuções
