import type { GenerationAssetSlot, GenerationInputSchema, GenerationParameterField, JsonValue } from "@/contracts/generation";
import type { GenerationCapability, GenerationRoute } from "@/server/domain/generation";
import { QIANWEN_CREDENTIAL_REF, QIANWEN_PROVIDER_ID } from "./qianwen-provider-constants";
const MIB=1024*1024;
export const QIANWEN_WAN_3_TEXT_TO_VIDEO_OPERATION="wan-3-0-text-to-video";
export const QIANWEN_WAN_3_IMAGE_TO_VIDEO_OPERATION="wan-3-0-image-to-video";
export const QIANWEN_WAN_3_MULTIMODAL_VIDEO_OPERATION="wan-3-0-multimodal-video";
export const QIANWEN_Z_IMAGE_TEXT_TO_IMAGE_OPERATION="z-image-text-to-image";
export const QIANWEN_WAN_2_6_TEXT_TO_IMAGE_OPERATION="wan-2-6-text-to-image";
export const QIANWEN_WAN_2_5_TEXT_TO_IMAGE_OPERATION="wan-2-5-text-to-image";
export const QIANWEN_WAN_2_2_PLUS_TEXT_TO_IMAGE_OPERATION="wan-2-2-plus-text-to-image";
export const QIANWEN_WAN_2_2_FLASH_TEXT_TO_IMAGE_OPERATION="wan-2-2-flash-text-to-image";
export const QIANWEN_WANX_2_1_PLUS_TEXT_TO_IMAGE_OPERATION="wanx-2-1-plus-text-to-image";
export const QIANWEN_WANX_2_1_TURBO_TEXT_TO_IMAGE_OPERATION="wanx-2-1-turbo-text-to-image";
export const QIANWEN_WANX_2_0_TURBO_TEXT_TO_IMAGE_OPERATION="wanx-2-0-turbo-text-to-image";
export const QIANWEN_WAN_2_7_TEXT_TO_VIDEO_OPERATION="wan-2-7-text-to-video";
export const QIANWEN_WAN_2_7_IMAGE_TO_VIDEO_OPERATION="wan-2-7-image-to-video";
export const QIANWEN_WAN_2_7_REFERENCE_TO_VIDEO_OPERATION="wan-2-7-reference-to-video";
export const QIANWEN_HAPPYHORSE_TEXT_TO_VIDEO_OPERATION="happyhorse-text-to-video";
export const QIANWEN_HAPPYHORSE_IMAGE_TO_VIDEO_OPERATION="happyhorse-image-to-video";
export const QIANWEN_HAPPYHORSE_REFERENCE_TO_VIDEO_OPERATION="happyhorse-reference-to-video";
export const QIANWEN_MINIMAX_H3_TEXT_TO_VIDEO_OPERATION="minimax-h3-text-to-video";
export const QIANWEN_MINIMAX_H3_IMAGE_TO_VIDEO_OPERATION="minimax-h3-image-to-video";
export const QIANWEN_MINIMAX_H3_MULTIMODAL_VIDEO_OPERATION="minimax-h3-multimodal-video";
export type QianwenOperation=typeof QIANWEN_WAN_3_TEXT_TO_VIDEO_OPERATION|typeof QIANWEN_WAN_3_IMAGE_TO_VIDEO_OPERATION|typeof QIANWEN_WAN_3_MULTIMODAL_VIDEO_OPERATION|typeof QIANWEN_WAN_2_7_TEXT_TO_VIDEO_OPERATION|typeof QIANWEN_WAN_2_7_IMAGE_TO_VIDEO_OPERATION|typeof QIANWEN_WAN_2_7_REFERENCE_TO_VIDEO_OPERATION|typeof QIANWEN_HAPPYHORSE_TEXT_TO_VIDEO_OPERATION|typeof QIANWEN_HAPPYHORSE_IMAGE_TO_VIDEO_OPERATION|typeof QIANWEN_HAPPYHORSE_REFERENCE_TO_VIDEO_OPERATION|typeof QIANWEN_MINIMAX_H3_TEXT_TO_VIDEO_OPERATION|typeof QIANWEN_MINIMAX_H3_IMAGE_TO_VIDEO_OPERATION|typeof QIANWEN_MINIMAX_H3_MULTIMODAL_VIDEO_OPERATION;
export interface QianwenAssetBinding{slot:string;mediaType:"first_frame"|"last_frame"|"reference_image"|"reference_video"|"reference_audio"|"driving_audio"|"image_url"|"feature"|"audio_url";cardinality:"first"|"list"}
interface QianwenVideoExecutionConfig{protocol:"dashscope-media-v1";operation:QianwenOperation;endpointId:"video-synthesis";vendorModel:"wan3.0-video"|"wan2.7-t2v-2026-06-12"|"wan2.7-i2v-2026-04-25"|"wan2.7-r2v-2026-06-12"|"happyhorse-1.1-t2v"|"happyhorse-1.1-i2v"|"happyhorse-1.1-r2v"|"MiniMax/MiniMax-H3";requestProfile:"wan-3-video-v1"|"wan-2-7-video-v1"|"happyhorse-video-v1"|"minimax-h3-video-v1";resultProfile:"video-url-v1";assetBindings:QianwenAssetBinding[];pollIntervalMs:15_000;submitMode:"async-task"}
type QianwenImageOperation=typeof QIANWEN_Z_IMAGE_TEXT_TO_IMAGE_OPERATION|typeof QIANWEN_WAN_2_6_TEXT_TO_IMAGE_OPERATION|typeof QIANWEN_WAN_2_5_TEXT_TO_IMAGE_OPERATION|typeof QIANWEN_WAN_2_2_PLUS_TEXT_TO_IMAGE_OPERATION|typeof QIANWEN_WAN_2_2_FLASH_TEXT_TO_IMAGE_OPERATION|typeof QIANWEN_WANX_2_1_PLUS_TEXT_TO_IMAGE_OPERATION|typeof QIANWEN_WANX_2_1_TURBO_TEXT_TO_IMAGE_OPERATION|typeof QIANWEN_WANX_2_0_TURBO_TEXT_TO_IMAGE_OPERATION;
interface QianwenImageExecutionConfig{protocol:"dashscope-media-v1";operation:QianwenImageOperation;endpointId:"multimodal-generation"|"image-generation"|"legacy-image-synthesis";vendorModel:"z-image-turbo"|"wan2.6-t2i"|"wan2.5-t2i-preview"|"wan2.2-t2i-plus"|"wan2.2-t2i-flash"|"wanx2.1-t2i-plus"|"wanx2.1-t2i-turbo"|"wanx2.0-t2i-turbo";requestProfile:"messages-text-image-v1"|"legacy-prompt-image-v1";resultProfile:"choices-content-image-v1"|"legacy-results-image-v1";assetBindings:[];pollIntervalMs?:5_000;submitMode:"sync"|"async-task"}
export type QianwenExecutionConfig=QianwenVideoExecutionConfig|QianwenImageExecutionConfig;
const params=():GenerationParameterField[]=>[
 select("resolution","分辨率",["480P","720P","1080P"],"1080P"),select("aspectRatio","画面比例",["adaptive","16:9","4:3","1:1","3:4","9:16"],"adaptive"),
 {key:"durationSeconds",label:"时长",description:"智能时长由模型根据输入决定。",type:"select",required:true,defaultValue:5,options:[{label:"智能时长",value:-1},...Array.from({length:29},(_,i)=>({label:`${i+2} 秒`,value:i+2}))]},
 bool("generateAudio","生成音轨",true),bool("promptExtend","提示词智能改写",true),bool("watermark","添加水印",false),
 {key:"seed",label:"随机种子",description:"留空时由供应商随机生成。",type:"number",min:0,max:2_147_483_647},
];
const slot=(key:string,label:string,mediaType:GenerationAssetSlot["mediaType"],maxFiles:number,maxFileSizeBytes:number,required=false):GenerationAssetSlot=>({key,label,mediaType,required,multiple:maxFiles>1,maxFiles,maxFileSizeBytes,acceptedTypes:mediaType==="image"?["image/png","image/jpeg","image/webp"]:mediaType==="video"?["video/mp4","video/quicktime"]:["audio/mpeg","audio/wav","audio/mp4"]});
const defs:Array<{operation:QianwenOperation;id:string;name:string;description:string;tags:string[];capability:GenerationCapability;schema:GenerationInputSchema;bindings:QianwenAssetBinding[]}>= [
 {operation:QIANWEN_WAN_3_TEXT_TO_VIDEO_OPERATION,id:"qianwen-wan-3-0-text-to-video",name:"Wan 3.0 文生视频",description:"千问AI平台 Wan 3.0 文生视频，支持 2–30 秒或智能时长、多种画幅、音轨生成与提示词智能改写。",tags:["最长30秒","智能时长","有声视频","最高1080P"],capability:"text-to-video",schema:{prompt:{required:true,maxLength:20_000},parameters:params()},bindings:[]},
 {operation:QIANWEN_WAN_3_IMAGE_TO_VIDEO_OPERATION,id:"qianwen-wan-3-0-image-to-video",name:"Wan 3.0 图生视频",description:"通过首帧或首尾帧生成 Wan 3.0 视频，素材经千问临时 OSS 安全提交。",tags:["首帧/首尾帧","最长30秒","有声视频","最高1080P"],capability:"image-to-video",schema:{prompt:{required:false,maxLength:20_000},parameters:params(),assets:[slot("firstFrameUrl","首帧图片","image",1,20*MIB,true),slot("lastFrameUrl","尾帧图片","image",1,20*MIB)]},bindings:[{slot:"firstFrameUrl",mediaType:"first_frame",cardinality:"first"},{slot:"lastFrameUrl",mediaType:"last_frame",cardinality:"first"}]},
 {operation:QIANWEN_WAN_3_MULTIMODAL_VIDEO_OPERATION,id:"qianwen-wan-3-0-multimodal-to-video",name:"Wan 3.0 多模态生视频",description:"组合参考图片、视频和音频生成 Wan 3.0 视频，并保持各类素材的稳定引用顺序。",tags:["多模态参考","图/视/音组合","最长30秒","有声视频"],capability:"multimodal-to-video",schema:{prompt:{required:true,maxLength:20_000},parameters:params(),assets:[slot("imageUrls","参考图片","image",10,20*MIB),slot("videoUrls","参考视频","video",5,50*MIB),slot("audioUrls","参考音频","audio",5,15*MIB)],constraints:[{kind:"at-least-one-asset",slots:["imageUrls","videoUrls","audioUrls"]}]},bindings:[{slot:"imageUrls",mediaType:"reference_image",cardinality:"list"},{slot:"videoUrls",mediaType:"reference_video",cardinality:"list"},{slot:"audioUrls",mediaType:"reference_audio",cardinality:"list"}]},
];
export function createQianwenRoutes(now=new Date().toISOString()):GenerationRoute[]{return [...defs.map(d=>({id:d.id,name:d.name,description:d.description,tags:d.tags,product:"Wan 3.0",capability:d.capability,providerId:QIANWEN_PROVIDER_ID,providerOperation:d.operation,enabled:false,isDefault:false,revision:2,defaults:Object.fromEntries((d.schema.parameters??[]).filter(f=>f.defaultValue!==undefined).map(f=>[f.key,f.defaultValue as JsonValue])),inputSchema:d.schema,adapterConfig:{protocol:"dashscope-media-v1",operation:d.operation,endpointId:"video-synthesis",vendorModel:"wan3.0-video",requestProfile:"wan-3-video-v1",resultProfile:"video-url-v1",assetBindings:d.bindings,pollIntervalMs:15_000,submitMode:"async-task"} as unknown as JsonValue,credentialRef:QIANWEN_CREDENTIAL_REF,createdAt:now,updatedAt:now})),...imageRoutes(now),...legacyImageRoutes(now),...extendedVideoRoutes(now)];}
function imageRoutes(now:string):GenerationRoute[]{const imageDefs=[{id:"qianwen-z-image-text-to-image",name:"Z-Image Turbo 文生图片",description:"千问 Z-Image Turbo 同步文生图，适合快速生成单张 PNG 图片。",tags:["同步生成","单张PNG","最高2048","提示词改写"],product:"Z-Image Turbo",operation:QIANWEN_Z_IMAGE_TEXT_TO_IMAGE_OPERATION,maxLength:800,model:"z-image-turbo",endpoint:"multimodal-generation",mode:"sync",size:"1024*1536",sizes:["1024*1024","832*1248","1248*832","864*1152","1152*864","720*1280","1280*720","1024*1536","1536*1024"]},{id:"qianwen-wan-2-6-text-to-image",name:"Wan 2.6 文生图片",description:"千问 Wan 2.6 异步文生图，支持 1–4 张输出、负向提示词和常用画幅。",tags:["异步生成","最多4张","多种画幅","提示词改写"],product:"Wan 2.6",operation:QIANWEN_WAN_2_6_TEXT_TO_IMAGE_OPERATION,maxLength:2100,model:"wan2.6-t2i",endpoint:"image-generation",mode:"async-task",size:"1280*1280",sizes:["1280*1280","1104*1472","1472*1104","960*1696","1696*960"]}] as const;return imageDefs.map(d=>{const fields:GenerationParameterField[]=[select("size","图片尺寸",[...d.sizes],d.size),bool("promptExtend","提示词智能改写",d.model!=="z-image-turbo"),...(d.model==="wan2.6-t2i"?[{key:"negativePrompt",label:"负向提示词",type:"text" as const,maxLength:500},{key:"imageCount",label:"生成数量",type:"number" as const,defaultValue:1,min:1,max:4},bool("watermark","添加水印",false)]:[]),{key:"seed",label:"随机种子",type:"number",min:0,max:2_147_483_647}];return{id:d.id,name:d.name,description:d.description,tags:[...d.tags],product:d.product,capability:"text-to-image",providerId:QIANWEN_PROVIDER_ID,providerOperation:d.operation,enabled:false,isDefault:false,revision:1,defaults:Object.fromEntries(fields.filter(f=>f.defaultValue!==undefined).map(f=>[f.key,f.defaultValue as JsonValue])),inputSchema:{prompt:{required:true,maxLength:d.maxLength},parameters:fields},adapterConfig:{protocol:"dashscope-media-v1",operation:d.operation,endpointId:d.endpoint,vendorModel:d.model,requestProfile:"messages-text-image-v1",resultProfile:"choices-content-image-v1",assetBindings:[],submitMode:d.mode,...(d.mode==="async-task"?{pollIntervalMs:5_000}:{})},credentialRef:QIANWEN_CREDENTIAL_REF,createdAt:now,updatedAt:now} as GenerationRoute;});}
function select(key:string,label:string,values:Array<string|number>,defaultValue:string|number):GenerationParameterField{return{key,label,type:"select",required:true,defaultValue,options:values.map(value=>({label:String(value),value}))};}
function bool(key:string,label:string,defaultValue:boolean):GenerationParameterField{return{key,label,type:"boolean",defaultValue};}

function legacyImageRoutes(now:string):GenerationRoute[] {
  const standardSizes=["1024*1024","768*1024","1024*768","576*1024","1024*576"];
  const definitions=[
    {id:"qianwen-wan-2-5-text-to-image",operation:QIANWEN_WAN_2_5_TEXT_TO_IMAGE_OPERATION,name:"Wan 2.5 文生图片（旧版）",product:"Wan 2.5",model:"wan2.5-t2i-preview",maxLength:2000,defaultSize:"1280*1280",sizes:["1280*1280","1104*1472","1472*1104","960*1696","1696*960"]},
    {id:"qianwen-wan-2-2-plus-text-to-image",operation:QIANWEN_WAN_2_2_PLUS_TEXT_TO_IMAGE_OPERATION,name:"Wan 2.2 Plus 文生图片（旧版）",product:"Wan 2.2",model:"wan2.2-t2i-plus",maxLength:500,defaultSize:"1024*1024",sizes:standardSizes},
    {id:"qianwen-wan-2-2-flash-text-to-image",operation:QIANWEN_WAN_2_2_FLASH_TEXT_TO_IMAGE_OPERATION,name:"Wan 2.2 Flash 文生图片（旧版）",product:"Wan 2.2",model:"wan2.2-t2i-flash",maxLength:500,defaultSize:"1024*1024",sizes:standardSizes},
    {id:"qianwen-wanx-2-1-plus-text-to-image",operation:QIANWEN_WANX_2_1_PLUS_TEXT_TO_IMAGE_OPERATION,name:"WanX 2.1 Plus 文生图片（旧版）",product:"WanX 2.1",model:"wanx2.1-t2i-plus",maxLength:500,defaultSize:"1024*1024",sizes:standardSizes},
    {id:"qianwen-wanx-2-1-turbo-text-to-image",operation:QIANWEN_WANX_2_1_TURBO_TEXT_TO_IMAGE_OPERATION,name:"WanX 2.1 Turbo 文生图片（旧版）",product:"WanX 2.1",model:"wanx2.1-t2i-turbo",maxLength:500,defaultSize:"1024*1024",sizes:standardSizes},
    {id:"qianwen-wanx-2-0-turbo-text-to-image",operation:QIANWEN_WANX_2_0_TURBO_TEXT_TO_IMAGE_OPERATION,name:"WanX 2.0 Turbo 文生图片（旧版）",product:"WanX 2.0",model:"wanx2.0-t2i-turbo",maxLength:800,defaultSize:"1024*1024",sizes:standardSizes},
  ] as const;
  return definitions.map(definition => {
    const fields:GenerationParameterField[]=[select("size","图片尺寸",[...definition.sizes],definition.defaultSize),{key:"negativePrompt",label:"负向提示词",type:"text",maxLength:500},{key:"imageCount",label:"生成数量",type:"number",defaultValue:1,min:1,max:4},bool("promptExtend","提示词智能改写",true),bool("watermark","添加水印",false),{key:"seed",label:"随机种子",type:"number",min:0,max:2_147_483_647}];
    return {id:definition.id,name:definition.name,description:"保留用于兼容旧工作流的千问异步文生图模型；新任务优先选择 Wan 2.6 或 Z-Image。",tags:["Legacy","异步生成","5秒轮询"],product:definition.product,capability:"text-to-image",providerId:QIANWEN_PROVIDER_ID,providerOperation:definition.operation,enabled:false,isDefault:false,revision:1,defaults:Object.fromEntries(fields.filter(field=>field.defaultValue!==undefined).map(field=>[field.key,field.defaultValue as JsonValue])),inputSchema:{prompt:{required:true,maxLength:definition.maxLength},parameters:fields},adapterConfig:{protocol:"dashscope-media-v1",operation:definition.operation,endpointId:"legacy-image-synthesis",vendorModel:definition.model,requestProfile:"legacy-prompt-image-v1",resultProfile:"legacy-results-image-v1",assetBindings:[],pollIntervalMs:5_000,submitMode:"async-task"} as unknown as JsonValue,credentialRef:QIANWEN_CREDENTIAL_REF,createdAt:now,updatedAt:now} satisfies GenerationRoute;
  });
}

interface ExtendedVideoDefinition {
  id: string;
  operation: QianwenOperation;
  name: string;
  description: string;
  product: string;
  capability: GenerationCapability;
  model: QianwenVideoExecutionConfig["vendorModel"];
  profile: QianwenVideoExecutionConfig["requestProfile"];
  schema: GenerationInputSchema;
  bindings: QianwenAssetBinding[];
}

function extendedVideoRoutes(now: string): GenerationRoute[] {
  const image = (key:string,label:string,max=1,required=false) => slot(key,label,"image",max,20*MIB,required);
  const video = (key:string,label:string,max=1) => slot(key,label,"video",max,50*MIB);
  const audio = (key:string,label:string) => slot(key,label,"audio",1,15*MIB);
  const wanParameters = (ratio=true):GenerationParameterField[] => [
    select("resolution","分辨率",["720P","1080P"],"1080P"),
    ...(ratio?[select("aspectRatio","画面比例",["16:9","9:16","1:1","4:3","3:4"],"16:9")]:[]),
    duration(2,15,5), bool("promptExtend","提示词智能改写",true), bool("watermark","添加水印",false),
    {key:"negativePrompt",label:"负向提示词",type:"text",maxLength:500},
    {key:"seed",label:"随机种子",type:"number",min:0,max:2_147_483_647},
  ];
  const horseParameters = (ratio=true):GenerationParameterField[] => [
    select("resolution","分辨率",["480P","720P","1080P"],"1080P"),
    ...(ratio?[select("aspectRatio","画面比例",["16:9","9:16","1:1","4:3","3:4","4:5","5:4","9:21","21:9"],"16:9")]:[]),
    duration(3,15,5),bool("watermark","添加 Happy Horse 水印",true),
    {key:"seed",label:"随机种子",type:"number",min:0,max:2_147_483_647},
  ];
  const miniParameters = ():GenerationParameterField[] => [
    select("resolution","分辨率",["768P","2K"],"768P"),
    select("aspectRatio","画面比例",["adaptive","16:9","9:16","1:1","4:3","3:4","21:9"],"adaptive"),
    duration(4,15,5),bool("watermark","添加水印",false),
  ];
  const definitions: ExtendedVideoDefinition[] = [
    {id:"qianwen-wan-2-7-text-to-video",operation:QIANWEN_WAN_2_7_TEXT_TO_VIDEO_OPERATION,name:"Wan 2.7 文生视频",description:"Wan 2.7 快照版文生视频，支持 2–15 秒、1080P 与可选驱动音频。",product:"Wan 2.7",capability:"text-to-video",model:"wan2.7-t2v-2026-06-12",profile:"wan-2-7-video-v1",schema:{prompt:{required:true,maxLength:5000},parameters:wanParameters(),assets:[audio("audioUrl","驱动音频")]},bindings:[{slot:"audioUrl",mediaType:"audio_url",cardinality:"first"}]},
    {id:"qianwen-wan-2-7-image-to-video",operation:QIANWEN_WAN_2_7_IMAGE_TO_VIDEO_OPERATION,name:"Wan 2.7 图生视频",description:"Wan 2.7 快照版首帧或首尾帧视频生成，支持可选驱动音频。",product:"Wan 2.7",capability:"image-to-video",model:"wan2.7-i2v-2026-04-25",profile:"wan-2-7-video-v1",schema:{prompt:{required:false,maxLength:5000},parameters:wanParameters(false),assets:[image("firstFrameUrl","首帧图片",1,true),image("lastFrameUrl","尾帧图片"),audio("drivingAudio","驱动音频")]},bindings:[{slot:"firstFrameUrl",mediaType:"first_frame",cardinality:"first"},{slot:"lastFrameUrl",mediaType:"last_frame",cardinality:"first"},{slot:"drivingAudio",mediaType:"driving_audio",cardinality:"first"}]},
    {id:"qianwen-wan-2-7-reference-to-video",operation:QIANWEN_WAN_2_7_REFERENCE_TO_VIDEO_OPERATION,name:"Wan 2.7 参考生视频",description:"Wan 2.7 快照版参考生视频，组合最多 5 个参考图片或视频。",product:"Wan 2.7",capability:"multimodal-to-video",model:"wan2.7-r2v-2026-06-12",profile:"wan-2-7-video-v1",schema:{prompt:{required:true,maxLength:5000},parameters:wanParameters(),assets:[image("imageUrls","参考图片",5),video("videoUrls","参考视频",5)],constraints:[{kind:"at-least-one-asset",slots:["imageUrls","videoUrls"]},{kind:"max-total-assets",slots:["imageUrls","videoUrls"],maxFiles:5}]},bindings:[{slot:"imageUrls",mediaType:"reference_image",cardinality:"list"},{slot:"videoUrls",mediaType:"reference_video",cardinality:"list"}]},
    {id:"qianwen-happyhorse-1-1-text-to-video",operation:QIANWEN_HAPPYHORSE_TEXT_TO_VIDEO_OPERATION,name:"HappyHorse 1.1 文生视频",description:"HappyHorse 1.1 文生视频，支持 3–15 秒、九种画幅和最高 1080P。",product:"HappyHorse 1.1",capability:"text-to-video",model:"happyhorse-1.1-t2v",profile:"happyhorse-video-v1",schema:{prompt:{required:true,maxLength:5000},parameters:horseParameters()},bindings:[]},
    {id:"qianwen-happyhorse-1-1-image-to-video",operation:QIANWEN_HAPPYHORSE_IMAGE_TO_VIDEO_OPERATION,name:"HappyHorse 1.1 图生视频",description:"HappyHorse 1.1 首帧图生视频，输出画幅自动跟随输入图片。",product:"HappyHorse 1.1",capability:"image-to-video",model:"happyhorse-1.1-i2v",profile:"happyhorse-video-v1",schema:{prompt:{required:false,maxLength:5000},parameters:horseParameters(false),assets:[image("firstFrameUrl","首帧图片",1,true)]},bindings:[{slot:"firstFrameUrl",mediaType:"first_frame",cardinality:"first"}]},
    {id:"qianwen-happyhorse-1-1-reference-to-video",operation:QIANWEN_HAPPYHORSE_REFERENCE_TO_VIDEO_OPERATION,name:"HappyHorse 1.1 参考生视频",description:"HappyHorse 1.1 参考生视频，支持按顺序引用 1–9 张角色或场景图片。",product:"HappyHorse 1.1",capability:"multimodal-to-video",model:"happyhorse-1.1-r2v",profile:"happyhorse-video-v1",schema:{prompt:{required:true,maxLength:5000},parameters:horseParameters(),assets:[image("imageUrls","参考图片",9,true)]},bindings:[{slot:"imageUrls",mediaType:"reference_image",cardinality:"list"}]},
    {id:"qianwen-minimax-h3-text-to-video",operation:QIANWEN_MINIMAX_H3_TEXT_TO_VIDEO_OPERATION,name:"MiniMax-H3 文生视频",description:"MiniMax-H3 文生视频，支持 4–15 秒、2K 输出和自适应画幅。",product:"MiniMax-H3",capability:"text-to-video",model:"MiniMax/MiniMax-H3",profile:"minimax-h3-video-v1",schema:{prompt:{required:true,maxLength:7000},parameters:miniParameters()},bindings:[]},
    {id:"qianwen-minimax-h3-image-to-video",operation:QIANWEN_MINIMAX_H3_IMAGE_TO_VIDEO_OPERATION,name:"MiniMax-H3 图生视频",description:"MiniMax-H3 首帧或首尾帧视频生成，支持 2K 输出。",product:"MiniMax-H3",capability:"image-to-video",model:"MiniMax/MiniMax-H3",profile:"minimax-h3-video-v1",schema:{prompt:{required:true,maxLength:7000},parameters:miniParameters(),assets:[image("firstFrameUrl","首帧图片",1,true),image("lastFrameUrl","尾帧图片")]},bindings:[{slot:"firstFrameUrl",mediaType:"first_frame",cardinality:"first"},{slot:"lastFrameUrl",mediaType:"last_frame",cardinality:"first"}]},
    {id:"qianwen-minimax-h3-multimodal-to-video",operation:QIANWEN_MINIMAX_H3_MULTIMODAL_VIDEO_OPERATION,name:"MiniMax-H3 多模态生视频",description:"MiniMax-H3 多模态视频，支持参考图片、特征视频与驱动音频组合。",product:"MiniMax-H3",capability:"multimodal-to-video",model:"MiniMax/MiniMax-H3",profile:"minimax-h3-video-v1",schema:{prompt:{required:true,maxLength:7000},parameters:miniParameters(),assets:[image("imageUrls","参考图片",10),video("videoUrls","特征视频",3),audio("audioUrls","驱动音频")],constraints:[{kind:"at-least-one-asset",slots:["imageUrls","videoUrls","audioUrls"]}]},bindings:[{slot:"imageUrls",mediaType:"image_url",cardinality:"list"},{slot:"videoUrls",mediaType:"feature",cardinality:"list"},{slot:"audioUrls",mediaType:"driving_audio",cardinality:"first"}]},
  ];
  return definitions.map(definition => videoRoute(definition,now));
}

function videoRoute(definition:ExtendedVideoDefinition,now:string):GenerationRoute {
  return {id:definition.id,name:definition.name,description:definition.description,tags:["异步生成","15秒轮询",...(definition.schema.assets?.length?["支持本地素材"]:[])],product:definition.product,capability:definition.capability,providerId:QIANWEN_PROVIDER_ID,providerOperation:definition.operation,enabled:false,isDefault:false,revision:1,defaults:Object.fromEntries((definition.schema.parameters??[]).filter(field=>field.defaultValue!==undefined).map(field=>[field.key,field.defaultValue as JsonValue])),inputSchema:definition.schema,adapterConfig:{protocol:"dashscope-media-v1",operation:definition.operation,endpointId:"video-synthesis",vendorModel:definition.model,requestProfile:definition.profile,resultProfile:"video-url-v1",assetBindings:definition.bindings,pollIntervalMs:15_000,submitMode:"async-task"} as unknown as JsonValue,credentialRef:QIANWEN_CREDENTIAL_REF,createdAt:now,updatedAt:now};
}

function duration(min:number,max:number,defaultValue:number):GenerationParameterField {
  return select("durationSeconds","时长",Array.from({length:max-min+1},(_,index)=>index+min),defaultValue);
}
