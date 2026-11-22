> ## Documentation Index
> Fetch the complete documentation index at: https://platform.minimax.io/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# Cancel or Delete Task

> Cancel a queued task or delete a succeeded or failed video generation, H3-Context-IR, or video regeneration task record based on its current status.

This endpoint automatically performs a cancel or delete based on the task's **current status**, as follows:

| Task status | Action | Description |
| :- | :- | :- |
| `queued` | `cancelled` | Cancel the task; processing has not started, no charge |
| `succeeded` | `deleted` | Delete the task record |
| `failed` | `deleted` | Delete the task record |
| `running` | — | Not allowed, returns an error (cannot cancel while processing) |
| `cancelled` | — | Not allowed, returns an error |


## OpenAPI

````yaml api-reference/video/generation/api/v2-video-generation.json DELETE /v2/video_generation/{task_id}
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
  /v2/video_generation/{task_id}:
    delete:
      tags:
        - Video V2
      summary: Cancel or delete task
      description: >-
        Cancel or delete a video generation, H3-Context-IR, or video
        regeneration task based on its current status:

        - `queued`: cancel the task (`action=cancelled`); processing has not
        started yet.

        - `succeeded` / `failed`: delete the task record (`action=deleted`).

        - `running` / `cancelled`: not allowed, an error is returned.
      operationId: videoGenerationV2Delete
      parameters:
        - name: task_id
          in: path
          required: true
          description: ID of the task to cancel or delete.
          schema:
            type: string
      responses:
        '200':
          description: ''
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DeleteVideoGenerationV2Resp'
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
    DeleteVideoGenerationV2Resp:
      type: object
      properties:
        task_id:
          type: string
          description: ID of the affected task.
        action:
          type: string
          description: >-
            The action actually performed: `cancelled` (only for the queued
            state) or `deleted` (remove a succeeded or failed task record).
          enum:
            - cancelled
            - deleted
        status:
          type: string
          description: 'Operation result: `cancelled` or `deleted`.'
          enum:
            - cancelled
            - deleted
      example:
        task_id: '424010985738629'
        action: cancelled
        status: cancelled
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