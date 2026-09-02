import type { AssetVariant } from '@/contracts/pipeline';
import { container } from '@/server/composition/container';
import { protectedRoute } from '@/app/api/_route';

export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  return protectedRoute<{ variants: AssetVariant[] }>(async () => {
    const { id } = await context.params;
    const variants = await container.pipelineRepository.listVariants(id);
    return { variants };
  });
}
