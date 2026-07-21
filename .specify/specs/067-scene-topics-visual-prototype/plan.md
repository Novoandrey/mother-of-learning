# Plan: functional dialogue before scene skin

1. Add the narrow `room → permitted speaker → message` migration and RLS reads.
2. Put all writes behind membership-gated server actions; allow the DM voice only to DM/owner and validate the explicit character speaker pool.
3. Add a plain `Сцена` Mini App tab: feed, select, textarea, send; give DM a one-button first-room creation flow.
4. Broadcast compact message-insert events through the established private campaign Realtime channel and re-read under RLS.
5. Verify types, lint, focused tests, then manually send as character and DM.

The visual `prototype.html` is not production code. Portraits, room controls, map/timeline and presence wait for follow-up specs.
