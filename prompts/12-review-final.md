# Prompt 12 — Senior/Staff Engineering Review

Faça uma revisão completa como um Tech Lead/Staff Engineer.

NÃO reescreva o projeto imediatamente.

Primeiro produza um relatório classificando:

- arquitetura;
- domínio;
- segurança;
- autenticação;
- autorização;
- rate limiting;
- SSE;
- Redis/BullMQ;
- banco;
- tipagem;
- testes;
- frontend;
- acessibilidade;
- observabilidade;
- performance;
- DX;
- documentação;
- uso de LLM;
- avaliação de LLM.

Classifique cada problema:

- BLOCKER;
- HIGH;
- MEDIUM;
- LOW;
- NICE_TO_HAVE.

Para cada problema:

- explique por que importa;
- indique arquivo/módulo;
- proponha correção;
- não faça mudança especulativa.

Depois aplique somente as correções BLOCKER/HIGH que forem claramente justificadas e rode os testes novamente.

Valide especialmente:

- zero `any`;
- ausência de secrets;
- refresh token não persistido em texto puro;
- rate limiting funcionando;
- SSE funcionando;
- seed funcionando;
- frontend seguindo `DESIGN.md`.
