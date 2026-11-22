> ## Documentation Index
> Fetch the complete documentation index at: https://platform.minimax.io/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# List Tasks

> List tasks from the last 7 days with pagination. Supports filtering by status, task ID, model, and task type.



## OpenAPI

````yaml api-reference/video/generation/api/v2-video-generation.json GET /v2/query/video_generation
openapi: 3.1.0
info:
  title: MiniMax API
  description: MiniMax video generation V2 (Hailuo-03) API
  license:
    name: MIT
  version: 2.0.0
servers:
  - url: https://api.minimax.io
security:
  - bearerAuth: []
paths:
  /v2/query/video_generation:
    get:
      tags:
        - Video V2
      summary: List tasks
      description: >-
        List tasks from the last 7 days with pagination. Supports filtering by
        status, task ID, model, and task type.
      operationId: videoGenerationV2List
      parameters:
        - name: page_num
          in: query
          required: false
          description: Page number, starting from 1.
          schema:
            type: integer
            example: 1
          example: 1
        - name: page_size
          in: query
          required: false
          description: Number of items per page.
          schema:
            type: integer
            example: 20
          example: 20
        - name: filter.status
          in: query
          required: false
          description: >-
            Filter by task status. Available values: `queued`, `running`,
            `succeeded`, `failed`, `cancelled`.
          schema:
            type: string
            enum:
              - queued
              - running
              - succeeded
              - failed
              - cancelled
        - name: filter.task_ids
          in: query
          required: false
          description: Filter by task ID; multiple values are allowed.
          schema:
            type: array
            items:
              type: string
        - name: filter.model
          in: query
          required: false
          description: Filter by model name, e.g. `MiniMax-H3`.
          schema:
            type: string
        - name: filter.task_type
          in: query
          required: false
          description: >-
            Filter by task type. Available values: `generation` (video
            generation), `h3_context_ir` (H3-Context-IR), `regeneration` (video
            regeneration).
          schema:
            type: string
            enum:
              - generation
              - h3_context_ir
              - regeneration
      responses:
        '200':
          description: ''
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ListVideoGenerationV2Resp'
        '400':
          $ref: '#/components/responses/Err400'
        '401':
          $ref: '#/components/responses/Err401'
        '429':
          $ref: '#/components/responses/Err429'
        '500':
          $ref: '#/components/responses/Err500'
      x-codeSamples:
        - lang: cURL
          source: |-
            curl --request GET \
              --url 'https://api.minimax.io/v2/query/video_generation?page_num=1&page_size=4' \
              --header 'Authorization: Bearer <token>'
components:
  schemas:
    ListVideoGenerationV2Resp:
      type: object
      properties:
        items:
          type: array
          description: Task list.
          items:
            $ref: '#/components/schemas/VideoTask'
        total:
          type: integer
          description: >-
            Total number of tasks matching the filter (counting only tasks from
            the last 7 days).
      example:
        items:
          - id: '424635601932571'
            model: MiniMax-H3
            status: succeeded
            created_at: 1785225940
            updated_at: 1785226100
            content:
              url: >-
                https://video-product.cdn.minimax.io/inference_output/rollout/2026-07-28/5fe7ec4a-6f51-4d69-880e-220e59535d98/output.mp4
            resolution: 2K
            duration: 5
            usage:
              total_seconds: 5
              input_seconds: 0
              output_seconds: 5
              input_image_count: 1
              input_audio_seconds: 6
              total_tokens: 273890
              prompt_tokens: 13500
              completion_tokens: 260390
            ratio: adaptive
            task_type: generation
          - id: '424635601932588'
            model: MiniMax-H3
            status: running
            created_at: 1785225940
            updated_at: 1785226100
            resolution: 2K
            duration: 10
            usage: {}
            ratio: '9:16'
            task_type: generation
          - id: '424635601932587'
            model: MiniMax-H3
            status: queued
            created_at: 1785225940
            updated_at: 1785226100
            resolution: 2K
            duration: 8
            usage: {}
            ratio: '9:16'
            task_type: generation
          - id: '424635601932586'
            model: MiniMax-H3
            status: failed
            created_at: 1785225940
            updated_at: 1785226100
            error:
              code: '1026'
              message: video description contains sensitive content
            resolution: 2K
            duration: 12
            usage: {}
            ratio: '9:16'
            task_type: generation
        total: 476
    VideoTask:
      type: object
      description: Task object returned by the shared H3 task query and list endpoints.
      properties:
        id:
          type: string
          description: Task ID.
        model:
          type: string
          description: Model name used by the task, e.g. `MiniMax-H3`.
        status:
          type: string
          description: |-
            Task status:
            - `queued`: waiting in queue
            - `running`: in progress
            - `succeeded`: succeeded
            - `failed`: failed
            - `cancelled`: cancelled
          enum:
            - queued
            - running
            - succeeded
            - failed
            - cancelled
        error:
          $ref: '#/components/schemas/VideoTaskError'
          description: >-
            Error information. Not returned when the task succeeds; returns
            `code` and `message` when the task fails.
        created_at:
          type: integer
          description: Unix timestamp (seconds) when the task was created.
        updated_at:
          type: integer
          description: Unix timestamp (seconds) when the task status was last updated.
        content:
          $ref: '#/components/schemas/VideoTaskContent'
          description: Task output content, returned after the task succeeds.
        resolution:
          type: string
          description: Resolution of the task output.
        duration:
          type: integer
          description: Duration of the task output (seconds).
        usage:
          $ref: '#/components/schemas/VideoTaskUsage'
          description: >-
            Usage of this request. Video tasks return fields measured in
            seconds; H3-Context-IR tasks return Token-usage fields. Returned
            only when the task has succeeded.
        ratio:
          type: string
          description: >-
            Aspect ratio of the task output. This can be an empty string when it
            does not apply to the task type.
        task_type:
          type: string
          description: |-
            Task type:
            - `generation`: video generation
            - `h3_context_ir`: H3-Context-IR (`/v2/h3_context_ir`)
            - `regeneration`: video regeneration (`/v2/video_regeneration`)
          enum:
            - generation
            - h3_context_ir
            - regeneration
        modality:
          type: string
          description: >-
            Output modality. Video generation and video regeneration tasks
            return `video`; H3-Context-IR tasks return `text`.
          enum:
            - video
            - text
    OaiError:
      type: object
      description: >-
        OpenAI-style error response. On error the HTTP status is the real error
        code (401/400/429/402/422/500…) and the body is this object.
      properties:
        type:
          type: string
          description: Always `error`.
          example: error
        error:
          $ref: '#/components/schemas/OaiErrorDetail'
        request_id:
          type: string
          description: Request trace ID (for troubleshooting).
    VideoTaskError:
      type: object
      properties:
        code:
          type: string
          description: Error code.
        message:
          type: string
          description: Error message.
    VideoTaskContent:
      type: object
      properties:
        url:
          type: string
          description: >-
            Time-limited download URL of a video task output. Download or store
            it promptly; query again to obtain a new URL after it expires.
        prompt:
          type: string
          description: >-
            Structured, enhanced video prompt generated by an H3-Context-IR
            task. Returned only when `task_type=h3_context_ir` and the task
            succeeds.
    VideoTaskUsage:
      type: object
      description: >-
        Usage of this request. Video tasks return fields measured in seconds;
        H3-Context-IR tasks return Token-usage fields. Returned only when the
        task has succeeded.
      properties:
        total_seconds:
          type: integer
          description: Total metered seconds = input seconds + output seconds.
        input_seconds:
          type: integer
          description: >-
            Input reference-video seconds (counted when a reference video is
            present).
        output_seconds:
          type: integer
          description: Output video seconds.
        input_image_count:
          type: integer
          description: >-
            Total number of input images (first_frame + last_frame +
            reference_image combined).
        input_audio_seconds:
          type: integer
          description: >-
            Input reference-audio seconds (sum of segments, rounded); not
            returned when there is no reference audio.
        total_tokens:
          type: integer
          description: |-
            Total tokens = prompt_tokens + completion_tokens.
            - Video tasks: converted from usage;
            - H3-Context-IR tasks: total tokens used by the task.
        prompt_tokens:
          type: integer
          description: >-
            Input tokens.

            - Video tasks = input reference-video seconds + all input images +
            input reference-audio seconds, 0 when none;

            - H3-Context-IR tasks: input tokens of the task.
        completion_tokens:
          type: integer
          description: |-
            Output tokens.
            - Video tasks = output video seconds converted;
            - H3-Context-IR tasks: output tokens of the task.
    OaiErrorDetail:
      type: object
      properties:
        type:
          type: string
          description: >-
            Error type:
            `authorized_error`(401)/`bad_request_error`(400)/`rate_limit_error`(429)/`insufficient_balance_error`(402)/`unprocessable_entity_error`(422)/`overloaded_error`(529)/`server_error`(500),
            etc.
        message:
          type: string
          description: >-
            Error detail; the trailing parenthesis holds the internal error code
            (e.g. `... (1004)`).
        http_code:
          type: string
          description: HTTP status code as a string, e.g. `401`.
  responses:
    Err400:
      description: Invalid parameters
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/OaiError'
          example:
            type: error
            error:
              type: bad_request_error
              message: >-
                invalid params, content must include a non-empty text item
                (prompt is required) (2013)
              http_code: '400'
            request_id: 021785229015510a2c883cf675b9804d
    Err401:
      description: Authentication failed
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/OaiError'
          example:
            type: error
            error:
              type: authorized_error
              message: >-
                login fail: Please carry the API secret key in the
                'Authorization' field of the request header (1004)
              http_code: '401'
            request_id: 021785229015510a2c883cf675b9804d
    Err429:
      description: Rate limit triggered
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/OaiError'
          example:
            type: error
            error:
              type: rate_limit_error
              message: rate limit, please retry later (1002)
              http_code: '429'
            request_id: 021785229015510a2c883cf675b9804d
    Err500:
      description: Server error
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/OaiError'
          example:
            type: error
            error:
              type: server_error
              message: internal error (1000)
              http_code: '500'
            request_id: 021785229015510a2c883cf675b9804d
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
      description: >-
        `HTTP: Bearer Auth`

        - Security Scheme Type: http

        - HTTP Authorization Scheme: `Bearer API_key`, used to verify account
        information, can be found in [Account Management>API
        Keys](https://platform.minimax.io/user-center/basic-information/interface-key).

````