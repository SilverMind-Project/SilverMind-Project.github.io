# Knowledge Repository

The Knowledge Repository is a caregiver-curated store of stable facts about the senior's life. It captures what matters most: family relationships, personal biography, medications, daily preferences, and routines. The repository produces two types of delivery artifacts: **info cards** (paraphrased text with images) and **quizzes** (multiple-choice or open-ended questions). Both are delivered through PWA popups, e-ink displays, or Gemini Live voice. The senior can also ask voice questions at any time and receive answers retrieved from the repository via RAG.

Every piece of content passes through a review gate. Nothing reaches the senior until a caregiver approves it. Source documents are uploaded by the caregiver, chunked and embedded via a Triton inference server, and used as the foundation for LLM-assisted content generation. The caregiver reviews drafts, edits where needed, and explicitly approves before delivery rules are activated.

## How It Works

```text
                         +-------------------+
                         |   Caregiver UI    |
                         +--------+----------+
                                  |
                    Upload documents (text + images)
                                  |
                                  v
                    +-----------------------------+
                    |  Triton Embedding Service   |
                    |  embeddinggemma-300m        |
                    |  chunk + embed via pgvector |
                    +-----------------------------+
                                  |
                    +-------------+--------------+
                    |                            |
                    v                            v
          +------------------+          +------------------+
          |  Info Card Draft |          |  Quiz Draft      |
          |  (LLM paraphrase)|          |  (LLM generate)  |
          +--------+---------+          +--------+---------+
                   |                             |
                   |      Caregiver Review       |
                   +----------+    Gate    +-----+
                              |            |
                              v            v
                     +--------+------------+--------+
                     |      Approved Content        |
                     +--------+------------+--------+
                              |            |
               +--------------+    +-------+-----------+
               | (pipeline rule)    | (pipeline rule)  |
               v                    v                   v
        +-----------+       +-----------+       +--------------+
        | Info Card |       |   Quiz    |       | Senior Voice |
        | Delivery  |       |  Session  |       | Query (RAG)  |
        +-----+-----+       +-----+-----+       +------+-------+
              |                   |                      |
     +--------+--------+   +-----+------+        +------+------+
     | PWA  | E-Ink |  |   | PWA | Voice |       | pgvector   |
     |Popup |       |  |   |     | (Gemini|      | cosine sim |
     +------+-------+--+   +-----+-------+       +------+------+
     | Voice (Gemini Live) |                           |
     +---------------------+                  +--------+--------+
                                              | LLM synthesis  |
                                              | or "no_answer"  |
                                              +-----------------+
```

Every interaction is logged for caregiver review. Info card deliveries record view and dismiss events. Quiz responses are graded and persisted. Voice queries record the question, answer, and source documents.

## Documents

Documents are the raw material of the knowledge repository. The caregiver uploads text content with optional images.

### Upload

Documents are created through the caregiver API or admin UI. Each document has a title, source text, optional tags, and optional image attachments.

```http
POST /api/v1/knowledge/documents
Content-Type: multipart/form-data

{
  "title": "Family Information",
  "source_text": "Grandma has three grandchildren: Aisha (12), ...",
  "tags": ["family", "biography"],
  "images": [<file>, ...]
}
```

Supported image types: `image/jpeg`, `image/png`, `image/webp`, `image/heic`. Maximum file size is 15 MB and maximum pixel count is 40 MP, both configured in settings.

### Chunking and Embedding

After upload, the system automatically chunks the source text and embeds each chunk via the Triton inference server using `embeddinggemma-300m`. Chunks are created using a `RecursiveCharacterTextSplitter` with configurable size and overlap, then embedded in batches.

```yaml
# config/settings.yaml
embedding:
  triton_url: "triton.nanai.khoofia.com:8701"
  model_name: "embeddinggemma-300m"
  dim: 768
  max_seq_len: 2048
  batch_size: 16

knowledge:
  chunk_size_tokens: 400
  chunk_overlap_tokens: 60
```

Embeddings are stored as 768-dimensional `pgvector` vectors alongside the chunk text in the `knowledge_document_chunks` table. A `cosine_distance` index enables fast similarity search.

### Lifecycle

Documents move through four statuses:

| Status | Meaning |
| ------ | ------- |
| `uploaded` | Created by caregiver; chunking and embedding queued |
| `chunked` | Successfully chunked and embedded by Triton |
| `approved` | Caregiver has reviewed and approved the content |
| `archived` | Removed from active use; preserved for audit |

Valid transitions:

```text
uploaded  -->  chunked  -->  approved  -->  archived
   |            |              |
   +---> approved              +---> uploaded (re-approve)
   +---> archived              |
   ^                           v
   +--- uploaded (restore) ----+
```

Editing the source text of an approved document resets it to `uploaded` so a fresh chunk-and-embed cycle runs. If the Triton embedding service is unavailable, the document stays in `uploaded` status and a scheduled job retries automatically.

::: tip Re-embedding on edit

When you edit the `source_text` of an approved document, existing chunks are deleted and new ones created. Info cards and quizzes that reference the document are **not** automatically regenerated, so re-generate drafts after a meaningful source edit.

:::

::: warning Deleting documents

A document cannot be deleted while it has active (draft, caregiver_review, or approved) info cards or quizzes referencing it. Archive or delete those artifacts first or move them to a different source document.

:::

## Info Cards

Info cards are paraphrased, caregiver-approved information cards delivered to the senior. Each card has a title, body text, an optional image layout, and a voice instruction for Gemini Live delivery.

### Layout Types

Five built-in layouts control how text and images are composed on each delivery surface:

| Layout ID | Images | Surfaces | Description |
| --------- | ------ | -------- | ----------- |
| `text_only` | 0 | PWA, e-ink | Title and body text only |
| `single_hero` | 1 | PWA, e-ink | One hero image above the text |
| `side_by_side` | 1 | PWA, e-ink | Image on the left, text on the right |
| `gallery_grid_2x2` | 2-4 | PWA | Up to four images in a 2x2 grid |
| `quiz_with_optional_image` | 0-1 | PWA | Used for quiz questions (not info cards) |

Layouts are defined in `config/knowledge_layouts.yaml` and validated at startup. Unknown enum values cause the process to fail immediately so a bad config never reaches a senior-facing delivery.

### Image Pipeline

When a caregiver binds a source image to an info card layout slot, the image pipeline generates per-surface variants:

1. Download the original from MinIO
2. Strip EXIF metadata (honouring orientation)
3. Colour convert: RGB for PWA, Floyd-Steinberg dithering for e-ink
4. Resize and crop per layout spec: `cover`, `contain`, or `pad`
5. Encode: WebP for PWA (with configurable quality), dithered PNG for e-ink
6. Upload each variant to MinIO under a derived key

Each variant is stored as a separate MinIO object referenced by the `InfoCardImageSlot.variants` JSONB column.

### LLM-Assisted Paraphrase Generation

Instead of writing info cards from scratch, the caregiver can upload a source document and ask the system to generate a paraphrase draft. The LLM (configurable via `knowledge.paraphrase_model`) rewrites the source into simple, warm, senior-friendly language and suggests a voice instruction.

```python
# Generated data structure
@dataclass(frozen=True, slots=True)
class ParaphraseSuggestion:
    title: str               # Short, warm title (max 100 chars)
    body_text: str           # Paraphrased content in 2-4 simple sentences
    voice_instruction: str   # Instruction for AI voice delivery
```

The caregiver reviews the draft, edits as needed, and approves it. The draft is not visible to the senior until explicitly approved.

### Delivery

Info cards are delivered via pipeline rules using the `info_card` step type. The delivery service broadcasts to three channels simultaneously:

- **PWA popup**: a popup appears on the companion tablet showing the card title, body, and images with a timed dismiss button
- **E-ink display**: the card title and body are rendered onto an e-ink template and pushed to targeted displays
- **Gemini Live voice**: the card is read aloud by the voice companion with the configured voice instruction

```yaml
# Example pipeline step
step_type: info_card
config:
  info_card_id: 42
  channels: [pwa, eink]
  pwa_dismiss_seconds: 120
  eink_expiry_minutes: 60
  voice_instruction: "Read this warmly and slowly. Pause between sentences."
```

The `voice_instruction` field is a per-step override. When empty, the system falls back to the info card's own `voice_instruction` column, then to the YAML default from `config/knowledge_voice.yaml`.

All deliveries are logged in the `info_card_deliveries` audit table with timestamps for view and dismiss events.

::: tip Choosing a layout

Use `text_only` for simple facts (medication dosage, daughter's phone number). Use `single_hero` or `side_by_side` when a family photo adds emotional context. Use `gallery_grid_2x2` for multi-image stories like "grandchildren at the park last summer."

:::

## Quizzes

Quizzes are interactive question sets designed to reinforce memory and engagement. They support two question types: multiple-choice and open-ended.

### Quiz Structure

Each quiz has a title, an optional intro voice template, and a set of questions. Questions are ordered and support per-question regeneration.

| Field | Description |
| ----- | ----------- |
| `title` | Quiz name shown in the admin UI |
| `intro_voice_template` | Text the voice assistant speaks before starting the quiz |
| `voice_instruction` | Instruction for how Gemini Live should conduct the quiz |
| `questions` | Ordered list of multiple-choice or open-ended questions |

### Question Types

**Multiple-choice**: has 3-4 choices with one marked as correct via `is_correct: true`. The senior sees tappable buttons on the PWA and hears the choices read aloud.

**Open-ended**: has no choices. The senior speaks their answer and Gemini Live calls `submit_quiz_answer` to record the response. The LLM grades the answer against the expected answer using a generous grading prompt.

```python
@dataclass(frozen=True, slots=True)
class QuizQuestionSuggestion:
    question_type: Literal["multiple_choice", "open_ended"]
    question_text: str
    choices: list[dict]       # [{id, text, is_correct}, ...] for MC
    expected_answer: str      # Used for grading open-ended responses
    explanation: str          # Shown in caregiver review
```

### LLM-Assisted Generation

The caregiver can generate a complete quiz draft from a source document with a single action. The LLM creates questions, answers, and distractors based on the document content. Questions can be regenerated individually without affecting the rest of the quiz.

```http
POST /api/v1/knowledge/quizzes/{id}/regenerate-question
{
  "question_ord": 2,
  "question_type": "multiple_choice"
}
```

### Quiz Session Lifecycle

A quiz session tracks a single delivery to the senior:

| Status | Meaning |
| ------ | ------- |
| `started` | Session created, intro delivered |
| `in_progress` | Senior is actively answering questions |
| `completed` | All questions answered or senior ended the session |
| `abandoned` | Senior stopped responding without completion |
| `timed_out` | Session duration exceeded the configured timeout |

The quiz session is created by the `quiz_start` pipeline step. Questions are delivered one at a time via PWA WebSocket message and Gemini Live voice. After each answer, the system records the response and advances to the next question.

### Delivery

```yaml
# Example pipeline step
step_type: quiz_start
config:
  quiz_id: 7
  max_questions: 5
  randomize_order: true
  session_timeout_minutes: 15
  per_senior_dedupe_hours: 12
  voice_instruction: "Conduct this quiz warmly. Encourage the senior after each answer."
```

The senior interacts by tapping choice buttons on the PWA or speaking their answer. Gemini Live calls the `submit_quiz_answer` MCP tool to record voice responses. After the last question or when the senior says they are done, Gemini Live calls `complete_quiz_session` to finalize.

::: tip Quiz deduplication

The `per_senior_dedupe_hours` setting (default 12) prevents the same quiz from being delivered to the same senior multiple times within a window. If a completed session is found within that window, the pipeline step skips silently. Reduce this value for daily quizzes, increase it for weekly ones.

:::

### Per-Question Regeneration

Individual quiz questions can be regenerated without affecting other questions in the same quiz. The LLM receives the source document, the current question type, and the existing question text, and produces a replacement.

```http
POST /api/v1/knowledge/quizzes/{id}/regenerate-question
{
  "question_ord": 3,
  "question_type": "multiple_choice"
}
```

The response replaces the question at that ordinal position. Existing quiz response records are preserved for audit purposes since they snapshot the question text at answer time.

## Senior Knowledge Queries (RAG)

The senior can ask factual questions about their own life through the voice companion, and the system answers from the knowledge repository. The flow is:

1. Senior asks a question like "How many grandchildren do I have?" via Gemini Live
2. Gemini recognizes this as a `query_knowledge_base` tool call
3. The service embeds the query using the same `embeddinggemma-300m` model
4. pgvector cosine similarity search retrieves the top-8 approved document chunks
5. If the top similarity is above the threshold (`min_similarity`: 0.55), the LLM synthesizes an answer from the chunk context
6. If below the threshold, the service returns `no_answer` and Gemini falls back to other tools

```python
@dataclass(frozen=True, slots=True)
class KnowledgeAnswer:
    query_text: str
    answer_text: str
    source_document_ids: tuple[int, ...]
    source_chunk_ids: tuple[int, ...]
    top_similarity: float
    answered_via: Literal["rag", "no_answer"]
```

### Query Flow

```text
Senior voice question
        |
        v
Gemini Live recognizes query_knowledge_base tool
        |
        v
Triton embedding: embed query text
        |
        v
pgvector cosine search on approved document chunks
        |
        +-- similarity >= threshold --> LLM synthesizes answer --> return "rag"
        |
        +-- similarity < threshold  --> return "no_answer" --> Gemini uses other tools
```

Every query is logged in the `senior_knowledge_queries` table for caregiver review, including the query text, synthesized answer, source document IDs, similarity score, and latency.

### Answer Synthesis

The LLM is prompted to answer using only the retrieved context. If the context does not contain the answer, it says "I don't have that information" rather than hallucinating. The answer model is configured via `knowledge.answer_model` in settings.

```text
You are a helpful assistant for a senior citizen. Answer the question using
ONLY the provided context. If the context does not contain the answer, say
"I don't have that information."

Context:
<retrieved chunk 1>
---
<retrieved chunk 2>
...

Question: How many grandchildren do I have?

Answer (in 1-2 simple sentences):
```

### Tool Integration

The `query_knowledge_base` MCP tool is available to Gemini Live during voice conversations. It is included in the `mcp.gemini_tools` list by default. The tool returns `{answer, source_documents, found}`. When `found` is `false`, Gemini should respond from another tool or politely say it does not know.

```json
// Tool response when answer is found
{
  "answer": "You have three grandchildren: Aisha (12), Ben (8), and Chloe (5).",
  "source_documents": [3, 7],
  "found": true
}

// Tool response when no match
{
  "answer": "",
  "source_documents": [],
  "found": false
}
```

## Voice Instruction System

Gemini Live receives a system instruction that controls how it delivers content to the senior. The knowledge repository uses a 3-layer composition to build this instruction:

| Priority | Source | Description |
| -------- | ------ | ----------- |
| 1 (highest) | Step override | `voice_instruction` field on the pipeline step config |
| 2 | Resource override | `voice_instruction` column on the info card or quiz record |
| 3 | YAML default | Default instructions from `config/knowledge_voice.yaml` |
| 4 (base) | Base system instruction | The Gemini system instruction from `settings.yaml` |

The `VoiceInstructionConfig` dataclass loads defaults at startup from `config/knowledge_voice.yaml`:

```yaml
# config/knowledge_voice.yaml
interactive_prompt_default: ""
  # No default for generic prompts; the step's own voice_prompt_template
  # carries the behavioural context.

info_card_default: >
  You are now delivering an information card to the senior. Read the
  following content aloud in a warm, clear voice. After reading, ask
  if they have any questions about this information. Keep the tone
  supportive and encouraging.

quiz_default: >
  You are now conducting a quiz with the senior. Read each question
  aloud clearly. For multiple-choice questions, read all choices and
  wait for their answer. For open-ended questions, listen carefully
  and record their response. Provide brief, encouraging feedback
  after each answer ("That's right!", "Good try!", "Thank you for
  sharing that."). Do NOT reveal correct answers during the quiz.
  Keep the tone warm and supportive. After the quiz, give a simple
  summary of how they did without specific scores.
```

When a new delivery starts (info card, quiz, or interactive prompt), the system composes the final instruction and reconnects the Gemini Live session with the updated system instruction. This ensures the voice assistant's behaviour matches the current delivery type.

Template variables like `{{senior_name}}` are available in voice instruction templates and resolved from the household member records before sending to Gemini.

## Pipeline Steps

The knowledge repository adds two new pipeline step types and extends one existing step. See [Composable Pipelines](/features/pipeline) for the full pipeline system reference.

### New Step Types

| Step type | Category | Description | Key config |
| --------- | -------- | ----------- | ---------- |
| `info_card` | action | Deliver a curated info card | `info_card_id`, `channels` (pwa/eink), `pwa_dismiss_seconds`, `voice_instruction` |
| `quiz_start` | flow | Start an interactive quiz session | `quiz_id`, `max_questions`, `randomize_order`, `session_timeout_minutes`, `voice_instruction` |

### Extended Step

The existing `interactive_prompt` step (category: flow) was extended with a `voice_instruction` config key that follows the same 3-layer composition as info cards and quizzes:

```yaml
step_type: interactive_prompt
config:
  voice_prompt_template: "Are you okay? Do you need help?"
  popup_message_template: "Are you okay?"
  voice_instruction: "Speak gently and calmly. The senior may be in distress."
  countdown_seconds: 30
```

### Example: Morning Info Card Delivery

A cron rule fires every morning at 9 AM to deliver a "Today's date and family fact" info card:

```yaml
Rule:
  trigger_type: cron
  schedule_cron: "0 9 * * *"
  cool_off_minutes: 1440

Pipeline:
  step_type: info_card
  config:
    info_card_id: 15
    channels: [pwa, eink, voice]
    pwa_dismiss_seconds: 120
    eink_expiry_minutes: 240
    voice_instruction: "Read this cheerfully. It's a morning greeting."
```

### Example: Weekly Quiz Session

A weekly quiz about family photos, delivered every Sunday afternoon:

```yaml
Rule:
  trigger_type: cron
  schedule_cron: "0 14 * * 0"
  cool_off_minutes: 10080  # once per week

Pipeline:
  step_type: quiz_start
  config:
    quiz_id: 3
    max_questions: 5
    randomize_order: true
    session_timeout_minutes: 20
    per_senior_dedupe_hours: 168  # once per week per senior
    voice_instruction: "Conduct this quiz like a friendly conversation. Encourage guessing."
```

### Example: Interactive Prompt with Voice Instruction

A bathroom occupancy safety check-in extended with a voice instruction override:

```yaml
# Triggered by occupancy_duration (40+ min in bathroom)
step_type: interactive_prompt
config:
  voice_prompt_template: "Are you okay? Would you like me to call someone?"
  popup_message_template: "Are you okay?"
  auto_escalate: true
  countdown_seconds: 30
  timeout_action: escalate
  voice_instruction: "Speak slowly and clearly. Check if the senior needs medical attention without alarming them."
```

::: tip voice_instruction best practices

Keep voice instructions concise (1-3 sentences). Focus on tone and behaviour rather than content: the content is already in the prompt template. The instruction tells Gemini *how* to say it, not *what* to say.

:::

## MCP Tools

Three knowledge-related MCP tools are exposed to Gemini Live for voice interactions. See [MCP Integration](/features/mcp-integration) for the full MCP tool reference.

| Tool | Purpose | Key parameters |
| ---- | ------- | -------------- |
| `query_knowledge_base` | Answer factual questions from the knowledge repository | `query` (string) |
| `submit_quiz_answer` | Record the senior's answer to a quiz question | `session_id`, `question_ord`, `choice_id` or `open_ended_text` |
| `complete_quiz_session` | Finalize a quiz session | `session_id` |

### query_knowledge_base

Called by Gemini Live when the senior asks a personal or factual question. Returns the synthesized answer or a `found: false` signal when no relevant content exists.

```json
{
  "query": "What medications do I take in the morning?"
}
```

The service embeds the query, searches approved document chunks via cosine similarity, and if the top match exceeds `min_similarity`, synthesizes an answer via the configured LLM. The question and answer are logged to `senior_knowledge_queries` for caregiver audit.

Gemini is instructed to use this tool only for stable personal facts (family, medications, routines, preferences), not for transient data like today's events, weather, or current sensor readings.

### submit_quiz_answer

Called by Gemini Live after the senior answers a quiz question by voice. Takes either `choice_id` (for multiple-choice) or `open_ended_text` (for open-ended questions).

```json
{
  "session_id": 42,
  "question_ord": 3,
  "choice_id": "b"
}
```

For open-ended responses, the service grades the answer via the LLM using a generous grading prompt that tolerates simple or imperfect language while checking for the key idea.

The response includes `advance` (boolean) indicating whether there are more questions. If `advance` is `false`, Gemini should call `complete_quiz_session`.

### complete_quiz_session

Called at the end of a quiz to finalize the session. Broadcasts a summary to the PWA with the number of correct answers.

```json
{
  "session_id": 42
}
```

Returns the final score for Gemini to share with the senior in a supportive way (e.g. "Great job! You got 4 out of 5 right!").

## Configuration

### Knowledge Layouts (`config/knowledge_layouts.yaml`)

Defines image layout specifications for info cards and quiz questions. Parsed and validated at startup by the `LayoutRegistry`. Each layout declares which surfaces it targets and exactly which resized variants must exist for each delivery surface.

```yaml
# Example: side_by_side layout
layouts:
  - id: side_by_side
    display_name: "Image left, text right"
    applies_to: [info_card]
    surfaces: [pwa, eink]
    min_images: 1
    max_images: 1
    image_slots:
      - slot_id: side
        variants:
          pwa:
            target_width: 720
            target_height: 720
            fit_mode: cover
            color_mode: rgb
            format: webp
            quality: 85
          eink:
            target_width: 400
            target_height: 480
            fit_mode: contain
            color_mode: bw_dither
            format: png
```

See [Configuration](/guide/configuration) for the full config file reference.

### Voice Instructions (`config/knowledge_voice.yaml`)

Default voice instructions per delivery type. These are composed with per-resource and per-step overrides at delivery time.

### Settings (`config/settings.yaml`)

Key settings for the knowledge repository:

```yaml
# Embedding inference (Triton)
embedding:
  triton_url: "triton.nanai.khoofia.com:8701"
  model_name: "embeddinggemma-300m"
  dim: 768
  max_seq_len: 2048
  batch_size: 16

# Knowledge repository
knowledge:
  chunk_size_tokens: 400
  chunk_overlap_tokens: 60
  retrieval_top_k: 8
  min_similarity: 0.55
  answer_model: "gemma4_26b"
  paraphrase_model: "gemma4_26b"
  quiz_generation_model: "gemma4_26b"
  max_upload_bytes: 15728640
  max_pixels: 40000000
  allowed_mime_types: ["image/jpeg", "image/png", "image/webp", "image/heic"]
  layouts_file: "config/knowledge_layouts.yaml"
```

| Setting | Default | Description |
| ------- | ------- | ----------- |
| `knowledge.chunk_size_tokens` | 400 | Target chunk size for document splitting |
| `knowledge.chunk_overlap_tokens` | 60 | Overlap between consecutive chunks |
| `knowledge.retrieval_top_k` | 8 | Number of chunks retrieved per query |
| `knowledge.min_similarity` | 0.55 | Minimum cosine similarity for RAG answer |
| `knowledge.answer_model` | `gemma4_26b` | LLM used for answer synthesis |
| `knowledge.paraphrase_model` | `gemma4_26b` | LLM used for info card paraphrase |
| `knowledge.quiz_generation_model` | `gemma4_26b` | LLM used for quiz generation |
| `knowledge.max_upload_bytes` | 15728640 | Max image upload size (15 MB) |
| `knowledge.max_pixels` | 40000000 | Max image pixel dimensions |
| `knowledge.allowed_mime_types` | [...] | Allowed image upload MIME types |

## Related Pages

- [Composable Pipelines](/features/pipeline): step system, pipeline builder, condition expressions, and prompt templates
- [Voice Companion](/features/voice-companion): Gemini Live voice delivery, WebSocket lifecycle, and tool calling
- [E-Ink Display Pipeline](/features/eink-display): e-ink template editor, rendering, and device management
- [MCP Integration](/features/mcp-integration): MCP tool reference and Gemini Live function calling
- [Configuration](/guide/configuration): all config file details including `settings.yaml`, `auth.yaml`, and `notifications.yaml`
- [API Reference](/api/reference): REST endpoint reference for documents, info cards, quizzes, and knowledge queries
