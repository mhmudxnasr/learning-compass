-- Six historical Riyadh revisions left both old and newer pairs marked ready.
-- Retire only the exact old pairs while a complete newer pair remains ready.
-- Keep all artifacts and R2 objects for recovery; lesson progress is untouched.
WITH revisions(recommendation_id,old_pair_id,current_pair_id) AS (VALUES
  ('cap_1787259547262_650107','lv-cap_1787259547262_650107-2fea6f94-1d846918','lv-cap_1787259547262_650107-8220d4a2-63c2cfff'),
  ('cap_1787440620436_2292b1','lv-cap_1787440620436_2292b1-bd6b7a4e-458ebb25','lv-cap_1787440620436_2292b1-bd6b7a4e-a0aa53cf'),
  ('cap_1787440621487_b5e43b','lv-cap_1787440621487_b5e43b-bc6a4b59-5e5239d2','lv-cap_1787440621487_b5e43b-bc6a4b59-2615f88a'),
  ('cap_1787440622854_a2ad17','lv-cap_1787440622854_a2ad17-583743f3-405ca692','lv-cap_1787440622854_a2ad17-583743f3-d947c8fe'),
  ('cap_1787440624145_4728f2','lv-cap_1787440624145_4728f2-47794153-f10691a3','lv-cap_1787440624145_4728f2-47794153-6fb75593'),
  ('cap_1787440624850_322d77','lv-cap_1787440624850_322d77-16b9920c-d9009693','lv-cap_1787440624850_322d77-16b9920c-4f174afe')
)
UPDATE artifacts AS old SET metadata_json=json_set(old.metadata_json,
  '$.publication_state','superseded',
  '$.visibility_repair','0075_riyadh_legacy_pair_visibility',
  '$.superseded_by_pair_id',(SELECT current_pair_id FROM revisions WHERE old_pair_id=json_extract(old.metadata_json,'$.pair_id')))
WHERE json_extract(old.metadata_json,'$.publication_state')='ready'
  AND COALESCE(json_extract(old.metadata_json,'$.chapter_key'),'')=''
  AND EXISTS (
    SELECT 1 FROM revisions r
    WHERE r.recommendation_id=json_extract(old.metadata_json,'$.recommendation_id')
      AND r.old_pair_id=json_extract(old.metadata_json,'$.pair_id')
      AND NOT EXISTS (SELECT 1 FROM lite_visual_pairs p WHERE p.pair_id=r.old_pair_id)
      AND 2=(SELECT COUNT(DISTINCT json_extract(current.metadata_json,'$.role'))
        FROM artifacts current
        WHERE json_extract(current.metadata_json,'$.recommendation_id')=r.recommendation_id
          AND json_extract(current.metadata_json,'$.pair_id')=r.current_pair_id
          AND COALESCE(json_extract(current.metadata_json,'$.chapter_key'),'')=''
          AND json_extract(current.metadata_json,'$.publication_state')='ready'
          AND json_extract(current.metadata_json,'$.validation_status')='passed'
          AND json_extract(current.metadata_json,'$.role') IN ('html','pdf'))
  );
