-- Replace the temporary branch-review taxonomy with Mahmood's durable personal map.
-- Existing sources, notes, cards, annotations, and topic nodes are preserved and
-- consolidated under a small stable top layer.

INSERT INTO tree_nodes (id,type,label,super_category,parent_id,status,round_label,meta_json,updated_at) VALUES
  ('cat-faith','category','Faith & Character','cat-faith','root','love',NULL,'{}',datetime('now')),
  ('cat-mind','category','Mind & People','cat-mind','root','love',NULL,'{}',datetime('now')),
  ('cat-money','category','Business & Money','cat-money','root','love',NULL,'{}',datetime('now')),
  ('cat-tools','category','Systems & Craft','cat-tools','root','love',NULL,'{}',datetime('now')),
  ('cat-life','category','Life & Relationships','cat-life','root','love',NULL,'{}',datetime('now')),
  ('cat-body','category','Body & Mind','cat-body','root','love',NULL,'{}',datetime('now'))
ON CONFLICT(id) DO UPDATE SET type='category',label=excluded.label,super_category=excluded.super_category,parent_id='root',status='love',round_label=NULL,updated_at=datetime('now');

INSERT INTO tree_nodes (id,type,label,super_category,parent_id,status,round_label,meta_json,updated_at) VALUES
  ('taz','branch','Tazkiyah & Character','cat-faith','cat-faith','love',NULL,'{"description":"Purifying the heart and building sincere, patient, disciplined character through trusted Sunni teaching and direct practice.","leaves":["sincerity and intention","diseases of the heart","patience and gratitude","repentance","daily spiritual practice"],"contrast_hook":"Original Arabic Sunni lectures and khutbahs only; no book-derived summaries, invented rituals, or commercial self-help."}',datetime('now')),
  ('pil','branch','Faith Foundations & Certainty','cat-faith','cat-faith','love',NULL,'{"description":"Strengthen certainty in Islam, understand core beliefs, and answer serious doubts through methodical Arabic teaching from trusted Sunni scholars.","leaves":["certainty in Allah","names and attributes","proofs of faith","answering atheist claims","pillars of Islam"],"contrast_hook":"No evolution-debate repetition, shallow apologetics, sectarian clips, or unverified claims."}',datetime('now')),
  ('hadith-verification','branch','Hadith Verification','cat-faith','cat-faith','love',NULL,'{"description":"Verify hadith wording, source, grading, and practical meaning using trusted Arabic references before accepting or sharing a narration.","leaves":["source tracing","hadith grading","scholar rulings","chain and text checks","responsible sharing"],"contrast_hook":"Never treat a quote card, unsourced post, or confident speaker as authentication."}',datetime('now')),
  ('fiqh','branch','Daily Fiqh & Worship','cat-faith','cat-faith','love',NULL,'{"description":"Practical Sunni rulings for prayer, purification, fasting, transactions, and daily conduct, with clear sourcing and real-life application.","leaves":["prayer","purification","fasting","daily transactions","common worship mistakes"],"contrast_hook":"Practical daily guidance, not abstract legal debate or unsupported social-media fatwas."}',datetime('now')),
  ('persu','branch','Persuasion & Influence','cat-mind','cat-mind','love',NULL,'{"description":"Understand how people change their minds and how to communicate persuasively in one-to-one, business, and real-life settings without coercion.","leaves":["influence principles","self-persuasion","framing","reciprocity","resistance"],"contrast_hook":"No mass-propaganda lens, manipulative guru tactics, or opinion content without a mechanism."}',datetime('now')),
  ('pwr','branch','Power & Social Dynamics','cat-mind','cat-mind','love',NULL,'{"description":"Make hidden incentives, status games, leverage, coalitions, and small-group dynamics visible so they can be navigated without naivety.","leaves":["power sources","status and reputation","coalitions","small-group behavior","self-protection"],"contrast_hook":"Personal and small-group mechanics only; avoid population-level propaganda and rationalizing malicious behavior."}',datetime('now')),
  ('dec','branch','Decision-Making & Cognitive Biases','cat-mind','cat-mind','love',NULL,'{"description":"Improve judgment under uncertainty through causal reasoning, forecasting, decision journals, calibration, and bias-aware choices.","leaves":["risk and uncertainty","causal inference","forecasting","decision journals","expert intuition"],"contrast_hook":"No generic bias listicles or repeated beginner explanations of already-mastered material."}',datetime('now')),
  ('story','branch','Real-World Storytelling','cat-mind','cat-mind','love',NULL,'{"description":"Use narrative structure to explain real people, businesses, brands, decisions, and lived events clearly and memorably.","leaves":["business stories","brand narrative","case framing","spoken explanation","story structure"],"contrast_hook":"No fiction craft, screenwriting, or vague inspiration about finding your voice."}',datetime('now')),
  ('dark','branch','Deceptive Design & Choice Architecture','cat-tools','cat-tools','love',NULL,'{"description":"Understand how interfaces steer choices, where persuasion becomes deception, and how to design autonomy-preserving alternatives.","leaves":["deceptive patterns","choice architecture","consent design","behavioral UX","consumer protection"],"contrast_hook":"Use Mathur and ProPublica-style deceptive-pattern analysis; exclude Harry Brignull framing and decorative UX commentary."}',datetime('now')),
  ('rel','branch','Relationships & Small-Group Dynamics','cat-life','cat-life','love',NULL,'{"description":"Build trust, read group behavior, set boundaries, and handle conflict across friends, coworkers, rivals, and close relationships.","leaves":["trust","friend-group dynamics","boundaries","conflict repair","social capital"],"contrast_hook":"No demographic-mismatched lifestyle advice or generic happiness content."}',datetime('now')),
  ('business-prelaunch','branch','Small-Business Foundations','cat-money','cat-money','love',NULL,'{"description":"Learn what to know and do before opening a real small business: validate demand, shape the offer, price it, operate simply, and protect cash.","leaves":["customer discovery","offer and pricing","first customers","cash flow","simple operations"],"contrast_hook":"Prefer boring, local, practical business mechanics; avoid monopoly theses, venture theater, SaaS growth jargon, and trend hype."}',datetime('now')),
  ('neg','branch','Negotiation & Sales','cat-money','cat-money','love',NULL,'{"description":"Prepare, uncover interests, make offers, protect boundaries, and reach durable agreements with customers, workers, suppliers, and partners.","leaves":["BATNA and preparation","interests and positions","offers and trade-offs","difficult conversations","ethical selling"],"contrast_hook":"No aggressive closing scripts, coercion, executive deal-room theater, or legal-specialist content."}',datetime('now')),
  ('fina','branch','Behavioral Finance','cat-money','cat-money','love',NULL,'{"description":"Understand how psychology, incentives, uncertainty, and social behavior shape personal and market financial decisions.","leaves":["loss aversion","mental accounting","market behavior","risk perception","money decisions"],"contrast_hook":"No trading hype, stock tips, generic budgeting advice, or repeated summaries of mastered books."}',datetime('now')),
  ('systems-thinking','branch','Systems Thinking','cat-tools','cat-tools','love',NULL,'{"description":"Explain behavior through boundaries, relationships, feedback, stocks and flows, delays, leverage, and unintended consequences, then apply the model to real problems.","leaves":["feedback loops","stocks and flows","system boundaries","leverage points","system dynamics"],"contrast_hook":"No diagram theater, shallow lists of mental models, or complexity without a concrete recurring problem."}',datetime('now')),
  ('pkm','branch','Personal Knowledge Systems','cat-tools','cat-tools','love',NULL,'{"description":"Design durable capture, reading, note, retrieval, and knowledge-organization workflows across Learning Compass, Obsidian, and related tools.","leaves":["capture systems","note architecture","retrieval","reading workflows","knowledge maps"],"contrast_hook":"No productivity cosplay, vault aesthetics without retrieval value, or tools that add ceremony without leverage."}',datetime('now')),
  ('linux-automation','branch','Linux & Automation','cat-tools','cat-tools','love',NULL,'{"description":"Build reliable Fedora, GNOME, Wayland, shell, and local automation workflows that remove repetitive work and remain understandable.","leaves":["Fedora","GNOME and Wayland","shell automation","local services","reliable tooling"],"contrast_hook":"No distro-war content, generic command lists, or opaque automation that is harder to maintain than the task."}',datetime('now')),
  ('visual-learning','branch','Visual Learning & Educational UX','cat-tools','cat-tools','love',NULL,'{"description":"Make difficult material easier to understand through information design, explanatory visuals, interaction, Arabic reading companions, and usable learning interfaces.","leaves":["information design","explanatory diagrams","educational UX","Arabic reading design","visual explanation"],"contrast_hook":"No AI-slop dashboards, decorative mockups, repeated cards, or visuals that do not clarify a relationship."}',datetime('now')),
  ('ment','branch','Mental Health','cat-body','cat-body','love',NULL,'{"description":"Understand mental health mechanisms and practical self-care through credible clinical and research-grounded material suited to Mahmood''s context.","leaves":["anxiety and mood","attention","stress","self-observation","when to seek help"],"contrast_hook":"No generic wellbeing encouragement, demographic mismatch, diagnosis-by-content, or motivational gurus."}',datetime('now')),
  ('self','branch','Attention, Sleep & Self-Regulation','cat-body','cat-body','love',NULL,'{"description":"Understand attention, sleep, energy, and self-regulation deeply enough to design realistic daily conditions and notice what actually changes performance.","leaves":["sleep architecture","attention control","environment design","self-tracking","recovery"],"contrast_hook":"Dopamine and habit-loop neuroscience are already mastered; reject rewiring claims and generic lifestyle basics."}',datetime('now')),
  ('life','branch','Mortality & Life Design','cat-life','cat-life','love',NULL,'{"description":"Use existential and philosophical work on death, meaning, trade-offs, and finitude to make clearer life decisions.","leaves":["terror management theory","Becker","Kierkegaard","meaning","finite-time decisions"],"contrast_hook":"Theoretical and philosophical only; no palliative-care, clinical dying, or sentimental lifestyle framing."}',datetime('now')),
  ('practical-life','branch','Practical Life Skills','cat-life','cat-life','love',NULL,'{"description":"Build concrete competence in high-value everyday skills such as first aid, safety, household decisions, and other abilities with real consequences.","leaves":["CPR and AED","first aid","personal safety","practical maintenance","emergency readiness"],"contrast_hook":"No survivalist theater, low-stakes life hacks, or advice without an authoritative procedure."}',datetime('now')),
  ('creat','branch','Applied Creativity','cat-tools','cat-tools','love',NULL,'{"description":"Generate, combine, test, and ship useful ideas in products, explanations, and personal projects through concrete creative methods.","leaves":["idea generation","creative constraints","remixing","prototype thinking","creative systems"],"contrast_hook":"Practical making only; no art-for-art framing, generic inspiration, or repeated Steal Like an Artist summaries."}',datetime('now'))
ON CONFLICT(id) DO UPDATE SET type='branch',label=excluded.label,super_category=excluded.super_category,parent_id=excluded.parent_id,status=excluded.status,round_label=NULL,meta_json=excluded.meta_json,updated_at=datetime('now');

-- The rebuilt map starts neutral. Priorities below are explicit; ordinary branches
-- must not masquerade as user love/taste signals.
UPDATE tree_nodes SET status='active',updated_at=datetime('now') WHERE id IN (
  'cat-faith','cat-mind','cat-money','cat-tools','cat-life','cat-body',
  'taz','pil','hadith-verification','fiqh','persu','pwr','dec','story','dark','rel',
  'business-prelaunch','neg','fina','systems-thinking','pkm','linux-automation',
  'visual-learning','ment','self','life','practical-life','creat'
);
-- Former test expansions remain searchable topics but no longer crowd the personal branch layer.
UPDATE tree_nodes SET type='leaf',parent_id='dec',super_category='cat-mind' WHERE id='cog-bias';
UPDATE tree_nodes SET type='leaf',parent_id='pwr',super_category='cat-mind' WHERE id IN ('meme','prop','personal-influence---defense-mshye9uo');
UPDATE tree_nodes SET type='leaf',parent_id='rel',super_category='cat-life' WHERE id='small-group-dynamics-mshye9j6';
UPDATE tree_nodes SET type='leaf',parent_id='pil',super_category='cat-faith' WHERE id IN ('-------------------------mskkzno3','r2-sunni-usul-legal-mechanics');
UPDATE tree_nodes SET type='leaf',parent_id='pil',super_category='cat-faith' WHERE id='----------------------mskkzrzv';
UPDATE tree_nodes SET type='leaf',parent_id='taz',super_category='cat-faith' WHERE id='r1-islamic-sunnah-khutbah';
UPDATE tree_nodes SET type='leaf',parent_id='business-prelaunch',super_category='cat-money' WHERE id='start' OR id LIKE 'biz-%';
UPDATE tree_nodes SET type='leaf',parent_id='neg',super_category='cat-money' WHERE id='negotiation-foundations' OR id LIKE 'neg-%';
UPDATE tree_nodes SET type='leaf',parent_id='neg',super_category='cat-life' WHERE id='nonviolent-action-individual' OR id LIKE 'nva-%';
UPDATE tree_nodes SET type='leaf',parent_id='persu',super_category='cat-mind' WHERE id='negotiation/sales';
UPDATE tree_nodes SET parent_id='linux-automation',super_category='cat-tools' WHERE parent_id='practical-ai';
UPDATE tree_nodes SET type='leaf',parent_id='linux-automation',super_category='cat-tools',status='active' WHERE id='practical-ai';

CREATE TABLE IF NOT EXISTS branch_rebuild_map_0047 (old_id TEXT PRIMARY KEY,new_id TEXT NOT NULL);
DELETE FROM branch_rebuild_map_0047;
INSERT OR REPLACE INTO branch_rebuild_map_0047 (old_id,new_id) VALUES
  ('ai-news-feed','systems-thinking'),('practical-ai','linux-automation'),('contrarian-strategy','business-prelaunch'),('fina-ariely','fina'),
  ('general','persu'),('lf-cialdini-presuasion','persu'),('mort-exist','life'),
  ('persu-reciprocity','persu'),('Organizational Dynamics & Power','pwr');
INSERT OR REPLACE INTO branch_rebuild_map_0047 (old_id,new_id)
SELECT id,parent_id FROM tree_nodes
WHERE type='leaf' AND parent_id IN (
  'taz','pil','hadith-verification','fiqh','persu','pwr','dec','story','dark','rel',
  'business-prelaunch','neg','fina','systems-thinking','pkm','linux-automation',
  'visual-learning','ment','self','life','practical-life','creat'
);

UPDATE recommendation_meta SET branch_id=COALESCE((SELECT new_id FROM branch_rebuild_map_0047 WHERE old_id=recommendation_meta.branch_id),branch_id);
UPDATE notes SET branch_id=COALESCE((SELECT new_id FROM branch_rebuild_map_0047 WHERE old_id=notes.branch_id),branch_id);
UPDATE srs_cards SET branch=COALESCE((SELECT new_id FROM branch_rebuild_map_0047 WHERE old_id=srs_cards.branch),branch);
UPDATE srs_drafts SET branch=COALESCE((SELECT new_id FROM branch_rebuild_map_0047 WHERE old_id=srs_drafts.branch),branch);
UPDATE source_annotations SET branch_id=COALESCE((SELECT new_id FROM branch_rebuild_map_0047 WHERE old_id=source_annotations.branch_id),branch_id);
UPDATE session_consumption_log SET branch_id=COALESCE((SELECT new_id FROM branch_rebuild_map_0047 WHERE old_id=session_consumption_log.branch_id),branch_id);
UPDATE compass_candidates SET branch_id=COALESCE((SELECT new_id FROM branch_rebuild_map_0047 WHERE old_id=compass_candidates.branch_id),branch_id);
UPDATE discovery_runs SET selected_branch_id=COALESCE((SELECT new_id FROM branch_rebuild_map_0047 WHERE old_id=discovery_runs.selected_branch_id),selected_branch_id);

-- Assign every previously unmapped production record to its real personal branch.
INSERT INTO recommendation_meta (recommendation_id,branch_id,learning_state,updated_at)
SELECT r.id,
  CASE r.id
    WHEN 'book_1785859663068_82o0b' THEN 'fina'
    WHEN 'cap_1786485354926_e5acdc' THEN 'dark'
    WHEN 'cap_1786847814836_763a34' THEN 'systems-thinking'
    WHEN 'cap_1786847819043_8fc1c6' THEN 'neg'
    WHEN 'cap_1787112287194_d5c0ca' THEN 'linux-automation'
    WHEN 'cap_1787112288220_e43fa7' THEN 'systems-thinking'
    WHEN 'cap_1787112288348_64eada' THEN 'pwr'
    WHEN 'cap_1787112289376_bb5bb1' THEN 'systems-thinking'
    WHEN 'cap_1787112289506_5a5934' THEN 'systems-thinking'
    WHEN 'cap_1785785839505_392a48' THEN 'taz'
    WHEN 'cap_1785867229879_06ddab' THEN 'taz'
    WHEN 'cap_1785870978941_3710b8' THEN 'self'
    WHEN 'rec_1785871538888_abval' THEN 'pwr'
    WHEN 'rec_1785871538888_fxbxf' THEN 'dec'
    WHEN 'cap_1785954275308_17f89f' THEN 'pil'
    WHEN 'cap_1786070970101_8b7b89' THEN 'pwr'
    WHEN 'cap_1786071014577_024df6' THEN 'business-prelaunch'
    WHEN 'cap_1786071044421_935787' THEN 'self'
    WHEN 'cap_1786071087523_e9c5e1' THEN 'taz'
    WHEN 'cap_1786071114590_4793f1' THEN 'fiqh'
    WHEN 'cap_1786104194683_1e9c48' THEN 'fiqh'
    WHEN 'cap_1786285614594_3601d3' THEN 'fina'
    WHEN 'cap_1786285616318_0b75c1' THEN 'systems-thinking'
    WHEN 'cap_1786286494529_87341a' THEN 'linux-automation'
    WHEN 'rec_1785259958577_f3v4n' THEN 'life'
    WHEN 'cap_1785339654888_560f12' THEN 'self'
    WHEN 'cap_rec_tazkiyah_01' THEN 'taz'
    WHEN 'cap_rec_behfin_02' THEN 'fina'
    WHEN 'cap_1785342848194_127e7a' THEN 'dec'
    WHEN 'cap_1785420387141_fc664c' THEN 'self'
    WHEN 'cap_1785420397580_48de71' THEN 'self'
    WHEN 'cap_1785420398851_337ac2' THEN 'life'
    WHEN 'cap_1785508928487_c35372' THEN 'dec'
    WHEN 'cap_1785755957221_2395ae' THEN 'neg'
    WHEN 'cap_1785755975200_a6a991' THEN 'taz'
    WHEN 'cap_1785756051439_38b763' THEN 'self'
    WHEN 'cap_1785786516507_021aae' THEN 'life'
    WHEN 'cap_1785867233680_aeccb4' THEN 'business-prelaunch'
    WHEN 'cap_1786285595727_4920ed' THEN 'practical-life'
    WHEN 'cap_1786285612812_a61f33' THEN 'neg'
    WHEN 'cap_1786285618102_0a2ca0' THEN 'business-prelaunch'
    WHEN 'cap_1786490859235_e3f7ea' THEN 'visual-learning'
    WHEN 'rec_1786505440065_ccgm9' THEN 'practical-life'
  END,
  CASE WHEN r.status='consumed' THEN 'completed' ELSE COALESCE((SELECT learning_state FROM recommendation_meta WHERE recommendation_id=r.id),'inbox') END,
  datetime('now')
FROM recommendations r
WHERE r.id IN (
  'book_1785859663068_82o0b','cap_1786485354926_e5acdc','cap_1786847814836_763a34','cap_1786847819043_8fc1c6',
  'cap_1787112287194_d5c0ca','cap_1787112288220_e43fa7','cap_1787112288348_64eada','cap_1787112289376_bb5bb1','cap_1787112289506_5a5934',
  'cap_1785785839505_392a48','cap_1785867229879_06ddab','cap_1785870978941_3710b8','rec_1785871538888_abval','rec_1785871538888_fxbxf',
  'cap_1785954275308_17f89f','cap_1786070970101_8b7b89','cap_1786071014577_024df6','cap_1786071044421_935787','cap_1786071087523_e9c5e1',
  'cap_1786071114590_4793f1','cap_1786104194683_1e9c48','cap_1786285614594_3601d3','cap_1786285616318_0b75c1','cap_1786286494529_87341a',
  'rec_1785259958577_f3v4n','cap_1785339654888_560f12','cap_rec_tazkiyah_01','cap_rec_behfin_02','cap_1785342848194_127e7a',
  'cap_1785420387141_fc664c','cap_1785420397580_48de71','cap_1785420398851_337ac2','cap_1785508928487_c35372','cap_1785755957221_2395ae',
  'cap_1785755975200_a6a991','cap_1785756051439_38b763','cap_1785786516507_021aae','cap_1785867233680_aeccb4','cap_1786285595727_4920ed',
  'cap_1786285612812_a61f33','cap_1786285618102_0a2ca0','cap_1786490859235_e3f7ea','rec_1786505440065_ccgm9'
)
ON CONFLICT(recommendation_id) DO UPDATE SET branch_id=excluded.branch_id,updated_at=datetime('now');

UPDATE recommendation_outcomes
SET branch_id=(SELECT branch_id FROM recommendation_meta WHERE recommendation_id=recommendation_outcomes.recommendation_id)
WHERE EXISTS (SELECT 1 FROM recommendation_meta WHERE recommendation_id=recommendation_outcomes.recommendation_id);
UPDATE recommendations
SET branch=(SELECT n.label FROM recommendation_meta m JOIN tree_nodes n ON n.id=m.branch_id WHERE m.recommendation_id=recommendations.id)
WHERE EXISTS (SELECT 1 FROM recommendation_meta m JOIN tree_nodes n ON n.id=m.branch_id WHERE m.recommendation_id=recommendations.id);

DELETE FROM priorities;
INSERT INTO priorities (rank,branch_id,label,rationale) VALUES
  (1,'taz','Tazkiyah & Character','Mahmood''s first durable learning priority.'),
  (2,'hadith-verification','Hadith Verification','Verification before accepting or sharing religious claims.'),
  (3,'systems-thinking','Systems Thinking','A reusable method for understanding and changing complex situations.'),
  (4,'business-prelaunch','Small-Business Foundations','Current practical preparation before opening a real business.'),
  (5,'persu','Persuasion & Influence','High-value personal, social, and commercial communication skill.');

DELETE FROM taste_vectors
WHERE topic IN (SELECT id FROM tree_nodes) OR topic IN (SELECT old_id FROM branch_rebuild_map_0047);
UPDATE profile_assertions SET status='inactive',updated_at=datetime('now')
WHERE assertion_key LIKE 'user.profile.branch_preference.%' AND status!='inactive';
DELETE FROM branch_evidence;
DELETE FROM branch_exploration;
UPDATE profile SET recent_signal=NULL,last_synced_at=datetime('now') WHERE id=1 AND recent_signal LIKE 'Branch decisions:%';

DROP TABLE branch_rebuild_map_0047;
