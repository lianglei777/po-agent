import { AppError } from "@/server/domain/app-error";

export async function readLimitedResponse(
  response: Response,
  input: {
    limitBytes: number;
    tooLargeMessage: string;
  },
): Promise<Uint8Array> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > input.limitBytes) {
    throw tooLarge(input.tooLargeMessage);
  }

  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > input.limitBytes) {
        // Content-Length 可能缺失或不可信，必须在读取过程中执行真实字节上限。
        try {
          await reader.cancel();
        } catch {
          // 取消失败不应掩盖真正的超限错误。
        }
        throw tooLarge(input.tooLargeMessage);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const data = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return data;
}

function tooLarge(message: string): AppError {
  return new AppError("GENERATION_DOWNLOAD_TOO_LARGE", message, 502);
}
