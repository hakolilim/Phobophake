# OrenjiNeko Privacy Policy

Last updated: November 21, 2026.

## Scope and Contact

OrenjiNeko is a Discord bot that provides Vietnamese word-chain games, counting games, and AI chat. This policy explains how data is processed when you use the bot and its accompanying web pages.

The bot is maintained by hakolilim. For questions, incident reports, or requests concerning your data, please contact the maintainer directly through the [Support Discord Server](https://discord.gg/NC7Ks2c5wE). The source code is available on [GitHub Phobophake](https://github.com/hakolilim/Phobophake).

## Data the Bot Processes

- **Servers and channels:** server IDs, game channel IDs, game modes, and Premium status. Server names, icons, and member counts may be read from Discord to display server information.
- **Word-chain players:** user IDs, display names, avatar URLs, and ranking statistics for each server. In an active game channel, the bot may create or update a ranking profile while processing a message, even if that message is not a valid word.
- **Game state:** the words used in the current word-chain round and the most recent player's ID and name; the current count and the most recent player's ID in a counting channel.
- **Message content:** the bot reads messages in channels it can access to recognize commands and run games. It does not store complete chat histories in its database; valid words in the current round are stored to check for duplicates and restore game state.
- **Word reports and suggestions:** the word, reason, submitter's username, and server name, ID, and icon are sent to a review channel on Discord. The bot may send the submitter a direct message with the outcome. Approved words are stored in the shared dictionary or blacklist.
- **Statistics and logs:** dictionary lookup counts, words played, and rounds played. Operational logs may contain server, channel, and user names, command names, words played, and error information for troubleshooting.

## Using the /ai Command

The bot sends your question, system instructions (default or supplied by you), and context from up to **10 recent messages** preceding the command in the channel to the AI provider configured by the operator. This context may include other users' messages and earlier bot replies, together with the senders' display names.

The bot may send up to **4 of the most recent images** in that context as URLs, including image attachments and images or thumbnails from embeds or link previews. The AI provider may access those URLs to process the images. If the model does not support images, the bot may retry using text only.

Your question and the answer are **public in the channel by default**. Set `visible:false` to make the Discord response visible only to you; this setting still sends the same context to the AI provider. Do not include passwords, tokens, sensitive information, or data you are not authorized to share in your question or its context. Server administrators should restrict the bot's channel access if they do not want a channel's content used as AI context.

The bot does not save AI conversations to Supabase. Responses are sent through Discord, and the AI provider applies its own retention and processing policies. The provider may change with the operator's configuration. Contact the maintainer in the support server to identify the current provider and applicable policies before sending data.

## Purposes and Third-Party Processing

Data is used to operate games, restore game state, display rankings and statistics, review words, provide AI responses, and handle errors or support requests. We do not sell personal data or use it for advertising.

- **Discord** processes messages, interactions, files, and content displayed on its platform under the [Discord Privacy Policy](https://discord.com/privacy).
- **Supabase (Postgres)** stores configuration, game state, rankings, the dictionary, the blacklist, statistics, and Premium status. Data is also loaded into memory on the server running the bot.
- **The configured AI provider** receives the data described in the `/ai` section when that command is used.
- **Hosting services** process operational activity and may retain technical logs. Data may also be disclosed when necessary to meet applicable legal obligations.

Leaderboards display players' names, avatars, and statistics to viewers in the server. Reports can be viewed by people who have access to the review channel. The public status page displays bot information and aggregate statistics, rather than individual player lists.

## Retention and Deletion

Configuration and ranking data are retained so the bot can continue operating across restarts. There is currently no automatic deletion after a fixed retention period. Word-chain game state is reset when a new round begins. Disabling a channel with `/unset-channel` deletes that channel's game configuration and state, but does not delete the server's rankings.

When `/leave` completes successfully, the bot deletes the selected server's channel configuration, game state, rankings, and Premium status before leaving. Simply kicking the bot from a server does not trigger this deletion process. The shared dictionary, blacklist, and global aggregate statistics are not deleted on a per-server basis.

You may request access to, correction of, or deletion of data relating to you by contacting the maintainer through the [Support Discord Server](https://discord.gg/NC7Ks2c5wE). Please provide the relevant user ID and server ID to help verify your request and locate the data; never send passwords or tokens. The bot does not currently offer a self-service command to delete an individual user's data.

Deleting data from the bot's database does not automatically delete messages, reports, or replies already on Discord, data retained by an AI provider, or backups and logs managed by infrastructure services. The maintainer will clarify the scope and any limitations when handling your request.

## Website and Security

The accompanying status, word suggestion, and policy pages do not require sign-in. The current source code does not set tracking cookies or integrate advertising or analytics tools. Hosting or proxy services may record IP addresses, requested URLs, and technical request information in their own logs.

Database and API credentials are configured on the server side. We seek to limit data access to operational needs, but cannot guarantee absolute security of systems or communications. If you discover a data leak or misuse, please report it to the maintainer through the support server.

## Policy Updates

Updated versions are published in this document and on the `/privacy-policy` page with a revised update date. Significant changes will be announced in the support server. See also the [Terms of Service](TERMS_OF_SERVICE.md).
