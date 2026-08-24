import type { AssetVariant } from '@/contracts/pipeline';
import { container } from '@/server/composition/container';
import { handleRoute } from '@/server/transport/http/api-response';

export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  return handleRoute<{ variants: AssetVariant[] }>(async () => {
    const { id } = await context.params;
    const variants = await container.pipelineRepository.listVariants(id);
    return { variants };
  });
}
