# Learning Compass, explained without technical language

**Date:** 17 August 2026

**Who this is for:** The owner of Learning Compass, without assuming any programming or software knowledge.

**How this guide is organized:** Situation → complication → resolution. First, what the product is trying to do. Second, what is currently getting in the way. Third, how to improve it in the right order.

This is the plain-language companion to the [full technical and competitive audit](./learning-compass-landscape-2026-08-17.md). The technical report contains the code evidence, detailed comparisons, and 165 primary-source links. This guide explains what those findings mean for you and your product.

## The shortest possible explanation

Learning Compass is meant to be a private learning control center.

It helps you:

1. Save useful material from the internet.
2. Decide what is actually worth your attention.
3. Keep only a few active learning commitments at a time.
4. Connect every source to a real learning goal.
5. Read or watch the original source.
6. Reflect on it in your own words.
7. Turn useful ideas into connected knowledge.
8. Create memory questions when something is worth remembering.
9. Review those questions at the right time.
10. Measure whether you are learning—not merely collecting.

That is a much stronger idea than “save links and let AI summarize them.”

The app already contains most of this system. Its problem is not a lack of ambition or features. Its main problem is that some important parts do not yet connect correctly, and the deployed app urgently needs to be made private.

## The situation: why this product should exist

Imagine you discover an excellent article about AI agents.

In a normal bookmarking app, you save it. A few days later, it is buried under 40 more links. Perhaps you read part of it. Perhaps an AI gives you a summary. But the app does not know:

- why you saved it;
- which skill you wanted to improve;
- whether you understood it;
- whether it changed your thinking;
- whether you can remember the important ideas;
- whether it should affect what you learn next.

Learning Compass is trying to solve that larger problem.

The article is not merely a bookmark. It belongs to a learning path. It has a reason for being there. You decide whether it deserves one of your five active learning spaces. You consume it, reflect, collect evidence, and decide what is worth remembering. The app can then use that history to recommend a better next source.

The core product promise is:

> Help me turn selected sources into verified learning, while protecting my attention from endless collecting and endless recommendations.

## A simple story of how the app should work

Suppose you want to become better at building reliable AI agents.

### Step 1: You save something

You find a useful article, video, PDF, book, Telegram link, or feed item. You send it to Learning Compass.

It enters the **Inbox**. The Inbox is a waiting room. Saving something does not mean committing to it.

The app records where it came from, removes obvious duplicates, and connects it to the correct learning area.

### Step 2: You decide whether it deserves attention

Later, you review the Inbox.

You can:

- move the source into the active Queue;
- leave it in the Inbox;
- schedule it to reappear later;
- archive it;
- reject it because it is not useful.

The **Queue** is intentionally limited to five active sources. This is one of the strongest ideas in the product. It prevents saving from becoming a false feeling of progress.

### Step 3: The source belongs to a real goal

The article is connected to a **Branch**, such as “Reliable AI Agents.” A Branch is a subject or capability you are developing.

It also belongs to a **Round**, which describes your current stage in that Branch. Early rounds are for exploration and orientation. Later rounds require stronger notes, evidence, application, and recall.

This prevents random learning. Every item should answer: “What part of my growth is this helping?”

### Step 4: You consume the real source

Learning Compass normally sends you to the original article, video, book, or document. It should not replace everything with an AI summary.

If the material is difficult to use in its original form, the system can create a verified Arabic reading companion. The companion must contain the full useful meaning, show where its information came from, and exist as matching HTML and PDF versions.

### Step 5: You leave evidence of learning

After reading, you write a reflection in your own words.

You might record:

- what was new;
- what you disagree with;
- how it connects to something you already know;
- where you could apply it;
- which claim needs more evidence.

The system can help organize your thinking, but it must not pretend that AI-written text is your personal reflection.

### Step 6: Knowledge becomes reusable

Important ideas become **Learning Units**.

A Learning Unit is a small, reusable piece of knowledge: a concept, distinction, mechanism, claim, or rule. Units can support or challenge one another. They can belong to more than one note or learning path.

This is where Learning Compass can become more valuable than a folder of notes. It can show not only what you wrote, but how ideas relate and where the evidence came from.

### Step 7: Worthwhile knowledge becomes recall practice

When something is important enough to remember, the app proposes memory questions.

These begin as **drafts**. You can edit or reject them. They do not become active memory cards until you approve them.

Approved cards use a spaced-repetition system. That means difficult material returns sooner and well-remembered material returns later.

The approval step matters. It prevents AI from filling your review list with weak or unnecessary questions.

### Step 8: The learning loop closes

When the source is complete, you record the outcome.

The app learns whether the source was useful, too basic, too advanced, repetitive, poorly matched, or especially valuable. That evidence can improve later recommendations.

The app then stops. It should not immediately push another recommendation. You ask for another recommendation only when you are ready.

That closed loop is Learning Compass’s main product advantage.

## The five main areas of the app

The product is organized into five destinations. This is a good structure and should remain stable.

### 1. Home

Home answers: **What deserves my attention now?**

It should show a calm, limited briefing:

- current learning commitments;
- the source you should resume;
- memory reviews due today;
- evidence or reflections waiting for completion;
- important system problems that require attention.

Home should not become a noisy feed. Its purpose is focus.

### 2. Library

Library answers: **What material do I own or have saved?**

It includes:

- Inbox items;
- active and completed sources;
- uploaded files;
- books;
- collections;
- archived material;
- RSS and Atom feed subscriptions.

Library is where collecting, organizing, filtering, and finding source material happens.

### 3. Learn

Learn answers: **What am I trying to understand, practice, or prove?**

It includes:

- learning Threads and their stages;
- structured notes;
- Learning Units;
- evidence and projects;
- memory-card drafts;
- active recall practice.

This should become the center of serious learning work. At present, some of its strongest ideas exist behind the scenes but are not yet easy to use through the interface.

### 4. Map

Map answers: **How does my learning connect, and where am I unbalanced?**

It shows:

- Branches;
- relationships between learning areas;
- current Rounds;
- areas receiving too much or too little attention;
- the wider knowledge Atlas.

The Map should help with orientation, not become a decorative graph.

### 5. Settings

Settings answers: **How does the system behave, and what does it know about me?**

It includes:

- your learning profile;
- preferences and appearance;
- exports and offline work;
- system abilities and scheduled tasks;
- the operations available to Hermes.

Settings is currently powerful, but parts of it expose too much internal machinery. It should explain consequences in human terms rather than presenting the product like an engineering console.

## Important words in normal language

| Product word | Plain meaning |
|---|---|
| Source | Something you may learn from: an article, video, PDF, book, text, or file |
| Inbox | An unlimited waiting room for saved material |
| Queue | Your active commitment list, normally limited to five sources |
| Branch | A subject or capability you are developing |
| Round | Your current stage of maturity inside a Branch |
| Thread | A goal-driven learning journey with ordered stages |
| Stage | One part of a Thread, like a chapter or milestone |
| Learning Unit | One reusable concept, claim, mechanism, distinction, or rule |
| Evidence | Proof supporting learning or understanding: a source passage, explanation, result, or completed project |
| Reflection | What you personally think after engaging with a source |
| Recall draft | A proposed memory question that you can edit or reject |
| Recall card | An approved memory question scheduled for review |
| Companion | A verified Arabic HTML and PDF reading version of difficult source material |
| Recommendation | A researched external source suggested for a specific Branch and Round |
| Hermes | The assistant operating the behind-the-scenes learning workflows |
| Atlas | The visual map of Branches and knowledge relationships |

## What is already unusually strong

Many competing products have one or two of the following qualities. Learning Compass combines them.

### Attention is treated as scarce

The five-item Queue is excellent. Most reading and bookmarking products reward saving more. Learning Compass can reward finishing, reflecting, and learning instead.

### Recommendations are accountable

A recommendation should explain:

- why it fits now;
- which Branch it serves;
- which Round it matches;
- whether it is a direct fit, a bridge, or a useful challenge;
- why it is not a duplicate of something already consumed;
- what evidence supports the choice.

That is better than an endless algorithmic feed.

### The original source remains important

The product does not automatically replace reading with summaries. This protects context, nuance, and intellectual honesty.

### Personal reflection is protected

Your own thinking should remain distinguishable from source material and AI suggestions. This is essential for real learning.

### Memory practice requires approval

AI can draft memory cards, but it cannot silently decide what belongs in your memory practice.

### The learning model is deeper than folders

Threads, Branches, Rounds, Units, evidence, recall, and outcomes describe learning more accurately than folders, tags, or generic blocks.

### The system already has good technical discipline

The audit found strong automated checks, safe retry handling, explicit approval for risky actions, migration testing, and a well-defined assistant-operation system. The app is not carelessly built. The urgent problems are specific and fixable.

## The complication: what is currently wrong

These problems are ordered by importance, not by how interesting they are.

### Problem 1: the private app is not currently private enough

This is the first thing to fix.

Safe checks against the deployed app showed that several personal information areas could be reached without signing in. These include profile information, the knowledge graph, the dashboard briefing, assistant context, and the list of operations the system can perform.

The test did not store your private content. It checked only whether the pages answered, their size, and their headers.

In ordinary language, the app currently has a door but no dependable lock in front of the entire house.

What should happen:

1. Create a complete backup before changing access.
2. Put a proper private sign-in gate in front of the whole app.
3. Give Hermes a separate machine credential that can be cancelled without affecting your own access.
4. Stop allowing secret credentials in web addresses.
5. Restrict which websites can request data from the app.
6. Add protection against repeated or abusive requests.
7. Test from outside that anonymous visitors cannot read or change anything private.

A Telegram webhook secret was also visible during the audit process. Its value is not included in either report. It should be replaced, and Telegram messages should be accepted only when both the secret and your approved chat identity match.

Do not begin major new feature work before this is complete.

### Problem 2: saving something can secretly bypass the Inbox

The product rule says every new capture enters Inbox.

The current behavior does not consistently follow that rule. Several saving methods can place a source directly into the Queue. Worse, one part of the system may report “Inbox” even when the saved record says “Queue.” The capture dialog itself says “Captured to Queue.”

This damages the product’s central promise: saving is not the same as committing.

The fix is conceptually simple:

- every saving method must use one shared capture process;
- every new source must enter Inbox;
- moving something to Queue must be a separate, clear decision;
- the receipt shown to you must match what was actually saved;
- retries must never create duplicates.

The written project documents also disagree about this behavior. They must all be updated from one final rule.

### Problem 3: Branch and Round are required in theory, but not always in reality

The product says every saved item must connect to a valid Branch and Round. The current system can still save records without them.

This creates “orphan” material that has no clear reason to exist in your learning system.

The app must keep capture quick without inventing fake learning connections.

The best approach is:

- automatically suggest a Branch only when the current context makes it obvious;
- otherwise ask you to confirm a Branch in a very small capture screen;
- let each feed subscription have a verified default Branch;
- calculate the Round from the Branch rather than asking users or tools to type it;
- refuse Queue promotion if the Branch connection is invalid.

The system should never create a meaningless “Unmapped” Branch just to satisfy the rule.

### Problem 4: some important destinations look real but do not work completely

Search can offer a Learning Unit result, but opening it does not lead to a complete Unit page. Memory Cards also lack a proper individual page.

This makes the system feel deeper in search than it is in use.

Every Unit page should show:

- the idea in clear language;
- its original source and exact evidence;
- its Branch and Round;
- the Thread using it;
- supporting and challenging Units;
- related notes;
- memory questions created from it.

Every Card page should show:

- the question and answer;
- the evidence behind it;
- its source and Unit;
- review history;
- why it is due;
- edit, suspend, or delete controls.

### Problem 5: the deepest knowledge features are hidden

The system already knows about Learning Units, relationships, contradictions, counterevidence, and proof of learning. But there is no simple place where you can work with all of this.

A focused **Synthesis** area should be added inside Learn. It should let you:

- see a claim;
- inspect evidence for and against it;
- compare related ideas;
- mark contradictions as resolved or still open;
- turn a useful conclusion into a note, Unit, project, or recall draft.

This should not become a sixth main destination. It belongs inside Learn.

### Problem 6: the Learning Hub mixes learning with course-building

The current Hub can make “use this learning path” compete with “edit this learning path.” A long stage can also appear as a flat list of more than 100 items.

The experience should separate two intentions:

- **Learn mode:** What should I do next?
- **Edit mode:** How should this path be structured?

Stages should be grouped into understandable sections. Prior knowledge should be recognized: you should be able to prove you already know something or consciously waive it, instead of repeating unnecessary work.

Mobile should not simply squeeze the desktop layout. It needs a deliberate sequence: current goal, next action, evidence, then supporting detail.

### Problem 7: export is not the same as backup

The current export mainly downloads the source library as JSON or Markdown, with a maximum of 5,000 records.

That does not protect the full product.

A real backup must include:

- sources and their states;
- notes and bilingual blocks;
- Threads and stages;
- Units and their relationships;
- evidence and reflections;
- recall drafts, cards, and review history;
- Branches and Rounds;
- profile history and memories;
- settings;
- feeds and imported entries;
- assistant jobs and receipts;
- uploaded files and Arabic companions.

It is not enough to create the backup. The system must regularly prove it can restore that backup into an empty test environment.

Obsidian export should remain a useful readable archive. It should not be treated as the complete backup or the main database.

### Problem 8: Arabic and English search are not equally supported

The app’s meaning-based search currently relies on a model designed mainly for English. But Arabic companions and bilingual notes are central to the product.

This means an Arabic question may fail to find a relevant English source, and an English question may miss an Arabic explanation.

The improved search should combine:

- exact word search;
- bilingual meaning search;
- Branch, Round, source type, and status filters;
- a final ranking step;
- a visible passage explaining why each result matched.

The new search system should run beside the old one first. It should replace the old system only after a fixed set of Arabic, English, mixed-language, and transliterated searches proves it is better.

### Problem 9: the system has become broad and internally complicated

The app has 179 operations available to its internal control system. It also has many data types, overlapping recommendation paths, and large interface files.

This does not mean the product should be rewritten. It means the rules must become simpler and more centralized.

Four areas especially need one clear owner:

1. All capture methods should use one capture service.
2. Branch and Round rules should be controlled in one place.
3. Search should return evidence through one consistent system.
4. Recommendation discovery and ranking should become one pipeline rather than overlapping old and new systems.

The product should remove retired pages and workflows instead of leaving them installed but unused.

## What other products teach us

There is no exact Learning Compass clone. That is good. The app combines several categories in an unusual way.

| Product family | What those products do well | What Learning Compass should borrow | What it should not copy |
|---|---|---|---|
| Readwise Reader, Readeck, Karakeep, Wallabag | Fast capture, highlights, reading position, metadata, offline reading | Exact passage capture, reliable receipts, better duplicate handling | A huge internal reading app that replaces original sources |
| Obsidian, Logseq, Anytype, Capacities | Links, backlinks, flexible views, local access, export | Contextual links, saved searches, typed object pages, portability | A generic block notebook or user-created type explosion |
| Anki, SuperMemo, RemNote | Mature memory scheduling and incremental resurfacing | Better card context, workload control, leech handling, source checkpoints | Streak pressure or automatically publishing AI cards |
| Zotero | Precise source information and annotations | Evidence that returns to the exact passage or page | Turning the product into an academic citation manager |
| NotebookLM | Answers and generated material visibly grounded in selected sources | Evidence chips, source selection, save-with-citations | A generic chat box as the main product |
| Khoj and Fabric | Searching and asking questions across personal material | A read-only “ask my learning record” experience with citations | Giving an assistant unrestricted writing power |
| FreshRSS and Miniflux | Feed filters, rules, imports, exports, predictable processing | OPML import/export, saved rules with previews, clear feed receipts | Infinite unread counts or sending feed items directly to Queue |

The lesson is not “copy every feature.” It is “borrow the best mechanic from each category while keeping the Learning Compass learning loop.”

## The best new features, in the right order

These are product improvements, not the urgent security repairs described earlier.

### 1. Exact highlights and annotations

You should be able to save one sentence or passage from a webpage, a page and quote from a PDF, or a timestamp from a video.

The highlight should survive reasonable changes to the page. If the system cannot confidently find it again, it should say the anchor is broken rather than opening the wrong passage.

### 2. Evidence attached to every derived idea

Notes, Units, recall drafts, recommendations, and companion sections should show where their factual claims came from.

The system should clearly distinguish:

- source evidence;
- your personal reflection;
- an AI inference;
- contradictory evidence.

### 3. Better Arabic–English search

Search should work across both languages and return the evidence passage, not only the name of a record.

### 4. A small browser capture extension

From the browser, you should be able to save:

- the whole page;
- a link;
- selected text;
- useful metadata.

Before saving, the extension should confirm the correct existing Branch. The result must enter Inbox and show a trustworthy receipt.

### 5. Complete Unit and Card pages

Every object offered by search must have a useful destination.

### 6. A Synthesis area

Create one calm place inside Learn for claims, evidence, counterevidence, contradictions, and promotion into notes or recall drafts.

### 7. Full backup and restore

Treat this as a user feature, not only maintenance. You should be able to know when the last verified backup happened and whether it can be restored.

### 8. Better Inbox management

Add:

- multi-select actions;
- duplicate merging;
- saved searches;
- reusable filters;
- keyboard shortcuts;
- feed rules with previews;
- “why was this suggested?” explanations.

Rules may suggest actions. They should not silently create Branches or promote Queue items.

### 9. Import tools

Useful future imports include:

- OPML feed lists;
- Readwise highlights;
- Zotero items and annotations;
- Obsidian Markdown;
- Anki exports where migration is genuinely needed.

Importing should preserve source history and avoid duplicates. It should not create a second competing memory scheduler.

### 10. Calm resurfacing of unfinished material

Memory cards bring back facts, but sometimes the right thing to revisit is a half-read source or valuable passage.

The app can show a checkpoint in Today or Practice without adding a new Queue item. This protects the five-item commitment limit.

## Tools, explained by the job they would do

You do not need to understand or choose these personally. This table explains why the implementation team might use them.

| Tool or standard | Its simple job |
|---|---|
| Cloudflare Access | The locked front door for the private app |
| Cloudflare service token | A separate key for Hermes, independent from your own sign-in |
| Cloudflare rate limiting | A guard that blocks excessive or abusive requests |
| Web Annotation standard | A durable way to describe an exact quote, page, or passage |
| Browser extension | A fast Save-to-Learning-Compass button for pages, links, and selections |
| Readability and DOMPurify | Extract the useful article safely and remove dangerous page code |
| Multilingual meaning model | Find related Arabic and English material even when the exact words differ |
| Playwright | A robot that walks through the app like a user and catches broken journeys |
| axe-core | An automated first check for accessibility problems |
| Worker logs and traces | A private operations dashboard showing where requests or jobs failed |
| Verified restore script | Proof that a backup can rebuild the system instead of merely creating files |
| MCP adapter | A future standard doorway for assistants, reusing the existing safety rules |

## How Hermes skills should evolve

Hermes already has many specialist skills. More skills are not automatically better.

The right principle is:

> The app enforces hard rules. Hermes handles research, judgment, and carefully controlled assistance.

For example, “all captures enter Inbox” should be guaranteed by the app itself. It should not depend on Hermes remembering to check afterward.

The existing skill set should be simplified where responsibilities overlap. The older disabled learning-curation skill should be removed once nothing depends on it. Recommendation-related skills should have clearly different jobs or be merged.

Useful capabilities after the underlying product features exist include:

- **Source capture and enrichment:** clean metadata, detect duplicates, and report extraction quality.
- **Evidence anchor repair:** try to reconnect a highlight when its source changes, while refusing uncertain matches.
- **Grounded synthesis:** organize claims and evidence without pretending AI output is your reflection.
- **Recall-draft critic:** detect vague, overloaded, or unsupported memory questions before you approve them.
- **Recommendation auditor:** confirm that a suggestion is reachable, new, correctly matched, and not blocked.
- **Bilingual search evaluator:** regularly test Arabic, English, mixed-language, and transliterated searches.
- **Companion evidence auditor:** verify that an Arabic companion covers the source faithfully and that its HTML and PDF agree.

Some of these should be checks inside existing workflows rather than seven additional standalone skills.

## The resolution: the recommended roadmap

### Wave 0A: lock the app immediately

**Time:** Same day.

Do this before feature development:

- make the entire app private;
- create separate human and Hermes access;
- rotate the exposed webhook secret;
- verify Telegram sender identity;
- restrict cross-site access;
- add proper request limits;
- confirm anonymous visitors cannot read or change private information.

**Done means:** anonymous access fails, your sign-in works, Hermes’s narrow access works, and fake Telegram requests fail.

### Wave 0B: repair the central learning rules

**Time:** One to three days.

- make every capture enter Inbox;
- make the shown receipt match the real saved state;
- require a valid Branch;
- calculate the Round correctly;
- keep Queue promotion separate and explicit;
- test all channels: normal capture, Share Target, Telegram, feeds, discovery, and recommendations.

**Done means:** there are no orphan captures, no capture silently enters Queue, and retries create only one record.

### Wave 0C: make the product recoverable and releases trustworthy

**Time:** Within one week.

- build a complete backup;
- restore it into an empty test environment;
- include every important automated check before release;
- ensure production is deployed from a reviewed, recorded version;
- put scheduled maintenance configuration into the project’s recorded setup.

**Done means:** the app can be lost and rebuilt without losing learning history.

### Wave 1: finish the existing learning experience

**Time:** One to two weeks.

- build complete Unit and Card pages;
- add the Synthesis area;
- separate Learn and Edit modes;
- group long stage lists;
- support proof or waiver of prior knowledge;
- improve the mobile learning sequence.

**Done means:** the important journeys already promised by the product work from beginning to end.

### Wave 2: add evidence fidelity and bilingual intelligence

**Time:** Approximately three to six weeks.

- add exact annotations;
- attach provenance to derived knowledge;
- build the browser extension;
- create multilingual search beside the current search;
- run fixed quality tests before switching systems.

**Done means:** every generated claim can return to evidence, and Arabic/English search is measurably better.

### Wave 3: add convenience only when the core is reliable

**Time:** Later, based on real use.

Possible work:

- saved Inbox views;
- imports;
- calm source resurfacing;
- better private monitoring;
- a read-only assistant connection standard;
- EPUB location support.

These should be built only when they solve observed friction.

## How to know the app is improving

Do not judge the product by how many links it stores, how many AI messages it produces, or how long you spend inside it.

The most meaningful measure is:

> How many active learning Branches complete a verified loop from real source to reflection, evidence, and changed understanding?

Important safety measures are:

- anonymous private access: zero;
- capture receipts that disagree with saved state: zero;
- new captures without valid Branch and Round: zero;
- sources entering Queue without a clear decision: zero;
- Queue above five without explicit override: zero;
- unapproved memory cards entering review: zero;
- generated factual claims without source evidence: zero in controlled workflows;
- blocked, completed, or duplicate recommendations appearing again: zero;
- recommendations automatically requested after feedback: zero;
- backup restore failures: zero.

Useful product measures include:

- how often saved sources reach real reflection;
- how often evidence is accepted, challenged, or applied;
- how long it takes to resume an unfinished source;
- whether memory workload remains manageable;
- whether Arabic and English searches return the right evidence;
- whether recommendations lead to useful outcomes by Branch and source type.

## What should deliberately not be built

The product will become weaker if it tries to copy every neighboring category.

Do not build:

1. **An endless recommendation feed.** It would destroy intentional learning.
2. **A full internal reader for every format.** Original sources should remain primary.
3. **A generic block-based notebook.** The explicit learning model is an advantage.
4. **Automatic AI Branch creation.** Suggestions are acceptable; unverified taxonomy is not.
5. **Automatic approval of memory cards.** The learner owns memory practice.
6. **Streaks and pressure-based gamification.** They measure attendance, not mastery.
7. **A second database that competes with the current one.** It would create confusion about which version is true.
8. **A separate graph database or large search cluster without measured need.** The current foundations can handle this product’s scale.
9. **A second Hermes-like automation system.** There should be one visible job and receipt authority.
10. **Logs containing private notes, reflections, sources, prompts, or secret addresses.** Monitoring must never become another privacy risk.

## The final product direction

Learning Compass should not try to be “the app that stores everything.”

It should become:

> A private learning system that protects attention, connects every source to a real goal, keeps evidence visible, makes reflection personal, approves memory deliberately, and recommends the next source only when asked.

The competitive research supports this direction.

- Reading apps are better at capture and highlights.
- Note apps are better at flexible linking.
- Memory apps are better at mature scheduling.
- Research assistants are better at visible citations.
- Personal AI tools are better at conversational search.

Learning Compass should borrow those mechanics, but keep its stronger opinion about how learning progresses.

After the urgent privacy, capture, Branch, and backup work, the three most valuable improvements are:

1. Exact source annotations.
2. Arabic–English search that returns evidence.
3. A visible evidence chain across notes, Units, cards, recommendations, and companions.

Together, these changes deepen almost every existing feature without turning the product into something else.

## What you personally need to remember

If the rest of this document feels large, keep these seven points:

1. The idea behind Learning Compass is strong and unusual.
2. The app already contains far more than a recommendation worker.
3. The deployed app must be made private before adding features.
4. Saving must always mean Inbox; Queue must always mean deliberate commitment.
5. Every source must have a real Branch and Round.
6. Backup must restore the whole learning system, not just export links.
7. After those repairs, build evidence annotations, bilingual search, and complete knowledge-object pages.

That is the clearest path from the current app to a trustworthy personal learning operating system.
