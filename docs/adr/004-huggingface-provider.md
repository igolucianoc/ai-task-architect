# ADR-004 — Hugging Face como provider exclusivo de LLM

**Data:** 2026-09-01  
**Status:** Aceito

## Contexto

O sistema precisa de um provider de LLM para duas funções: geração de especificações técnicas
(com streaming) e avaliação de qualidade (sem streaming). Precisamos definir qual provider usar
e como abstrair o acesso.

## Decisão

Usar **exclusivamente a Hugging Face Inference API** como provider de LLM. Nenhum outro provider
(OpenAI, Anthropic, Cohere, Mistral via API própria, etc.) será integrado.

A comunicação é feita via SDK oficial `@huggingface/inference` ou via `fetch` direto para a
Inference API, com token de acesso lido de variável de ambiente.

## Justificativa

- Restrição de portfólio: demonstrar uso responsável de LLM open-source via Hugging Face em vez
  de depender de providers proprietários.
- A Hugging Face Inference API suporta streaming via `textGenerationStream()`.
- Acesso gratuito com token de acesso pessoal para modelos públicos (ex.: `mistralai/Mixtral-8x7B-Instruct-v0.1`,
  `HuggingFaceH4/zephyr-7b-beta`).
- Abstração via `LlmModule` isola o resto do sistema do provider específico, facilitando
  eventual troca sem alterar módulos de negócio.

## Configuração esperada

```env
HUGGINGFACE_API_TOKEN=hf_...
HUGGINGFACE_MODEL_GENERATION=HuggingFaceH4/zephyr-7b-beta
HUGGINGFACE_MODEL_EVALUATION=HuggingFaceH4/zephyr-7b-beta
```

Modelos podem ser diferentes para geração e avaliação, configuráveis via `.env`.

## Alternativas consideradas

| Opção | Motivo de descarte |
|-------|-------------------|
| OpenAI GPT-4 | Provider proprietário, custo por token, fora da restrição do projeto |
| Anthropic Claude | Idem OpenAI |
| Ollama (local) | Requer hardware local potente; não funciona em ambientes de CI/CD sem GPU |
| LangChain | Abstração adicional desnecessária; adiciona dependência pesada sem ganho claro |

## Consequências

- `LlmService` encapsula toda comunicação com o HF. Nenhum outro módulo importa o SDK diretamente.
- Respostas do HF podem ter latência variável (modelos grandes em cold start). O sistema deve
  comunicar isso claramente via SSE e ter timeout configurável.
- Token de acesso é lido exclusivamente de `process.env.HUGGINGFACE_API_TOKEN` — nunca hardcoded.
- Modelos free tier têm rate limits; o sistema deve tratar erros 429 com mensagem descritiva.
- Ver `prompts/huggingface-access-token.md` para regras adicionais sobre o token.
