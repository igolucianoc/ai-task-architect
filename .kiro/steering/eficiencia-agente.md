# Eficiência do agente (economia de tokens)

Regras de trabalho para este projeto. Objetivo: entregar rápido e correto, gastando o mínimo de
tokens. Não enrolar.

## Delegação a sub-agents

- Toda implementação de fatia é feita por sub-agent (`general-task-execution`). A sessão principal só
  orquestra, valida o essencial e commita.
- Prompt de sub-agent CURTO: objetivo + arquivos-alvo (caminhos) + restrições + "rode lint/typecheck/
  test e me devolva os contadores". NÃO colar conteúdo de arquivos no prompt — o sub-agent lê sozinho.
- Confiar no relatório do sub-agent. NÃO reler os arquivos que ele já leu/alterou nem re-rodar as
  verificações que ele reportou, exceto quando: (a) ele reporta falha, (b) é o gate final da etapa,
  ou (c) há sinal concreto de inconsistência (ex.: `git status` diverge do relatado).

## Verificação

- Rodar lint/typecheck/test UMA vez, no fim da etapa (ou da fatia só se a próxima depender do
  resultado). Não verificar de forma redundante a cada passo.
- Antes de afirmar que um teste/checagem "prova" algo, garantir que o próprio teste é válido. Não
  perseguir sintomas com verificações improvisadas e possivelmente erradas (ex.: SQL cru que viola
  constraints).

## Investigação

- Para entender código desconhecido, usar `context-gatherer` uma vez com pergunta específica; não
  refazer a mesma investigação com outras palavras.
- Ler apenas os trechos necessários (ranges), não arquivos inteiros por precaução.

## Commits

- Só commitar quando o usuário pedir.
- Mensagens semânticas puras em pt-BR, sem ID externo.
- Um commit por unidade coesa de trabalho.
- Deixar SEMPRE fora dos commits as mudanças externas/de infra que o usuário mantém no working tree
  (ex.: `README.md`, `Dockerfile`, `docker-compose.yml`, `web/.env.example`, `web/vite.config.ts`),
  a menos que o usuário peça explicitamente.
- Quando o working tree tiver trabalho externo entrelaçado com o meu, avisar e perguntar em vez de
  gastar dezenas de comandos separando hunk a hunk.

## Postura

- Corrigir a causa raiz, não remendar sintomas. Se algo falhou duas vezes, parar e diagnosticar.
- Ser direto na comunicação; sem voltas nem repetição.
