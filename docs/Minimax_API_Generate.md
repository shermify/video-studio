> ## Documentation Index
> Fetch the complete documentation index at: https://platform.minimax.io/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# Create Video Generation Task

> Video generation V2 endpoint. Provide multimodal input via the content array (text / image / video / audio); switch between MiniMax H3, MiniMax H3 Highspeed, MiniMax H3 Lite, and MiniMax H3 Max with the `model` field to support text-to-video, image-to-video (first & last frame), and reference-to-video, with output up to 2K.<br /><br />Note: To use MiniMax H3, MiniMax H3 Highspeed, MiniMax H3 Lite, or MiniMax H3 Max, please select the [Pay-as-you-go API](https://platform.minimax.io/docs/pricing/overview#models/video).



## OpenAPI

````yaml api-reference/video/generation/api/v2-video-generation.json POST /v2/video_generation
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
  /v2/video_generation:
    post:
      tags:
        - Video V2
      summary: Create video generation task
      description: >-
        Create a video generation task. The model generates a video from the
        multimodal input you provide (text / image / video / audio). This is an
        asynchronous endpoint: on success it returns a `task_id`, and you should
        poll the [Query Task](/api-reference/video-generation-v2-query) endpoint
        for the task status and retrieve the generated video once it succeeds.


        Currently supported models: `MiniMax-H3`, `MiniMax-H3-Highspeed`,
        `MiniMax-H3-Lite`, `MiniMax-H3-Max`.


        Use the optional `generate_audio` parameter to control whether the video
        includes audio: `true` (default) outputs a video with audio; `false`
        outputs a silent video.
      operationId: videoGenerationV2Create
      parameters:
        - name: Content-Type
          in: header
          required: true
          description: Media type of the request body. Set it to `application/json`.
          schema:
            type: string
            enum:
              - application/json
            default: application/json
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/VideoGenerationV2Req'
            examples:
              Text-to-video (t2va):
                value:
                  model: MiniMax-H3
                  content:
                    - type: text
                      text: >-
                        Epic space-opera theatrical teaser: a female captain
                        stands alone before a massive observation window as the
                        last fleet gathers and jumps away in a blinding flash,
                        the bridge shaking, leaving her behind.
                  resolution: 2K
                  duration: 5
                  ratio: '16:9'
              Image-to-video (i2va):
                value:
                  model: MiniMax-H3
                  content:
                    - type: text
                      text: >-
                        Pull focus to the people in the background and add more
                        steam to the ramen bowl.
                    - type: image_url
                      image_url:
                        url: >-
                          https://cdn.hailuoai.com/prod/hailuo_demo/testsets/H3_AA_I2VA/gallery/sr_v17_variants_seed42_43_20260724/inputs/4a3a90bf9100_KDmcbkhzYo5sjjxr9FqcVmWVnzb.png
                      role: first_frame
                  resolution: 2K
                  duration: 5
                  ratio: adaptive
              Reference-to-video (r2va):
                value:
                  model: MiniMax-H3
                  content:
                    - type: text
                      text: >-
                        Character speaks: Follow the wind, live free. Leave
                        worries behind, enjoy the moment. Voice timbre follows
                        reference audio 1.
                    - type: video_url
                      video_url:
                        url: >-
                          https://cdn.hailuoai.com/prod/hailuo_demo/testsets/h3_promo_eval_ref2va/gallery/sr_v2p26_trio_seed42_20260724/inputs/297573323635_00_%E8%A7%86%E9%A2%911_YnyRbxEwio_video_20260525_163755_1927e9d3.mp4
                      role: reference_video
                    - type: audio_url
                      audio_url:
                        url: >-
                          https://cdn.hailuoai.com/prod/hailuo_demo/testsets/h3_promo_eval_ref2va/gallery/sr_v2p26_trio_seed42_20260724/inputs/f463d523c5ce_01_%E9%9F%B3%E9%A2%911_RSLcbpzJPo_6%E6%9C%885%E6%97%A5(1).mp3
                      role: reference_audio
                  resolution: 2K
                  duration: 5
                  ratio: adaptive
              Silent video (generate_audio=false):
                summary: Generate a silent video
                value:
                  model: MiniMax-H3
                  content:
                    - type: text
                      text: A small paper boat drifts across a calm pond.
                  resolution: 768P
                  duration: 6
                  ratio: '4:3'
                  generate_audio: false
        required: true
      responses:
        '200':
          description: >-
            The create endpoint returns a `task_id`. Use this `task_id` with the
            [Query Task](/api-reference/video-generation-v2-query) endpoint to
            retrieve the task status and result.


            **Successful Query Task response example**


            ```json

            {
              "task": {
                "id": "424010985738629",
                "model": "MiniMax-H3",
                "status": "succeeded",
                "created_at": 1785125529,
                "updated_at": 1785125946,
                "content": {
                  "url": "https://your-cdn.example.com/h3-generated-2k-output.mp4"
                },
                "resolution": "2K",
                "duration": 5,
                "usage": {
                  "total_seconds": 5,
                  "input_seconds": 0,
                  "output_seconds": 5,
                  "input_image_count": 0
                },
                "ratio": "16:9",
                "task_type": "generation",
                "modality": "video"
              }
            }

            ```
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/VideoGenerationV2Resp'
        '400':
          $ref: '#/components/responses/Err400'
        '401':
          $ref: '#/components/responses/Err401'
        '402':
          $ref: '#/components/responses/Err402'
        '422':
          $ref: '#/components/responses/Err422'
        '429':
          $ref: '#/components/responses/Err429'
        '500':
          $ref: '#/components/responses/Err500'
components:
  schemas:
    VideoGenerationV2Req:
      type: object
      required:
        - model
        - content
        - resolution
        - duration
      properties:
        model:
          type: string
          description: >-
            Model name. Currently available: `MiniMax-H3`,
            `MiniMax-H3-Highspeed`, `MiniMax-H3-Lite`, `MiniMax-H3-Max`.


            - **`MiniMax-H3`**: **the variant for high-quality video creation.**
            Supports text-to-video, image-to-video (first / last frame), and
            reference-to-video; `768P` / `2K` resolution, 4–15s duration.

            - **`MiniMax-H3-Highspeed`**: **balances generation quality and
            speed.** Supports text-to-video, image-to-video (first / last
            frame), and reference-to-video (reference image / video / audio);
            `480P` / `768P` resolution, **`2K` is not supported**; 4–15s
            duration.

            - **`MiniMax-H3-Lite`**: **the lightweight variant.** Supports
            text-to-video, image-to-video (first / last frame), and
            reference-to-video (reference image / video / audio); `480P` /
            `768P` resolution, **`2K` is not supported**; 4–15s duration.

            - **`MiniMax-H3-Max`**: **the fast generation variant.** Supports
            text-to-video, image-to-video (first / last frame), and
            reference-to-video (reference image / video / audio); `480P` /
            `768P` resolution, **`2K` is not supported**; 5–15s duration.
          enum:
            - MiniMax-H3
            - MiniMax-H3-Highspeed
            - MiniMax-H3-Lite
            - MiniMax-H3-Max
        content:
          type: array
          description: >-
            Array of multimodal input describing the information used to
            generate the video. Each element is distinguished by `type` (`text`
            / `image_url` / `video_url` / `audio_url`) and can be labeled with a
            `role`.


            **Every request must include one non-empty `text` item (the prompt
            is required)**; otherwise a parameter error is returned.


            Supported input combinations (corresponding to different generation
            scenarios):

            - **Text-to-video**: a single `text` element only.

            - **Image-to-video, first frame**: `text` + 1 `image_url`
            (`role=first_frame`, or omitted).

            - **Image-to-video, last frame**: `text` + 1 `image_url`
            (`role=last_frame`).

            - **Image-to-video, first & last frame**: `text` + 2 `image_url`
            items with `role` set to `first_frame` and `last_frame`
            respectively.

            - **Reference-to-video**: `text` + any combination of reference
            images (`role=reference_image`), reference videos
            (`role=reference_video`), and reference audio
            (`role=reference_audio`).


            > **Image-to-video and reference-to-video are mutually exclusive**:
            if any `reference_image` / `reference_video` / `reference_audio`
            role appears in content, then `first_frame` / `last_frame` must not
            appear (and vice versa); the two cannot be mixed.


            ---


            **Input media limits** (total request body ≤ 64 MB; use public URLs
            for large files, avoid Base64)


            Image `image_url`:


            | Item | Limit |

            | :--- | :--- |

            | Format | JPG, JPEG, PNG, WEBP, HEIC, HEIF |

            | Single file size | ≤ 30 MB |

            | Width/height range | [256, 5760] px |

            | Aspect ratio (w/h) | [0.4, 2.5] |

            | Count | first frame ≤ 1, last frame ≤ 1, reference images ≤ 9 |


            Video `video_url` (reference scenario only):


            | Item | Limit |

            | :--- | :--- |

            | Container / format | MP4 (`.mp4`), MOV (`.mov`) |

            | Codec | Video H.264/AVC, H.265/HEVC; audio AAC, MP3 |

            | Single file size | ≤ 50 MB |

            | Count | ≤ 3 |

            | Per-clip duration | [2, 15] s; total ≤ 15 s |

            | Width/height range | [256, 5760] px |

            | Aspect ratio (w/h) | [0.4, 2.5] |

            | Frame rate | [23.976, 60] |


            Audio `audio_url` (reference scenario only):


            | Item | Limit |

            | :--- | :--- |

            | Format | WAV, MP3 |

            | Single file size | ≤ 15 MB |

            | Count | ≤ 3 |

            | Per-clip duration | [2, 15] s; total ≤ 15 s |
          items:
            $ref: '#/components/schemas/ContentItem'
        resolution:
          type: string
          description: |-
            Video resolution. Availability differs by model:

            - **`MiniMax-H3`**: `768P`, `2K`
            - **`MiniMax-H3-Highspeed`**: `480P`, `768P` (`2K` is not supported)
            - **`MiniMax-H3-Lite`**: `480P`, `768P` (`2K` is not supported)
            - **`MiniMax-H3-Max`**: `480P`, `768P` (`2K` is not supported)
          enum:
            - 480P
            - 768P
            - 2K
        duration:
          type: integer
          description: >-
            Duration of the generated video in seconds. Required, integer.
            Available values differ by model:


            - **`MiniMax-H3`**: `4`–`15`

            - **`MiniMax-H3-Highspeed`**: `4`–`15`

            - **`MiniMax-H3-Lite`**: `4`–`15`

            - **`MiniMax-H3-Max`**: `5`–`15` (4 seconds is not supported)
          enum:
            - 4
            - 5
            - 6
            - 7
            - 8
            - 9
            - 10
            - 11
            - 12
            - 13
            - 14
            - 15
        ratio:
          type: string
          description: >-
            Aspect ratio of the generated video. Defaults to `adaptive` (the
            most suitable ratio is chosen automatically based on the input; the
            actual ratio can be read from the `ratio` field of the query
            endpoint). Available values: `adaptive`, `21:9`, `16:9`, `4:3`,
            `1:1`, `3:4`, `9:16`.


            **Text-to-video (t2va, content contains only `text`)**: `ratio` is
            required and cannot be `adaptive`; available values `21:9`, `16:9`,
            `4:3`, `1:1`, `3:4`, `9:16`.


            **Image-to-video (i2va, content contains a `first_frame` /
            `last_frame` image)**: the aspect ratio is determined by the input
            image and `ratio` is always `adaptive`; passing another valid value
            does not error but is ignored and treated as `adaptive`.


            **Reference-to-video (r2va, content contains `reference_image` /
            `reference_video` / `reference_audio`)**: `ratio` is optional and
            defaults to `adaptive`; you may also explicitly specify any of the
            concrete ratios above. `MiniMax-H3-Lite` does not support `adaptive`
            yet; specify a concrete ratio.
          enum:
            - adaptive
            - '21:9'
            - '16:9'
            - '4:3'
            - '1:1'
            - '3:4'
            - '9:16'
        extra:
          type: object
          description: >-
            Additional generation options for `MiniMax-H3-Max`. Currently only
            `prompt_expansion_mode` is supported. If `extra` or this property is
            omitted, `balanced` is used. Do not pass `balance`, an empty string,
            a Boolean value, or other undeclared fields.
          properties:
            prompt_expansion_mode:
              type: string
              description: >-
                Prompt expansion mode. `disabled` disables prompt expansion;
                `balanced` uses balanced expansion and is the default; `quality`
                prioritizes expansion quality.
              enum:
                - disabled
                - balanced
                - quality
              default: balanced
          additionalProperties: false
        generate_audio:
          type: boolean
          description: >-
            Controls whether the generated video includes audio. Optional;
            defaults to `true`.


            - `true`: output a video with audio.

            - `false`: output a silent video.
          default: true
        callback_url:
          type: string
          description: >-
            Callback URL for task status changes. Once configured, the MiniMax
            server first sends a verification request containing a `challenge`
            field (you must return the `challenge` unchanged within 3 seconds to
            complete verification); after verification succeeds, it POSTs an
            update to this URL whenever the task status changes. The push body
            has the same structure as the response of the [Query
            Task](/api-reference/video-generation-v2-query) endpoint.


            Callback `status` values: `queued`, `running`, `succeeded`,
            `failed`, `cancelled`.
        response_format:
          type: string
          enum:
            - task
            - flat
          default: task
          description: >-
            Response format.


            - `task` (default): returns `{"task": {...}}`, with task fields
            nested under the `task` object.

            - `flat`: task fields are flattened at the top level of the response
            (including `usage`), matching the shape of `items[]` in the task
            list response.
      example:
        model: MiniMax-H3
        content:
          - type: text
            text: A boy playing basketball by the sea
        resolution: 2K
        duration: 5
        ratio: '16:9'
    VideoGenerationV2Resp:
      type: object
      properties:
        task_id:
          type: string
          description: ID of the task, used to query the task status and result later.
      example:
        task_id: '424010985738629'
    ContentItem:
      type: object
      required:
        - type
      properties:
        type:
          type: string
          description: Type of the input content.
          enum:
            - text
            - image_url
            - video_url
            - audio_url
        text:
          type: string
          description: >-
            Text prompt, **required**: every scenario must include one non-empty
            `text` describing the desired video. Length is counted by
            characters, with a maximum of 7000 characters per `text`.
        image_url:
          type: object
          description: >-
            Image object when `type=image_url` (see the content description
            above for format / size / dimension / count limits).
          required:
            - url
          properties:
            url:
              type: string
              description: >-
                Image location. Supported: a public URL; `mm_file://{file_id}`
                (reference an existing platform file, e.g. an uploaded file or a
                previous output's file_id); a
                `data:image/<format>;base64,<Base64>` data URI (`<format>`
                lowercase).
        video_url:
          type: object
          description: >-
            Video object when `type=video_url` (reference video, reference
            scenario only; see the content description above for format / size /
            duration limits).
          required:
            - url
          properties:
            url:
              type: string
              description: >-
                Video location. Supported: a public URL; `mm_file://{file_id}`
                (reference an existing platform file's file_id); a
                `data:video/mp4;base64,<Base64>` data URI. Note the total
                request body must be ≤ 64 MB and Base64 inflates size by about
                33%, so use a public URL or mm_file:// for large videos.
        audio_url:
          type: object
          description: >-
            Audio object when `type=audio_url` (reference audio, reference
            scenario only; see the content description above for format / size /
            duration limits).
          required:
            - url
          properties:
            url:
              type: string
              description: >-
                Audio location. Supported: a public URL; `mm_file://{file_id}`
                (reference an existing platform file's file_id); a
                `data:audio/<format>;base64,<Base64>` data URI (`<format>`
                lowercase).
        role:
          type: string
          description: >-
            Position or purpose of the content, conditionally required:

            - `first_frame`: first-frame image (image-to-video; when there is a
            single image and no role is set, it defaults to first_frame).

            - `last_frame`: last-frame image (image-to-video first & last frame,
            must be paired with first_frame).

            - `reference_image`: reference image (reference-to-video).

            - `reference_video`: reference video (reference-to-video).

            - `reference_audio`: reference audio (reference-to-video).
          enum:
            - first_frame
            - last_frame
            - reference_image
            - reference_video
            - reference_audio
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
    Err402:
      description: Insufficient balance/quota
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/OaiError'
          example:
            type: error
            error:
              type: insufficient_balance_error
              message: insufficient balance (1008)
              http_code: '402'
            request_id: 021785229015510a2c883cf675b9804d
    Err422:
      description: Input contains sensitive content
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/OaiError'
          example:
            type: error
            error:
              type: unprocessable_entity_error
              message: video description contains sensitive content (1026)
              http_code: '422'
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