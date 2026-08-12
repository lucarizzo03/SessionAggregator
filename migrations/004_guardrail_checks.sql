-- guardrail_fires -> guardrail_checks: the original violations-only shape
-- ({name, turn_idx}) couldn't distinguish "guardrail was pressure-tested
-- and held" from "guardrail was never relevant" — both looked like an
-- empty array. New shape is {name, outcome: "held"|"violated", turn_idx}.
-- Existing rows keep their old (now-stale-shaped) data under the renamed
-- column until re-extracted with ?force=true.
alter table extractions rename column guardrail_fires to guardrail_checks;
