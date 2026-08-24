-- Retire synthetic R1/R2/R3 round labels across knowledge tree and recommendation records.
-- Branches are organized strictly by Domain (super_category), Branch, and Leaves.

UPDATE tree_nodes SET round_label = NULL WHERE round_label IS NOT NULL;

UPDATE tree_nodes
SET label = TRIM(REPLACE(REPLACE(REPLACE(label, '[R1]', ''), '[R2]', ''), '[R3]', ''))
WHERE label LIKE '%[R1]%' OR label LIKE '%[R2]%' OR label LIKE '%[R3]%';

UPDATE recommendations SET round = NULL WHERE round IS NOT NULL AND round != '';
