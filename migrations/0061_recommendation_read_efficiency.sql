-- Support bounded recommendation enrichment without scanning all recall cards.
CREATE INDEX IF NOT EXISTS idx_srs_cards_recommendation_due ON srs_cards(recommendation_id, due_at);
