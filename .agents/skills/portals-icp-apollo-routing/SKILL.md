---
name: portals-icp-apollo-routing
description: Qualify and route Apollo contacts and accounts for Portals ICP, character continuity, conversational nurture, and 25% holdout campaigns. Use when reviewing the Portals ICP eligible-contacts list, assigning Wave 1 lists or sequences, searching for better creative-operations contacts, or maintaining the campaign capacity targets.
---

# Portals Apollo ICP Routing

## Purpose

Review contacts from Apollo's `Portals | ICP | eligible contacts` list in top-of-list order. Review the account and the contact together, route qualified records to the appropriate account/contact lists, and remove processed records from the working source list. Treat this file as the learned qualification policy, not as a generic lead-scoring rubric.

## Apollo IDs

Use list names with the Apollo list tool; IDs are recorded here for verification and browser navigation.

| Type | Name | Apollo ID |
| --- | --- | --- |
| Account | Portals \| ICP \| eligible accounts | `6a8cebee1fec380014ead19f` |
| Account | Portals \| Character continuity \| eligible accounts | `6a8cebf63c6f150018e0c521` |
| Account | creative studios | `6a684ea7ba362e00208f77e1` |
| Account | advertising agency | `6a8ea6985e838c0018ec252d` |
| Account | top prospects | `6a79a54ab626f1000cdb7617` |
| Account | Nurture | `6a7f2907d7cd130018ee56f7` |
| Contact | Portals \| ICP \| eligible contacts | `6a8cebf83c6f150018e0c524` |
| Contact | Portals \| Character continuity \| eligible contacts | `6a8cebfb3c6f150018e0c534` |
| Contact | Portals \| Wave 1 \| conversational \| 2026-08 | `6a8cebf93c6f150018e0c527` |
| Contact | Portals \| Wave 1 \| character continuity \| 2026-08 | `6a8cebf7844f4a000c816b17` |
| Contact | Portals \| Experiment \| 25% holdout contacts \| 2026-08 | `6a8cebfa844f4a0018f08555` |

Sequences:

- Conversational nurture sequence: `6a8cbbf86ac9f400145228d0`
- Problem-focused sequence: character continuity: `6a8cbbf46190360010875b60`
- Default sender: `andreas@hello.portals.works`, email account `6a6a98cbedb2370020f1ecee`

## Capacity And Exclusivity

- Stop processing when all three contact lists are full: conversational Wave 1 = 50, character-continuity Wave 1 = 50, holdout = 50.
- A contact may be in only one Wave 1 list and one sequence. Never place a contact in both Wave 1 lists or both sequences.
- Match the sequence to the Wave 1 list.
- Fortune 1000 contacts go to holdout and receive no sequence. Do not add more holdouts after the holdout list reaches 50.
- Do not create duplicate same-company sequence enrollments when a suitable company contact is already in that sequence. The Nike example is intentionally limited to one holdout contact; select the best creative-operations contact.
- If the intended Wave is full, do not force the contact into the other Wave. Use holdout only while it has capacity; otherwise leave the record unsequenced and remove it from the working source list after the decision.

## Account Qualification

Strong character-continuity account fits include:

- Game studios and game publishers with an identifiable studio or production team.
- VFX, animation, CGI, compositing, post-production, virtual-production, or 3D studios.
- Film-making and film/content production companies, especially where AI, real-time, virtual production, or other digital production signals are present.
- AI-native production companies or studios using AI production tools.

General digital media production can be a conversational fit, but it is not automatically a character-continuity fit. Use AI/digital production tools as a decision signal when there is no stronger game, VFX, animation, filmmaking, or production-studio signal. Filmmaking itself is a valid signal; AI is not required for an obvious film, game, VFX, animation, or post-production studio.

Advertising or creative agencies go to `advertising agency`. Add them to ICP account lists only when they also show a clear ICP production/digital fit. Add obvious creative production studios to `creative studios`.

Add an account to `top prospects` when it is a Fortune 1000 company. Keep the account classification separate from the contact route: a qualifying content or creative team inside a large company can be a valid contact even when the broad company is not a character-continuity account.

Do not qualify an account solely because it has a production-sounding title. Traditional stage/opera/event production, general broadcasting/news, toy companies, construction, manufacturing, food, IT services, and generic business services are generally out. A content/digital production team inside a normally excluded company can qualify only with a clear digital/AI production signal. Broadcasting companies are not a fit by default.

## Contact Qualification And Routing

Prefer contacts responsible for creative operations, content operations, studio operations, production operations, production technology, production management, or the creative/technical pipeline. `Head of Production` and close variants are acceptable only when no more suitable creative-operations contact exists at that company. Search the company for a better operations contact first when the title is merely adjacent.

For a strong character-continuity account and suitable contact:

- Add the account to `Portals | ICP | eligible accounts`, `Portals | Character continuity | eligible accounts`, and `creative studios`.
- Add the contact to `Portals | Character continuity | eligible contacts` and the character-continuity Wave 1 list.
- Enroll only in the character-continuity sequence after the required confirmation summary.

For a general digital media, advertising, film/content production, or conversational prospect:

- Add the relevant account classification, including `advertising agency` when applicable.
- Use the conversational Wave 1 list and conversational sequence when capacity exists.
- If conversational is full, use holdout only if it has capacity and the contact is eligible for holdout; otherwise leave unsequenced.

For a Fortune 1000 company:

- Add the account to `top prospects`.
- Add the contact to holdout, with no Wave 1 list and no sequence.
- Do not create an additional holdout after the holdout reaches 50.

When a contact is a fit but the account is not, do not add the account to ICP account lists. TikTok is the reference case: the contact may be an ICP/conversational contact, but TikTok itself is not an ICP or character-continuity account.

If both contact and account are not a fit, remove the contact from `Portals | ICP | eligible contacts`. In this workflow, “delete” means detach from the working Apollo list; do not hard-delete the Apollo person or account unless separately instructed.

## Operational Workflow

1. Read the current Apollo list from the top, preserving the user's current filters and sort. Ignore Apollo job-change signals.
2. Reconcile each visible contact against existing labels and sequence membership before acting. Recent contacts may already have been processed.
3. Review the account's industry, keywords, size, and production/digital signals. For uncertain companies, use a focused company review. Do not use global people search when the plan blocks it; use the company's People search page instead.
4. If a title is only `Head of Production` or similar, search the company for creative/content/studio operations before selecting that person. Use the existing contact if no more suitable person is available.
5. Apply account and contact labels, then remove the processed contact from the working ICP source list. List removal is reversible; hard deletion is not part of this workflow.
6. Re-check list counts after each batch because Apollo cached counts can lag the write response.
7. Restore the prior Apollo URL and filters when finished. The established filtered view excludes both target sequences:
   `#/lists/6a8cebf83c6f150018e0c524?notEmailerCampaignIds[]=6a8cbbf86ac9f400145228d0&notEmailerCampaignIds[]=6a8cbbf46190360010875b60&page=1`

## Sequence Safety

Before enrollment, search Apollo for the exact sequence name. If multiple sequences match, show all matches and ask which one is intended. Resolve the default sender from Apollo's email-account list; never guess a sender ID.

The sequence tool requires a confirmation summary immediately before enrollment. The summary must state the sender address, sequence name, number of contacts, and whether enrollment is active or paused. Wait for explicit confirmation before adding contacts. Do not use a broad earlier instruction as a substitute for this action-time confirmation, because enrollment can send real email and is irreversible once dispatched.

## Reference Decisions

- Nike: Fortune 1000 contacts go to holdout. Keep only one Nike holdout and search for the best creative-operations contact before choosing it.
- Audacy: treat as general digital media production. Use conversational routing; do not add character-continuity account/contact lists.
- TikTok: the account is not an ICP or character-continuity fit, but a suitable content-operations contact can be an ICP/conversational contact. Do not add duplicate TikTok contacts to sequence.
- Whitewater Films: filmmaking is a fit even without a separate AI signal.
- Skeelo: likely AI production; add to ICP and Nurture while the product continues developing, and search for creative operations first.
- GP: broad company; find a creative-operations contact and route that person to ICP, creative studios, Nurture, and the conversational lane when capacity permits.
- MBC/Odai and Channel 4: content/digital operations can qualify at a broadcaster-like organization only when the specific team shows a real digital-content production fit; do not qualify a general broadcaster by default.
- Traditional stage production, generic broadcast/news, toy-company general roles, events, manufacturing, and unrelated operations are not matches. Content teams inside a toy company can still be reviewed for a specific digital-production fit.
- Revuse, Workweek, and Whisper were rejected. Forevr and OCUS were accepted. When both the contact and account are poor fits, remove the contact from the working list.

