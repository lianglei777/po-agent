import type { CreateAgentResponse } from '@/contracts/agent';
import { container } from '@/server/composition/container';
import { protectedRoute } from '@/app/api/_route';

export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  return protectedRoute<CreateAgentResponse>(async () => {
    const { id } = await context.params;
    return container.createPipelineAgentSession(id);
  });
}
