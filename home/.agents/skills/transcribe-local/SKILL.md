---
name: transcribe-local
description: Extracts audio from a video file if needed and runs WhisperX transcription, with optional output folders for audio and transcript files. Use when the user says "транскрибуй", "transcribe", "розпізнай аудіо", "whisper", or provides a video/audio file path and wants text output.
---

Extract audio from video when needed, then transcribe with the global `transcribe` command.

## Invocation

Accept arguments in the form:

`<input file> [audio to <folder>] [transcript to <folder>]`

Supported path forms:

- absolute filesystem path: `/mnt/c/...`
- vault-relative path: `01 - Projects/...`
- file URL: `file:///c:/Users/...`

Supported output folder indicators:

- English: `audio to`, `audio in`, `transcript to`, `transcript in`
- Ukrainian: `аудіо в`, `аудіо у`, `транскрипт в`, `транскрипт у`

## Step 1 — Parse arguments

Extract from the user input:

- **Input file** — required; the source audio or video file
- **Audio output folder** — optional; used only when the input is a video
- **Transcript output folder** — optional; destination for WhisperX output

Normalize paths:

- If the input is a `file:///c:/...` URL, convert it to the WSL path `/mnt/c/...`
- If the input path is vault-relative, resolve it from the vault root
- Treat output folders the same way

## Step 2 — Detect file type

Determine the input kind from the extension.

Audio formats:

- `.wav`, `.mp3`, `.m4a`, `.aac`, `.flac`, `.ogg`, `.opus`, `.webm`

Video formats:

- `.mp4`, `.mkv`, `.mov`, `.avi`, `.webm`

Notes:

- If the extension can be ambiguous (for example `.webm`), prefer treating it as video only when it contains a video stream; otherwise treat it as audio.
- If the file type is unsupported or unclear, stop and tell the user exactly what was detected.

## Step 3 — Resolve output folders

### If input is a video

- **Audio output folder**:
  - if explicitly provided — use it
  - otherwise — use the same folder as the source video
- **Transcript output folder**:
  - if explicitly provided — use it
  - if the skill is invoked from Obsidian (i.e. no explicit transcript folder is given and the source file is inside the vault) — use `Files/transcriptions/` relative to the vault root
  - otherwise — use the same folder as the extracted audio

### If input is an audio file

- Ignore any audio output folder argument
- **Transcript output folder**:
  - if explicitly provided — use it
  - if the skill is invoked from Obsidian (i.e. no explicit transcript folder is given and the source file is inside the vault) — use `Files/transcriptions/` relative to the vault root
  - otherwise — use the same folder as the source audio

If an output folder does not exist:

- verify the parent directory exists
- create the folder

## Step 4 — Validate prerequisites

Before running anything:

- verify the source file exists
- verify `transcribe` is available in `PATH`
- if input is video, verify `ffmpeg` is available

The global command requires WhisperX installed in `~/whisperx-env`.

## Step 5 — If input is video, extract audio

Use `ffmpeg` to extract a mono 16 kHz WAV file.

Output naming:

- keep the original basename
- change only the extension to `.wav`

Command shape:

```bash
ffmpeg -i "<video>" -vn -acodec pcm_s16le -ar 16000 -ac 1 "<audio_output_dir>/<basename>.wav"
```

After extraction:

- verify the WAV file exists
- use this WAV file as the source for transcription

## Step 6 — Run transcription

Run the global `transcribe` command for transcription:

```bash
transcribe "<audio_file>" "<transcript_output_dir>"
```

On macOS, always add `--light` to avoid heavy system load:

```bash
transcribe "<audio_file>" "<transcript_output_dir>" --light
```

Behavior notes:

- this workflow uses the repo's current WhisperX defaults
- by default the script produces `.txt`
- by default the script runs diarization unless configured otherwise in the script/options
- `--light` lowers process priority (`nice -n 15`) and reduces batch size, so the user can keep working while transcription runs

## Step 7 — Inspect results

After transcription finishes:

- list the output folder
- identify the produced transcript file(s)
- if a `.txt` transcript was created, report its path
- if extraction was performed, also report the WAV file path

## Step 8 — Confirm

Tell the user in Ukrainian:

- what input file was processed
- whether it was treated as audio or video
- whether audio extraction was performed
- where the extracted audio was saved, if applicable
- where the transcript was saved
- what files were produced

Keep the confirmation concise.

## Defaults and behavior summary

- Video input: `extract audio -> transcribe extracted WAV`
- Audio input: `transcribe directly`
- If the user provides both folders, respect both
- If the user provides only transcript folder, keep extracted audio near the video
- If the user provides only audio folder for video, put transcript in that same folder unless a separate transcript folder was provided

**Language:** Always respond in Ukrainian.
