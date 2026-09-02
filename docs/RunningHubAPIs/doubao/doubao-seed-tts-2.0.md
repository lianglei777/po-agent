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
curl --location --request POST 'https://www.runninghub.cn/openapi/v2/bytedance/doubao-seed-tts-2.0' \
--header "Content-Type: application/json" \
--header "Authorization: Bearer ${RUNNINGHUB_API_KEY}" \
--data-raw '{
  "text": "时代浪潮奔涌向前，发展步伐铿锵有力。回望征程，我们在坚守中砥砺初心，在拼搏中书写担当，每一份耕耘都凝聚着汗水，每一次突破都承载着希望。从城市建设的日新月异，到乡村振兴的蓬勃生机；从科技创新的不断突破，到民生福祉的持续提升，处处都展现着昂扬向上的新气象。 立足当下，我们怀揣初心与使命，以实干笃定前行，以奋斗开创未来。各行各业的工作者坚守岗位、履职尽责，用平凡铸就伟大，用坚守诠释责任，在各自的领域里发光发热，汇聚成推动时代前行的磅礴力量。无论是攻坚克难的科研一线，还是服务群众的基层前沿；无论是追逐梦想的青年学子，还是默默奉献的平凡英雄，都在以昂扬的姿态迎接挑战，以坚定的信念追逐目标。 展望前路，机遇与挑战并存，梦想与荣光同在。我们将始终保持锐意进取的精神风貌，秉持脚踏实地的工作作风，凝心聚力、携手同行，在新时代的征程上勇毅前行，不负时代、不负韶华，用拼搏与汗水铸就新的辉煌，书写更加精彩的时代篇章，让每一份努力都有回响，每一个梦想都能绽放，向着更加美好的未来奋勇迈进！",
  "speaker": "zh_male_shaonianzixin_uranus_bigtts",
  "format": "mp3",
  "sample_rate": "24000",
  "speech_rate": 0,
  "loudness_rate": 0,
  "bit_rate": null,
  "pitch": null,
  "enable_subtitle": false,
  "max_length_to_filter_parenthesis": 100,
  "silence_duration": null,
  "disable_markdown_filter": false,
  "disable_emoji_filter": false,
  "enable_latex_tn": false,
  "explicit_dialect": null
}'
```

### 接口描述
```
name: Doubao-语音合成-2.0
desc: 基于全新升级的“豆包-语音合成-2.0”模型，针对对话式 TTS 范式进行了深度优化。接口具备极强的互动拟人感与情感演绎能力，能够精准呈现匹配语境的语气、语调与停顿。支持通过文本直接控制语速、情绪、声线等丰富指令，更针对中小学复杂公式符号的朗读进行了专项准确率提升，完美赋能 AI 交互、情感陪伴、有声小说及在线教育等场景。
tags: 豆包TTS 2.0底座 |超拟真情感演绎 |多维度富文本控制 |复杂公式高准朗读 |
```

#### 请求参数说明

| 参数说明 | 类型 | 必填/可选 | AI 应用程序生成的结果。 |
| --- | --- | --- | --- |
| `text` | String | 必填 | 待合成的文本，按字符数计费<br>文本长度限制: 1 - 10000 |
| `speaker` | String | 必填 | 音色ID，从控制台音色库获取；参考：https://www.volcengine.com/docs/6561/1257544?lang=zh#豆包语音合成模型2-0-音色列表 |
| `format` | String | 可选 | 输出音频格式，默认mp3<br>枚举值: [mp3, pcm, ogg_opus, wav] |
| `sample_rate` | String | 可选 | 采样率(Hz)，默认24000；可选：8000；16000；22050；24000；32000；44100；48000 |
| `speech_rate` | Int | 可选 | 语速，[-50,100]，100=2.0倍速，-50=0.5倍速，默认0 |
| `loudness_rate` | Int | 可选 | 音量，[-50,100]，100=2.0倍，-50=0.5倍，默认0 |
| `bit_rate` | Int | 可选 | 比特率(bps)，仅mp3生效，范围[64000,160000] |
| `pitch` | Int | 可选 | 音调，[-12,12]，默认0 |
| `enable_subtitle` | Boolean | 可选 | 是否开启字幕服务，开启后，返回字级别的时间戳，默认false |
| `max_length_to_filter_parenthesis` | Int | 可选 | 是否过滤括号内内容：0不过滤，100过滤 |
| `silence_duration` | Int | 可选 | 文本末尾增加静音时长(ms)，[0,30000]，默认0 |
| `disable_markdown_filter` | Boolean | 可选 | 是否开启Markdown解析过滤，true:开启过滤，会解析并去除 Markdown 语法。例如" **你好** "朗读为 "你好";false：关闭过滤，保留原始字符。例如 " **你好** " 朗读为 "星星你好星星" |
| `disable_emoji_filter` | Boolean | 可选 | 是否开启Emoji解析过滤，默认false |
| `enable_latex_tn` | Boolean | 可选 | 是否启用Latex文本朗读；控制 TTS 是否把输入文本里的 LaTeX 数学公式识别并转成可朗读的自然语言，再合成语音 |
| `explicit_language` | String | 可选 | 显式指定朗读语种，默认自动判断；指定后仅朗读该语种内容<br>枚举值: [[object Object], zh-cn, en, ja, es-mx, id, pt-br, pt, ko, de, fr, th, vi, ru, fil, ms, ar] |
| `explicit_dialect` | String | 可选 | 指定方言；（需speaker为支持方言的音色，中文方言只支持拼音） |

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

