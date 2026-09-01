# ADR-007 — Autenticação JWT com access token e refresh token

**Data:** 2026-09-01  
**Status:** Aceito

## Contexto

O sistema precisa autenticar usuários para proteger as rotas de criação e consulta de tarefas.
Precisamos definir a estratégia de autenticação: sessão server-side, JWT stateless, ou JWT
híbrido com refresh token.

## Decisão

Usar **JWT com dois tokens**:
- **Access token**: JWT assinado (HS256), TTL de 15 minutos, enviado no header `Authorization: Bearer`.
- **Refresh token**: UUID opaco, TTL de 7 dias, enviado em cookie HttpOnly/Secure/SameSite=Strict.
  Persistido em banco para permitir revogação.

## Justificativa

- Access token de curta duração (15 min) limita o impacto de um token vazado.
- Refresh token em cookie HttpOnly é inacessível ao JavaScript da página, protegendo contra XSS.
- Persistir o refresh token em banco permite revogação explícita no logout — JWTs puros não têm
  esse mecanismo sem uma blocklist.
- `@nestjs/passport` + `passport-jwt` é solução madura e bem documentada para NestJS.
- A combinação access + refresh token é padrão de mercado reconhecível em portfólios.

## Fluxo de tokens

```
Login:
  POST /auth/login → { accessToken } + Set-Cookie: refreshToken=...

Requisição autenticada:
  Authorization: Bearer <accessToken>

Renovação (access expirado):
  POST /auth/refresh (cookie enviado automaticamente)
  → { accessToken } novo

Logout:
  POST /auth/logout → revoga refresh token no banco, limpa cookie
```

## Segurança

- Senhas armazenadas com bcrypt, custo mínimo 12.
- Rate limiting em `/auth/login` e `/auth/register`: 5 requisições por minuto por IP via
  `@nestjs/throttler`.
- Refresh tokens com `expiresAt` e `revokedAt` — consulta banco a cada renovação.
- CORS configurado para aceitar apenas a origem do frontend (variável de ambiente).
- Helmet ativado no NestJS para headers de segurança HTTP.

## Alternativas consideradas

| Opção | Motivo de descarte |
|-------|-------------------|
| Sessão server-side (express-session) | Requer store distribuída para escalar; não demonstra JWT |
| JWT stateless puro (sem refresh) | TTL longo cria janela de exposição; TTL curto força relogin frequente |
| OAuth2 / OIDC externo | Complexidade desnecessária; o projeto é autossuficiente |
| Cookies para access token também | Access token em header é padrão de APIs REST; mais flexível para clientes não-browser |

## Consequências

- Tabela `refresh_tokens` no banco com índice em `token` (consulta por hash a cada renovação).
- Limpeza periódica de refresh tokens expirados (cron simples ou limpeza preguiçosa na renovação).
- O frontend gerencia o access token em memória (não em `localStorage`) para evitar XSS.
- `JwtAuthGuard` aplicado globalmente com `@Public()` decorator para rotas abertas.
