> ## Documentation Index
> Fetch the complete documentation index at: https://platform.minimax.io/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# Query Task

> Query the status and result of a single video generation, H3-Context-IR, or video regeneration task from the last 7 days by task_id.



## OpenAPI

````yaml api-reference/video/generation/api/v2-video-generation.json GET /v2/query/video_generation/{task_id}
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
  /v2/query/video_generation/{task_id}:
    get:
      tags:
        - Video V2
      summary: Query Task
      description: >-
        Query the status and result of a single video generation, H3-Context-IR,
        or video regeneration task. Once the task succeeds (`status=succeeded`),
        retrieve video output from `content.url` or an enhanced prompt from
        `content.prompt`.


        > Only tasks from the last 7 days can be queried (window `[T-7d, T)`,
        where `T` is the request time as a UTC timestamp in seconds); a
        `task_id` outside this window returns `invalid task_id`. Video output
        URLs are time-limited, so download or store them promptly.
      operationId: videoGenerationV2Query
      parameters:
        - name: task_id
          in: path
          required: true
          description: >-
            ID of the task to query (the `task_id` returned when the task was
            created).
          schema:
            type: string
      responses:
        '200':
          description: ''
          content:
            application/json:
              schema:
                description: >-
                  The response shape is determined by `response_format` set at
                  task creation: `task` returns `{"task": {...}}`
                  (GetVideoGenerationV2Resp), while `flat` returns the task
                  object flattened (VideoGenerationTaskV2).
                oneOf:
                  - $ref: '#/components/schemas/GetVideoGenerationV2Resp'
                  - $ref: '#/components/schemas/VideoTask'
              examples:
                Video generation succeeded:
                  value:
                    task:
                      id: '424010985738629'
                      model: MiniMax-H3
                      status: succeeded
                      created_at: 1785125529
                      updated_at: 1785125946
                      content:
                        url: >-
                          https://cdn.hailuoai.com/prod/hailuo_demo/testsets/h3_promo_eval_ref2va/gallery/sr_v2p26_trio_seed42_20260724/inputs/89f8c0bbee5b_denoise_ids_0_final.mp4
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
                      ratio: '16:9'
                      task_type: generation
                      modality: video
                H3-Context-IR succeeded:
                  value:
                    task:
                      id: '426586401755526'
                      model: MiniMax-H3
                      status: succeeded
                      created_at: 1785702855
                      updated_at: 1785702884
                      content:
                        prompt: >-
                          integrated_multimodal_description: [Shot 1] Cinematic,
                          wide shot with a slow push in on a female captain
                          standing center frame with her back to the camera. She
                          has a slender build and short, swept-back silver hair,
                          wearing a crisp, dark navy-blue futuristic military
                          uniform adorned with rigid silver epaulets. Before her
                          stretches a colossal, curved glass observation window
                          dominating the dimly lit starship bridge. The interior
                          features sleek metallic consoles on the left and right
                          emitting soft cyan light. Outside the window, a
                          massive fleet of dark-grey, heavily armored
                          dreadnoughts and cruisers is assembling against a
                          backdrop of a swirling deep-purple and magenta nebula.
                          The rear thrusters of the distant ships glow intensely
                          with fiery orange light. [Shot 2] At 00:02.800, the
                          camera cuts to a medium close-up of the captain from
                          Shot 1 in profile facing right, while the camera
                          shakes strongly. Her facial features are now visible,
                          revealing a woman in her late forties with sharp
                          cheekbones and a stoic expression. A sudden, blinding
                          flash of brilliant cyan and white light bursts through
                          the window as the fleet outside simultaneously jumps
                          into warp, casting harsh, overexposed illumination
                          across her face. The bridge vibrates violently,
                          causing her shoulders to tense and her uniform collar
                          to tremble. The intense light instantly fades into
                          deep shadow, leaving her completely alone against the
                          newly emptied, pitch-black void of space.

                          overall_soundscape: Deep, resonant low-frequency
                          thrumming of ship engines, overlaid with rhythmic,
                          high-pitched electronic beeps from the consoles,
                          followed by a sudden, deafening sub-bass boom and a
                          loud, sizzling crackle as the warp drives engage. The
                          immense acoustic impact causes a heavy, metallic
                          clattering of the bridge panels, which instantly drops
                          off into a stark, quiet mechanical hum.

                          non_diegetic_music: Symphonic orchestral score,
                          beginning with a slow, rising brass and string
                          crescendo that abruptly cuts off, instantly
                          transitioning into a single, sustained, low-register
                          solo cello note with no dynamic swell.
                      duration: 5
                      usage:
                        total_tokens: 9090
                        prompt_tokens: 5664
                        completion_tokens: 3426
                      ratio: '16:9'
                      task_type: h3_context_ir
                      modality: text
                Video regeneration succeeded:
                  value:
                    task:
                      id: '424010985738631'
                      model: MiniMax-H3
                      status: succeeded
                      created_at: 1785126000
                      updated_at: 1785126300
                      content:
                        url: >-
                          https://your-cdn.example.com/h3-regenerated-2k-output.mp4
                      resolution: 2K
                      duration: 5
                      usage:
                        total_seconds: 5
                        input_seconds: 0
                        output_seconds: 5
                        input_image_count: 0
                        total_tokens: 97645
                        prompt_tokens: 0
                        completion_tokens: 97645
                      ratio: ''
                      task_type: regeneration
                      modality: video
                Failure:
                  value:
                    task:
                      id: '424010985738630'
                      model: MiniMax-H3
                      status: failed
                      error:
                        code: '1026'
                        message: video description contains sensitive content
                      created_at: 1785125529
                      updated_at: 1785125700
                      resolution: 2K
                      duration: 5
                      usage: {}
                      ratio: '16:9'
                      task_type: generation
                      modality: video
                Video generated successfully (flat response format):
                  summary: 'flat: task fields flattened at the top level'
                  value:
                    id: '424010985738629'
                    model: MiniMax-H3
                    status: succeeded
                    created_at: 1785125529
                    updated_at: 1785125946
                    content:
                      url: >-
                        https://cdn.hailuoai.com/prod/hailuo_demo/testsets/h3_promo_eval_ref2va/gallery/sr_v2p26_trio_seed42_20260724/inputs/89f8c0bbee5b_denoise_ids_0_final.mp4
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
                    ratio: '16:9'
                    task_type: generation
                    modality: video
        '400':
          $ref: '#/components/responses/Err400'
        '401':
          $ref: '#/components/responses/Err401'
        '429':
          $ref: '#/components/responses/Err429'
        '500':
          $ref: '#/components/responses/Err500'
components:
  schemas:
    GetVideoGenerationV2Resp:
      type: object
      properties:
        task:
          $ref: '#/components/schemas/VideoTask'
      example:
        task:
          id: '424010985738629'
          model: MiniMax-H3
          status: succeeded
          created_at: 1785125529
          updated_at: 1785125946
          content:
            url: >-
              https://video-product.cdn.minimax.io/inference_output/rollout/2026-07-27/6c68f487-4b33-48cb-8c92-1631f63f6682/output.mp4
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
          ratio: '16:9'
          task_type: generation
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