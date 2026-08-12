-- Pessimistic prior for Thompson-sampled strategy reward (Phase 3, item 9).
-- Deezer's finding: a Beta(1,2) prior (posterior mean 1/3) beats the uniform
-- Beta(1,1) (mean 1/2) for cold-start strategies — it forces a strategy to
-- prove itself against its prior before its feature weights move. Applied only
-- where no explicit evidence has accrued yet, so live strategies keep their
-- already-learned posterior untouched.
UPDATE compass_strategy_priors SET beta = 2.0 WHERE explicit_evidence_count = 0 AND beta = 1.0;
