import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { EvaluateTaskSpecificationUseCase } from '../application/evaluate-task-specification.use-case';
import { TasksRepository } from './tasks.repository';
import { EVALUATION_QUEUE, EvaluationJobData } from './evaluation.queue';

/**
 * Worker BullMQ da avaliação assíncrona (LLM-as-Judge — ADR-006).
 *
 * Semântica de erros (distinção importante para retry/backoff):
 * - DADO INVÁLIDO (task inexistente ou sem especificação reidratável): NÃO
 *   relança. Reprocessar não resolveria — apenas logamos e retornamos, evitando
 *   retry infinito de um job que nunca teria sucesso.
 * - FALHA DO PROVIDER: o próprio use-case já captura, persiste UNAVAILABLE e
 *   retorna normalmente — então, no caminho comum, o processor não relança.
 * - ERRO INESPERADO DE INFRA (ex.: banco indisponível ao reidratar): deixamos
 *   propagar para o BullMQ acionar retry com backoff exponencial.
 */
@Processor(EVALUATION_QUEUE)
export class EvaluationProcessor extends WorkerHost {
  private readonly logger = new Logger(EvaluationProcessor.name);

  constructor(
    private readonly evaluateUseCase: EvaluateTaskSpecificationUseCase,
    private readonly repository: TasksRepository,
  ) {
    super();
  }

  async process(job: Job<EvaluationJobData>): Promise<void> {
    const { taskId } = job.data;

    // Reidrata a necessidade original + especificação a partir do banco.
    const source = await this.repository.findTaskWithArtifactById(taskId);
    if (!source) {
      // Dado inválido: não relança (reprocessar não ajudaria).
      this.logger.warn(
        `avaliação ignorada taskId=${taskId}: task inexistente ou sem especificação válida`,
      );
      return;
    }

    const outcome = await this.evaluateUseCase.execute({
      taskId,
      description: source.description,
      specification: source.specification,
    });

    // Metadados de conclusão — sem prompt/conteúdo/dados sensíveis.
    if (outcome.status === 'completed') {
      this.logger.log(
        `avaliação concluída taskId=${taskId} status=completed ` +
          `result=${outcome.result} overallScore=${outcome.overallScore.toFixed(2)}`,
      );
    } else {
      this.logger.log(`avaliação concluída taskId=${taskId} status=unavailable`);
    }
  }
}
