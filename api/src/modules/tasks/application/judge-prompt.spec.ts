import { describe, it, expect } from 'vitest';
import { buildJudgeMessages, JUDGE_PROMPT_VERSION } from './judge-prompt';
import { buildGenerationMessages } from './prompt-builder';
import { parseJudgeResponse } from '../domain/task-evaluation';
import { TaskSpecification } from '../domain/task-specification';
import { FakeLlmProvider } from '../infra/fake-llm.provider';

/** Especificação de exemplo usada nas asserções do prompt do juiz. */
const sampleSpecification: TaskSpecification = {
  title: 'Autenticação por token',
  context: 'API precisa autenticar usuários via JWT.',
  objective: 'Permitir login seguro com emissão de token.',
  functionalRequirements: ['Emitir JWT no login'],
  nonFunctionalRequirements: ['Token expira em 15 minutos'],
  acceptanceCriteria: ['Login válido retorna 200 com token'],
  technicalTasks: ['Implementar guard de JWT'],
  risks: ['Vazamento de segredo de assinatura'],
  dependencies: ['Biblioteca de JWT'],
  definitionOfDone: ['Testes de integração passando'],
};

const sampleDescription = 'Preciso de autenticação de usuários por token na API.';

describe('buildJudgeMessages', () => {
  it('retorna exatamente 2 mensagens: system e user', () => {
    const messages = buildJudgeMessages({
      description: sampleDescription,
      specification: sampleSpecification,
    });

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
  });

  it('menciona os seis critérios no system prompt', () => {
    const [system] = buildJudgeMessages({
      description: sampleDescription,
      specification: sampleSpecification,
    });

    expect(system.content).toContain('clarity');
    expect(system.content).toContain('completeness');
    expect(system.content).toContain('consistency');
    expect(system.content).toContain('testability');
    expect(system.content).toContain('risks');
    expect(system.content).toContain('requirementsAdherence');
  });

  it('exige resposta exclusivamente em JSON no system prompt', () => {
    const [system] = buildJudgeMessages({
      description: sampleDescription,
      specification: sampleSpecification,
    });

    expect(system.content).toContain('JSON');
    expect(system.content).toContain('"scores"');
    expect(system.content).toContain('"rationale"');
  });

  it('inclui a description e o JSON da specification no user message', () => {
    const [, user] = buildJudgeMessages({
      description: sampleDescription,
      specification: sampleSpecification,
    });

    expect(user.content).toContain(sampleDescription);
    expect(user.content).toContain(JSON.stringify(sampleSpecification, null, 2));
  });

  it('garante independência: não contém trechos característicos do prompt de geração', () => {
    const judgeMessages = buildJudgeMessages({
      description: sampleDescription,
      specification: sampleSpecification,
    });
    const [generationSystem] = buildGenerationMessages(sampleDescription);

    // Trecho característico do system prompt do GERADOR — não pode vazar para o juiz.
    const generationHallmark = 'Você é um arquiteto de software sênior';
    expect(generationSystem.content).toContain(generationHallmark);

    const combined = judgeMessages.map((m) => m.content).join('\n');
    expect(combined).not.toContain(generationHallmark);
  });
});

describe('JUDGE_PROMPT_VERSION', () => {
  it('é uma string não vazia', () => {
    expect(typeof JUDGE_PROMPT_VERSION).toBe('string');
    expect(JUDGE_PROMPT_VERSION.length).toBeGreaterThan(0);
  });
});

describe('FakeLlmProvider.defaultJudgeJson', () => {
  it('produz um JSON que parseJudgeResponse aceita como válido', () => {
    const result = parseJudgeResponse(FakeLlmProvider.defaultJudgeJson());
    expect(result.success).toBe(true);
  });
});
