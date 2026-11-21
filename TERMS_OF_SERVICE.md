# OrenjiNeko Terms of Service

Last updated: November 21, 2026.

## Acceptance of These Terms

These terms apply when you add or use OrenjiNeko, a Discord bot providing Vietnamese word-chain games, counting games, and AI chat, and when you use its accompanying web pages. If you do not agree, stop using the bot. Server administrators may disable game channels or have the bot leave their server.

You must meet the age and eligibility requirements in the [Discord Terms of Service](https://discord.com/terms) and comply with the [Discord Community Guidelines](https://discord.com/guidelines), your server's rules, and applicable law. OrenjiNeko is an independent project and is not an official Discord service.

## Features and Administrative Permissions

OrenjiNeko provides word-chain games against other players or the bot, counting games, leaderboards, statistics, word reports and suggestions, and the `/ai` command when configured. Features may depend on Discord permissions, the operator's configuration, and third-party service availability.

The person adding the bot and the server administrators are responsible for choosing appropriate channels, granting suitable permissions, and informing members about how the bot processes data, particularly context used by `/ai`. Configuration commands and `/leave` require the Manage Server permission. Some operational tools are restricted to a designated report channel. Members with access to that channel can use `/broadcast` to send announcements to all configured game channels.

`!start` starts a word-chain round; `!stop` ends an active round and starts a new one. In the current version, both commands can be used by members who can send messages in the game channel. Do not repeatedly reset rounds to disrupt other players.

## Responsible Use

- Do not spam commands, deliberately overload the bot, exploit vulnerabilities, gain unauthorized access, or disrupt the bot or related services.
- Do not use the bot to harass or impersonate others, distribute unlawful content, or violate privacy, intellectual property rights, or community rules.
- Do not manipulate rankings, disrupt games, submit fraudulent reports, or misuse administrative, word review, or broadcast tools.
- Submit only content and images that you are authorized to use, share, and have processed to provide the requested feature.
- Do not provide passwords, tokens, sensitive information, or other people's data that you are not authorized to share.

The maintainer may restrict or discontinue access for users or servers that abuse the service, create security risks, or violate these terms. If you believe a restriction was applied in error, contact the maintainer through the support server to request a review.

## AI Features

When you use `/ai`, your question, system instructions, and context from up to 10 recent channel messages, including up to 4 images, may be sent to an AI provider selected by the operator. Read the [Privacy Policy](PRIVACY_POLICY.md) before using this feature.

Responses are public by default. Setting `visible:false` only limits who can see the response on Discord; it does not prevent context from being sent to the AI provider. Use the command only when you are authorized to share the relevant content. Do not attempt to use the bot to obtain information from channels you are not allowed to access.

AI-generated content may be incorrect, incomplete, or inappropriate. You should verify it before using or sharing it and are responsible for how you use it. Do not rely solely on AI responses for medical, legal, financial, or other important decisions.

## Data and Ending Use

Data processing, retention, and deletion requests are described in the [Privacy Policy](PRIVACY_POLICY.md). You may stop using the bot at any time. Administrators may use `/unset-channel` to disable a channel or `/leave` to delete server-specific data and have the bot leave.

`/leave` deletes the selected server's configuration, game state, rankings, and Premium status. This action cannot be undone through the bot, so consider its consequences before proceeding. The shared dictionary, blacklist, aggregate statistics, and messages already posted on Discord are not deleted by this command. Directly kicking the bot does not automatically delete database records; contact the maintainer if you need assistance.

## Availability and Liability

The bot is provided as is. The maintainer may change, suspend, or discontinue features for maintenance, incident response, or abuse prevention. There is no guarantee that the bot will always be available, be free of errors, or preserve every score and data record in every circumstance.

To the extent permitted by applicable law, the maintainer is not liable for indirect damages arising from service interruptions, data loss, AI-generated content, or users' use of the bot. These terms do not exclude rights or liabilities that cannot be limited under applicable law.

## Source Code

OrenjiNeko's source code is available on [GitHub Phobophake](https://github.com/hakolilim/Phobophake). Copying, modifying, and distributing the source code are governed by the license in the repository; these service terms do not replace that license. People who deploy their own instances are responsible for those deployments and their data policies.

## Changes and Contact

Updated terms are published in this document and on the `/terms-of-service` page with a revised update date. Significant changes will be announced in the support server. If you do not agree with a change, stop using the service.

Maintainer: **hakolilim**. For questions about these terms, support requests, data requests, or requests to review an access restriction, please contact the maintainer directly through the [Support Discord Server](https://discord.gg/NC7Ks2c5wE).
