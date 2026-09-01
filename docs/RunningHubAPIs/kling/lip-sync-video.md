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
curl --location --request POST 'https://www.runninghub.cn/openapi/v2/kling-lip-sync/lip-sync-video' \
--header "Content-Type: application/json" \
--header "Authorization: Bearer ${RUNNINGHUB_API_KEY}" \
--data-raw '{
  "sessionId": "865289575831703581",
  "faceId": "0",
  "audioId": "865272148167389266",
  "audioUrl": null,
  "soundStartTime": null,
  "soundEndTime": null,
  "soundInsertTime": null,
  "soundVolume": 1,
  "originalAudioVolume": 1
}'
```

### 接口描述
```
name: 可灵对口型-视频生成
decs: 可灵AI对口型视频生成模型，基于输入的人物识别结果视频与音频，实现人物口型与声音内容的帧级同步。支持真实人物、3D及2D动画角色，可处理本地音频上传或在线合成配音。采用音频对齐插帧策略，确保发音难度较高的音节也能准确还原口型状态，生成时长支持延伸至分钟级。
tags: 帧级口型同步 | 多角色类型支持 | 本地与在线音频双模式| 音频对齐插帧| 高难度音节还原| 分钟级长视频生成
```


#### 请求参数说明

| 参数说明 | 类型 | 必填/可选 | AI 应用程序生成的结果。 |
| --- | --- | --- | --- |
| `sessionId` | String | 必填 | 会话ID，由人脸识别接口返回 |
| `faceId` | String | 必填 | 人脸ID，由人脸识别接口返回 |
| `audioId` | String | 可选 | 通过语音合成接口生成的音频ID，与audioUrl二选一。仅支持30天内生成的、时长2~60秒的音频 |
| `audioUrl` | String | 可选 | 音频URL，与audioId二选一。支持.mp3/.wav/.m4a格式，文件不超过5MB，时长2~60秒<br>最多支持 1 项音频，每个 5 MB |
| `soundStartTime` | Int | 必填 | 音频裁剪起点时间（单位ms）。以原始音频开始时间为准，开始时间为0分0秒，单位ms，起点之前的音频会被裁剪，裁剪后音频不得短于2秒 |
| `soundEndTime` | Int | 必填 | 音频裁剪终点时间（单位ms）。以原始音频开始时间为准，开始时间为0分0秒，单位ms，终点之后的音频会被裁剪，裁剪后音频不得短于2秒 |
| `soundInsertTime` | Int | 必填 | 裁剪后音频插入时间（单位ms）。插入音频时间范围需与人脸可对口型时间区间至少重合2秒，插入音频的开始时间不得早于视频开始时间，插入音频的结束时间不 得晚于视频结束时间 |
| `soundVolume` | Float | 可选 | 音频音量大小，取值范围[0, 2]，默认为1<br>输入范围值: 0 - 2 |
| `originalAudioVolume` | Float | 可选 | 原始视频音量大小，取值范围[0, 2]，默认为1。原视频无声时参数无效<br>输入范围值: 0 - 2 |

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
