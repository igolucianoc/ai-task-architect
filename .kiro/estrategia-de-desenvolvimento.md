# Estratégia de desenvolvimento no `.kiro/` (AI Task Architect)

Montamos um setup no Kiro que padroniza como a IA trabalha no projeto. Resumo geral:

## 1. Roteador de workflows

A intenção escrita no chat é mapeada para um workflow, sem precisar decorar comando:

- Definir o que construir → `spec`
- Quebrar em tarefas → `planning`
- Implementar → `build`
- Testar / corrigir bug → `test`
- Definir a barra de qualidade → `constraints`
- Revisar antes do merge → `review`
- Simplificar / refatorar sem mudar comportamento → `code-simplify`
- Auditar performance web → `webperf`
- Pré-lançamento (decisão go/no-go) → `ship`

O acionamento manual por `#<nome>` continua disponível como atalho explícito.

## 2. Fluxo Spec → Plan → Build → Verify → Review → Ship

- **Spec:** gera um `SPEC.md` com objetivo, comandos, estrutura do projeto, estilo de código, estratégia de testes e fronteiras.
- **Planning:** modo somente leitura, fatiamento **vertical** (um caminho completo por tarefa, não camadas horizontais), com critérios de aceitação e passos de verificação → salva em `tasks/plan.md` e `tasks/todo.md`.
- **Build:** implementação incremental, uma fatia por vez. Existe o modo `build auto` que roda o plano inteiro com **uma única aprovação** humana (checkpoint único), sem parar entre tarefas.

## 3. TDD de verdade (RED → GREEN → refatora)

Todo build segue o loop:

1. Escreve teste que falha para o comportamento esperado (RED)
2. Implementa o código mínimo para passar (GREEN)
3. Roda a suíte de testes completa (checagem de regressão)
4. Roda o build para verificar a compilação
5. Faz commit com mensagem descritiva
6. Marca a tarefa como concluída e para

Correção de bug segue o padrão **Prove-It**: escreve primeiro um teste que reproduz o bug (deve falhar), confirma a falha, implementa a correção e confirma que passa.

## 4. Build & qualidade

- Cada tarefa só fecha com teste passando + build compilando + commit próprio.
- Nada de `git add -A` cego: stage apenas dos arquivos que a tarefa tocou.
- **Review em 5 eixos:** correção, legibilidade, arquitetura, segurança e performance. Achados categorizados como Crítico, Importante ou Sugestão, com referências `arquivo:linha`.
- O `ship` só dá **GO** com plano de rollback obrigatório.

## 5. Isolamento de contexto = economia de tokens

Este é o pulo do gato:

- Toda exploração de código e leitura ampla é **delegada a sub-agents** (`context-gatherer`, `general-task-execution`).
- A sessão principal recebe **apenas o resultado final**, nunca o contexto intermediário (arquivos lidos, buscas, tentativas).
- Isso mantém o histórico da sessão principal enxuto e reduz o consumo de tokens.

As **personas especialistas** (`code-reviewer`, `security-auditor`, `test-engineer`, `web-performance-auditor`) também rodam como sub-agents isolados. No `ship`, as três principais rodam **em paralelo** e a sessão principal apenas funde os relatórios em uma decisão go/no-go.

> Detalhe importante: sub-agents só funcionam em **Autopilot mode**. Em Supervised eles não rodam.
