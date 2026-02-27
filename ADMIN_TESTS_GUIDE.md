# Creating Mock Tests (IELTS Simulator Admin)

This guide explains how to build and publish IELTS mock tests using the admin panel.

## 1) Access the Admin Panel
- Go to the IELTS simulator app.
- Open `/admin/tests` (Tests Manager).
- You must be an admin user (platform role = admin).

## 2) Option A — Build a Test in the Builder (no JSON)
This is best for manual creation or quick edits.

### Steps
1. Open **Tests Manager** at `/admin/tests`.
2. Click **Open Builder**.
3. Click **New test**.
4. Fill the **Experience name** (test name).
5. Add sections, parts, and units:
   - **Add section** (Reading / Listening / Writing).
   - Set section **duration** (minutes).
   - Add **parts** inside sections.
   - Add **content units** (passage, audio, questions).
6. For each unit:
   - Choose **Unit type**.
   - Fill **Unit data (JSON)** and **Answer key (JSON)**.
7. Click **Save**.

### Unit Types (what they mean)
- `instruction` — intro text for the part.
- `reading_passage` — long passage text.
- `audio` — listening audio (storage-based).
- `image` — standalone image.
- `question_*` — question types (single choice, matching, gap fill, etc.).

The builder auto-fills defaults in JSON so you can edit quickly.

### Example: Gap Fill Question
Data JSON:
```json
{
  "prompt": "Complete the notes.",
  "text": "The {{1}} was reported by {{2}}.",
  "blanks": [
    { "id": "1", "placeholder": "Q1" },
    { "id": "2", "placeholder": "Q2" }
  ]
}
```
Answer key JSON:
```json
{
  "blanks": {
    "1": ["report"],
    "2": ["staff"]
  }
}
```

## 3) Option B — Import JSON (best for full tests)
Use `/admin/import` to upload a full test definition.

### Steps
1. Open **Import JSON** at `/admin/import`.
2. Paste or upload your JSON.
3. Click **Validate** first.
4. If validation passes, click **Import**.
5. Use the **Download JSON** button to keep a clean normalized copy.

### What gets created
- Experience ? Sections ? Parts ? Content Units ? Answer Keys

## 4) Upload Assets (Audio / Images)
Use `/admin/assets` to upload audio or images.

### Steps
1. Go to **Assets**.
2. Select **Audio** or **Image**.
3. Upload file.
4. Copy the JSON snippet shown.
5. Paste into your unit data JSON (Builder or Import JSON).

### Example: Audio Unit
```json
{
  "type": "audio",
  "data": {
    "storage": { "bucket": "listening", "path": "audio/part1.mp3" },
    "duration_seconds": 60,
    "play_once": true,
    "auto_start": true
  }
}
```

### Example: Diagram Labeling with Image
```json
{
  "type": "question_diagram_labeling",
  "data": {
    "prompt": "Label the diagram.",
    "image": {
      "storage": { "bucket": "images", "path": "diagrams/diagram1.png" },
      "alt": "Diagram"
    },
    "labels": [
      { "id": "1", "prompt": "Label 1" },
      { "id": "2", "prompt": "Label 2" }
    ]
  }
}
```

## 5) Publish / Activate
Use **Tests Manager** to publish.

1. Go to `/admin/tests`.
2. Toggle **Active** to make the test visible.
3. Use **Up/Down** to reorder.

## 6) Quick Sanity Checklist
- Each section has a duration set.
- Each question has a valid answer key.
- Audio/image units use `storage` not raw URLs.
- Test is marked **Active** in Tests Manager.

## 7) Common Issues
- **No test appears**: not active, or no entitlements for product.
- **Audio doesn’t play**: missing asset, wrong bucket/path.
- **Import fails**: invalid JSON or missing required fields.
- **Answers not graded**: answer key missing or wrong shape.

## 8) Recommended Workflow
1. Upload assets first.
2. Build test in JSON or Builder.
3. Validate + Import.
4. Activate in Tests Manager.
5. Preview with `/test/{experience_id}`.
