# Padrão — Uso seguro do Hugging Face Access Token

Este documento é a fonte de verdade para integração com LLMs neste projeto.

**O provider de LLM é exclusivamente a Hugging Face.**
Não use OpenAI, Anthropic, Cohere, Google Gemini ou qualquer outro provider, mesmo que existam instruções, exemplos ou bibliotecas disponíveis para eles.
Se surgir necessidade de troca de provider, atualize este documento antes de alterar qualquer código.

Aplique as regras abaixo desde a etapa de setup, antes de escrever qualquer código de integração.

---

## Regra fundamental

O Hugging Face Access Token é um secret.
Ele nunca deve aparecer em código-fonte, commits, logs ou saídas de terminal.

---

## Configuração de ambiente

Declare o token exclusivamente via variável de ambiente:

```
HF_TOKEN=hf_...
```

No `.env.example`, use um placeholder descritivo — nunca um token real:

```
# Hugging Face Configuration
# Get your token at: https://huggingface.co/settings/tokens
HF_TOKEN=your_hugging_face_token_here

# Model to use for inference
# Examples:
#   microsoft/DialoGPT-medium
#   HuggingFaceH4/zephyr-7b-beta
#   mistralai/Mistral-7B-Instruct-v0.2
#   meta-llama/Llama-2-7b-chat-hf (requires access request)
HF_MODEL=HuggingFaceH4/zephyr-7b-beta
```

Garanta que `.env` e qualquer arquivo com valores reais estejam no `.gitignore`.

---

## Tipos de token e escopo mínimo

| Tipo | Quando usar |
|------|-------------|
| Read | Inferência, download de modelos públicos e privados |
| Fine-grained | Quando precisar restringir acesso a repositórios ou namespaces específicos |
| Write | Apenas se o projeto fizer upload de modelos ou datasets |

Sempre solicite o menor escopo necessário para a operação do projeto.

---

## Carregamento no backend

Valide a presença do token na inicialização da aplicação, não no momento do uso.
Falhe rápido se o token estiver ausente em ambiente de produção.

Exemplo em Node.js / TypeScript:

```typescript
// config/huggingface.config.ts
import { z } from 'zod';

const schema = z.object({
  HF_TOKEN: z.string().min(1, 'HF_TOKEN é obrigatório'),
  HF_MODEL: z.string().min(1, 'HF_MODEL é obrigatório'),
});

export const hfConfig = schema.parse(process.env);
```

Exemplo em Python:

```python
# config/huggingface_config.py
import os
from dataclasses import dataclass

@dataclass
class HuggingFaceConfig:
    access_token: str
    model: str

    @classmethod
    def from_env(cls) -> "HuggingFaceConfig":
        token = os.environ.get("HF_TOKEN")
        model = os.environ.get("HF_MODEL")
        if not token:
            raise EnvironmentError("HF_TOKEN é obrigatório")
        if not model:
            raise EnvironmentError("HF_MODEL é obrigatório")
        return cls(access_token=token, model=model)
```

---

## Abstração do provider

O domínio da aplicação não deve importar diretamente o SDK da Hugging Face.
Crie uma interface/porta e injete a implementação concreta via injeção de dependência.

```typescript
// domain/ports/llm-provider.port.ts
export interface LLMProvider {
  generate(prompt: string): Promise<string>;
}

// infra/huggingface/huggingface.provider.ts
export class HuggingFaceProvider implements LLMProvider {
  constructor(private readonly config: HuggingFaceConfig) {}

  async generate(prompt: string): Promise<string> {
    // usa this.config.access_token e this.config.model — nunca lê process.env aqui
  }
}
```

Crie sempre um `FakeLLMProvider` para testes automatizados.
Testes não devem depender de chamadas reais à API da Hugging Face.

---

## O que nunca fazer

- Não hardcode o token, nem em comentários ou strings de exemplo com valor real.
- Não logue o token, nem parcialmente (evite `token.substring(0, 8)`).
- Não exponha o token em respostas de API, mesmo em modo debug.
- Não commite arquivos `.env` com valores reais.
- Não passe o token como argumento de linha de comando (aparece em `ps aux` e logs de CI).
- Não use o mesmo token em todos os projetos — gere um token por projeto quando possível.

---

## Observabilidade

Ao registrar logs relacionados à integração com a Hugging Face, nunca inclua o token.
Registre apenas:

- model id;
- latência;
- input/output tokens quando disponíveis;
- status da resposta;
- erros sem stack traces que exponham o token.

---

## CI/CD

Configure o token como secret no sistema de CI (GitHub Actions, GitLab CI, etc.).
Referencie-o via variável de ambiente no pipeline — nunca via arquivo comitado.

Exemplo no GitHub Actions:

```yaml
env:
  HF_ACCESS_TOKEN: ${{ secrets.HF_ACCESS_TOKEN }}
```

---

## Checklist antes de qualquer commit

- [ ] `.env` está no `.gitignore`
- [ ] `.env.example` tem placeholder, não token real
- [ ] Token carregado e validado na inicialização
- [ ] Domínio não importa SDK da Hugging Face diretamente
- [ ] Testes usam provider fake, não chamadas reais
- [ ] Logs não contêm o token
- [ ] CI usa secret, não variável em arquivo comitado
