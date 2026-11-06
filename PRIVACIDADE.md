# Política de privacidade do Mano

O Mano é um assistente pessoal que roda inteiramente no computador do próprio usuário. Não existe servidor do Mano na internet, e nenhum dado é enviado para os desenvolvedores ou para terceiros.

## Dados do Google que o Mano acessa

Quando você conecta a sua conta Google, o Mano pede:

- **Gmail (somente leitura):** para listar e resumir e-mails não lidos no visor. O Mano não envia, apaga nem altera e-mails.
- **Google Agenda (leitura e criação de eventos):** para mostrar os compromissos do dia e criar compromissos quando você pedir.
- **Google Tasks (leitura e escrita):** para mostrar, criar e concluir tarefas quando você pedir.

## Onde os dados ficam

- O token de acesso fica num arquivo local (`data/google_token.json`) no seu computador.
- E-mails, eventos e tarefas são lidos direto do Google pelo seu computador e mostrados no visor local. Resumos, quando ligados, são gerados por um modelo de linguagem que também roda no seu computador.
- Nada disso é vendido, compartilhado ou usado para publicidade.

O uso das informações recebidas das APIs do Google segue a [Política de dados do usuário dos serviços de API do Google](https://developers.google.com/terms/api-services-user-data-policy), incluindo os requisitos de uso limitado.

## Como revogar o acesso

- No Mano: **Ajustes → Google → Desconectar** apaga o token local.
- Na sua conta Google: <https://myaccount.google.com/permissions> → Mano → **Remover acesso**.

## Contato

Dúvidas ou pedidos: abra uma issue em <https://github.com/LuizObara/mano/issues>.
