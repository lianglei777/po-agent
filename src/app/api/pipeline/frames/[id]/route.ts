import type { FrameResponse } from '@/contracts/pipeline';
import type { StoryboardFrame } from '@/server/domain/pipeline';
import { container } from '@/server/composition/container';
import { AppError } from '@/server/domain/app-error';
import { handleRoute, readJson } from '@/server/transport/http/api-response';

export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  return handleRoute<FrameResponse>(async () => {
    const { id } = await context.params;
    const body = (await readJson(request)) as Partial<StoryboardFrame>;
    const updated = await container.pipelineRepository.updateFrame(id, body);
    if (!updated) throw new AppError('PIPELINE_FRAME_NOT_FOUND', 'Frame ' + id + ' not found', 404);
    return updated;
  });
}
