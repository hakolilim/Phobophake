# CLAUDE.md

## Tổng quan

Đây là một Discord bot tiếng Việt cho trò chơi nối từ (word-chain game). Bot được xây dựng với Node.js + Discord.js 14, lưu trữ toàn bộ dữ liệu trên **Supabase (Postgres)** để nhiều VPS có thể dùng chung một database (mô hình active–standby).

Kiến trúc cơ bản:

- `bot.js` là entrypoint, chứa phần lớn logic game và xử lý `messageCreate`, `interactionCreate`. Lúc khởi động chạy `bootstrap()` nạp toàn bộ state từ Supabase vào RAM rồi mới `client.login()`.
- `commands/` chứa các slash command (`/help`, `/stats`, `/rank`, `/me`, `/server`, `/report`, `/set-channel`, `/unblacklist`, `/ping`)
- `events/` chứa event handler, hiện tại chỉ có `ready.js` để thiết lập trạng thái bot
- `modules/sync_commands.js` đồng bộ slash commands với Discord khi bot khởi động
- `db/supabase.js` khởi tạo Supabase client (singleton) từ `SUPABASE_URL` + `SUPABASE_KEY`
- `repos/` là tầng truy cập dữ liệu (data access layer), mỗi file quản lý 1 nhóm dữ liệu với cache RAM + write-through xuống Supabase: `words.js`, `config.js`, `gameState.js`, `ranking.js`, `stats.js`, `premium.js`
- `supabase/schema.sql` chứa DDL các bảng, chạy 1 lần trong Supabase SQL Editor

## Kiến trúc dữ liệu (in-memory cache + write-through)

Vì chạy active–standby (mỗi lúc chỉ 1 instance), mỗi repo nạp toàn bộ dữ liệu từ Supabase vào RAM lúc khởi động (gameplay đọc sync nhanh), và mọi mutation cập nhật **cả cache RAM lẫn Supabase**. Khi failover, VPS standby khởi động lại sẽ nạp đầy đủ state từ Supabase.

Các bảng Supabase (xem `supabase/schema.sql`):

- `words` (PK `word`): từ điển chính, seed tự động từ GitHub ở lần chạy đầu nếu rỗng. Quản lý bởi `repos/words.js`.
- `report_words` (PK `word`): blacklist động (từ bị report được chấp nhận). Quản lý bởi `repos/words.js`.
- `guild_config` (PK `guild_id`, cột `channel_id`): cấu hình kênh nối từ. Quản lý bởi `repos/config.js`.
- `game_state` (PK `channel_id`): trạng thái ván hiện tại (`running`, `current_player_id/name`, `words` jsonb). Quản lý bởi `repos/gameState.js`.
- `rankings` (PK `guild_id,user_id`): BXH mỗi server. Cột `true_count` map sang thuộc tính `.true` trong RAM (vì `true` là từ khóa SQL). Quản lý bởi `repos/ranking.js`.
- `global_stats` (PK `key`): 3 counter `query`, `word_played`, `round_played`. Quản lý bởi `repos/stats.js`.
- `premium_guilds` (PK `guild_id`): danh sách guild Premium. Quản lý bởi `repos/premium.js`.

`global.dicData` vẫn là từ điển runtime dùng trong gameplay = `words − report_words`, được build 1 lần khi `words.loadDictionary()` và cập nhật mỗi khi thêm/gỡ blacklist (không filter lại mỗi message như trước).

## Luồng game nối từ

Trò chơi được kích hoạt bằng lệnh prefix:

- `!start` - bắt đầu ván nối từ
- `!stop` - kết thúc ván hiện tại và bắt đầu ván mới (yêu cầu quyền `MANAGE_CHANNEL`)
- `?phobo set <channel>` - cấu hình kênh nối từ (yêu cầu quyền `MANAGE_GUILD`)

**Logic kiểm tra từ:**

1. Từ phải có chính xác 2 tiếng (2 từ tách bằng space)
2. Tiếng đầu tiên phải trùng với tiếng cuối cùng của từ trước
3. Từ không được sử dụng lại trong ván hiện tại
4. Từ phải có trong bảng `words` và không nằm trong blacklist (`global.dicData`)
5. Nếu không có từ nào khác có thể nối được, bot tính người nước gần nhất thắng cuộc

**Cập nhật dữ liệu khi chơi:**

- Mỗi từ hợp lệ: `gameState.recordWord()` thêm vào `game_state.words` và cập nhật người chơi hiện tại
- `stats.addWordPlayedCount()` tăng counter từ đã nối
- `ranking.updateRankingForUser()` cộng `true` và `total` cho người chơi hiện tại
- Khi ván kết thúc: `stats.addRoundPlayedCount()`, `ranking.updateRankingForUser()` cộng `win` cho người thắng

Lưu ý: mọi hàm mutation của repo đều **async** (write-through xuống Supabase) nên cần `await`.

## Lệnh `/report`

Lệnh `/report` được dùng cho **cả hai mục đích**:

1. **Báo cáo từ không phù hợp** (`type: 'report'`):
   - Từ phải có trong từ điển (`dictionary.checkWordIfInDictionary`)
   - Khi được chấp nhận, từ được thêm vào bảng `report_words` (blacklist)
   - Từ trong blacklist sẽ bị loại khỏi `global.dicData`
   - Sử dụng `dictionary.addWordToReportList(word)` (async) để lưu

2. **Đề xuất thêm từ mới** (`type: 'add'`):
   - Từ không được có trong từ điển
   - Khi được chấp nhận, từ được thêm vào bảng `words`
   - Cập nhật `global.dicData` (từ điển runtime)
   - Sử dụng `dictionary.addWordToDictionary(word)` (async) để lưu

Lệnh yêu cầu có `REPORT_CHANNEL` được cấu hình trong `.env`, nơi mods dùng button để chấp nhận/từ chối.

## Lệnh `/unblacklist`

Lệnh này chỉ dùng được trong `REPORT_CHANNEL` bởi người có quyền `MANAGE_GUILD`:

- `/unblacklist <word> check` - kiểm tra từ có trong blacklist không
- `/unblacklist <word> remove` - gỡ từ khỏi blacklist (xóa khỏi bảng `report_words`, cập nhật `global.dicData`)

## Các lệnh khác

- `/help` - hướng dẫn sử dụng bot
- `/stats` - thống kê toàn cầu của bot (query, word-played, round-played)
- `/rank` - bảng xếp hạng nối từ trong server hiện tại
- `/me` - thống kê cá nhân trong server hiện tại
- `/server` - thông tin server (tên, icon, member count, Premium status)
- `/ping` - ping bot
- `/set-channel <channel>` - cấu hình kênh nối từ (yêu cầu quyền `MANAGE_GUILD`)

## Quyền Discord cần thiết

Bot cần các intent sau:

- `Guilds` - để truy cập thông tin server
- `GuildMessages` - để xử lý tin nhắn trong server
- `MessageContent` - để đọc nội dung tin nhắn (bắt buộc cho prefix commands)

## Tải từ điển

**Khởi động (`repos/words.js` → `loadDictionary()`):**

1. Nạp toàn bộ bảng `words` từ Supabase qua phân trang `.range()` (PostgREST giới hạn ~1000 row/request)
2. Nếu bảng `words` rỗng → seed tự động từ GitHub: tải `words.txt` (lọc 2 tiếng, không dấu gạch/ngoặc) + từ đóng góp `accepted-words.txt`, rồi `upsert` theo batch vào bảng `words`
3. Nạp bảng `report_words` (blacklist)
4. Build `global.dicData = words − report_words`

**Runtime:**

- `global.dicData` chứa từ điển được dùng trong gameplay (đã loại blacklist sẵn từ lúc load, cập nhật trực tiếp khi thêm/gỡ blacklist — không filter lại mỗi message)
- `dictionary.getReportWords()` lấy blacklist từ cache RAM

## Cách chạy

```bash
# Cài dependencies
yarn

# Cấu hình .env: BOT_TOKEN, SUPABASE_URL, SUPABASE_KEY (service_role), REPORT_CHANNEL (tùy chọn)
# Chạy supabase/schema.sql trong Supabase SQL Editor 1 lần để tạo bảng

# Chạy bot
yarn start
# hoặc
node bot
```

## Lưu ý khi sửa code

1. **Tầng repo**: Mọi đọc/ghi dữ liệu đi qua `repos/*` (cache RAM + write-through Supabase). Không đọc/ghi file `data/` trực tiếp nữa. Hàm getter là sync (đọc cache); hàm mutation là async (cần `await`).

2. **Runtime dictionary**: `global.dicData` là từ điển runtime, khởi tạo trong `words.loadDictionary()` lúc bootstrap và cập nhật khi gọi `/unblacklist remove` hoặc khi `/report` được chấp nhận. Repo `words.js` tự đồng bộ `global.dicData` khi thêm/gỡ blacklist.

3. **Slash commands sync**: `modules/sync_commands.js` chỉ tạo/xóa/cập nhật commands dựa trên so sánh tên và description. Nếu thay đổi command structure, cần chạy bot để đồng bộ.

4. **Ranking update**: Mỗi lần người chơi gửi từ đúng, `repos/ranking.js` cập nhật cache RAM + upsert vào bảng `rankings`. Khi cập nhật logic ranking, cần kiểm tra các nơi gọi `updateRankingForUser()` và `initRankDataForUser()`. Lưu ý cột DB `true_count` ↔ thuộc tính `.true` trong RAM.

5. **Stats tracking**: Query counter tăng hàng nghìn/lượt nên được tích trong RAM và flush xuống Supabase định kỳ (mỗi 60s + lúc SIGINT/SIGTERM) thay vì ghi mỗi message. `word_played`/`round_played` ghi ngay vì ít. Khi thay đổi logic kiểm tra từ, có thể ảnh hưởng query counter.

6. **Report/Add channels**: Nếu `REPORT_CHANNEL` không cấu hình trong `.env`, lệnh `/report` và `/unblacklist` sẽ báo lỗi. Lệnh `/unblacklist` chỉ dùng được trong report channel cụ thể.

7. **Failover (active–standby)**: Mỗi lúc chỉ chạy 1 instance. Khi chuyển VPS, instance mới `bootstrap()` nạp lại toàn bộ state từ Supabase. Không chạy đồng thời nhiều instance vì cache RAM của chúng sẽ không đồng bộ với nhau (chỉ đồng bộ qua DB lúc khởi động).

8. **Múi giờ**: Nếu cần thêm timestamp, `moment-timezone` đã có trong dependencies.

## Dependencies chính

- `discord.js@14.14.1` - Discord API client
- `@supabase/supabase-js` - Supabase (Postgres) client
- `dotenv` - load `.env`
- `axios` - fetch từ điển từ GitHub (seed lần đầu)
- `moment-timezone` - handle time (nếu cần)
- Chú ý: `mongodb` và `mongoose` có trong dependencies nhưng không được sử dụng trong code hiện tại

## Biến môi trường

```
BOT_TOKEN=...          # Token của Discord bot (bắt buộc)
SUPABASE_URL=...       # URL project Supabase (bắt buộc)
SUPABASE_KEY=...       # Service role key của Supabase (bắt buộc)
REPORT_CHANNEL=...     # Channel ID để báo cáo từ (tùy chọn)
CORRECT_EMOJI=✅       # Emoji phản hồi từ đúng (mặc định: ✅)
WRONG_EMOJI=❌         # Emoji phản hồi từ sai (mặc định: ❌)
```
