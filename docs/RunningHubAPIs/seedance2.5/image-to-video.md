# 欢迎使用 RunningHub API，轻松调用 RunningHub 标准模型API

## 开始使用

### 注册用户

先注册成为RunningHub网站的用户，并充值钱包。标准模型API仅支持企业级-共享API Key

### 获取您的 API Key

RunningHub 为每位用户自动生成一个独特的 32 位 API KEY

请妥善保存您的 API KEY，不要外泄，后续步骤将依赖此密钥进行操作

### 提交请求

提交 API 请求。RunningHub API 已为您处理 API Key，您只需提交请求即可

```curl
curl --location --request POST 'https://www.runninghub.cn/openapi/v2/bytedance/seedance-2.5-token/image-to-video' \
--header "Content-Type: application/json" \
--header "Authorization: Bearer ${RUNNINGHUB_API_KEY}" \
--data-raw '{
  "prompt": "以首帧为起点、尾帧为终点，生成茶园人物广告镜头。  黄昏茶园，穿浅蓝上衣的长发女性背对镜头在茶垄间缓步前行，右手自然掠过茶叶顶端，叶片被指尖带动轻晃；镜头齐腰高度稳定跟随，与她保持恒定距离，逆光把发丝和肩线勾出温暖金边，远山在浅景深里柔化。  风格：电影广告级质感，暖金逆光，低饱和，轻微胶片颗粒，写实布料与皮肤。 音频：风吹茶叶的沙沙声、远处鸟鸣，配一段极简的东方弦乐氛围，无对白。 避免：人物转身露脸后五官畸形；手指数量错误；身形或衣着中途变化；镜头抖动或忽快忽慢；文字、水印、logo。",
  "resolution": "720p",
  "duration": "5",
  "firstFrameUrl": "https://rh-images-switch-1252422369.cos.ap-guangzhou.myqcloud.com/input/openapi/seedance25-ref/706450ca9e0abeb7d15cb4dc8af257b210e2cbf019679c5f71cf6c9af3d4805c.jpg?q-sign-algorithm=sha1&q-ak=AKIDREPLACED&q-sign-time=1786011310%3B1788603370&q-key-time=1786011310%3B1788603370&q-header-list=host&q-url-param-list=&q-signature=a418e8b0e83371b4d6b9d7afa236874b0a1d21d5",
  "lastFrameUrl": "https://rh-images-switch-1252422369.cos.ap-guangzhou.myqcloud.com/input/openapi/seedance25-ref/0385f197d1952c225330c055d10f6376f579e5407eb12ad236b2e2e3e467f4b7.jpg?q-sign-algorithm=sha1&q-ak=AKIDREPLACED&q-sign-time=1786011311%3B1788603371&q-key-time=1786011311%3B1788603371&q-header-list=host&q-url-param-list=&q-signature=572b7091e8c773823924fb2582a60b4312e4df65",
  "generateAudio": true,
  "ratio": "adaptive",
  "realPersonMode": true,
  "conversionSlots": [
    "all"
  ],
  "returnLastFrame": false,
  "bitrateMode": "standard",
  "seed": -1,
  "outputFormat": "mp4"
}'
```

#### 请求参数说明

| 参数说明 | 类型 | 必填/可选 | AI 应用程序生成的结果。 |
| --- | --- | --- | --- |
| `prompt` | String | 可选 | 视频生成提示词<br>文本长度限制: 0 - 20480 |
| `resolution` | String | 必填 | 视频分辨率。480p、720p 为模型原生输出；1080p、2k、4k 为基于 720p 原生生成后进行超分放大。<br>枚举值: [480p, 720p, 1080p, 2k, 4k] |
| `duration` | String | 必填 | 视频时长（秒）。-1 为智能时长；4-30 秒可选。<br>枚举值: [-1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30] |
| `firstFrameUrl` | String | 必填 | 首帧图片<br>最多支持 1 项图片，每张 30 MB |
| `lastFrameUrl` | String | 可选 | 尾帧图片（可选，首尾帧模式）<br>最多支持 1 项图片，每张 30 MB |
| `generateAudio` | Boolean | 可选 | 是否生成视频音频 |
| `ratio` | String | 可选 | 视频宽高比<br>枚举值: [adaptive] |
| `realPersonMode` | Boolean | 可选 | 真人模式，开启后系统会自动将图片/视频/音频转为火山资产（asset://），提升生成效果。 |
| `conversionSlots` | List(String) | 可选 | 真人素材资产化槽位，多选；all 表示所有槽位都做资产化。<br>枚举值: [all, firstFrameUrl, lastFrameUrl] |
| `returnLastFrame` | Boolean | 可选 | 是否返回视频尾帧图片 |
| `bitrateMode` | String | 可选 | 画质档位。standard 标准；high 高画质（文件体积约为标准的 3-5 倍）。<br>枚举值: [standard, high] |
| `seed` | Int | 可选 | 种子整数，用于控制生成内容的随机性。<br>输入范围值: -1 - 2147483647 |
| `outputFormat` | String | 可选 | 输出视频的格式。mp4：通用格式，兼容性最好；mov：专业高色彩精度，推荐编辑/延长场景。<br>枚举值: [mp4, mov] |

#### 响应示例

```json
{
  "taskId": "2013508786110730241",
  "status": "RUNNING",
  "errorCode": "",
  "errorMessage": "",
  "results": null,
  "clientId": "f828b9af25161bc066ef152db7b29ccc",
  "promptTips": "{\"result\": true, \"error\": null, \"outputs_to_execute\": [\"4\"], \"node_errors\": {}}"
}
```

#### 响应字段说明

| 参数说明 | 类型 | AI 应用程序生成的结果。 |
| --- | --- | --- |
| `taskId` | String | 任务ID，用于后续查询任务状态 |
| `status` | String | 当前任务状态，常见状态：QUEUED (排队中), RUNNING (运行中), SUCCESS (成功), FAILED (失败) |
| `errorCode` | String | 错误码，仅在失败时返回 |
| `errorMessage` | String | 错误具体信息 |
| `results` | List | 生成结果（提交时为 null） |
| ├ `url` | String | 重要提醒：该链接有效期仅为 24 小时。任务生成结束后，请务必在此时间窗口内将视频文件下载或转存至您的服务器。逾期后链接将永久失效且无法恢复。 |
| ├ `nodeId` | String | 生成该结果的工作流节点 ID |
| ├ `outputType` | String | 文件扩展名 (如 png, mp4, txt) |
| └ `text` | String | 如果输出是纯文本，内容将显示在此字段 |
| `clientId` | String | 客户端会话ID，用于标识本次连接 |
| `promptTips` | String (JSON) | ComfyUI 后端的校验信息，包含需执行的节点ID等调试信息 |

### 查询结果与 Webhook

如果在提交时添加了 "webhookUrl": "https://example.com/webhook" 请求体参数，RunningHub 会在任务完成时向您的URL发送POST请求

#### 请求示例

```curl
curl --location --request POST 'https://www.runninghub.cn/openapi/v2/query' \
--header "Content-Type: application/json" \
--header "Authorization: Bearer ${RUNNINGHUB_API_KEY}" \
--data-raw '{
  "taskId": "${RUNNINGHUB_TASKID}"
}'
```

#### 响应示例

```json
{
  "taskId": "2013508786110730241",
  "status": "SUCCESS",
  "errorCode": "",
  "errorMessage": "",
  "failedReason": {},
  "usage": {
    "consumeMoney": null,
    "consumeCoins": null,
    "taskCostTime": "0",
    "thirdPartyConsumeMoney": null
  },
  "results": [
    {
      "url": "https://rh-images-1252422369.cos.ap-beijing.myqcloud.com/b04e28cad0ee39193921a30a2eb4dc00/output/ComfyUI_00001_plhjr_1768892915.png",
      "nodeId": "2",
      "outputType": "png",
      "text": null
    }
  ],
  "clientId": "",
  "promptTips": ""
}
```

#### 响应字段说明

| 参数说明 | 类型 | AI 应用程序生成的结果。 |
| --- | --- | --- |
| `taskId` | String | 任务 ID |
| `status` | String | 任务最终状态，SUCCESS 表示生成成功 |
| `results` | List | 生成结果列表，包含图片、视频或文本等输出 |
| ├ `url` | String | 重要提醒：该链接有效期仅为 24 小时。任务生成结束后，请务必在此时间窗口内将视频文件下载或转存至您的服务器。逾期后链接将永久失效且无法恢复。 |
| ├ `nodeId` | String | 生成该结果的工作流节点 ID |
| ├ `outputType` | String | 文件扩展名 (如 png, mp4, txt) |
| └ `text` | String | 如果输出是纯文本，内容将显示在此字段 |
| `errorCode` | String | 错误码 (如有) |
| `errorMessage` | String | 错误信息 (如有) |
| `failedReason` | Object | ComfyUI 相关的失败原因 |
| `usage` | Object | 任务消耗信息 |
| ├ `thirdPartyConsumeMoney` | String | 三方API消费金额 |
| ├ `consumeMoney` | String | 运行时长消耗金额 |
| ├ `consumeCoins` | String | 运行消耗的RH币 |
| └ `taskCostTime` | String | 运行耗时（ComfyUI 工作流运行时长） |
### 文件上传

资源文件（如 imageUrls）参数支持传入文件 URL 或 Base64 Data URI。

#### 公共 URL

直接传递可公开访问的 URL：

```json
{
  "imageUrls": [
    "https://example.com/image.png"
  ]
}
```

#### Base64 data URI

以 Base64 格式嵌入图片：

```json
{
  "images": [
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
  ]
}
```

#### RH 上传接口

上传本地文件以获取一个 URL。

**Endpoint:** `https://www.runninghub.cn/openapi/v2/media/upload/binary`

**请求**

```curl
curl --location --request POST 'https://www.runninghub.cn/openapi/v2/media/upload/binary' \
--header 'Authorization: Bearer [Your API KEY]' \
--form 'file=@/path/to/image.png'
```

**响应**

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "type": "image",
    "download_url": "xxxx.png",
    "fileName": "openapi/xxxx.png",
    "size": "3490"
  }
}
```

**备注:** 上传后获得的链接有效期为 1 天，超期将无法通过 URL 直接访问。

