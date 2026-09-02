import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { EvaluateTaskSpecificationUseCase } from '../application/evaluate-task-specification.use-case';
import { CORRELATION_ID_KEY } from '../../../common/observability/observability.constants';
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
    private readonly cls: ClsService,
  ) {
    super();
  }

  async process(job: Job<EvaluationJobData>): Promise<void> {
    // Fallback quando o job não traz correlationId (jobs antigos): geramos um id
    // próprio da execução assíncrona com randomUUID(), rastreável e independente
    // do request original. O log "avaliação iniciada" liga taskId ao id gerado.
    const correlationId = job.data.correlationId ?? randomUUID();

    // Abre um escopo CLS para que TODOS os logs abaixo — inclusive os emitidos
    // dentro do EvaluateTaskSpecificationUseCase — herdem o mesmo correlationId.
    // O `run` é aguardado e propaga exceções: dado inválido não relança; erro de
    // infra propaga normalmente para o BullMQ acionar retry.
    await this.cls.run(async () => {
      this.cls.set(CORRELATION_ID_KEY, correlationId);

      const { taskId } = job.data;

      // Liga os dois mundos (request → worker): registra o vínculo taskId/correlationId.
      this.logger.log(`avaliação iniciada taskId=${taskId} correlationId=${correlationId}`);

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
    });
  }
}
