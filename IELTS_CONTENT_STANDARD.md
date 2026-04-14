# IELTS Content Standard

This document defines the canonical IELTS content format used by the simulator admin.

The goal is simple:

- Content authors should create reusable items in a standard way.
- JSON imports and exports should always normalize to one schema.
- Admins should be able to build a full mock test from saved Listening, Reading, and Writing sections.
- The learner runtime should stay unchanged.

The canonical schema version is:

```json
"ielts.content.v1"
```

## 1. Authoring Model

The admin flow is library-first:

1. Create reusable child items in `Content Library`
2. Create reusable full sections in `Section Library`
3. Bind one saved Listening section, one saved Reading section, and one saved Writing section in `Mock Tests`

The runtime model remains:

```text
experiences -> sections -> parts -> content_units -> answer_keys
```

The admin authoring model adds reusable libraries on top:

```text
part_templates -> part_template_versions
section_templates -> section_template_versions
mock tests -> materialized into experiences/sections/parts/content_units
```

## 2. Core Rules

These are the required IELTS rules enforced by the new standard.

- A full IELTS mock test must contain exactly 3 sections.
- Section order must always be:
  - Listening
  - Reading
  - Writing
- Listening must have exactly 4 parts.
- Reading must have exactly 3 passages.
- Writing must have exactly 2 tasks.
- Listening and Reading must publish with valid answer keys and a total max score of 40 each.
- Writing must publish with at least one `question_text` prompt in the section.
- Listening/Reading/Writing sections must have a valid `duration_seconds`.
- Media units must point to a valid URL or valid Supabase storage reference.

Drafts may be incomplete while editing, but published content must pass all rules above.

## 3. Canonical JSON Entities

There are 3 canonical JSON entities:

1. Part template JSON
2. Section template JSON
3. Mock test JSON

### 3.1 Part Template JSON

Use this when creating:

- one Listening part
- one Reading passage
- one Writing task

Canonical shape:

```json
{
  "schema_version": "ielts.content.v1",
  "entity_type": "part",
  "module_type": "listening",
  "template_key": "listening-part-1-example",
  "name": "Part 1",
  "metadata": {},
  "content_units": []
}
```

Field meanings:

- `schema_version`: must be `ielts.content.v1`
- `entity_type`: must be `part`
- `module_type`: `listening`, `reading`, or `writing`
- `template_key`: optional stable slug for import/export and versioning
- `name`: human-readable part name
- `metadata`: free-form object
- `content_units`: ordered array of units inside the part

### 3.2 Section Template JSON

Use this when creating:

- one full Listening section
- one full Reading section
- one full Writing section

Canonical shape:

```json
{
  "schema_version": "ielts.content.v1",
  "entity_type": "section",
  "module_type": "reading",
  "template_key": "reading-section-example",
  "name": "Reading",
  "metadata": {
    "type": "reading",
    "duration_seconds": 3600
  },
  "parts": []
}
```

Field meanings:

- `schema_version`: must be `ielts.content.v1`
- `entity_type`: must be `section`
- `module_type`: `listening`, `reading`, or `writing`
- `template_key`: optional stable slug
- `name`: section name
- `metadata.type`: should match `module_type`
- `metadata.duration_seconds`: required for save-ready/publish-ready sections
- `parts`: ordered array of child parts

### 3.3 Mock Test JSON

Use this when exporting or importing a full mock test made from saved section library items.

Canonical shape:

```json
{
  "schema_version": "ielts.content.v1",
  "entity_type": "mock_test",
  "name": "IELTS Mock Test 12",
  "display_order": 12,
  "is_active": false,
  "price_amount": 49000,
  "price_currency": "UZS",
  "metadata": {},
  "sections": [
    {
      "module_type": "listening",
      "section_template_key": "listening-section-12",
      "section_template_version": 3
    },
    {
      "module_type": "reading",
      "section_template_key": "reading-section-12",
      "section_template_version": 2
    },
    {
      "module_type": "writing",
      "section_template_key": "writing-section-12",
      "section_template_version": 1
    }
  ]
}
```

Important:

- Mock test JSON references saved section templates.
- It does not embed full section content.
- The system sorts sections into Listening, Reading, Writing order during normalization.

## 4. Standard Part and Section Naming

Recommended names:

- Listening parts: `Part 1`, `Part 2`, `Part 3`, `Part 4`
- Reading parts: `Passage 1`, `Passage 2`, `Passage 3`
- Writing parts: `Task 1`, `Task 2`
- Full sections: `Listening`, `Reading`, `Writing`

Recommended `template_key` style:

- lowercase
- hyphen-separated
- stable once created

Examples:

- `listening-part-1-cafe-booking`
- `reading-passage-2-urban-transport`
- `writing-task-1-line-graph-energy-use`
- `reading-section-cambridge-18-test-2`

## 5. Canonical Unit Structure

Every content unit inside `content_units` must use this shape:

```json
{
  "type": "instruction",
  "display_order": 1,
  "data": {},
  "metadata": {},
  "answer_key": null
}
```

Field meanings:

- `type`: unit type identifier
- `display_order`: order inside the part
- `data`: unit payload
- `metadata`: free-form object
- `answer_key`: either `null` or:

```json
{
  "correct": {},
  "metadata": {}
}
```

Rules:

- `data` must always be an object.
- `metadata` should always be an object if present.
- `answer_key.correct` must be an object if `answer_key` exists.
- Non-question units should usually have `answer_key: null`.

## 6. Question Numbering

Question numbering is standardized automatically.

Rules:

- The system renumbers question units sequentially across the whole section.
- Numbering starts at `1` for each full section.
- Authors may include `metadata.question_number`, but the section normalizer will reset it to the correct sequence when saving/importing.
- Multi-item question types still use one unit, but the unit may contribute more than one score point.

Examples:

- Listening section:
  - Part 1 starts at question 1
  - Part 2 continues after Part 1
  - Part 3 continues after Part 2
  - Part 4 continues after Part 3
- Reading section:
  - Passage 1 starts at question 1
  - Passage 2 continues after Passage 1
  - Passage 3 continues after Passage 2

## 7. Supported Unit Types

The IELTS admin currently supports these canonical unit types:

- `instruction`
- `reading_passage`
- `audio`
- `image`
- `question_text`
- `question_single_choice`
- `question_multi_choice`
- `question_matching`
- `question_matching_headings`
- `question_sentence_endings`
- `question_true_false_not_given`
- `question_yes_no_not_given`
- `question_gap_fill`
- `question_select_from_list`
- `question_table_completion`
- `question_diagram_labeling`
- `question_drag_drop`

## 8. Non-Question Units

### 8.1 `instruction`

Purpose:

- directions
- section notes
- task instructions

Expected `data`:

```json
{
  "text": "Read the instructions carefully."
}
```

Notes:

- no scoring
- no answer key

### 8.2 `reading_passage`

Purpose:

- long reading passage text

Expected `data`:

```json
{
  "title": "Passage title",
  "text": "Paste passage text here."
}
```

Notes:

- no scoring
- no answer key
- should contain clean plain text, not HTML

### 8.3 `audio`

Purpose:

- listening audio source

Expected `data`:

```json
{
  "play_once": true,
  "auto_start": false,
  "storage": {
    "bucket": "media",
    "path": "ielts/listening/test-01/part-01.mp3"
  }
}
```

Alternative:

```json
{
  "play_once": true,
  "auto_start": false,
  "url": "https://..."
}
```

Notes:

- no scoring
- no answer key
- publish requires either:
  - `url`
  - or `storage.bucket` and `storage.path`

### 8.4 `image`

Purpose:

- prompt image
- supporting visual
- task image

Expected `data`:

```json
{
  "storage": {
    "bucket": "media",
    "path": "ielts/images/task-01.png"
  },
  "alt": "Line graph showing yearly sales",
  "caption": "Use the chart to answer the question."
}
```

Notes:

- no scoring
- no answer key
- publish requires either:
  - `url`
  - or `storage.bucket` and `storage.path`

## 9. Question Units

### 9.1 `question_text`

Purpose:

- Writing Task 1
- Writing Task 2
- short text answer when exact-match checking is needed

Typical `data`:

```json
{
  "prompt": "Write at least 150 words.",
  "task_type": "task1",
  "min_words": 150,
  "rows": 14,
  "show_word_count": true
}
```

Typical `answer_key`:

```json
null
```

Optional exact-match style:

```json
{
  "correct": {
    "answers": ["sample answer"]
  },
  "metadata": {}
}
```

Notes:

- Writing sections usually leave `answer_key` empty
- Writing publish readiness requires at least one `question_text` unit in the section

### 9.2 `question_single_choice`

Purpose:

- choose one answer

Expected `data`:

```json
{
  "prompt": "Choose one option.",
  "options": [
    { "id": "A", "label": "Option A" },
    { "id": "B", "label": "Option B" },
    { "id": "C", "label": "Option C" }
  ]
}
```

Expected `answer_key`:

```json
{
  "correct": {
    "option_id": "A"
  },
  "metadata": {}
}
```

Validation:

- must define `options`
- `option_id` must exist in `options`

### 9.3 `question_multi_choice`

Purpose:

- choose multiple answers

Expected `data`:

```json
{
  "prompt": "Choose all that apply.",
  "options": [
    { "id": "A", "label": "Option A" },
    { "id": "B", "label": "Option B" },
    { "id": "C", "label": "Option C" }
  ],
  "max_select": 2
}
```

Expected `answer_key`:

```json
{
  "correct": {
    "option_ids": ["A", "C"]
  },
  "metadata": {}
}
```

Validation:

- must define `options`
- `option_ids` must all exist in `options`

### 9.4 `question_matching`

Purpose:

- match items to options

Expected `data`:

```json
{
  "prompt": "Match each item with the correct option.",
  "items": [
    { "id": "1", "label": "Item 1" },
    { "id": "2", "label": "Item 2" }
  ],
  "options": [
    { "id": "A", "label": "Option A" },
    { "id": "B", "label": "Option B" }
  ]
}
```

Expected `answer_key`:

```json
{
  "correct": {
    "matches": {
      "1": "A",
      "2": "B"
    }
  },
  "metadata": {}
}
```

Validation:

- must define `items`
- must define `options`
- every item in `matches` must exist
- every mapped option must exist

### 9.5 `question_matching_headings`

Purpose:

- paragraph-to-heading matching

Expected `data`:

```json
{
  "prompt": "Match each paragraph to a heading.",
  "items": [
    { "id": "1", "label": "Paragraph 1" },
    { "id": "2", "label": "Paragraph 2" }
  ],
  "options": [
    { "id": "A", "label": "Heading A" },
    { "id": "B", "label": "Heading B" }
  ]
}
```

Expected `answer_key`:

```json
{
  "correct": {
    "matches": {
      "1": "A",
      "2": "B"
    }
  },
  "metadata": {}
}
```

Validation:

- same rules as `question_matching`

### 9.6 `question_sentence_endings`

Purpose:

- complete sentence halves/endings

Expected `data`:

```json
{
  "prompt": "Match sentence endings.",
  "items": [
    { "id": "1", "label": "The report suggests..." },
    { "id": "2", "label": "Researchers concluded..." }
  ],
  "options": [
    { "id": "A", "label": "...policy changes are needed." },
    { "id": "B", "label": "...further study is required." }
  ]
}
```

Expected `answer_key`:

```json
{
  "correct": {
    "matches": {
      "1": "A",
      "2": "B"
    }
  },
  "metadata": {}
}
```

Validation:

- same rules as `question_matching`

### 9.7 `question_true_false_not_given`

Purpose:

- classic IELTS Reading statements

Expected `data`:

```json
{
  "prompt": "Choose TRUE, FALSE, or NOT GIVEN.",
  "statements": [
    { "id": "1", "text": "Statement 1" },
    { "id": "2", "text": "Statement 2" }
  ]
}
```

Expected `answer_key`:

```json
{
  "correct": {
    "matches": {
      "1": "T",
      "2": "NG"
    }
  },
  "metadata": {}
}
```

Accepted answer tokens:

- `T`, `F`, `NG`

Validation:

- must define `statements`
- `matches` keys must reference valid statement ids
- answer values must be valid TFNG tokens

### 9.8 `question_yes_no_not_given`

Purpose:

- yes/no/not given statement set

Expected `data`:

```json
{
  "prompt": "Choose YES, NO, or NOT GIVEN.",
  "statements": [
    { "id": "1", "text": "Statement 1" },
    { "id": "2", "text": "Statement 2" }
  ]
}
```

Expected `answer_key`:

```json
{
  "correct": {
    "matches": {
      "1": "Y",
      "2": "NG"
    }
  },
  "metadata": {}
}
```

Accepted answer tokens:

- `Y`, `N`, `NG`

Validation:

- must define `statements`
- `matches` keys must reference valid statement ids
- answer values must be valid YNNG tokens

### 9.9 `question_gap_fill`

Purpose:

- fill gaps with free text answers

Expected `data`:

```json
{
  "prompt": "Complete the notes below.",
  "text": "The {{1}} was reported by {{2}}.",
  "blanks": [
    { "id": "1", "placeholder": "Q1" },
    { "id": "2", "placeholder": "Q2" }
  ]
}
```

Expected `answer_key`:

```json
{
  "correct": {
    "blanks": {
      "1": ["answer one"],
      "2": ["answer two"]
    }
  },
  "metadata": {}
}
```

Validation:

- blanks may come from `blanks` array or `{{id}}` placeholders in `text`
- every blank id in the answer key must exist
- every blank must have a non-empty accepted answer list

### 9.10 `question_select_from_list`

Purpose:

- fill gaps using fixed option ids instead of free text

Expected `data`:

```json
{
  "prompt": "Choose from the list.",
  "text": "The {{1}} was reported by {{2}}.",
  "options": [
    { "id": "A", "label": "Option A" },
    { "id": "B", "label": "Option B" }
  ],
  "blanks": [
    { "id": "1", "placeholder": "Q1" },
    { "id": "2", "placeholder": "Q2" }
  ]
}
```

Expected `answer_key`:

```json
{
  "correct": {
    "blanks": {
      "1": ["A"],
      "2": ["B"]
    }
  },
  "metadata": {}
}
```

Validation:

- must define `options`
- answer values must use option ids, not option labels

### 9.11 `question_table_completion`

Purpose:

- complete cells in a table

Expected `data`:

```json
{
  "prompt": "Complete the table.",
  "columns": ["Column A", "Column B"],
  "rows": [
    [{ "text": "Row 1" }, { "blank_id": "1", "placeholder": "Q1" }],
    [{ "text": "Row 2" }, { "blank_id": "2", "placeholder": "Q2" }]
  ]
}
```

Expected `answer_key`:

```json
{
  "correct": {
    "cells": {
      "1": ["answer one"],
      "2": ["answer two"]
    }
  },
  "metadata": {}
}
```

Validation:

- table must contain at least one cell with `blank_id`
- every answer key cell id must exist in the table
- each cell must have a non-empty answer list

### 9.12 `question_diagram_labeling`

Purpose:

- label parts of a diagram

Expected `data`:

```json
{
  "prompt": "Label the diagram.",
  "image": {
    "storage": {
      "bucket": "media",
      "path": "ielts/diagrams/test-01.png"
    },
    "alt": "Diagram of a water filtration system",
    "caption": ""
  },
  "labels": [
    { "id": "1", "prompt": "Label 1" },
    { "id": "2", "prompt": "Label 2" }
  ]
}
```

Expected `answer_key`:

```json
{
  "correct": {
    "labels": {
      "1": ["label one"],
      "2": ["label two"]
    }
  },
  "metadata": {}
}
```

Validation:

- must define `labels`
- publish requires a valid diagram image reference
- each label answer must be non-empty

### 9.13 `question_drag_drop`

Purpose:

- drag items to targets

Expected `data`:

```json
{
  "prompt": "Drag items to the targets.",
  "items": [
    { "id": "A", "label": "Item A" },
    { "id": "B", "label": "Item B" }
  ],
  "targets": [
    { "id": "1", "label": "Target 1" },
    { "id": "2", "label": "Target 2" }
  ]
}
```

Expected `answer_key`:

```json
{
  "correct": {
    "targets": {
      "1": "A",
      "2": "B"
    }
  },
  "metadata": {}
}
```

Validation:

- must define `items`
- must define `targets`
- each answer target must exist
- each mapped item id must exist

## 10. Metadata Conventions

`metadata` is intentionally flexible, but a few keys are important.

### 10.1 Section metadata

Recommended keys:

```json
{
  "type": "reading",
  "duration_seconds": 3600
}
```

When materialized into runtime sections, a library-linked section also stores:

```json
{
  "template_ref": {
    "template_id": "uuid",
    "template_key": "reading-section-cambridge-18-test-2",
    "template_version_id": "uuid",
    "template_version": 2
  }
}
```

### 10.2 Part metadata

Usually empty unless you need extra internal metadata.

When a section is assembled from reusable child items, the part metadata can include:

```json
{
  "part_template_ref": {
    "template_id": "uuid",
    "template_key": "reading-passage-2-urban-transport",
    "template_version_id": "uuid",
    "template_version": 4
  }
}
```

### 10.3 Unit metadata

Recommended keys:

```json
{
  "question_number": 1
}
```

Notes:

- `question_number` is safe to include
- the normalizer may overwrite it to keep section-wide numbering correct

## 11. Save-Ready and Publish-Ready Expectations

### 11.1 Listening

A publish-ready Listening section should have:

- `metadata.type = "listening"`
- valid `duration_seconds`
- exactly 4 parts
- valid audio references
- valid answer keys for all scorable question units
- total max score = 40

Typical part composition:

- instruction
- audio
- questions

### 11.2 Reading

A publish-ready Reading section should have:

- `metadata.type = "reading"`
- valid `duration_seconds`
- exactly 3 passages
- each passage usually includes:
  - instruction
  - reading passage
  - one or more question groups
- valid answer keys for all scorable question units
- total max score = 40

### 11.3 Writing

A publish-ready Writing section should have:

- `metadata.type = "writing"`
- valid `duration_seconds`
- exactly 2 tasks
- at least one `question_text` unit in the section

Typical Writing composition:

- instruction
- image or chart if needed
- `question_text`

## 12. Examples

### 12.1 Full Part Example

```json
{
  "schema_version": "ielts.content.v1",
  "entity_type": "part",
  "module_type": "reading",
  "template_key": "reading-passage-1-environmental-change",
  "name": "Passage 1",
  "metadata": {},
  "content_units": [
    {
      "type": "instruction",
      "display_order": 1,
      "data": {
        "text": "Read Passage 1 and answer Questions 1-13."
      },
      "metadata": {},
      "answer_key": null
    },
    {
      "type": "reading_passage",
      "display_order": 2,
      "data": {
        "title": "Environmental Change",
        "text": "Paste passage text here..."
      },
      "metadata": {},
      "answer_key": null
    },
    {
      "type": "question_gap_fill",
      "display_order": 3,
      "data": {
        "prompt": "Complete the notes below.",
        "text": "The main cause was {{1}}.",
        "blanks": [
          { "id": "1", "placeholder": "Q1" }
        ]
      },
      "metadata": {
        "question_number": 1
      },
      "answer_key": {
        "correct": {
          "blanks": {
            "1": ["industrial growth"]
          }
        },
        "metadata": {}
      }
    }
  ]
}
```

### 12.2 Full Section Example

```json
{
  "schema_version": "ielts.content.v1",
  "entity_type": "section",
  "module_type": "writing",
  "template_key": "writing-section-cambridge-style-test-01",
  "name": "Writing",
  "metadata": {
    "type": "writing",
    "duration_seconds": 3600
  },
  "parts": [
    {
      "name": "Task 1",
      "display_order": 1,
      "metadata": {},
      "content_units": [
        {
          "type": "instruction",
          "display_order": 1,
          "data": {
            "text": "Write at least 150 words."
          },
          "metadata": {},
          "answer_key": null
        },
        {
          "type": "question_text",
          "display_order": 2,
          "data": {
            "prompt": "Summarise the information by selecting and reporting the main features.",
            "task_type": "task1",
            "min_words": 150,
            "rows": 14,
            "show_word_count": true
          },
          "metadata": {},
          "answer_key": null
        }
      ]
    },
    {
      "name": "Task 2",
      "display_order": 2,
      "metadata": {},
      "content_units": [
        {
          "type": "instruction",
          "display_order": 1,
          "data": {
            "text": "Write at least 250 words."
          },
          "metadata": {},
          "answer_key": null
        },
        {
          "type": "question_text",
          "display_order": 2,
          "data": {
            "prompt": "Some people think public transport should be free. Discuss both views and give your own opinion.",
            "task_type": "task2",
            "min_words": 250,
            "rows": 18,
            "show_word_count": true
          },
          "metadata": {},
          "answer_key": null
        }
      ]
    }
  ]
}
```

### 12.3 Full Mock Test Example

```json
{
  "schema_version": "ielts.content.v1",
  "entity_type": "mock_test",
  "name": "IELTS Mock Test 01",
  "display_order": 1,
  "is_active": false,
  "price_amount": 49000,
  "price_currency": "UZS",
  "metadata": {},
  "sections": [
    {
      "module_type": "listening",
      "section_template_key": "listening-section-test-01",
      "section_template_version": 1
    },
    {
      "module_type": "reading",
      "section_template_key": "reading-section-test-01",
      "section_template_version": 1
    },
    {
      "module_type": "writing",
      "section_template_key": "writing-section-test-01",
      "section_template_version": 1
    }
  ]
}
```

## 13. Authoring Recommendations

To keep population easy and scalable, use this habit:

1. Create each Listening part separately first.
2. Create each Reading passage separately first.
3. Create each Writing task separately first.
4. Reuse those child items when assembling full sections.
5. Save full Listening, Reading, and Writing sections into the Section Library.
6. Build final mock tests only from saved section templates.

Why this is best:

- easier bulk population
- easier reuse
- version history stays clean
- JSON files stay smaller and clearer
- fixing one part does not require rebuilding every full test manually

## 14. What Authors Should Usually Put in JSON

If you want the shortest practical rule:

- part JSON should mostly contain:
  - `schema_version`
  - `entity_type = "part"`
  - `module_type`
  - `template_key`
  - `name`
  - `metadata`
  - `content_units`
- section JSON should mostly contain:
  - `schema_version`
  - `entity_type = "section"`
  - `module_type`
  - `template_key`
  - `name`
  - `metadata.type`
  - `metadata.duration_seconds`
  - `parts`
- mock JSON should mostly contain:
  - `schema_version`
  - `entity_type = "mock_test"`
  - `name`
  - pricing and status fields
  - `sections` as template references only

For each unit:

- always set `type`
- always set `data` as an object
- keep `metadata` as an object
- only add `answer_key` for scorable objective questions

## 15. Common Mistakes to Avoid

- Do not create a full mock by manually mixing raw runtime tables.
- Do not publish Listening with fewer or more than 4 parts.
- Do not publish Reading with fewer or more than 3 passages.
- Do not publish Writing with fewer or more than 2 tasks.
- Do not store labels instead of ids in answer keys for option-based questions.
- Do not leave `data` as an array or string; it must be an object.
- Do not omit media references for `audio`, `image`, or diagram images.
- Do not assume manual `question_number` values will be preserved exactly; normalization can renumber them.
- Do not embed full section content inside mock-test export JSON.

## 16. Summary

Use this standard everywhere:

- individual child items as `part`
- full reusable modules as `section`
- final full tests as `mock_test`

Keep all exports in `ielts.content.v1`.

If a payload comes from an old format, import it once, let the system normalize it, and save it back in the canonical format.
