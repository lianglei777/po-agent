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
curl --location --request POST 'https://www.runninghub.cn/openapi/v2/bytedance/seedance-2.5-token/multimodal-video' \
--header "Content-Type: application/json" \
--header "Authorization: Bearer ${RUNNINGHUB_API_KEY}" \
--data-raw '{
  "prompt": "一段电影感汽车品牌片，拍摄于开阔山间公路的黄金时刻。变形宽银幕画幅，纪录片式写实质感，避免 CGI 塑料感。  参考素材用法：参考图锁定主角车的车身造型、白色漆面与逆光主光；参考视频 1 设定接近速度与低机位高度；参考视频 2 设定过弯节奏；参考音频全程作为配乐。  [00:00-00:06] 大远景航拍：一条沥青公路如丝带般穿行于山脊之间，低垂的太阳在峰峦后形成眩光，一辆白色跑车从画面下方远处驶入。环境声：风声、远处引擎声。  [00:06-00:12] 轮毂高度的低机位跟拍：车辆扫过下坡弯道，轮胎咬紧路面，热浪在地面上微微升腾，镜头眩光划过画面。环境声：胎噪、引擎负荷上升。  [00:12-00:19] 车内切镜：驾驶员双手握方向盘，做旧皮革质感，快速瞥一眼后视镜；温暖的日落光线掠过仪表台。浅景深，约 50mm 镜头感。  [00:19-00:25] 车辆朝固定低机位直线加速冲来，太阳刚好压在车顶轮廓上方，中网与大灯逐渐放大直至充满画面；切黑，画面中央留出干净空间用于片尾字幕卡。  风格：电影感汽车广告，变形宽银幕眩光，温暖金色逆光对比深冷阴影，真实漆面反射与轮胎接地，轻微胶片颗粒。  运镜：航拍、低机位跟拍、车内稳定手持感、结尾锁定机位迎面冲镜。不要甩镜，不要变速 ramp。  音频：在参考配乐之上叠加引擎与风的拟音层次，无旁白。  避免：车身扭曲或重复结构；车轮倒转；车辆悬空未接地；文字、字幕、水印、品牌 Logo；闪烁或跳切。",
  "resolution": "720p",
  "duration": "25",
  "imageUrls": [
    "https://rh-images-switch-1252422369.cos.ap-guangzhou.myqcloud.com/input/openapi/seedance25-ref/82a640656c3da4a4c243ddcf236a456f3f18a3f9f6ffcb3bec3f45ae0a22e4fa.jpg?q-sign-algorithm=sha1&q-ak=AKIDREPLACED&q-sign-time=1786011294%3B1788603354&q-key-time=1786011294%3B1788603354&q-header-list=host&q-url-param-list=&q-signature=abdd256484fc57e871320b67c925238c2e71ab31"
  ],
  "videoUrls": [
    "https://rh-images-switch-1252422369.cos.ap-guangzhou.myqcloud.com/input/openapi/seedance25-ref/eb8baf4046aec345ff0f77e1eedb48c72d4a663e47fbef0d0e0a18e5d885a867.mp4?q-sign-algorithm=sha1&q-ak=AKIDREPLACED&q-sign-time=1786011312%3B1788603372&q-key-time=1786011312%3B1788603372&q-header-list=host&q-url-param-list=&q-signature=2cb04afc61f10fe074d03e6284f609dd152c0479"
  ],
  "audioUrls": [
    "https://rh-images-switch-1252422369.cos.ap-guangzhou.myqcloud.com/input/openapi/seedance25-ref/e3c88488e65b8c87a6f06120983ce2cb12ea3aeba99f8cadb7ee5d6d284ef2c6.mp3?q-sign-algorithm=sha1&q-ak=AKIDREPLACED&q-sign-time=1786011280%3B1788603340&q-key-time=1786011280%3B1788603340&q-header-list=host&q-url-param-list=&q-signature=5c51ba130eeef3357393ed586f39a1025e273eeb"
  ],
  "conversionSlots": [
    "all"
  ],
  "returnLastFrame": false,
  "realPersonMode": true,
  "ratio": "adaptive",
  "bitrateMode": "standard",
  "generateAudio": true,
  "seed": -1,
  "outputFormat": "mp4"
}'
```

#### 请求参数说明

| 参数说明 | 类型 | 必填/可选 | AI 应用程序生成的结果。 |
| --- | --- | --- | --- |
| `prompt` | String | 必填 | 视频生成提示词<br>文本长度限制: 1 - 20480 |
| `resolution` | String | 必填 | 视频分辨率。480p、720p 为模型原生输出；1080p、2k、4k 为基于 720p 原生生成后进行超分放大。<br>枚举值: [480p, 720p, 1080p, 2k, 4k] |
| `duration` | String | 必填 | 视频时长（秒）。-1 为智能时长；4-30 秒可选。<br>枚举值: [-1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30] |
| `imageUrls` | List(String) | 可选 | 参考图片（0-30 张）<br>最多支持 30 项图片，每张 50 MB |
| `videoUrls` | List(String) | 可选 | 参考视频（0-10 个，用于多模态参考/视频编辑/续写）。单个视频时长 [2, 30] s，所有视频总时长不超过 30s。<br>最多支持 10 项视频，每个 50 MB |
| `audioUrls` | List(String) | 可选 | 参考音频（0-10 段，可与 prompt 单独组合，无需图片/视频）。单个音频时长 [2, 30] s，所有音频总时长不超过 30s。<br>最多支持 10 项音频，每个 50 MB |
| `conversionSlots` | List(String) | 可选 | 真人素材资产化槽位，多选；all 表示所有槽位都做资产化。<br>枚举值: [all, image1, image2, image3, image4, image5, image6, image7, image8, image9, image10, image11, image12, image13, image14, image15, image16, image17, image18, image19, image20, image21, image22, image23, image24, image25, image26, image27, image28, image29, image30, video1, video2, video3, video4, video5, video6, video7, video8, video9, video10] |
| `returnLastFrame` | Boolean | 可选 | 是否返回视频尾帧图片 |
| `realPersonMode` | Boolean | 可选 | 真人模式，开启后系统会自动将图片/视频/音频转为火山资产（asset://），提升生成效果。 |
| `ratio` | String | 可选 | 视频宽高比<br>枚举值: [adaptive, 16:9, 4:3, 1:1, 3:4, 9:16, 21:9] |
| `bitrateMode` | String | 可选 | 画质档位。standard 标准；high 高画质（文件体积约为标准的 3-5 倍）。<br>枚举值: [standard, high] |
| `generateAudio` | Boolean | 可选 | 是否生成视频音频 |
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

