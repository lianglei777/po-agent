export interface GenerationProviderCredentialDescriptor {
  reference: string;
  kind: "api-key";
  environmentVariable: string;
}

export interface GenerationProviderDescriptor {
  providerId: string;
  displayName: string;
  credential?: GenerationProviderCredentialDescriptor;
}

export interface GenerationProviderDirectory {
  list(): GenerationProviderDescriptor[];
  get(providerId: string): GenerationProviderDescriptor | undefined;
}
