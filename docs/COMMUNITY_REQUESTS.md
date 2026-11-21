# Mattermost read receipts: community requests and design background

Read receipts, Seen check marks and the ability to identify message readers have been discussed repeatedly by Mattermost users. The sources below establish a recurring request; they are not a survey of every forum or a claim that every customer wants the same behavior.

## A multi-year feature request

| Date | Primary community source | What it establishes |
|---|---|---|
| March 2016 | [UserVoice visual read-indication proposal](https://mattermost.uservoice.com/forums/306457-general/suggestions/12595398-implement-a-visual-indication-for-messages-if-and?category_id=149862&page=4&per_page=20) | A longstanding request for message reader visibility and familiar check-mark feedback |
| June 2021 | [WhatsApp-like read receipts, Mattermost GitHub discussion #94](https://github.com/mattermost/community/discussions/94) | Users requested familiar Seen behavior; a Mattermost participant characterized the idea as highly requested, while others raised privacy and opt-out questions |
| March 2023–October 2025 | [Read receipts not available?, official discussion forum](https://forum.mattermost.com/t/read-receipts-not-available/15290) | Users asked about availability. A July 2024 response from Mattermost described strong UserVoice interest during the previous quarter |
| August 2024 onward | [Design Preview: Read receipts for DMs/GMs](https://forum.mattermost.com/t/design-preview-read-receipts-for-dms-gms/19254) | Mattermost shared a design exploration, linked customer requests and competitor research, and received feedback about the need for reader visibility |

Sources reviewed on 2026-11-21. Vote totals and product roadmaps can change, so this guide does not present a live popularity ranking. Availability claims in old discussions are historical; do not use them to infer the capabilities of every current Mattermost edition or release. This plugin is an independent implementation, not an official endorsement or delivery of a Mattermost roadmap item.

## Why Telegram and WhatsApp are useful comparisons

Users already recognize check marks as a compact way to understand whether a message has been seen. This project brings that familiar interaction to Mattermost as **double-check Seen status with named readers**. It uses its own display, client protocol and visibility rules rather than duplicating all behavior of another messaging product.

## Receiving a message is not reading it

A device can receive a post while its user is reading an older part of the channel, working in another app, or keeping the client minimized. Similarly, opening a parent post is not the same as opening its thread replies. This project therefore uses explicit per-message observations instead of treating a channel cursor or message delivery as proof of reading.

See [visibility and receipt architecture](ARCHITECTURE.md) and [paired negative/positive tests](VALIDATION.md).

## Privacy and acknowledgement

Community feedback includes both demand for receipts and concern about pressure, consent and privacy. This plugin has administrator enable/disable and retention controls; these should not be confused with a WhatsApp-style per-user opt-out feature, which is not claimed here. Administrators should explain the behavior and establish an appropriate policy before enabling it.

Automatic Seen status also differs from the explicit acknowledgement of an important or urgent message. Neither a check mark nor a recorded reader proves comprehension, acceptance of an instruction or a completed task.
