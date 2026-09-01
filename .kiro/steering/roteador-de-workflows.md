---
inclusion: always
---

# Roteador de workflows

Mapeie a intenção do usuário para o workflow certo do pacote agent-skills. Quando
a intenção casar com um comando abaixo, siga o comando correspondente em
`.kiro/steering/comandos/<nome>.md` (carregue-o sob demanda; não repita o conteúdo
dele aqui). As skills em `.kiro/skills/` já ativam sozinhas por contexto — o mapa
abaixo é para os workflows encadeados que vão além de uma skill isolada.

## Mapa intenção -> workflow

| Intenção do usuário | Workflow | Fase |
|---|---|---|
| Definir o que construir, escrever especificação | comandos/spec | Define |
| Quebrar em tarefas, planejar a execução | comandos/planning | Plan |
| Implementar tarefa(s), codar incremental | comandos/build | Build |
| Escrever testes, corrigir bug com teste | comandos/test | Verify |
| Definir barra de qualidade do projeto | comandos/constraints | Build |
| Revisar código antes do merge | comandos/review | Review |
| Simplificar/refatorar sem mudar comportamento | comandos/code-simplify | Review |
| Auditar performance web | comandos/webperf | Review |
| Checklist de pré-lançamento, decisão go/no-go | comandos/ship | Ship |

## Regras de orquestração

- Reconheça a intenção e aplique o workflow sem exigir que o usuário digite `#`.
  O acionamento manual por `#<nome>` continua disponível como atalho explícito.
- Confirme antes de iniciar workflows que alteram muitos arquivos ou fazem commits
  (build auto, ship). Workflows de leitura/análise (review, webperf) podem iniciar direto.
- Personas especialistas (`code-reviewer`, `security-auditor`, `test-engineer`,
  `web-performance-auditor`) são acionadas como sub-agents via `invoke_sub_agent`,
  em Autopilot mode. Personas não chamam outras personas; a sessão principal orquestra.
- Um workflow pode encadear outro (ex.: `build` chama `test` e, em falha,
  `debugging-and-error-recovery`). Siga os encadeamentos descritos em cada comando.
- Mantenha o isolamento de contexto: delegue exploração e leitura ampla a sub-agents.
