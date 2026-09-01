import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/vue';
import type { TaskSpecification } from '@/services/task-events';
import SpecificationView from './SpecificationView.vue';

function makeSpec(overrides: Partial<TaskSpecification> = {}): TaskSpecification {
  return {
    title: 'Cadastro de usuários',
    context: 'Sistema precisa de gestão de contas.',
    objective: 'Permitir criar e autenticar usuários.',
    functionalRequirements: [],
    nonFunctionalRequirements: [],
    acceptanceCriteria: [],
    technicalTasks: [],
    risks: [],
    dependencies: [],
    definitionOfDone: [],
    ...overrides,
  };
}

describe('SpecificationView', () => {
  it('deve renderizar título, contexto e objetivo', () => {
    render(SpecificationView, { props: { specification: makeSpec() } });

    expect(
      screen.getByRole('heading', { level: 1, name: 'Cadastro de usuários' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Sistema precisa de gestão de contas.')).toBeInTheDocument();
    expect(screen.getByText('Permitir criar e autenticar usuários.')).toBeInTheDocument();
  });

  it('deve renderizar as seções cujas listas não estão vazias', () => {
    render(SpecificationView, {
      props: {
        specification: makeSpec({
          functionalRequirements: ['Login por e-mail', 'Recuperar senha'],
          acceptanceCriteria: ['Senha com no mínimo 8 caracteres'],
        }),
      },
    });

    expect(screen.getByRole('heading', { name: 'Requisitos funcionais' })).toBeInTheDocument();
    expect(screen.getByText('Login por e-mail')).toBeInTheDocument();
    expect(screen.getByText('Recuperar senha')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Critérios de aceite' })).toBeInTheDocument();
    expect(screen.getByText('Senha com no mínimo 8 caracteres')).toBeInTheDocument();
  });

  it('deve omitir seções cujas listas estão vazias', () => {
    render(SpecificationView, {
      props: { specification: makeSpec({ functionalRequirements: ['Único requisito'] }) },
    });

    expect(screen.getByRole('heading', { name: 'Requisitos funcionais' })).toBeInTheDocument();
    // As demais listas estão vazias e não devem aparecer.
    expect(screen.queryByRole('heading', { name: 'Riscos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Dependências' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Definition of Done' })).not.toBeInTheDocument();
  });
});
