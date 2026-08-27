import { AppError } from "@/server/domain/app-error";
import type { PreparedGenerationAsset } from "@/server/domain/generation";
import type { ProviderInputAsset } from "@/server/ports/generation-provider";

const POLICY_URL="https://dashscope.aliyuncs.com/api/v1/uploads";
export class QianwenUploadClient{
  constructor(private readonly fetcher:typeof fetch,private readonly now:()=>Date=()=>new Date()){}
  async upload(asset:ProviderInputAsset,credential:string,vendorModel:string):Promise<PreparedGenerationAsset>{
    const response=await this.fetcher(`${POLICY_URL}?action=getPolicy&model=${encodeURIComponent(vendorModel)}`,{headers:{Authorization:`Bearer ${credential}`,"Content-Type":"application/json"},redirect:"error",signal:AbortSignal.timeout(120_000)});
    const value=await json(response,"Qianwen upload policy");
    if(!response.ok)throw providerError(value,`Qianwen upload policy failed (${response.status})`,response);
    const policy=parsePolicy(value);
    if(asset.data.byteLength>policy.maxFileSizeMb*1024*1024)throw new AppError("GENERATION_UPLOAD_FAILED","Qianwen input exceeds the model upload limit",400);
    const host=allowedUploadHost(policy.uploadHost);
    const key=`${policy.uploadDir}/${safeName(asset.name)}`;
    const form=new FormData();
    form.append("OSSAccessKeyId",policy.accessKey);form.append("policy",policy.policy);form.append("Signature",policy.signature);
    form.append("key",key);form.append("x-oss-object-acl",policy.acl);form.append("x-oss-forbid-overwrite",policy.forbidOverwrite);form.append("success_action_status","200");
    const bytes=asset.data.buffer.slice(asset.data.byteOffset,asset.data.byteOffset+asset.data.byteLength) as ArrayBuffer;
    // OSS 要求 file 是最后一个 multipart 字段，否则可能拒绝请求。
    form.append("file",new Blob([bytes],{type:asset.mimeType}),safeName(asset.name));
    const uploaded=await this.fetcher(host,{method:"POST",body:form,redirect:"error",signal:AbortSignal.timeout(120_000)});
    if(!uploaded.ok){
      if(uploaded.status===429)throw new AppError("GENERATION_PROVIDER_RATE_LIMITED","Qianwen OSS upload rate limit was reached",429,{retryAfterMs:retryAfter(uploaded.headers.get("retry-after"))});
      throw new AppError("GENERATION_UPLOAD_FAILED",`Qianwen OSS upload failed (${uploaded.status})`,uploaded.status);
    }
    return{slot:asset.slot,bindingId:asset.bindingId,order:asset.order,name:asset.name,mimeType:asset.mimeType,reference:{kind:"dashscope-oss",url:`oss://${key}`,vendorModel},expiresAt:new Date(this.now().getTime()+47*60*60*1000).toISOString()};
  }
}
function parsePolicy(value:unknown){const data=obj(obj(value).data);const fields={policy:str(data.policy),signature:str(data.signature),uploadDir:str(data.upload_dir),uploadHost:str(data.upload_host),accessKey:str(data.oss_access_key_id),acl:str(data.x_oss_object_acl),forbidOverwrite:str(data.x_oss_forbid_overwrite),maxFileSizeMb:num(data.max_file_size_mb)};if(Object.values(fields).some(v=>v===undefined)||!fields.uploadDir!.startsWith("dashscope-instant/")||fields.uploadDir!.includes(".."))throw new AppError("GENERATION_PROVIDER_PROTOCOL_ERROR","Qianwen upload policy is invalid",502);return fields as {[K in keyof typeof fields]:NonNullable<(typeof fields)[K]>};}
function allowedUploadHost(value:string){let url:URL;try{url=new URL(value)}catch{throw rejected()};if(url.protocol!=="https:"||url.username||url.password||url.pathname!=="/"||url.search||!/^dashscope-file(?:-[a-z0-9-]+)?\.oss(?:-accelerate|-cn-[a-z0-9-]+)\.aliyuncs\.com$/i.test(url.hostname))throw rejected();return url.toString();}
function rejected(){return new AppError("GENERATION_UPLOAD_FAILED","Qianwen upload URL is not allowed",400)}
function safeName(value:string){const name=value.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f<>:"|?*]/g,"_").slice(-180);return name||"upload.bin"}
async function json(response:Response,label:string){const text=await response.text();try{return text?JSON.parse(text):{}}catch{throw new AppError("GENERATION_PROVIDER_PROTOCOL_ERROR",`${label} returned invalid JSON`,502)}}
function providerError(value:unknown,fallback:string,response:Response){return response.status===429?new AppError("GENERATION_PROVIDER_RATE_LIMITED",str(obj(value).message)??fallback,429,{retryAfterMs:retryAfter(response.headers.get("retry-after"))}):new AppError("GENERATION_PROVIDER_ERROR",str(obj(value).message)??fallback,response.status)}
function retryAfter(value:string|null){if(!value)return undefined;const seconds=Number(value);if(Number.isFinite(seconds)&&seconds>=0)return seconds*1000;const timestamp=Date.parse(value);return Number.isFinite(timestamp)?Math.max(0,timestamp-Date.now()):undefined}
function obj(value:unknown):Record<string,unknown>{return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{}}
function str(value:unknown){return typeof value==="string"&&value?value:undefined}
function num(value:unknown){const result=typeof value==="number"?value:Number(value);return Number.isFinite(result)&&result>0?result:undefined}
