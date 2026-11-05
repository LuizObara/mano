# Convenções

## Idioma

- **Português** em tudo que o usuário vê (falas, telas, erros), em comentários, docstrings, docs e mensagens de commit.
- **Inglês** em nomes de código: variáveis, funções, classes, rotas (`/api/briefing/feeds`) e nomes de intenção (`timer.start`). Exceção: o `name` das skills é o nome em português usado em `ctx.skill("remédios")`.
- Falas do Mano: curtas, naturais, sem jargão e sem markdown. Horários do jeito falado ("às 3 e meia"; ver `say_clock`/`say_when`).

## Python

- Python 3.12, `from __future__ import annotations` nos módulos com tipos à frente.
- Assíncrono por padrão (FastAPI + APScheduler assíncrono). Bibliotecas bloqueantes (spotipy, yt-dlp, trafilatura, SAPI) vão para `asyncio.to_thread` ou thread própria.
- Datas **locais sem fuso** no banco e no código (app de um usuário numa máquina). Converta na borda (`to_local`/`to_rfc3339` no Google) e mande ao visor em milissegundos (`ms()`).
- Clientes HTTP preguiçosos e trocáveis (propriedade com setter) para os testes.
- Logs com `logging.getLogger(__name__)`; nada de `print`.

## Frontend

- React 19 com componentes de função e hooks; estado global só em `useMano()`.
- Paleta "Mel & Café" com tema claro e escuro. As cores são tokens em `index.css` que apontam para variáveis trocadas por `<html data-theme>`; **nunca escreva cor fixa** (hex, `emerald-400`), use os tokens:
  - fundos: `ink` (página e campos), `panel` (cartões), `soft` (hover e itens), `deep` (bloco do relógio, com `deep-text`, `deep-muted`, `deep-line`, `glow`);
  - texto: `text`, `muted`, `accent` (links e destaques em texto);
  - destaque: `ember` (mel, só preenchimento) com `on-ember` por cima; `alert` com `on-alert`; `ok`; `think` (orbe pensando); `area-0`…`area-4` (cores das áreas do vault).
- Fontes: `font-display` (Fraunces) no relógio, títulos de painel e de nota; o resto em Figtree (`font-sans`). Ambas vêm do npm (`@fontsource-variable`), então funcionam sem internet.
- Use as peças de `components/ui.tsx`: `Card` (ganha o botão de ocultar sozinho dentro do Início), `btn.*`, `input`, `Icon`. Preferências do aparelho (tema, painéis ocultos) com `useStored` de `lib/prefs.ts`.
- Datas com `toLocaleString("pt-BR")` e os helpers `hhmm`, `ago`, `isoDay` de `lib/mano.ts`.
- HTML vindo de fora (notas) sempre passa pelo DOMPurify.
- Tudo precisa caber em 375 px de largura sem rolagem lateral.

## Versões

Dependências com **versão exata** (`==` no `requirements.txt`, sem `^` no `package.json`). Atualize de propósito, uma de cada vez, rodando os testes. Já houve um caso (Tailwind 4.0.0) em que uma versão quebrou o build.

## Banco de dados

Tabelas novas em `models.py` são criadas sozinhas ao iniciar. **Colunas novas em tabelas existentes não**: o SQLite do usuário continua com o esquema antigo. Até existir uma ferramenta de migração (Alembic seria o caminho), faça assim:

1. Prefira guardar o dado novo numa tabela nova ou num JSON em `data/`.
2. Se precisar mesmo da coluna, acrescente no `start()` da skill um `ALTER TABLE ... ADD COLUMN ...` protegido por uma checagem em `PRAGMA table_info(...)`.

O índice das notas (`notes_meta`, `notes_fts`) é gerenciado pelo `Vault` e pode ser apagado à vontade: ele é refeito do vault.

## Segurança e privacidade

- Credenciais e tokens só em `data/` (no `.gitignore`), nunca no código, em teste ou em log.
- O Mano não digita senhas por ninguém: o usuário cola o Client ID e envia o JSON pela tela, e o login acontece no site do serviço.
- Permissões mínimas: Gmail só leitura; o vault só recebe acréscimos.
- O servidor escuta só em `127.0.0.1` e não tem autenticação. Antes de expor na rede, é preciso pôr autenticação.
- Endereço de e-mail do usuário não vai para serviços de terceiros (ex.: o User-Agent da Wikipedia usa uma URL, não e-mail).

## Git e commits

- Um commit por entrega que funciona (até agora, um por fase), com título curto em português e corpo com tópicos do que entrou.
- `data/`, `.env`, `frontend/dist`, `node_modules`, `.venv` ficam fora do git.
- O repositório usa LF; o git no Windows avisa que vai converter para CRLF, e isso é esperado.
- Commits feitos com o Claude terminam com a linha `Co-Authored-By` correspondente.

## Documentação

- Comando novo → linha em `docs/guia/comandos.md` (o teste cobra).
- Variável nova em `config.py` → linha em `docs/guia/configuracao.md`.
- Rota ou evento novo → `docs/dev/api.md`.
- Limitação ou pendência descoberta → `docs/pendencias.md`.
