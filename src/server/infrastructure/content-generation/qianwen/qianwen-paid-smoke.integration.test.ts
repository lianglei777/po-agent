import { describe, expect, it } from "vitest";
import { QianwenAdapter } from "./qianwen-adapter";
import { createQianwenRoutes } from "./qianwen-catalog";

const paidSmoke=process.env.QIANWEN_PAID_SMOKE==="1"?describe:describe.skip;

paidSmoke("Qianwen paid smoke",()=>{
  it("generates and downloads one Z-Image output",async()=>{
    const credential=process.env.DASHSCOPE_API_KEY;
    if(!credential)throw new Error("DASHSCOPE_API_KEY is required when QIANWEN_PAID_SMOKE=1");
    const route=createQianwenRoutes().find(item=>item.id==="qianwen-z-image-text-to-image")!;
    const adapter=new QianwenAdapter();
    const result=await adapter.submit({operation:route.providerOperation,executionConfig:route.adapterConfig,generation:{prompt:"A single red ceramic cup on a plain white studio background",parameters:route.defaults},assets:[],credential});
    expect(result.state).toBe("succeeded");
    expect(result.outputs).toHaveLength(1);
    const downloaded=await adapter.download(result.outputs[0].url!);
    expect(downloaded.data.byteLength).toBeGreaterThan(0);
    expect(downloaded.contentType).toMatch(/^image\//);
  },180_000);
});
