# Prompt 11 — Developer Experience e execução com um comando

Faça o projeto ser fácil de executar por outra pessoa.

O objetivo é permitir, com documentação clara, algo próximo de:

```bash
docker compose up --build
```

e comandos complementares apenas quando realmente necessários.

Prepare:

- Dockerfiles adequados;
- docker-compose;
- healthchecks;
- migrations;
- seed;
- variáveis de ambiente;
- README com troubleshooting;
- scripts de desenvolvimento;
- scripts de teste.

Garanta que a inicialização não dependa de ordem manual frágil entre containers.

Não embuta secrets.
