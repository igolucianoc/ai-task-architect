# Prompt 10 — Estratégia de testes

Eleve a cobertura de qualidade do projeto.

## Backend

Criar testes unitários para:

- casos de uso;
- regras de domínio;
- autenticação;
- rotação/revogação de refresh token;
- rate limiting;
- geração;
- avaliação;
- Quality Gate.

Criar E2E para os fluxos críticos:

1. register/login;
2. refresh;
3. criar tarefa;
4. acompanhar execução;
5. concluir geração;
6. avaliar;
7. consultar histórico.

## Frontend

Testar componentes e comportamentos críticos com Vitest e ferramentas adequadas ao Vue.

## Testes de integração

Validar persistência e contratos importantes.

Use providers fake para não depender de chamadas reais a LLM durante testes automatizados.

Não aumentar cobertura artificialmente apenas para atingir um percentual.
