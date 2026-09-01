import { describe, it, expect } from 'vitest';
import { parseTaskSpecification } from './task-specification';

const validSpec = {
  title: 'Autenticação com Google multi-tenant',
  context: 'O sistema precisa autenticar via Google mantendo isolamento por tenant.',
  objective: 'Adicionar login com Google respeitando permissões por tenant.',
  functionalRequirements: ['Login via OAuth Google', 'Associação de conta ao tenant'],
  nonFunctionalRequirements: ['Latência de login < 2s'],
  acceptanceCriteria: ['Usuário autentica com conta Google', 'Permissões respeitam o tenant'],
  technicalTasks: ['Configurar OAuth', 'Mapear claims para tenant'],
  risks: ['Vazamento de token entre tenants'],
  dependencies: ['Credenciais OAuth do Google'],
  definitionOfDone: ['Testes de integração passando'],
};

describe('parseTaskSpecification', () => {
  it('faz parse de um JSON válido e puro', () => {
    const result = parseTaskSpecification(JSON.stringify(validSpec));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe(validSpec.title);
      expect(result.data.acceptanceCriteria).toHaveLength(2);
    }
  });

  it('extrai JSON embrulhado em cerca markdown (```json ... ```)', () => {
    const wrapped =
      'Claro! Aqui está a especificação:\n```json\n' +
      JSON.stringify(validSpec) +
      '\n```\nEspero que ajude.';
    const result = parseTaskSpecification(wrapped);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.objective).toBe(validSpec.objective);
    }
  });

  it('extrai JSON quando o modelo adiciona texto antes e depois', () => {
    const noisy = 'Segue abaixo: ' + JSON.stringify(validSpec) + ' Fim.';
    const result = parseTaskSpecification(noisy);

    expect(result.success).toBe(true);
  });

  it('aplica defaults para arrays opcionais ausentes', () => {
    const minimal = {
      title: 'Título',
      context: 'Contexto',
      objective: 'Objetivo',
      acceptanceCriteria: ['Critério único'],
    };
    const result = parseTaskSpecification(JSON.stringify(minimal));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.functionalRequirements).toEqual([]);
      expect(result.data.risks).toEqual([]);
      expect(result.data.definitionOfDone).toEqual([]);
    }
  });

  it('falha quando não há JSON na resposta', () => {
    const result = parseTaskSpecification('Desculpe, não consegui gerar a especificação.');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('nenhum objeto JSON');
    }
  });

  it('falha quando o JSON é sintaticamente inválido', () => {
    const result = parseTaskSpecification('{ "title": "x", "context": }');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/JSON válido|objeto JSON/);
    }
  });

  it('falha quando falta campo obrigatório (acceptanceCriteria)', () => {
    const invalid = { title: 'x', context: 'y', objective: 'z' };
    const result = parseTaskSpecification(JSON.stringify(invalid));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('acceptanceCriteria');
    }
  });

  it('falha quando acceptanceCriteria é uma lista vazia', () => {
    const invalid = { ...validSpec, acceptanceCriteria: [] };
    const result = parseTaskSpecification(JSON.stringify(invalid));

    expect(result.success).toBe(false);
  });

  it('rejeita título vazio (apenas espaços)', () => {
    const invalid = { ...validSpec, title: '   ' };
    const result = parseTaskSpecification(JSON.stringify(invalid));

    expect(result.success).toBe(false);
  });
});
