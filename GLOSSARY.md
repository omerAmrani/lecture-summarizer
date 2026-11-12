# Lecture Summarizer

open-uni turns Open University (OPAL) lecture recordings into transcripts and summaries.

## open-uni

**Course**:
An Open University course the user follows, linked to its OPAL page. Code still names it `class`.
_Avoid_: Class

**Detect**:
Checking a course's OPAL page for lecture recordings not yet known and adding them as pending lectures. Never transcribes or summarizes.
_Avoid_: Scan, sync

**Pipeline**:
Transcribing a pending lecture, then summarizing it.
_Avoid_: Process, run

**Summary prompt**:
The text telling the AI how to summarize a lecture. Never includes the transcript or the output-language rule. Every summary is made with exactly one.
_Avoid_: Instructions

**Default prompt**:
The summary prompt that ships with the app. Used when there is no custom prompt; "reset" returns to it.
_Avoid_: Built-in prompt

**Custom prompt**:
A summary prompt the user saved in Settings. Replaces the default prompt for every summarize until reset.
_Avoid_: Default (when meaning the user's saved prompt)

**One-off prompt**:
A summary prompt edited for a single re-summarize. Becomes the custom prompt only if the user explicitly saves it as such.
_Avoid_: Per-run prompt, override
