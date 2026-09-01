---
inclusion: always
---

# Isolamento de contexto via sub-agents

- Delegar toda exploração de código, investigação e leitura de múltiplos
  arquivos ao sub-agent context-gatherer, em vez de fazer na sessão principal.
- Delegar subtasks isoladas e bem definidas ao general-task-execution.
- Trazer para a sessão principal apenas o resultado final, nunca o contexto
  intermediário (arquivos lidos, buscas, tentativas).
- Executar o trabalho pesado de leitura/análise dentro dos sub-agents para
  manter o histórico da sessão principal enxuto.
- Sub-agents só funcionam em Autopilot mode; em Supervised não rodam.
