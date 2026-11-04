# Criar uma skill

Regra da casa: **uma skill = um módulo**. Cada skill declara as frases que entende e, se precisar, as rotas para o visor. Voz, barra de comando e botões caem no **mesmo handler**: o que dá para falar dá para clicar.

## Passo a passo

1. Crie `backend/mano/skills/minha_skill.py` (ou uma pasta com `__init__.py`, se crescer).
2. Escreva a classe:

   ```python
   from ..intents.registry import Reply, Skill, intent


   class ClimaSkill(Skill):
       name = "clima"                 # identificador (ctx.skill("clima"))
       description = "Previsão do tempo"  # aparece no "o que você sabe fazer?"

       @intent(
           "weather.today",
           patterns=[r"\b(como (esta|vai estar) o )?tempo (hoje|agora)\b", r"\bvai chover\b"],
           examples=["como está o tempo hoje?", "vai chover?"],
           priority=6,
       )
       async def today(self, slots: dict) -> Reply:
           return Reply("Sol com nuvens, máxima de 27 graus.")
   ```

3. Registre em `ALL_SKILLS` (`backend/mano/skills/__init__.py`). A ordem da lista é a ordem do "o que você sabe fazer?".
4. Acrescente as frases em `docs/guia/comandos.md` (uma linha por frase, com a intenção na terceira coluna). O teste `tests/test_docs.py` falha se alguma intenção ficar sem exemplo ou se uma frase da página cair em outra intenção.
5. Escreva testes (ver [testes.md](testes.md)).

## `@intent`

| Parâmetro | Para quê |
|---|---|
| `name` | `area.acao`, em inglês, minúsculas (`timer.start`, `notes.search`) |
| `patterns` | Regex sobre o texto **normalizado**. Grupos nomeados viram slots |
| `matcher` | Nome de um método `(text) -> dict \| None` para casos que regex não resolve (durações, datas, desambiguação) |
| `examples` | Frases reais, com acento. Vão para a ajuda e para o catálogo do plano B do modelo local |
| `priority` | Maior é testada primeiro. Use para resolver conflitos (ver abaixo) |

O texto normalizado não tem acentos nem maiúsculas, tem números em dígitos e não tem a frase de ativação: escreva `r"\bproximo remedio\b"`, não `próximo remédio`. Teste rápido:

```powershell
cd backend
.\.venv\Scripts\python.exe -c "from mano.intents.ptbr import normalize; print(normalize('Fala Mano, toca dez músicas do Djavan'))"
```

### Slots e acentos

Grupos nomeados (`(?P<what>.+)`) chegam em `slots`. Como vêm do texto normalizado, estão sem acento. Para devolver ao usuário do jeito que ele falou, use `restore_accents(slots["what"], slots["_raw"])` de `mano.intents.ptbr`. Para casar um nome com uma lista (hábitos, tarefas), use `best_match()` (comparação aproximada).

### Prioridades em uso

Uma frase pode casar com várias intenções; a de maior prioridade vence. Faixas atuais, para orientar:

| Prioridade | Quem | Por quê |
|---|---|---|
| 30–31 | `alerts.dismiss`, controles curtos do Spotify, `youtube.close` | Frases curtas e exatas ("para", "próxima música") |
| 20–26 | Cancelar timer/lembrete, remédios | "para o timer" não pode virar pausa da música; "tomei" é sempre remédio |
| 10–15 | Criar timer, lembrete, evento; YouTube | Têm `matcher` com datas e durações |
| 5–9 | Agenda, tarefas, e-mail, briefing, hábitos, volume | Frases com palavras-chave claras |
| 1–4 | Notas, Spotify "toca…", pesquisa | Padrões abertos ("toca X", "pesquisa X", "o que é X") que engoliriam os outros |

Se uma frase nova cair na intenção errada, procure o conflito com `registry.parse()` nos testes antes de mexer em prioridade.

## `Reply`

```python
Reply(speech, display=None, data=None)
```

- `speech`: o que o Mano fala. Frases curtas, naturais, sem markdown.
- `display`: texto da tela, se for diferente (ex.: lista com `\n` vira itens).
- `data`: extras para o visor (`card`, `link`, `notes`, `video`…; ver [api.md](api.md#núcleo)).

## O que mais uma skill pode ter

| Método | Quando é chamado | Uso |
|---|---|---|
| `router()` | Na criação do app | Devolva um `APIRouter(prefix="/api/minha")` para o visor |
| `start()` | Na subida (dentro do loop) | Agendar jobs (`self.ctx.scheduler.add_job(...)`), carregar estado |
| `stop()` | No desligamento | Fechar clientes HTTP |
| `snapshot()` | A cada visor que conecta | `{"minha": estado}`; vai junto no `hello` |
| `dismiss_alerts()` | No "para"/"ok" | Silenciar o que a skill estiver tocando; retorne quantos |

E o que ela recebe em `self.ctx`:

| `ctx.` | Para quê |
|---|---|
| `settings` | Configuração (`MANO_*`) |
| `db.session()` | Sessão SQLModel (`expire_on_commit=False`) |
| `hub.broadcast(tipo, dados)` | Avisar os visores; mande o mesmo formato do `snapshot()` |
| `scheduler` | APScheduler (assíncrono) |
| `speaker.say(texto)` | Falar sem passar por comando |
| `notify(texto, title=, level=, toast=)` | Aviso proativo: tela + voz + Windows |
| `skill("nome")` | Outra skill (ex.: o briefing lê a agenda) |
| `registry.get("intent")` | Chamar o handler de outra intenção |
| `llm` | Modelo local: `await ctx.llm.generate(prompt, label=..., interactive=...)`; confira `ctx.llm.ready` antes |
| `open_url(url)` | Abrir no navegador do PC (trocado nos testes) |

## Boas práticas

- **Falhe com educação.** Integração não configurada → diga como configurar ("Veja a aba Ajustes"), nunca um erro técnico.
- **Nada de rede no construtor.** Crie clientes HTTP sob demanda (propriedade preguiçosa) e permita trocar por um `MockTransport` nos testes, como `GoogleAccount.http`, `LLM.http` e `BriefingSkill.http`.
- **Trabalho lento fora do caminho.** Algo que leve mais de ~2 s (modelo local, várias chamadas de rede) deve responder já ("Vou ver e já te conto") e terminar numa tarefa com `ctx.notify()`. Ver `gmail.summary`.
- **Tabelas novas** em `models.py` são criadas sozinhas; colunas novas em tabela existente não (ver [convenções](convencoes.md#banco-de-dados)).
- **Dados do usuário são sagrados:** nunca apagar nem reescrever arquivos dele (as notas são só acrescentadas).
