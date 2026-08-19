import type { GenerationRunService } from '@/server/application/content-generation/generation-run-service';
import type { GenerationSession } from '@/server/domain/generation';

// pipeline session bypasses Pi SessionRepository; needs manual creation
export async function ensurePipelineRunSession(
  runService: GenerationRunService,
  projectId: string,
  cwd: string,
): Promise<void> {
  const now = new Date().toISOString();
  const session: GenerationSession = {
    id: `pipeline:${projectId}`,
    cwd,
    title: `Pipeline ${projectId}`,
    origin: 'direct-generation',
    createdAt: now,
    updatedAt: now,
  };
  await runService.ensureSession(session);
}
