# Prompt 09 — Observabilidade e uso de LLM

Adicione observabilidade suficiente para explicar o comportamento do sistema.

Registrar, quando aplicável:

- request/correlation id;
- duração;
- status;
- erros;
- execução de LLM;
- provider;
- model;
- input tokens;
- output tokens;
- total tokens;
- latência;
- custo estimado;
- versão do prompt.

Nunca registrar:

- senha;
- access token;
- refresh token;
- secrets;
- conteúdo sensível sem necessidade.

Crie uma visão simples no frontend para mostrar métricas das execuções, sem transformar o projeto em uma plataforma de observabilidade completa.

Se Sentry/OpenTelemetry for adotado, abstraia a integração para evitar acoplamento do domínio.
