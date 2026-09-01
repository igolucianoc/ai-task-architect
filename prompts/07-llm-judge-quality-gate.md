# Prompt 07 — LLM-as-Judge e Quality Gate

Adicione uma etapa independente de avaliação da tarefa gerada.

## Objetivo

Depois da geração:

1. validar estrutura;
2. enviar o artefato para um avaliador;
3. receber critérios e scores;
4. calcular resultado;
5. decidir Quality Gate.

## Critérios

Use critérios objetivos, por exemplo:

- clareza;
- completude;
- consistência;
- testabilidade;
- riscos;
- aderência aos requisitos.

Use escala documentada e resultado final:

- APPROVED;
- REJECTED.

## Regras

O judge deve ser tratado como componente independente do gerador.

Não permita que o mesmo contexto de geração seja reutilizado de forma que torne a avaliação artificialmente tendenciosa.

Persistir:

- critérios;
- scores;
- justificativas curtas;
- modelo;
- versão do prompt;
- tokens;
- latência;
- resultado final.

Criar provider fake para testes.

Não criar um sistema multi-modelo complexo nesta etapa.
