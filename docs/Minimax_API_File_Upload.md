> ## Documentation Index
> Fetch the complete documentation index at: https://platform.minimax.io/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# Upload File

> Upload a file on the MiniMax API Platform.



## OpenAPI

````yaml api-reference/file/management/api/openapi.json POST /v1/files/upload
openapi: 3.1.0
info:
  title: MiniMax File Management API
  description: >-
    MiniMax file management API for uploading, retrieving, listing, and deleting
    files
  license:
    name: MIT
  version: 1.0.0
servers:
  - url: https://api.minimax.io
security:
  - bearerAuth: []
paths:
  /v1/files/upload:
    post:
      tags:
        - Files
      summary: Upload File
      operationId: uploadFile
      parameters:
        - name: Content-Type
          in: header
          required: true
          description: Indicates the request is a multipart file upload.
          schema:
            type: string
            enum:
              - multipart/form-data
            default: multipart/form-data
      requestBody:
        description: ''
        content:
          multipart/form-data:
            schema:
              type: object
              required:
                - purpose
                - file
              properties:
                purpose:
                  type: string
                  description: >-
                    The purpose of the file. The values and supported formats
                    are as follows:


                    1. __voice_clone__: For quick cloning of the original voice
                    file (supports mp3, m4a, wav formats).

                    2. __prompt_audio__: Sample audio for voice cloning
                    (supports mp3, m4a, wav formats).

                    3. __t2a_async_input__: Text file in the request body for
                    asynchronous long-text-to-speech synthesis.

                    4. __video_understanding__: Video file for multimodal
                    understanding, referenced in chat requests as
                    `mm_file://{file_id}` and retained for up to 7 days
                    (supports MP4, AVI, MOV, MKV formats).

                    5. __video_generation_input__: Input materials for video
                    generation (first-frame image / reference image / reference
                    video / reference audio), referenced in the generation
                    request's content `url` field as `mm_file://{file_id}`,
                    valid for 7 days (after expiry, generation returns file
                    expired and you must re-upload); specs are validated on
                    upload, invalid files are rejected with 400 and not
                    retained, and heic/heif dimensions are parsed server-side
                    (no client-side transcoding).

                    6. __image_generation_input__: Reference images for
                    MiniMax-H3-Image image editing, referenced in the request's
                    `images[].image_url` field as `mm_file://{file_id}`, valid
                    for 7 days (after expiry, the request returns file expired
                    and you must re-upload); files are validated on upload
                    against the [Image
                    Edit](/api-reference/image-generation-h3-edits) reference
                    image limits, and invalid files are rejected with 400 and
                    not retained.


                    Supported formats and per-file size limits for
                    `video_generation_input`:


                    | Type | Extensions | Per-file limit |

                    | --- | --- | --- |

                    | Image | jpg / jpeg / png / webp / heic / heif | 30 MB |

                    | Reference video | mp4 / mov | 50 MB |

                    | Reference audio | wav / mp3 | 15 MB |


                    Supported formats and per-file size limits for
                    `image_generation_input`:


                    | Type | Extensions | Per-file limit |

                    | --- | --- | --- |

                    | Image | jpg / jpeg / png / webp / heic / heif | 64 MB |
                  enum:
                    - voice_clone
                    - prompt_audio
                    - t2a_async_input
                    - video_understanding
                    - video_generation_input
                    - image_generation_input
                  example: t2a_async_input
                file:
                  type: string
                  format: binary
                  description: The file to be uploaded.
        required: true
      responses:
        '200':
          description: ''
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UploadFileResp'
components:
  schemas:
    UploadFileResp:
      type: object
      properties:
        file:
          $ref: '#/components/schemas/FileObject'
        base_resp:
          $ref: '#/components/schemas/UploadFileBaseResp'
      example:
        file:
          file_id: ${file_id}
          bytes: 5896337
          created_at: 1700469398
          filename: MiniMax Open Platform-Test bot.docx
          purpose: t2a_async_input
        base_resp:
          status_code: 0
          status_msg: success
    FileObject:
      type: object
      properties:
        file_id:
          type: integer
          format: int64
          description: The unique identifier for the file.
        bytes:
          type: integer
          format: int64
          description: The size of the file in bytes.
        created_at:
          type: integer
          format: int64
          description: The Unix timestamp (in seconds) when the file was created.
        filename:
          type: string
          description: The name of the file.
        purpose:
          type: string
          description: The purpose of the file.
    UploadFileBaseResp:
      type: object
      properties:
        status_code:
          type: integer
          description: >-
            The status codes and their meanings are as follows:

            0, Request successful

            1002, Rate limit triggered, please try again later

            1004, Account authentication failed, please check if the API Key is
            correct

            1008, Insufficient account balance

            1026, The image description contains sensitive content

            2013, Invalid input parameters, please check if the parameters are
            filled in as required

            2049, Invalid API Key
        status_msg:
          type: string
          description: Status details.
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
      description: >-
        `HTTP: Bearer Auth`

        - Security Scheme Type: http

        - HTTP Authorization Scheme: `Bearer API_key`, can be found in [Account
        Management>API
        Keys](https://platform.minimax.io/user-center/basic-information/interface-key).

````