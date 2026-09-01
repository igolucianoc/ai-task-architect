import { Task } from '@prisma/client';
import { TaskWithRelations } from './tasks.repository';
import { TaskSpecification } from './domain/task-specification';

export interface TaskSummaryView {
  id: string;
  description: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDetailView extends TaskSummaryView {
  specification: TaskSpecification | null;
  lastRun: {
    status: string;
    model: string;
    errorMessage: string | null;
    startedAt: string;
    finishedAt: string | null;
  } | null;
}

export function toTaskSummary(task: Task): TaskSummaryView {
  return {
    id: task.id,
    description: task.description,
    status: task.status,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

export function toTaskDetail(task: TaskWithRelations): TaskDetailView {
  const latestArtifact = task.artifacts.at(0);
  const latestRun = task.generationRuns.at(0);

  return {
    ...toTaskSummary(task),
    specification: latestArtifact ? parseArtifactContent(latestArtifact.content) : null,
    lastRun: latestRun
      ? {
          status: latestRun.status,
          model: latestRun.model,
          errorMessage: latestRun.errorMessage,
          startedAt: latestRun.startedAt.toISOString(),
          finishedAt: latestRun.finishedAt ? latestRun.finishedAt.toISOString() : null,
        }
      : null,
  };
}

/**
 * O artifact foi persistido como JSON já validado. Ainda assim, fazemos parse
 * defensivo: se algo estiver corrompido, retornamos null em vez de quebrar.
 */
function parseArtifactContent(content: string): TaskSpecification | null {
  try {
    return JSON.parse(content) as TaskSpecification;
  } catch {
    return null;
  }
}
