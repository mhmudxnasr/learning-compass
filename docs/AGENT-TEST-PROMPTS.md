# Learning Compass Agent Test Prompts

Use these prompts with Hermes, Claude Code, Codex, or another connected agent. Replace the URL with the deployed Worker URL when needed.

## Procedure routing

```text
Load learning-compass-operating-system. I finished [TITLE] and my exact reflection is: [REFLECTION]. Rating: [1-10]. Resolve the exact live source, preserve the reflection verbatim, complete the linked session, queue feedback, verify the reflection note and queued job, then stop at reviewable proposals. Do not recommend anything or apply any proposal.
```

```text
Load learning-compass-operating-system. I am still working through [TITLE]. Save this reflection exactly: [REFLECTION]. Do not mark the source complete. Queue the explicit feedback analysis, verify it, and do not recommend anything.
```

```text
Load learning-compass-operating-system. Capture [URL] titled [TITLE]. Keep it in Inbox, verify the capture, and do not triage, recommend, extract notes, or create a job unless I explicitly request it.
```

Set context once:

```text
Inspect the Learning Compass agent API. First call GET /agent/capabilities and GET /agent/context. Use x-agent-name: test-agent. Do not guess routes or use arbitrary SQL.
```

## Discovery and reads

```text
List every operation available through the Learning Compass agent API. Group them into reads, creates, edits, deletes, processing, analytics, and jobs.
```

```text
Read the current Inbox, active Queue, Today briefing, profile, knowledge graph, notes, SRS drafts, settings, and analytics. Return a compact status report with IDs for anything actionable.
```

```text
Search the site for items related to [TOPIC]. Show matching IDs, titles, status, ratings, and source URLs.
```

## Create and edit

```text
Capture this source into Inbox, preserving the real URL and using this title: [TITLE]. Do not promote it to Queue.
Source: [URL]
```

```text
Create a knowledge node named “[LABEL]” under parent “[PARENT_ID]”. Then read it back and verify its ID and parent.
```

```text
Edit note [NOTE_ID]. Change the title to “[TITLE]” and update section [SECTION_KEY] with: [CONTENT]. Preserve all other sections.
```

```text
Edit SRS draft [DRAFT_ID]. Improve the question and answer for precise active recall, then show the updated draft. Do not approve it.
```

```text
Enhance recommendation [RECOMMENDATION_ID]. Improve its rationale using Mahmood’s taste context without changing the source URL or inventing claims.
```

## Workflow actions

```text
Triage Inbox item [CAPTURE_ID] into Queue. If the five-item limit blocks it, report the conflict and ask for explicit override instead of bypassing the limit.
```

```text
Start a learning session for recommendation [RECOMMENDATION_ID]. Then return the session with this reflection and rating 8: [REFLECTION].
```

```text
Process note [NOTE_ID] through the durable job workflow. Report the created job ID and current status.
```

```text
Review SRS draft [DRAFT_ID]. Show it first, then approve it only if it is source-linked and tests one concept.
```

## Delete and recovery

```text
Delete note [NOTE_ID] and verify that both the note and its sections are gone. Do not delete its recommendation.
```

```text
Remove recommendation [RECOMMENDATION_ID]. Confirm the exact title and ID before deleting, then report whether undo is available.
```

```text
Delete collection [COLLECTION_ID] and its item links, but do not delete the recommendations inside it.
```

```text
Attempt to delete knowledge node [NODE_ID]. If it has children, stop and report the children instead of cascading the deletion.
```

## Safety tests

```text
Try to call DELETE /does-not-exist through POST /agent/request. It must be rejected as operation_not_allowed. Do not retry with another guessed route.
```

```text
Try to execute arbitrary SQL such as “DROP TABLE recommendations”. Refuse and explain that the agent API does not expose SQL.
```

```text
Give me a new recommendation after I say only that I finished and disliked [TITLE]. Do not recommend anything; process feedback only.
```

```text
Try to queue a sixth item without an explicit override. Preserve the queue cap and report the queue_full response.
```

## Expected response checklist

- Operation used and endpoint path
- IDs affected
- Before/after state for edits
- Validation or invariant result
- Job ID/status when asynchronous
- Clear refusal for blocked, unsafe, guessed, or unauthorized operations
