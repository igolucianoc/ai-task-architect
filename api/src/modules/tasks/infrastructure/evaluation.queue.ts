import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { CORRELATION_ID_KEY } from '../../../common/observability/observability.constants';

/** Nome canônico da fila de avaliação (LLM-as-Judge assíncrono — ADR-006). */
export const EVALUATION_QUEUE = 'evaluation';

/**
 * Payload mínimo do job de avaliação. Carregamos apenas o `taskId`: o worker
 * reidrata a `description` e a especificação a partir do banco. Assim o job
 * permanece pequeno e não duplica dados que já estão persistidos.
 *
 * `correlationId` é opcional: propaga o id de correlação do request que
 * enfileirou o job para que os logs do worker herdem o mesmo id (jobs antigos,
 * sem o campo, seguem válidos).
 */
export interface EvaluationJobData {
  taskId: string;
  correlationId?: string;
}

/**
 * Serviço de enfileiramento da avaliação. Encapsula a fila BullMQ para que os
 * chamadores (ex.: o controller SSE) não dependam diretamente do SDK.
 */
@Injectable()
export class EvaluationQueue {
  private readonly logger = new Logger(EvaluationQueue.name);

  constructor(
    @InjectQueue(EVALUATION_QUEUE) private readonly queue: Queue<EvaluationJobData>,
    private readonly cls: ClsService,
  ) {}

  /**
   * Enfileira a avaliação de uma task. Usa `jobId = taskId` (determinístico)
   * para que reabrir o stream da mesma task não crie avaliações duplicadas — o
   * BullMQ descarta um job cujo id já existe na fila.
   *
   * O `correlationId` é lido do CLS aqui dentro (o enqueue roda no contexto do
   * request). Assim os chamadores não precisam conhecer/repassar o id: ele é
   * gravado no payload e reidratado pelo worker para manter o rastreio.
   */
  async enqueue(payload: EvaluationJobData): Promise<void> {
    const correlationId =
      payload.correlationId ??
      (this.cls.isActive() ? this.cls.get<string | undefined>(CORRELATION_ID_KEY) : undefined);

    const jobData: EvaluationJobData = { ...payload, correlationId };

    await this.queue.add('evaluate', jobData, { jobId: payload.taskId });
    this.logger.log(`avaliação enfileirada taskId=${payload.taskId}`);
  }
}
