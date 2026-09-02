# Checklist final de release

Preparação do repositório `ai-task-architect` para publicação no GitHub.

## Status por item

| # | Item | Status | Observação |
|---|------|--------|------------|
| 1 | Remover arquivos temporários | OK | Working tree limpo; nenhum `.log`/`.tmp`/`.bak` versionado. `api/dist` e `web/dist` existem localmente mas estão no `.gitignore` (não vão para o repositório). |
| 2 | Remover secrets | OK | Nenhum token real versionado; `git grep` por `hf_…` não retorna nada. `.env`, `api/.env`, `web/.env` são ignorados e não trackeados. |
| 3 | Revisar `.gitignore` | OK | Cobre `node_modules`, `dist/build`, `.env*`, logs, cache, coverage, editores, artefato de Prisma dev. |
| 4 | Revisar `.env.example` | OK | Três arquivos (`.env.example`, `api/.env.example`, `web/.env.example`) só com placeholders e instruções. |
| 5 | Validar Docker | OK | `docker compose config` válido; `docker-entrypoint.sh` com sintaxe válida; subida completa validada nas Etapas 11–12. |
| 6 | Validar migrations | OK | `prisma validate` OK; `prisma migrate status` → "Database schema is up to date" (3 migrations). |
| 7 | Validar seed | OK | Idempotente: executado duas vezes seguidas sem erro. |
| 8 | Executar testes | OK | API: 135 unit (18 arquivos) + 7 E2E. Web: 116 (24 arquivos). |
| 9 | Executar typecheck | OK | API e Web sem erros. |
| 10 | Executar lint | OK | API e Web sem erros. |
| 11 | Revisar README | OK | README de portfólio cobrindo os 19 tópicos + narrativa + uso de IA (Etapa 13). |
| 12 | Revisar ADRs | OK | 13 ADRs (001–013), todos linkados no README. |
| 13 | Revisar nomes públicos | OK | `ai-task-architect-api` / `ai-task-architect-web`, `0.1.0`, `private: true`. |
| 14 | Revisar comentários | OK | Sem `console.log` em produção; único `TODO` reescrito como nota de decisão. |
| 15 | Verificar dependências desnecessárias | OK | Sem `bcrypt` órfão (só `bcryptjs`); demais dependências têm uso claro. |

## Comandos executados

```bash
# Higiene
git ls-files | grep -E "(^|/)\.env"          # só *.example
git check-ignore .env api/.env web/.env      # todos ignorados
git grep -nE "hf_[A-Za-z0-9]{20,}"           # nenhum secret

# Infra / banco
docker compose config                        # válido
sh -n api/docker-entrypoint.sh               # sintaxe OK
npx prisma validate                          # schema válido
npx prisma migrate status                    # up to date
npm run db:seed  (2x)                         # idempotente

# Qualidade — API
npm run typecheck && npm run lint && npm test # OK (135 testes)
DATABASE_URL=…_test npm run test:e2e          # OK (7 testes)

# Qualidade — Web
npm run typecheck && npm run lint && npm test # OK (116 testes)
npm run build                                 # build de produção OK
```

## Riscos conhecidos

- **Chamada ao LLM não cancelável**: desconexão do cliente durante o stream encerra o transporte,
  mas a chamada em andamento segue e o resultado é persistido. Sem timeout via `AbortSignal`.
- **Access token na query string do SSE**: mascarado nos logs da aplicação (`[REDACTED]`), mas logs
  de borda (proxy/CDN) poderiam registrá-lo. Mitigação futura: token de stream dedicado.
- **`api/dist` local pertence a `root`** (gerado por build no container). Não afeta o repositório
  (é gitignored); limpeza opcional com `sudo rm -rf api/dist`.
- **Testes E2E exigem banco `_test`** dedicado; por design (evita truncar o banco de dev). É preciso
  fornecer um `DATABASE_URL` apontando para `..._test` (o setup deriva automaticamente).

## Sugestão de tag/versão inicial

- **`v0.1.0`** — primeira versão pública funcional (coerente com o `0.1.0` dos `package.json`).
- Comando sugerido (execução manual, após revisar e commitar):

  ```bash
  git tag -a v0.1.0 -m "Release inicial: geração de especificações com LLM + LLM-as-Judge"
  git push origin main --tags
  ```
