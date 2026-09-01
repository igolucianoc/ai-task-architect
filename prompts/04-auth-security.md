# Prompt 04 — Autenticação e segurança

Implemente autenticação para a aplicação.

## Modelo

Usar:

- JWT access token de curta duração;
- refresh token de maior duração;
- rotação de refresh token;
- revogação de sessão;
- armazenamento somente do hash do refresh token no banco;
- cookie HttpOnly/Secure/SameSite para refresh token quando compatível com a arquitetura;
- access token mantido em memória no frontend.

## Rotas mínimas

- POST `/auth/register`
- POST `/auth/login`
- POST `/auth/refresh`
- POST `/auth/logout`
- GET `/auth/me`

## Rate limiting

Aplicar proteção específica para:

- login;
- register;
- refresh;
- logout quando pertinente.

Prefira uma estratégia distribuída com Redis se a infraestrutura adotada permitir.

Não trate rate limiting como substituto de outras medidas de segurança.

## Segurança

Considerar:

- senha com hash seguro;
- validação de entrada;
- mensagens de erro que não revelem informações sensíveis;
- expiração;
- rotação;
- detecção de reuse de refresh token;
- CORS;
- headers de segurança;
- configuração segura de cookies.

Criar testes para os fluxos de sucesso e falha.

Não implementar MFA, OAuth ou recuperação de senha nesta etapa.
