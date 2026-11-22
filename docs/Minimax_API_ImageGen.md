> ## Documentation Index
> Fetch the complete documentation index at: https://platform.minimax.io/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# Text-to-Image

> Generate images from a text description with MiniMax-H3-Image. Supports `auto` or custom width and height, and up to 10 images per request.

Supported models: `MiniMax-H3-Image`, `MiniMax-H3-Image-Highspeed`; both take the same parameters and limits.

> [!WARNING]
>
> The server waits up to 600 seconds; set the client timeout to at least 600 seconds. This endpoint is not idempotent: once a request is sent, the server finishes generation and charges for successful images even if the client times out or disconnects, and a retry generates and charges again. With the OpenAI SDK, set `max_retries=0` to turn off its default automatic retries.


## OpenAPI

````yaml api-reference/image/generation/api/h3-image-generations.json POST /v1/images/generations
openapi: 3.1.0
info:
  title: MiniMax H3-Image Generations API
  description: MiniMax H3-Image API
  license:
    name: MIT
  version: 1.0.0
servers:
  - url: https://api.minimax.io
security:
  - bearerAuth: []
paths:
  /v1/images/generations:
    post:
      tags:
        - Image
      summary: Text-to-Image
      description: >-
        Generate images from a text description. Synchronous, with optional
        streaming.


        Supported models: `MiniMax-H3-Image`, `MiniMax-H3-Image-Highspeed`; both
        take the same parameters and limits.


        The server waits up to 600 seconds; set the client timeout to at least
        600 seconds. This endpoint is not idempotent: once a request is sent,
        the server finishes generation and charges for successful images even if
        the client times out or disconnects, and a retry generates and charges
        again.
      operationId: h3ImageGenerations
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/H3ImageGenerationReq'
      responses:
        '200':
          description: >-
            Returns `application/json` when `stream` is `false` (default). When
            `stream` is `true`, returns `text/event-stream` (SSE); the `data` of
            each event is JSON, defined under the `text/event-stream` response.
            See [Streaming Events](/api-reference/image-generation-h3-streaming)
            for event details and a full example.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ImagesResponse'
            text/event-stream:
              schema:
                $ref: '#/components/schemas/ImageStreamEvent'
              examples:
                Single image succeeded:
                  summary: Single image succeeded
                  value:
                    type: image_generation.partial_succeeded
                    created: 1792308690
                    model: MiniMax-H3-Image
                    image_index: 1
                    url: https://example.com/h3-image/output-1.jpg
                    size: 2720x1536
                    output_format: jpeg
                    revised_prompt: >-
                      An orange cat curled up asleep on a sunlit windowsill, a
                      blurred city street outside the window, warm tones, film
                      texture
                Single image failed:
                  summary: Single image failed
                  value:
                    type: image_generation.partial_failed
                    created: 1792308691
                    model: MiniMax-H3-Image
                    image_index: 2
                    code: '1027'
                    message: output image failed content safety check
                All done:
                  summary: All done
                  value:
                    type: image_generation.completed
                    created: 1792308695
                    model: MiniMax-H3-Image
                    usage:
                      generated_images: 2
                      total_tokens: 13022
                      input_tokens: 4862
                      output_tokens: 8160
                      input_tokens_details:
                        text_tokens: 4862
                        image_tokens: 0
                      output_tokens_details:
                        image_tokens: 8160
                    request_id: 021792308678142a2c883cf675b9804d
                Request failed:
                  summary: Request failed
                  value:
                    type: error
                    error:
                      type: server_error
                      message: internal error (1000)
                      http_code: '500'
                    usage:
                      generated_images: 0
                      total_tokens: 0
                      input_tokens: 0
                      output_tokens: 0
                      input_tokens_details:
                        text_tokens: 0
                        image_tokens: 0
                      output_tokens_details:
                        image_tokens: 0
                    request_id: 021792308678142a2c883cf675b9804d
        '400':
          $ref: '#/components/responses/Err400'
        '401':
          $ref: '#/components/responses/Err401'
        '402':
          $ref: '#/components/responses/Err402'
          description: >-
            Insufficient balance or plan quota. The error code is in the
            parentheses at the end of `error.message`:


            - `1008`: insufficient balance

            - `2053`: insufficient credit

            - `2067`: usage limit reached and credit auto consumption is off

            - `2068`: the current plan tier does not support this model
        '422':
          $ref: '#/components/responses/Err422'
        '429':
          $ref: '#/components/responses/Err429'
          description: >-
            Rate limited. The error code is in the parentheses at the end of
            `error.message`:


            - `1002`: the images-per-minute (IPM) limit is exceeded; each
            request counts as `n` images

            - `2056`: the M Plan usage limit is reached
        '500':
          $ref: '#/components/responses/Err500'
components:
  schemas:
    H3ImageGenerationReq:
      type: object
      required:
        - model
        - prompt
      properties:
        model:
          type: string
          description: >-
            Model name. Supported values: `MiniMax-H3-Image`,
            `MiniMax-H3-Image-Highspeed`; both take the same parameters and
            limits
          enum:
            - MiniMax-H3-Image
            - MiniMax-H3-Image-Highspeed
        prompt:
          type: string
          maxLength: 32000
          description: >-
            Text description of the image, up to 32000 characters (counted as
            Unicode characters, excluding leading and trailing whitespace); an
            empty or whitespace-only prompt returns 400. With prompt enhancement
            disabled (`disable_prompt_enhanced` is `true`), the model reads only
            about the first 4096 tokens; the rest has no effect.
        disable_prompt_enhanced:
          type: boolean
          default: false
          description: >-
            Whether to disable prompt enhancement, default `false` (enhancement
            on); see `data[].revised_prompt` for the enhanced prompt.


            When `true`, the original `prompt` is used and the request must
            specify the aspect ratio in one of two ways:


            - `size` is `WIDTHxHEIGHT`

            - `size` is omitted or `auto`, and `aspect_ratio` is `X:Y` (`area`
            is optional, default `4K`)


            If `size` is not `WIDTHxHEIGHT` and `aspect_ratio` is omitted or
            `auto`, 400 is returned.
        'n':
          type: integer
          default: 1
          minimum: 1
          maximum: 10
          description: Number of images, range [1, 10], default 1.
        size:
          type: string
          default: auto
          description: >-
            Output image size, default `auto`; see [Output
            Size](/guides/image-generation#output-size). Use one of two forms:


            - `WIDTHxHEIGHT`: set the width and height directly, e.g.
            `2720x1536`; both are positive integers. The area (width × height)
            must be between 655,360 and 20,000,000 pixels and the aspect ratio
            between 1:3 and 3:1, bounds inclusive; otherwise 400 is returned,
            and the size is never scaled or rounded. In this form, do not set
            `aspect_ratio` or `area` (not even to `auto`); otherwise 400 is
            returned

            - `auto` or omitted: width and height are determined by
            `aspect_ratio` (default `auto`) and `area` (default `4K`); either
            can be set on its own
        aspect_ratio:
          type: string
          default: auto
          example: '16:9'
          description: >-
            Output aspect ratio, default `auto`.


            - Cannot be set when `size` is `WIDTHxHEIGHT` (not even as `auto`);
            otherwise 400 is returned

            - Must be `X:Y` when `size` is omitted or `auto` and
            `disable_prompt_enhanced` is `true`; omitting it or passing `auto`
            returns 400


            Values:


            - `auto`: decided by prompt enhancement based on the content

            - `X:Y`: X and Y are integers from 1 to 300 and the ratio is between
            1:3 and 3:1 (bounds inclusive), e.g. `16:9`, `3:4`, `21:9`, `3:1`
        area:
          type: string
          enum:
            - 1K
            - 2K
            - 4K
          default: 4K
          description: >-
            Output area level, default `4K`. Can only be set when `size` is
            omitted or `auto`; setting it while `size` is `WIDTHxHEIGHT` returns
            400.


            `1K`, `2K` and `4K` target areas of 1024 × 1024, 2048 × 2048 and
            4096 × 4096 pixels. The server calculates width and height from the
            aspect ratio; for example, `2K` with `16:9` outputs 2720 × 1536. See
            `data[].size` for each image's actual width and height.
        output_format:
          type: string
          enum:
            - png
            - jpeg
            - jpg
            - webp
          default: jpeg
          description: >-
            Output image format, default `jpeg`. Available values: `png`,
            `jpeg`, `jpg`, `webp`. `jpg` is equivalent to `jpeg`;
            `output_format` in the response is returned as `jpeg`.
        response_format:
          type: string
          enum:
            - url
            - b64_json
          default: url
          description: >-
            Return format, default `url`.


            - `url`: image URL. Download the image and store it yourself; the
            URL is not guaranteed to remain available

            - `b64_json`: Base64-encoded image data, not supported with
            streaming


            Total output area (`n` × width × height) limits for `b64_json`;
            exceeding returns 400 (with `size` = `auto`, each image counts as
            its `area` level, e.g. 4096 × 4096 for `4K`):


            | `output_format` | Total area limit | Example |

            | :--- | :--- | :--- |

            | `png` | 20,000,000 px | 1 image of any size |

            | `jpeg` / `webp` | 80,000,000 px | Up to 4 images at `4K`, or 10 at
            `2K` |
        stream:
          type: boolean
          default: false
          description: >-
            Whether to stream results, default `false`. When enabled, the
            response is `text/event-stream` (SSE), and only `response_format` =
            `url` is supported:


            - One event is pushed as each image finishes:
            `image_generation.partial_succeeded` on success,
            `image_generation.partial_failed` on failure. Events are pushed in
            completion order; use `image_index` to match images

            - `image_generation.completed` is pushed after all images finish,
            with `usage` and `request_id`

            - After the response headers are sent, an `error` event is pushed if
            all images fail or the request fails before generation is submitted

            - Errors before the response headers are sent (invalid parameters,
            authentication, rate limiting, insufficient balance, etc.) are
            returned as regular HTTP errors, the same as non-streaming calls;
            check the HTTP status code before parsing SSE


            See [Streaming Events](/api-reference/image-generation-h3-streaming)
            for event structures.
        output_compression:
          type: integer
          minimum: 0
          maximum: 100
          default: 95
          description: >-
            Compression quality, range [0, 100], default 95; higher values give
            better quality and larger files. Only applies to `jpeg` / `webp` and
            is ignored for `png`; values outside the range return 400.
      example:
        model: MiniMax-H3-Image
        prompt: >-
          An orange cat lying on a windowsill basking in the sun, warm afternoon
          light, film texture
        size: 2720x1536
        'n': 2
        response_format: url
    ImagesResponse:
      type: object
      properties:
        created:
          type: integer
          description: Time the response was generated, as a Unix timestamp in seconds.
        data:
          type: array
          description: >-
            Images, always `n` items in image order (matching `image_index` in
            streaming events). Successful items contain `url` (or `b64_json`),
            `size` and `revised_prompt`; failed items, including those withheld
            by the content safety check, contain only `error`.


            If at least one image succeeds, the HTTP status is 200, so check
            `data[].error` for every item; if all images fail, a 402, 422 or 500
            error response is returned. Only successful images are charged.
          items:
            $ref: '#/components/schemas/ImageObject'
        output_format:
          type: string
          enum:
            - png
            - jpeg
            - webp
          description: Format of the generated images.
        usage:
          $ref: '#/components/schemas/ImageUsage'
        request_id:
          type: string
          description: Request ID (the trace ID). Provide it when reporting an issue.
      example:
        created: 1792308678
        data:
          - url: https://example.com/h3-image/output-0.jpg
            size: 2720x1536
            revised_prompt: >-
              Warm afternoon light streams through a wooden window frame onto
              the sill, where an orange cat lies on its side basking in the sun,
              eyes half-closed, its fur rimmed with golden light, blurred indoor
              plants in the background, film grain, soft warm tones
          - error:
              code: '1027'
              message: output image failed content safety check
        output_format: jpeg
        usage:
          generated_images: 1
          total_tokens: 7254
          input_tokens: 3174
          output_tokens: 4080
          input_tokens_details:
            text_tokens: 3174
            image_tokens: 0
          output_tokens_details:
            image_tokens: 4080
        request_id: 021792308678142a2c883cf675b9804d
    ImageStreamEvent:
      description: >-
        JSON in the `data` field of each SSE event: one of the four events
        below, distinguished by `type`. Each event consists of an `event:` line
        and a `data:` line, and events are separated by a blank line. While
        waiting, a comment line `: keepalive` is sent every 15 seconds and can
        be ignored.
      oneOf:
        - $ref: '#/components/schemas/ImageStreamPartialSucceeded'
        - $ref: '#/components/schemas/ImageStreamPartialFailed'
        - $ref: '#/components/schemas/ImageStreamCompleted'
        - $ref: '#/components/schemas/ImageStreamError'
    ImageObject:
      type: object
      properties:
        url:
          type: string
          description: Image URL, returned when `response_format` is `url`.
        b64_json:
          type: string
          description: >-
            Base64-encoded image data. Returned when `response_format` is
            `b64_json`.
        size:
          type: string
          description: Actual image size, formatted as `WIDTHxHEIGHT`.
        revised_prompt:
          type: string
          description: >-
            The prompt actually used to generate this image: the enhanced prompt
            when prompt enhancement is on; the same as `prompt` in the request
            when `disable_prompt_enhanced` is `true`.
        error:
          type: object
          description: Error for this image, returned only when it fails.
          properties:
            code:
              type: string
              description: >-
                Error code for this image. Common values: `1000` generation
                failed, `1001` timed out, `1008` insufficient balance, `1026`
                enhanced prompt failed the content safety check, `1027`
                generated image failed the content safety check. See [Error
                Codes](/api-reference/errorcode) for the full list.
            message:
              type: string
              description: Error detail.
    ImageUsage:
      type: object
      description: >-
        Token usage of this request, counting successful images only; billing is
        based on it. `total_tokens` is the sum of `input_tokens` and
        `output_tokens`.
      properties:
        generated_images:
          type: integer
          description: Number of images generated successfully; may be less than `n`.
        total_tokens:
          type: integer
          description: Total tokens.
        input_tokens:
          type: integer
          description: Input tokens (text and reference images).
        output_tokens:
          type: integer
          description: Output tokens (generated images).
        input_tokens_details:
          type: object
          properties:
            text_tokens:
              type: integer
              description: >-
                Input text tokens, including tokens converted from the prompt
                enhancement cost.
            image_tokens:
              type: integer
              description: Input reference image tokens; 0 for text-to-image.
        output_tokens_details:
          type: object
          properties:
            image_tokens:
              type: integer
              description: Tokens of the output images.
    ImageStreamPartialSucceeded:
      type: object
      title: partial_succeeded
      description: >-
        A single image was generated successfully. Pushed once for each
        successful image, in completion order; use `image_index` to identify the
        image.
      required:
        - type
        - image_index
        - url
      properties:
        type:
          type: string
          enum:
            - image_generation.partial_succeeded
          description: Event type, always `image_generation.partial_succeeded`.
        created:
          type: integer
          description: Unix timestamp (seconds) when the event was produced.
        model:
          type: string
          description: Model name.
        image_index:
          type: integer
          description: >-
            Image index, starting from 0, range [0, n-1]; matches the position
            in `data` of the non-streaming response.
        url:
          type: string
          description: Image URL. Download the image and store it yourself.
        size:
          type: string
          description: Actual image size, formatted as `WIDTHxHEIGHT`.
        output_format:
          type: string
          enum:
            - png
            - jpeg
            - webp
          description: 'Image format: `png`, `jpeg`, or `webp`.'
        revised_prompt:
          type: string
          description: >-
            The prompt actually used to generate this image: the enhanced prompt
            when prompt enhancement is on; the same as `prompt` in the request
            when `disable_prompt_enhanced` is `true`.
    ImageStreamPartialFailed:
      type: object
      title: partial_failed
      description: >-
        A single image failed to generate or failed the content safety check.
        Other images are not affected and continue to be pushed.
      required:
        - type
        - image_index
        - code
        - message
      properties:
        type:
          type: string
          enum:
            - image_generation.partial_failed
          description: Event type, always `image_generation.partial_failed`.
        created:
          type: integer
          description: Unix timestamp (seconds) when the event was produced.
        model:
          type: string
          description: Model name.
        image_index:
          type: integer
          description: >-
            Image index, starting from 0, range [0, n-1]; matches the position
            in `data` of the non-streaming response.
        code:
          type: string
          description: >-
            Error code for this image. Common values: `1000` generation failed,
            `1001` timed out, `1008` insufficient balance, `1026` enhanced
            prompt failed the content safety check, `1027` generated image
            failed the content safety check. See [Error
            Codes](/api-reference/errorcode) for the full list.
        message:
          type: string
          description: Error details.
    ImageStreamCompleted:
      type: object
      title: completed
      description: >-
        Pushed when all images are done and at least one succeeded. This is the
        last event in the stream.
      required:
        - type
      properties:
        type:
          type: string
          enum:
            - image_generation.completed
          description: Event type, always `image_generation.completed`.
        created:
          type: integer
          description: Unix timestamp (seconds) when the event was produced.
        model:
          type: string
          description: Model name.
        usage:
          $ref: '#/components/schemas/ImageUsage'
        request_id:
          type: string
          description: Request ID (the trace ID). Provide it when reporting an issue.
    ImageStreamError:
      type: object
      title: error
      description: >-
        Pushed when no image was generated, or when the request fails as a whole
        after the response headers were sent but before generation was
        submitted. The stream ends after this event. Not billed.Does not include
        `created` or `data`; the failure reason of each image is in the
        `partial_failed` events pushed before it.
      required:
        - type
        - error
      properties:
        type:
          type: string
          enum:
            - error
          description: Always `error`.
        error:
          $ref: '#/components/schemas/OaiErrorDetail'
          description: >-
            Error details, the same as the `error` field of the HTTP error
            response of a non-streaming request. When all images fail,
            `http_code` is `422` (all failed the content safety check), `402`
            (all failed due to insufficient balance), or `500` (otherwise).
        usage:
          $ref: '#/components/schemas/ImageUsage'
          description: All values are 0.
        request_id:
          type: string
          description: Request ID (the trace ID). Provide it when reporting an issue.
    OaiError:
      type: object
      description: >-
        Error response. The HTTP status code is the error code.


        If all images fail, `created`, `data` (per-image failure reasons), and
        `usage` are also returned: 422 if all failed the content safety check,
        402 if all failed due to insufficient balance, otherwise 500.
      properties:
        type:
          type: string
          description: Always `error`.
          example: error
        error:
          $ref: '#/components/schemas/OaiErrorDetail'
        created:
          type: integer
          description: Unix timestamp (seconds). Returned only when all images fail.
        data:
          type: array
          description: Per-image failure reasons. Returned only when all images fail.
          items:
            $ref: '#/components/schemas/ImageObject'
        usage:
          $ref: '#/components/schemas/ImageUsage'
          description: Returned only when all images fail.
        request_id:
          type: string
          description: Request ID (the trace ID). Provide it when reporting an issue.
    OaiErrorDetail:
      type: object
      properties:
        type:
          type: string
          description: >-
            Error type: `bad_request_error` (400) / `authorized_error` (401) /
            `insufficient_balance_error` (402) / `unprocessable_entity_error`
            (422) / `rate_limit_error` (429) / `server_error` (500), etc.
        message:
          type: string
          description: >-
            Error detail; the trailing parenthesis holds the internal error code
            (e.g. `... (2013)`). See [Error Codes](/api-reference/errorcode).
        http_code:
          type: string
          description: HTTP status code as a string, e.g. `400`.
  responses:
    Err400:
      description: Invalid parameters
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/OaiError'
          examples:
            invalid_size:
              summary: Invalid parameters
              value:
                type: error
                error:
                  type: bad_request_error
                  message: >-
                    invalid params, size 4096x1024: aspect ratio must be within
                    1:3 and 3:1 (2013)
                  http_code: '400'
                request_id: 021792308678142a2c883cf675b9804d
            b64_json:
              summary: b64_json constraint not met
              value:
                type: error
                error:
                  type: bad_request_error
                  message: >-
                    invalid params, b64_json total output area (n x width x
                    height) 33554432 exceeds 20000000 for png, use url or
                    jpeg/webp instead (2013)
                  http_code: '400'
                request_id: 021792308678142a2c883cf675b9804d
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
            request_id: 021792308678142a2c883cf675b9804d
    Err402:
      description: Insufficient balance
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
            request_id: 021792308678142a2c883cf675b9804d
    Err422:
      description: >-
        Input contains sensitive content / All images withheld by the content
        safety check
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/OaiError'
          examples:
            input_sensitive:
              summary: Input contains sensitive content
              value:
                type: error
                error:
                  type: unprocessable_entity_error
                  message: 'input content failed safety check: prompt (1026)'
                  http_code: '422'
                request_id: 021792308678142a2c883cf675b9804d
            all_images_failed:
              summary: All images withheld by the content safety check
              value:
                type: error
                error:
                  type: unprocessable_entity_error
                  message: >-
                    no image generated: all 2 images failed content safety check
                    (1027)
                  http_code: '422'
                created: 1792308678
                data:
                  - error:
                      code: '1027'
                      message: output image failed content safety check
                  - error:
                      code: '1027'
                      message: output image failed content safety check
                usage:
                  generated_images: 0
                  total_tokens: 0
                  input_tokens: 0
                  output_tokens: 0
                  input_tokens_details:
                    text_tokens: 0
                    image_tokens: 0
                  output_tokens_details:
                    image_tokens: 0
                request_id: 021792308678142a2c883cf675b9804d
    Err429:
      description: Rate limited
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/OaiError'
          example:
            type: error
            error:
              type: rate_limit_error
              message: rate limit exceeded(IPM) (1002)
              http_code: '429'
            request_id: 021792308678142a2c883cf675b9804d
    Err500:
      description: Server error
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/OaiError'
          examples:
            server_error:
              summary: Server error
              value:
                type: error
                error:
                  type: server_error
                  message: internal error (1000)
                  http_code: '500'
                request_id: 021792308678142a2c883cf675b9804d
            all_images_failed:
              summary: No image generated (server error involved)
              value:
                type: error
                error:
                  type: server_error
                  message: 'no image generated: 1 x 1027, 1 x 1000 (1000)'
                  http_code: '500'
                created: 1792308678
                data:
                  - error:
                      code: '1027'
                      message: output image failed content safety check
                  - error:
                      code: '1000'
                      message: image generation failed
                usage:
                  generated_images: 0
                  total_tokens: 0
                  input_tokens: 0
                  output_tokens: 0
                  input_tokens_details:
                    text_tokens: 0
                    image_tokens: 0
                  output_tokens_details:
                    image_tokens: 0
                request_id: 021792308678142a2c883cf675b9804d
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      description: >-
        `HTTP: Bearer Auth`

        - Security Scheme Type: http

        - HTTP Authorization Scheme: `Bearer API_key`, used to verify account
        information, can be found in [Account Management>API
        Keys](https://platform.minimax.io/user-center/basic-information/interface-key).

````