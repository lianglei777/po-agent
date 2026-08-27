> ## Documentation Index
> Fetch the complete documentation index at: https://platform.qianwenai.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# MiniMax-H3 视频生成

> MiniMax-H3 视频生成模型。支持文生视频、图生视频（首帧/尾帧/首尾帧）和多模态参考生视频。

## OpenAPI

````yaml post /services/aigc/video-generation/video-synthesis
openapi: 3.1.0
info:
  title: MiniMax-H3 视频生成 API
  description: MiniMax-H3 是视频生成模型，支持文生视频、图生视频（首帧/尾帧/首尾帧）和多模态参考生视频等多种用法。提交异步任务后，通过 `GET /tasks/{task_id}` 轮询获取结果。
  version: 1.0.0
servers:
  - url: https://dashscope.aliyuncs.com/api/v1
    description: 千问AI平台
security:
  - BearerAuth: []
paths:
  /services/aigc/video-generation/video-synthesis:
    post:
      operationId: createMiniMaxH3VideoTask
      summary: MiniMax-H3 视频生成
      description: 提交视频生成任务，返回 `task_id` 用于轮询查询。支持文生视频、首帧/尾帧/首尾帧生视频、多模态参考生视频等用法。
      parameters:
        - name: X-DashScope-Async
          in: header
          required: true
          description: 必须设置为 `enable`，表示异步提交任务。缺少此请求头将报错："current user api does not support synchronous calls"。
          schema:
            type: string
            enum:
              - enable
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/MiniMaxH3VideoRequest"
      responses:
        "200":
          description: 任务提交成功
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/AsyncTaskSubmitResponse"
        "400":
          description: 请求参数无效
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/DashScopeErrorResponse"
      x-codeSamples:
        - lang: curl
          label: 文生视频
          source: |-
            curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis' \
                -H 'X-DashScope-Async: enable' \
                -H "Authorization: Bearer $DASHSCOPE_API_KEY" \
                -H 'Content-Type: application/json' \
                -d '{
                "model": "MiniMax/MiniMax-H3",
                "input": {
                    "prompt": "Epic space opera trailer: a female captain stands alone before a giant observation window, the last fleet assembles and jumps away, bright flashes, bridge shakes, she is left behind."
                },
                "parameters": {
                    "resolution": "768P",
                    "ratio": "16:9",
                    "duration": 5,
                    "watermark": true
                }
            }'
        - lang: curl
          label: 首帧生视频
          source: |-
            curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis' \
                -H 'X-DashScope-Async: enable' \
                -H "Authorization: Bearer $DASHSCOPE_API_KEY" \
                -H 'Content-Type: application/json' \
                -d '{
                "model": "MiniMax/MiniMax-H3",
                "input": {
                    "prompt": "Animate the character, hair swaying gently in the breeze",
                    "media": [
                        {
                            "type": "first_frame",
                            "url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20260121/zlpocv/wan-i2v-haigui.webp"
                        }
                    ]
                },
                "parameters": {
                    "resolution": "768P",
                    "duration": 5,
                    "watermark": true
                }
            }'
        - lang: curl
          label: 尾帧生视频
          source: |-
            curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis' \
                -H 'X-DashScope-Async: enable' \
                -H "Authorization: Bearer $DASHSCOPE_API_KEY" \
                -H 'Content-Type: application/json' \
                -d '{
                "model": "MiniMax/MiniMax-H3",
                "input": {
                    "prompt": "Camera slowly pushes in, gradually focusing on the scene in the image",
                    "media": [
                        {
                            "type": "last_frame",
                            "url": "https://wanx.alicdn.com/material/20250318/last_frame.png"
                        }
                    ]
                },
                "parameters": {
                    "resolution": "768P",
                    "duration": 5,
                    "watermark": true
                }
            }'
        - lang: curl
          label: 首尾帧生视频
          source: |-
            curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis' \
                -H 'X-DashScope-Async: enable' \
                -H "Authorization: Bearer $DASHSCOPE_API_KEY" \
                -H 'Content-Type: application/json' \
                -d '{
                "model": "MiniMax/MiniMax-H3",
                "input": {
                    "prompt": "Realistic style, a black kitten curiously looking up at the sky, camera pans from eye level to overhead, ending with a top-down view of its curious eyes.",
                    "media": [
                        {
                            "type": "first_frame",
                            "url": "https://wanx.alicdn.com/material/20250318/first_frame.png"
                        },
                        {
                            "type": "last_frame",
                            "url": "https://wanx.alicdn.com/material/20250318/last_frame.png"
                        }
                    ]
                },
                "parameters": {
                    "resolution": "768P",
                    "duration": 5,
                    "watermark": true
                }
            }'
        - lang: curl
          label: 多模态参考生视频
          source: |-
            curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis' \
                -H 'X-DashScope-Async: enable' \
                -H "Authorization: Bearer $DASHSCOPE_API_KEY" \
                -H 'Content-Type: application/json' \
                -d '{
                "model": "MiniMax/MiniMax-H3",
                "input": {
                    "prompt": "The character from the reference slowly turns their head, smiles and waves, with soft ambient lighting",
                    "media": [
                        {
                            "type": "image_url",
                            "url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20260320/knsple/wan-r2v-role-frame.jpg"
                        },
                        {
                            "type": "feature",
                            "url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20260129/qigswt/wan-r2v-role2.mp4"
                        }
                    ]
                },
                "parameters": {
                    "resolution": "768P",
                    "ratio": "16:9",
                    "duration": 5,
                    "watermark": true
                }
            }'
components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      description: 千问AI平台 API Key。详见[获取与配置 API Key](/api-reference/preparation/api-key)。
  schemas:
    MiniMaxH3VideoRequest:
      type: object
      required:
        - model
        - input
      properties:
        model:
          type: string
          description: 模型名称。固定值：`MiniMax/MiniMax-H3`。
          enum:
            - MiniMax/MiniMax-H3
          example: MiniMax/MiniMax-H3
        input:
          type: object
          required:
            - prompt
          description: 输入信息。
          properties:
            prompt:
              type: string
              description: 文本提示词，用来描述期望生成的视频内容。支持中英文，不超过 7000 个字符，超过部分会自动截断。
              maxLength: 7000
              example: "Epic space opera trailer: a female captain stands alone before a giant observation window, the last fleet assembles and jumps away, bright flashes, bridge shakes, she is left behind."
            media:
              type: array
              description: 媒体素材数组，可选。支持传入首帧、尾帧、参考图像、特征视频、驱动音频等。
              items:
                $ref: "#/components/schemas/MiniMaxH3MediaItem"
        parameters:
          $ref: "#/components/schemas/MiniMaxH3VideoParameters"
    MiniMaxH3MediaItem:
      type: object
      required:
        - type
        - url
      properties:
        type:
          type: string
          description: 媒体素材类型。
          enum:
            - first_frame
            - last_frame
            - image_url
            - feature
            - driving_audio
        url:
          type: string
          description: 媒体素材的 URL 地址。支持公网可访问的 HTTP/HTTPS URL。
    MiniMaxH3VideoParameters:
      type: object
      required:
        - resolution
        - duration
      description: 视频生成参数。
      properties:
        resolution:
          type: string
          description: 生成视频的分辨率档位。
          enum:
            - 768P
            - 2K
        ratio:
          type: string
          description: 生成视频的宽高比。默认为 `adaptive`，根据输入自动推荐合适的比例。
          enum:
            - adaptive
            - 16:9
            - 9:16
            - 1:1
            - 4:3
            - 3:4
            - 21:9
          default: adaptive
        duration:
          type: integer
          description: 生成视频的时长，单位为秒。取值范围为 [4, 15] 的整数。
          minimum: 4
          maximum: 15
        watermark:
          type: boolean
          description: 是否添加水印标识。
          default: false
    AsyncTaskSubmitResponse:
      type: object
      description: 异步任务提交响应。
      properties:
        request_id:
          type: string
          description: 请求唯一标识，用于链路追踪和问题排查。
          example: 4909100c-7b5a-9f92-bfe5-xxxxxx
        output:
          type: object
          properties:
            task_id:
              type: string
              description: 任务 ID，查询有效期 24 小时。配合 `GET /tasks/{task_id}` 使用。
              example: 0385dc79-5ff8-4d82-bcb6-xxxxxx
            task_status:
              type: string
              description: 初始任务状态，通常为 `PENDING`。
              enum:
                - PENDING
                - RUNNING
                - SUCCEEDED
                - FAILED
                - CANCELED
                - UNKNOWN
    MiniMaxH3VideoTaskStatusResponse:
      type: object
      description: MiniMax-H3 视频生成任务状态响应。
      properties:
        request_id:
          type: string
          description: 请求唯一标识。可用于请求明细溯源和问题排查。
          example: bde5ed1a-86de-9fac-xxxx-xxxxxxxxxxxx
        output:
          type: object
          properties:
            task_id:
              type: string
              description: 任务 ID。
              example: ca7eaceb-2b00-4f29-xxxx-xxxxxxxxxxxx
            task_status:
              type: string
              description: 任务状态。流转：`PENDING`（排队中）-> `RUNNING`（处理中）-> `SUCCEEDED`（成功）/ `FAILED`（失败）。手动取消为 `CANCELED`，过期为 `UNKNOWN`。
              enum:
                - PENDING
                - RUNNING
                - SUCCEEDED
                - FAILED
                - CANCELED
                - UNKNOWN
            submit_time:
              type: string
              description: 任务提交时间。格式为 YYYY-MM-DD HH:mm:ss.SSS。
              example: 2026-08-20 13:54:07.204
            scheduled_time:
              type: string
              description: 任务执行时间。格式为 YYYY-MM-DD HH:mm:ss.SSS。
              example: 2026-08-20 13:54:07.249
            end_time:
              type: string
              description: 任务完成时间。格式为 YYYY-MM-DD HH:mm:ss.SSS。仅在 `SUCCEEDED` 或 `FAILED` 时返回。
              example: 2026-08-20 13:55:58.633
            video_url:
              type: string
              format: uri
              description: 生成视频的 URL 地址。仅在 `task_status` 为 `SUCCEEDED` 时返回。视频 URL 仅保留 24 小时，请及时保存。
              example: https://xxx.oss-cn-shanghai.aliyuncs.com/xxx/output.mp4?Expires=xxx&Signature=xxx
            orig_prompt:
              type: string
              description: 原始输入的提示词。
            code:
              type: string
              description: 错误码。仅在 `task_status` 为 `FAILED` 时返回。
            message:
              type: string
              description: 错误信息。仅在 `task_status` 为 `FAILED` 时返回。
        usage:
          type: object
          description: 输出信息统计。只对成功的结果计数。
          properties:
            duration:
              type: integer
              description: 生成视频的时长，单位为秒。
            size:
              type: string
              description: 生成视频的分辨率尺寸。示例值：1344*768。
            SR:
              type: string
              description: 生成视频的分辨率档位。示例值：768。
            video_count:
              type: integer
              description: 生成视频的数量。固定为 1。
            image_count:
              type: integer
              description: 输入图片数量。
            input_seconds:
              type: integer
              description: 输入时长，单位为秒。
            output_seconds:
              type: integer
              description: 输出视频时长，单位为秒。
            total_seconds:
              type: integer
              description: 总计时长，单位为秒。
    DashScopeErrorResponse:
      type: object
      description: API 错误响应。
      properties:
        request_id:
          type: string
          description: 请求唯一标识，用于链路追踪和问题排查。
        code:
          type: string
          description: 错误码。
          example: InvalidApiKey
        message:
          type: string
          description: 错误描述信息。
          example: No API-key provided.
````


> ## Documentation Index
> Fetch the complete documentation index at: https://platform.qianwenai.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# MiniMax-H3 查询任务结果

> 查询 MiniMax-H3 视频生成任务的状态和结果。

## OpenAPI

````yaml get /tasks/{task_id}
openapi: 3.1.0
info:
  title: MiniMax-H3 视频生成 API
  description: MiniMax-H3 是视频生成模型，支持文生视频、图生视频（首帧/尾帧/首尾帧）和多模态参考生视频等多种用法。提交异步任务后，通过 `GET /tasks/{task_id}` 轮询获取结果。
  version: 1.0.0
servers:
  - url: https://dashscope.aliyuncs.com/api/v1
    description: 千问AI平台
security:
  - BearerAuth: []
paths:
  /tasks/{task_id}:
    get:
      operationId: getMiniMaxH3VideoResult
      summary: 查询结果
      description: 轮询任务状态，任务成功后获取视频 URL。建议轮询间隔为 15 秒。task_id 有效期为 24 小时。
      parameters:
        - name: task_id
          in: path
          required: true
          description: 提交任务时返回的任务 ID。
          schema:
            type: string
      responses:
        "200":
          description: 任务状态查询成功
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/MiniMaxH3VideoTaskStatusResponse"
              examples:
                SUCCEEDED:
                  summary: 任务执行成功
                  value:
                    request_id: bde5ed1a-86de-9fac-xxxx-xxxxxxxxxxxx
                    output:
                      task_id: ca7eaceb-2b00-4f29-xxxx-xxxxxxxxxxxx
                      task_status: SUCCEEDED
                      submit_time: 2026-08-20 13:54:07.204
                      scheduled_time: 2026-08-20 13:54:07.249
                      end_time: 2026-08-20 13:55:58.633
                      video_url: https://xxx.oss-cn-shanghai.aliyuncs.com/xxx/output.mp4?Expires=xxx&Signature=xxx
                    usage:
                      SR: "768"
                      duration: 5
                      image_count: 0
                      input_seconds: 0
                      output_seconds: 5
                      size: 1344*768
                      total_seconds: 5
                      video_count: 1
                FAILED:
                  summary: 任务执行失败
                  value:
                    request_id: e5d70b02-ebd3-98ce-9fe8-759d7d7b107d
                    output:
                      task_id: 86ecf553-d340-4e21-af6e-a0c6a421c010
                      task_status: FAILED
                      code: InvalidParameter
                      message: The parameter is invalid xxxxxx
                UNKNOWN:
                  summary: 任务查询过期
                  value:
                    request_id: a4de7c32-7057-9f82-8581-xxxxxx
                    output:
                      task_id: 502a00b1-19d9-4839-a82f-xxxxxx
                      task_status: UNKNOWN
        "400":
          description: 请求参数无效
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/DashScopeErrorResponse"
      x-codeSamples:
        - lang: curl
          label: 查询任务结果
          source: |-
            curl -X GET 'https://dashscope.aliyuncs.com/api/v1/tasks/{task_id}' \
                -H "Authorization: Bearer $DASHSCOPE_API_KEY"
components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      description: 千问AI平台 API Key。详见[获取与配置 API Key](/api-reference/preparation/api-key)。
  schemas:
    MiniMaxH3VideoRequest:
      type: object
      required:
        - model
        - input
      properties:
        model:
          type: string
          description: 模型名称。固定值：`MiniMax/MiniMax-H3`。
          enum:
            - MiniMax/MiniMax-H3
          example: MiniMax/MiniMax-H3
        input:
          type: object
          required:
            - prompt
          description: 输入信息。
          properties:
            prompt:
              type: string
              description: 文本提示词，用来描述期望生成的视频内容。支持中英文，不超过 7000 个字符，超过部分会自动截断。
              maxLength: 7000
              example: "Epic space opera trailer: a female captain stands alone before a giant observation window, the last fleet assembles and jumps away, bright flashes, bridge shakes, she is left behind."
            media:
              type: array
              description: 媒体素材数组，可选。支持传入首帧、尾帧、参考图像、特征视频、驱动音频等。
              items:
                $ref: "#/components/schemas/MiniMaxH3MediaItem"
        parameters:
          $ref: "#/components/schemas/MiniMaxH3VideoParameters"
    MiniMaxH3MediaItem:
      type: object
      required:
        - type
        - url
      properties:
        type:
          type: string
          description: 媒体素材类型。
          enum:
            - first_frame
            - last_frame
            - image_url
            - feature
            - driving_audio
        url:
          type: string
          description: 媒体素材的 URL 地址。支持公网可访问的 HTTP/HTTPS URL。
    MiniMaxH3VideoParameters:
      type: object
      required:
        - resolution
        - duration
      description: 视频生成参数。
      properties:
        resolution:
          type: string
          description: 生成视频的分辨率档位。
          enum:
            - 768P
            - 2K
        ratio:
          type: string
          description: 生成视频的宽高比。默认为 `adaptive`，根据输入自动推荐合适的比例。
          enum:
            - adaptive
            - 16:9
            - 9:16
            - 1:1
            - 4:3
            - 3:4
            - 21:9
          default: adaptive
        duration:
          type: integer
          description: 生成视频的时长，单位为秒。取值范围为 [4, 15] 的整数。
          minimum: 4
          maximum: 15
        watermark:
          type: boolean
          description: 是否添加水印标识。
          default: false
    AsyncTaskSubmitResponse:
      type: object
      description: 异步任务提交响应。
      properties:
        request_id:
          type: string
          description: 请求唯一标识，用于链路追踪和问题排查。
          example: 4909100c-7b5a-9f92-bfe5-xxxxxx
        output:
          type: object
          properties:
            task_id:
              type: string
              description: 任务 ID，查询有效期 24 小时。配合 `GET /tasks/{task_id}` 使用。
              example: 0385dc79-5ff8-4d82-bcb6-xxxxxx
            task_status:
              type: string
              description: 初始任务状态，通常为 `PENDING`。
              enum:
                - PENDING
                - RUNNING
                - SUCCEEDED
                - FAILED
                - CANCELED
                - UNKNOWN
    MiniMaxH3VideoTaskStatusResponse:
      type: object
      description: MiniMax-H3 视频生成任务状态响应。
      properties:
        request_id:
          type: string
          description: 请求唯一标识。可用于请求明细溯源和问题排查。
          example: bde5ed1a-86de-9fac-xxxx-xxxxxxxxxxxx
        output:
          type: object
          properties:
            task_id:
              type: string
              description: 任务 ID。
              example: ca7eaceb-2b00-4f29-xxxx-xxxxxxxxxxxx
            task_status:
              type: string
              description: 任务状态。流转：`PENDING`（排队中）-> `RUNNING`（处理中）-> `SUCCEEDED`（成功）/ `FAILED`（失败）。手动取消为 `CANCELED`，过期为 `UNKNOWN`。
              enum:
                - PENDING
                - RUNNING
                - SUCCEEDED
                - FAILED
                - CANCELED
                - UNKNOWN
            submit_time:
              type: string
              description: 任务提交时间。格式为 YYYY-MM-DD HH:mm:ss.SSS。
              example: 2026-08-20 13:54:07.204
            scheduled_time:
              type: string
              description: 任务执行时间。格式为 YYYY-MM-DD HH:mm:ss.SSS。
              example: 2026-08-20 13:54:07.249
            end_time:
              type: string
              description: 任务完成时间。格式为 YYYY-MM-DD HH:mm:ss.SSS。仅在 `SUCCEEDED` 或 `FAILED` 时返回。
              example: 2026-08-20 13:55:58.633
            video_url:
              type: string
              format: uri
              description: 生成视频的 URL 地址。仅在 `task_status` 为 `SUCCEEDED` 时返回。视频 URL 仅保留 24 小时，请及时保存。
              example: https://xxx.oss-cn-shanghai.aliyuncs.com/xxx/output.mp4?Expires=xxx&Signature=xxx
            orig_prompt:
              type: string
              description: 原始输入的提示词。
            code:
              type: string
              description: 错误码。仅在 `task_status` 为 `FAILED` 时返回。
            message:
              type: string
              description: 错误信息。仅在 `task_status` 为 `FAILED` 时返回。
        usage:
          type: object
          description: 输出信息统计。只对成功的结果计数。
          properties:
            duration:
              type: integer
              description: 生成视频的时长，单位为秒。
            size:
              type: string
              description: 生成视频的分辨率尺寸。示例值：1344*768。
            SR:
              type: string
              description: 生成视频的分辨率档位。示例值：768。
            video_count:
              type: integer
              description: 生成视频的数量。固定为 1。
            image_count:
              type: integer
              description: 输入图片数量。
            input_seconds:
              type: integer
              description: 输入时长，单位为秒。
            output_seconds:
              type: integer
              description: 输出视频时长，单位为秒。
            total_seconds:
              type: integer
              description: 总计时长，单位为秒。
    DashScopeErrorResponse:
      type: object
      description: API 错误响应。
      properties:
        request_id:
          type: string
          description: 请求唯一标识，用于链路追踪和问题排查。
        code:
          type: string
          description: 错误码。
          example: InvalidApiKey
        message:
          type: string
          description: 错误描述信息。
          example: No API-key provided.
````
