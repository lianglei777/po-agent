import type {
  UpdateWebAccessSettingsRequest,
  WebAccessSettingsResponse,
} from "@/contracts/web-access";

export interface WebAccessSettingsStore {
  read(): Promise<WebAccessSettingsResponse>;
  write(input: UpdateWebAccessSettingsRequest): Promise<void>;
}
