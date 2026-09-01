# Prompt 05 — Domínio e geração de tarefas

Implemente o núcleo do produto.

## Entrada

O usuário fornece uma necessidade técnica em linguagem natural, por exemplo:

"Adicionar autenticação com Google mantendo controle de permissões por tenant."

## Saída esperada

A IA deve produzir uma estrutura validável contendo, quando aplicável:

- título;
- contexto;
- objetivo;
- requisitos funcionais;
- requisitos não funcionais;
- critérios de aceite;
- tarefas técnicas;
- riscos;
- dependências;
- Definition of Done.

## Arquitetura

Separe:

- domínio;
- casos de uso;
- portas/interfaces;
- infraestrutura;
- provider de LLM;
- persistência;
- apresentação HTTP.

O domínio não deve depender do SDK específico do provider.

## LLM

Crie uma abstração de provider.

A resposta do LLM deve ser estruturada e validada antes de ser persistida.

Não confiar cegamente no JSON retornado pelo modelo.

Se o provider falhar:

- registre erro;
- mantenha o estado da execução consistente;
- não persista artefato inválido.

Crie um provider fake para testes.
