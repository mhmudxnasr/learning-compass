-- Canon is an evergreen Learn atlas, not a finite Learning Thread. Preserve the
-- original Thread as a read-only superseded record and keep book records out of
-- the canonical source library until the learner explicitly captures one.

ALTER TABLE learning_threads ADD COLUMN superseded_by_type TEXT;
ALTER TABLE learning_threads ADD COLUMN superseded_by_id TEXT;
ALTER TABLE learning_threads ADD COLUMN superseded_at TEXT;

CREATE TABLE IF NOT EXISTS canon_atlases (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  guiding_question TEXT NOT NULL,
  orientation TEXT,
  definition_of_done TEXT,
  selection_rubric TEXT NOT NULL,
  source_thread_id TEXT REFERENCES learning_threads(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS canon_domains (
  id TEXT PRIMARY KEY,
  atlas_id TEXT NOT NULL REFERENCES canon_atlases(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'domain' CHECK(kind IN ('family','domain')),
  parent_id TEXT REFERENCES canon_domains(id) ON DELETE RESTRICT,
  branch_id TEXT NOT NULL,
  title TEXT NOT NULL,
  boundary TEXT NOT NULL,
  orientation TEXT,
  curation_status TEXT NOT NULL DEFAULT 'unmapped' CHECK(curation_status IN ('unmapped','curating','complete')),
  validation_state TEXT NOT NULL DEFAULT 'untested' CHECK(validation_state IN ('untested','exploring','field_tested')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(atlas_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_canon_domains_atlas ON canon_domains(atlas_id, kind, sort_order, title);
CREATE INDEX IF NOT EXISTS idx_canon_domains_parent ON canon_domains(parent_id, sort_order, title);
CREATE INDEX IF NOT EXISTS idx_canon_domains_branch ON canon_domains(branch_id);

CREATE TABLE IF NOT EXISTS canon_entries (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL REFERENCES canon_domains(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('foundation','representative','boundary')),
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  canonical_url TEXT,
  isbn TEXT,
  why_slot TEXT NOT NULL,
  beginner_case TEXT NOT NULL,
  expert_case TEXT NOT NULL,
  unique_contribution TEXT NOT NULL,
  limitations TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  rejected_alternative TEXT NOT NULL,
  rejection_reason TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(evidence_json)),
  recommendation_id TEXT REFERENCES recommendations(id) ON DELETE SET NULL,
  editorial_status TEXT NOT NULL DEFAULT 'draft' CHECK(editorial_status IN ('draft','reviewed','approved')),
  validation_state TEXT NOT NULL DEFAULT 'untested' CHECK(validation_state IN ('untested','exploring','field_tested')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(domain_id, role),
  UNIQUE(domain_id, title, author)
);
CREATE INDEX IF NOT EXISTS idx_canon_entries_domain ON canon_entries(domain_id, role);
CREATE INDEX IF NOT EXISTS idx_canon_entries_recommendation ON canon_entries(recommendation_id);

CREATE TABLE IF NOT EXISTS canon_entry_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id TEXT NOT NULL,
  domain_id TEXT NOT NULL,
  role TEXT NOT NULL,
  previous_json TEXT NOT NULL CHECK(json_valid(previous_json)),
  replacement_reason TEXT NOT NULL,
  replaced_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_canon_entry_revisions_entry ON canon_entry_revisions(entry_id, replaced_at DESC);

CREATE TRIGGER IF NOT EXISTS canon_complete_requires_approved_trio
BEFORE UPDATE OF curation_status ON canon_domains
WHEN NEW.curation_status='complete' AND OLD.curation_status!='complete'
BEGIN
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM canon_entries e
    WHERE e.domain_id=NEW.id
      AND e.editorial_status='approved'
      AND TRIM(e.why_slot)!=''
      AND TRIM(e.beginner_case)!=''
      AND TRIM(e.expert_case)!=''
      AND TRIM(e.unique_contribution)!=''
      AND TRIM(e.limitations)!=''
      AND TRIM(e.difficulty)!=''
      AND TRIM(e.rejected_alternative)!=''
      AND TRIM(e.rejection_reason)!=''
  )=3 AND (
    SELECT COUNT(DISTINCT role) FROM canon_entries e WHERE e.domain_id=NEW.id
  )=3
  THEN 1 ELSE RAISE(ABORT, 'complete Canon domains require three approved dossiers') END;
END;

CREATE TRIGGER IF NOT EXISTS canon_new_domain_cannot_start_complete
BEFORE INSERT ON canon_domains
WHEN NEW.curation_status='complete'
BEGIN
  SELECT RAISE(ABORT, 'new Canon domains cannot start complete');
END;

CREATE TRIGGER IF NOT EXISTS canon_complete_entries_are_stable_on_update
BEFORE UPDATE ON canon_entries
WHEN EXISTS (SELECT 1 FROM canon_domains d WHERE d.id=OLD.domain_id AND d.curation_status='complete')
BEGIN
  SELECT RAISE(ABORT, 'reopen the Canon domain before replacing an approved entry');
END;

CREATE TRIGGER IF NOT EXISTS canon_complete_entries_are_stable_on_delete
BEFORE DELETE ON canon_entries
WHEN EXISTS (SELECT 1 FROM canon_domains d WHERE d.id=OLD.domain_id AND d.curation_status='complete')
BEGIN
  SELECT RAISE(ABORT, 'reopen the Canon domain before removing an approved entry');
END;

INSERT OR IGNORE INTO canon_atlases (
  id,title,guiding_question,orientation,definition_of_done,selection_rubric,source_thread_id
) VALUES (
  'world-major-domains',
  'The Three-Book Canon',
  'Across every major domain, discipline, and literary genre, which three books form the strongest enduring entry point?',
  'An extensible atlas for discovering exceptional books and unfamiliar fields. It has no fixed completion percentage; each domain is curated and tested independently.',
  'Keep a stable selection standard, map high-value domains without false completeness, and field-test trios in unfamiliar domains.',
  'Exactly three distinct roles: Foundation establishes the field; Representative shows it working at its strongest; Boundary challenges or broadens its normal frame. Every dossier must justify beginner access, expert respect, unique contribution, limitations, difficulty, evidence, and the strongest rejected alternative. Consumed and blacklisted books are ineligible.',
  (SELECT id FROM learning_threads WHERE id='thread_1787207442605_bae8a389')
);

UPDATE canon_atlases
SET title=COALESCE((SELECT title FROM learning_threads WHERE id='thread_1787207442605_bae8a389'),title),
    guiding_question=COALESCE((SELECT guiding_question FROM learning_threads WHERE id='thread_1787207442605_bae8a389'),guiding_question),
    orientation=COALESCE((SELECT why_now FROM learning_threads WHERE id='thread_1787207442605_bae8a389'),orientation),
    definition_of_done=COALESCE((SELECT definition_of_done FROM learning_threads WHERE id='thread_1787207442605_bae8a389'),definition_of_done),
    source_thread_id=COALESCE((SELECT id FROM learning_threads WHERE id='thread_1787207442605_bae8a389'),source_thread_id),
    updated_at=datetime('now')
WHERE id='world-major-domains';

-- Seed a varied pilot only when the production Taste Map branches exist. A
-- clean test database therefore stays empty until its first verified branch is
-- created; production receives the intended starter map without fake branches.
INSERT OR IGNORE INTO canon_domains (id,atlas_id,slug,kind,parent_id,branch_id,title,boundary,orientation,sort_order)
SELECT 'canon-family-humans','world-major-domains','humans-society-meaning','family',NULL,id,'Humans, Society & Meaning','Fields for understanding people, institutions, history, ideas, ethics, and meaning.','Preserve disciplinary boundaries and surface contested canons.',10 FROM tree_nodes WHERE id='root';
INSERT OR IGNORE INTO canon_domains (id,atlas_id,slug,kind,parent_id,branch_id,title,boundary,orientation,sort_order)
SELECT 'canon-family-agency','world-major-domains','agency-organizations','family',NULL,id,'Agency & Organizations','Fields used to decide, persuade, lead, build, and allocate resources.','Keep practical fields distinct from generic business self-help.',20 FROM tree_nodes WHERE id='root';
INSERT OR IGNORE INTO canon_domains (id,atlas_id,slug,kind,parent_id,branch_id,title,boundary,orientation,sort_order)
SELECT 'canon-family-making','world-major-domains','science-technology-making','family',NULL,id,'Science, Technology & Making','Fields that explain nature or create reliable things.','Accessible works must preserve real mechanisms rather than flatten them.',30 FROM tree_nodes WHERE id='root';
INSERT OR IGNORE INTO canon_domains (id,atlas_id,slug,kind,parent_id,branch_id,title,boundary,orientation,sort_order)
SELECT 'canon-family-literature','world-major-domains','literature-and-forms','family',NULL,id,'Literature & Forms','Fiction genres, world traditions, and major nonfiction forms.','Each trio should represent a distinct reading experience and open a path deeper.',40 FROM tree_nodes WHERE id='root';

INSERT OR IGNORE INTO canon_domains (id,atlas_id,slug,parent_id,branch_id,title,boundary,orientation,sort_order)
SELECT 'canon-domain-psychology','world-major-domains','psychology','canon-family-humans',id,'Psychology','Scientific and interpretive accounts of mind and behavior; excludes clinical self-treatment guides.','Start with mechanisms, evidence, and competing schools.',10 FROM tree_nodes WHERE id='cat-mind' AND status!='pruned';
INSERT OR IGNORE INTO canon_domains (id,atlas_id,slug,parent_id,branch_id,title,boundary,orientation,sort_order)
SELECT 'canon-domain-history','world-major-domains','history','canon-family-humans',id,'History','Historical method and large-scale interpretation; distinct from biography and narrative reportage.','Balance method, synthesis, and a perspective that unsettles the default canon.',20 FROM tree_nodes WHERE id='cat-life' AND status!='pruned';
INSERT OR IGNORE INTO canon_domains (id,atlas_id,slug,parent_id,branch_id,title,boundary,orientation,sort_order)
SELECT 'canon-domain-philosophy','world-major-domains','philosophy','canon-family-humans',id,'Philosophy','Reasoned inquiry into knowledge, reality, value, and the good life.','Prefer works that teach philosophical practice, not quotation collections.',30 FROM tree_nodes WHERE id='cat-mind' AND status!='pruned';
INSERT OR IGNORE INTO canon_domains (id,atlas_id,slug,parent_id,branch_id,title,boundary,orientation,sort_order)
SELECT 'canon-domain-negotiation','world-major-domains','negotiation','canon-family-agency',id,'Negotiation','Preparing and reaching durable agreements under differing interests and power.','Keep negotiation distinct from sales tactics and manipulation.',10 FROM tree_nodes WHERE id='neg' AND status!='pruned';
INSERT OR IGNORE INTO canon_domains (id,atlas_id,slug,parent_id,branch_id,title,boundary,orientation,sort_order)
SELECT 'canon-domain-leadership','world-major-domains','leadership','canon-family-agency',id,'Leadership','Mobilizing people toward shared outcomes under uncertainty; distinct from management systems.','Include power, ethics, and institutional limits—not heroic biography alone.',20 FROM tree_nodes WHERE id='cat-money' AND status!='pruned';
INSERT OR IGNORE INTO canon_domains (id,atlas_id,slug,parent_id,branch_id,title,boundary,orientation,sort_order)
SELECT 'canon-domain-systems-thinking','world-major-domains','systems-thinking','canon-family-making',id,'Systems Thinking','Understanding behavior through relationships, feedback, accumulation, delay, and intervention.','Require usable models as well as conceptual orientation.',10 FROM tree_nodes WHERE id='systems-thinking' AND status!='pruned';
INSERT OR IGNORE INTO canon_domains (id,atlas_id,slug,parent_id,branch_id,title,boundary,orientation,sort_order)
SELECT 'canon-domain-design','world-major-domains','design','canon-family-making',id,'Design','Framing needs and shaping useful, usable, and responsible artifacts or services.','Separate design practice from visual styling and inspiration books.',20 FROM tree_nodes WHERE id='creat' AND status!='pruned';
INSERT OR IGNORE INTO canon_domains (id,atlas_id,slug,parent_id,branch_id,title,boundary,orientation,sort_order)
SELECT 'canon-domain-literary-fiction','world-major-domains','literary-fiction','canon-family-literature',id,'Literary Fiction','Fiction centered on language, form, character, and the interpretation of lived experience.','Avoid treating one national tradition as the universal center.',10 FROM tree_nodes WHERE id='cat-life' AND status!='pruned';
INSERT OR IGNORE INTO canon_domains (id,atlas_id,slug,parent_id,branch_id,title,boundary,orientation,sort_order)
SELECT 'canon-domain-science-fiction','world-major-domains','science-fiction','canon-family-literature',id,'Science Fiction','Speculative fiction that tests social, scientific, or technological possibilities.','Represent the genre beyond gadget prediction or a single Anglophone lineage.',20 FROM tree_nodes WHERE id='cat-tools' AND status!='pruned';
INSERT OR IGNORE INTO canon_domains (id,atlas_id,slug,parent_id,branch_id,title,boundary,orientation,sort_order)
SELECT 'canon-domain-investigative-reporting','world-major-domains','investigative-reporting','canon-family-literature',id,'Investigative Reporting','Evidence-led nonfiction that uncovers concealed systems, wrongdoing, or public consequences.','Distinguish durable investigative craft from topical news collections.',30 FROM tree_nodes WHERE id='cat-mind' AND status!='pruned';

UPDATE learning_threads
SET superseded_by_type='canon',superseded_by_id='world-major-domains',superseded_at=COALESCE(superseded_at,datetime('now')),updated_at=datetime('now')
WHERE id='thread_1787207442605_bae8a389'
  AND EXISTS (SELECT 1 FROM canon_atlases WHERE id='world-major-domains');
