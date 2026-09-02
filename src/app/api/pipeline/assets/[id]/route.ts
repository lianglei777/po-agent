import type { AssetResponse, UpdateAssetRequest } from '@/contracts/pipeline';
import { container } from '@/server/composition/container';
import { AppError } from '@/server/domain/app-error';
import { protectedRoute, readJson } from '@/app/api/_route';

export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  return protectedRoute<AssetResponse>(async () => {
    const { id } = await context.params;
    const body = (await readJson(request)) as UpdateAssetRequest;
    const updated = await container.pipelineRepository.updateAsset(id, body);
    if (!updated) throw new AppError('PIPELINE_ASSET_NOT_FOUND', 'Asset ' + id + ' not found', 404);
    return updated;
  });
}
