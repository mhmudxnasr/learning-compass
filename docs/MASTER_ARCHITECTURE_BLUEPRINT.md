# Learning Compass — Master Architecture Blueprint & Technical Roadmap

## 1. Executive Summary & Paradigm Shift

Learning Compass is evolving from a passive capture-and-note tool into a **layered cognitive learning operating system**. By decoupling memory timing, knowledge structure, belief evolution, reading companions, and dialectic discovery, the platform achieves maximum retention with minimum cognitive friction.

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                       LEARNING COMPASS ARCHITECTURE                     │
└─────────────────────────────────────────────────────────────────────────┘
   [ CAPTURE PLANE ] ──► Web / RSS / PDF / Stylus Marginalia / Audio
           │
           ▼
   [ INGESTION & PIPELINE PLANE ]
     - R2 Artifact Storage (PDF, HTML, Audio)
     - PyMuPDF Spatial Margin Overlap Alignment (|Δy| ≤ 15pt)
     - Local VLM (Qwen2-VL/olmOCR) Annotation OCR
           │
           ▼
   [ KNOWLEDGE & MEMORY PLANE (D1 Canonical) ]
     - FSRS-5 Kernel (Card D, S, R calculations)
     - Prerequisite DAG (Node Mastery M(v,t) & Retrievability Attenuation R̂_v(t))
     - Belief Ledger (Claims, Evidence, Conflict Classification)
           │
           ├──► [ READING COMPANION PLANE ]
           │      HTML + PDF Pair for Huawei TGR-W09
           │      Inline Socratic Web Components (<mnemonic-widget>)
           │
           ├──► [ DIALECTIC DISCOVERY PLANE ]
           │      Dialectic Divergence Score S_dialectic(d)
           │      Contrast Hook Decision Receipts
           │
           └──► [ AUDIO STUDIO PLANE ]
                  Grounded Script Generation -> Multi-Speaker TTS -> WebVTT Cues
```

---

## 2. Core Mathematical & Algorithmic Foundations

### A. FSRS-5 Memory Kernel
For any card $c$, retrievability follows the power-law retention curve:
$$R(t, S) = \left(1 + F \cdot \frac{t}{S}\right)^C \quad \text{where } F = \frac{19}{81}, \, C = -0.5$$

Optimal review interval $I$ for target retention $R_d$:
$$I(R_d, S) = \frac{S}{F} \cdot \left(R_d^{1/C} - 1\right)$$

Stability $S$ updates upon review grade $G \in \{1: \text{Again}, 2: \text{Hard}, 3: \text{Good}, 4: \text{Easy}\}$:
- **Success ($G \ge 2$):** $S' = S \cdot \left(1 + e^{w_8} \cdot (11 - D) \cdot S^{-w_9} \cdot \left(e^{w_{10}(1-R)} - 1\right) \cdot w_{15} \cdot w_{16}\right)$
- **Lapse ($G = 1$):** $S'_{lapse} = \min\left(w_{11} \cdot D^{-w_{12}} \cdot \left((S + 1)^{w_{13}} - 1\right) \cdot e^{w_{14}(1-R)}, \, S\right)$

### B. Knowledge Graph DAG Dependency Propagation
Concept node mastery $M(v, t)$ aggregates card retrievabilities:
$$M(v, t) = \frac{\sum_{c \in \text{Cards}(v)} w_c \cdot R_c(t, S_c)}{\sum_{c \in \text{Cards}(v)} w_c}$$

When a prerequisite node $u \in \text{Parents}(v)$ drops in retrievability, dependent node $v$'s effective retrievability $\hat{R}_v(t)$ is attenuated:
$$\hat{R}_v(t) = R_v(t, S_v) \cdot \prod_{u \in \text{Parents}(v)} \sigma\left(\gamma \cdot (M(u, t) - \tau)\right)$$
where $\sigma(x) = \frac{1}{1 + e^{-x}}$, threshold $\tau = 0.70$, and steepness $\gamma = 10$.

### C. Dialectic Divergence Search
`taste-rec` ranks candidates by targeted semantic divergence rather than naive similarity:
$$S_{dialectic}(d) = \lambda \cdot \cos(\mathbf{e}_{thesis}, \mathbf{e}_d) - (1 - \lambda) \cdot \left\vert \cos(\mathbf{e}_{thesis}, \mathbf{e}_d) - \theta_{target} \right\vert + \mu \cdot \mathbb{I}_{refutation}(d)$$
where $\theta_{target} = 0.25$ enforces orthogonal contrast, and $\mathbb{I}_{refutation}(d)$ is set by NLI stance evaluation.

### D. Stylus Margin Alignment Geometry
Vertical overlap $\text{Overlap}_y(B_k, A_j)$ between paragraph block $B_k$ and margin ink annotation $A_j$:
$$\text{Overlap}_y(B_k, A_j) = \max\left(0, \, \min(y_1^k, y_1^j) - \max(y_0^k, y_0^j)\right)$$
Optimal anchor paragraph selection:
$$B_k^* = \arg\max_{B_k} \left( \frac{\text{Overlap}_y(B_k, A_j)}{\min(y_1^k - y_0^k, \, y_1^j - y_0^j)} - \alpha \cdot \vert x_0^j - x_1^k \vert \right)$$

---

## 3. Database Schema Blueprint (D1 Migration `0005_master_learning_engine.sql`)

```sql
-- FSRS-5 Card State & Memory Parameters
CREATE TABLE IF NOT EXISTS fsrs_cards (
  id TEXT PRIMARY KEY,
  node_id TEXT REFERENCES knowledge_nodes(id),
  card_type TEXT NOT NULL,                -- recall | cloze | contrast | socratic
  prompt_html TEXT NOT NULL,
  answer_md TEXT NOT NULL,
  stability REAL NOT NULL DEFAULT 1.0,
  difficulty REAL NOT NULL DEFAULT 5.0,
  desired_retention REAL NOT NULL DEFAULT 0.90,
  last_review_at INTEGER,
  next_review_at INTEGER,
  lapse_count INTEGER DEFAULT 0,
  review_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS fsrs_review_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id TEXT NOT NULL REFERENCES fsrs_cards(id),
  review_grade INTEGER NOT NULL,          -- 1: Again, 2: Hard, 3: Good, 4: Easy
  elapsed_days REAL NOT NULL,
  retrievability_before REAL NOT NULL,
  stability_before REAL NOT NULL,
  stability_after REAL NOT NULL,
  difficulty_after REAL NOT NULL,
  reviewed_at INTEGER NOT NULL,
  source_context TEXT NOT NULL             -- inline_widget | queue_review | audio_cue
);

-- DAG Graph Edges & Dependency Types
CREATE TABLE IF NOT EXISTS knowledge_dag_edges (
  id TEXT PRIMARY KEY,
  from_node_id TEXT NOT NULL REFERENCES knowledge_nodes(id),
  to_node_id TEXT NOT NULL REFERENCES knowledge_nodes(id),
  edge_type TEXT NOT NULL,                -- prerequisite | core | counter_thesis | application
  weight REAL DEFAULT 1.0,
  created_at INTEGER NOT NULL
);

-- Temporal Belief Ledger & Contradiction Engine
CREATE TABLE IF NOT EXISTS belief_claims (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  relation TEXT NOT NULL,
  value TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.85,
  status TEXT NOT NULL DEFAULT 'active',  -- active | superseded | disputed | split_context
  validity_start INTEGER NOT NULL,
  validity_end INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS belief_conflicts (
  id TEXT PRIMARY KEY,
  claim_a_id TEXT NOT NULL REFERENCES belief_claims(id),
  claim_b_id TEXT NOT NULL REFERENCES belief_claims(id),
  conflict_type TEXT NOT NULL,            -- self | pair | conditional | numerical | negation
  severity REAL NOT NULL,
  resolution_status TEXT NOT NULL DEFAULT 'proposed', -- proposed | accepted | dismissed
  receipt_md TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
```

---

## 4. Four-Phase Execution Roadmap

### Phase 1: Mnemonic Media in `lite-visual` Companions
* Upgrade `lite-visual` generator to insert `<mnemonic-widget>` custom elements after key narrative sections in generated HTML companions.
* Implement `POST /api/v1/srs/review` in Hono Worker to process inline widget ratings and update FSRS-5 parameters in real time.
* Ensure print PDF companions retain wide outer margins for stylus writing on the Huawei TGR-W09.

### Phase 2: Dialectic Discovery Engine (`taste-rec`)
* Integrate the Dialectic Divergence Score $S_{dialectic}(d)$ into `taste-rec` wave exploration.
* Auto-generate Contrast Hook decision receipts for every surfaced counter-perspective item.

### Phase 3: FSRS-5 & Knowledge Graph Priority propagation
* Deploy migration `0005_master_learning_engine.sql`.
* Implement FSRS-5 stability math in Hono API and recalculate node priority using DAG prerequisite attenuation scores.

### Phase 4: Temporal Belief Ledger (`taste-mapper` Contradiction Engine)
* Add Hermes background job `belief-contradiction-scan`.
* Surface reviewable **Belief Shift Proposals** in `/#/curate/contradictions` with explicit receipts.
