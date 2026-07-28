# PRODUCT.md — Taste Map Engine

## What it is
A personal knowledge curation system for one user (Mahmood). It tracks content recommendations across a queue lifecycle, maps his knowledge domains as a tree, and logs daily learning.

## Register
**Product UI** — design SERVES the product. This is a tool used daily, not a marketing surface.

## Platform
web

## Users
One user. Reads/reviews on tablet and phone, curates and pushes on desktop. Ambient light varies (light + dark mode both needed).

## Core loop
1. AI/pipeline pushes recommendations → they land in the **Queue**.
2. User consumes content, rates it (love/like/meh/dislike), writes a review → moves to **Archive**.
3. Consumption updates the taste profile → the **Map** reflects branch health, resurfacing needs, patterns.
4. Daily learning is logged in the **Journal**; produced artifacts (HTML study guides, PDFs) live in the **Vault**.

## Interaction concept: Three Workspaces
| Workspace | Intent | Contents |
|---|---|---|
| **Curate** | "What should I watch/read next? What did I think of it?" | Queue, Archive, All |
| **Map** | "What does my knowledge look like? What's neglected?" | Canvas, Branches, Profile, Resurfacing |
| **Log** | "What did I do today? What have I produced?" | Journal, Vault, Stats |

Navigation: left sidebar (desktop) / bottom bar (mobile). Sub-views are a segmented control inside each workspace. Hash routing: `#/curate`, `#/map`, `#/log`.

## Non-goals
- Multi-user, auth UI, social features.
- Replaced in this redesign: 9-tab flat nav, hover-only row actions, modal-for-everything.

## Craft bar
Linear shell density + Raycast command palette. Not marketing. Not Notion-pastel. Not cream SaaS.
