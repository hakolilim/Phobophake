# CLAUDE.md

## Tổng quan

Đây là một Discord bot tiếng Việt cho trò chơi nối từ (word-chain game). Bot được xây dựng với Node.js + Discord.js 14, lưu trữ toàn bộ dữ liệu dạng file JSON/TXT trong folder `data/` mà không sử dụng database chính thức.

Kiến trúc cơ bản:

- `bot.js` là entrypoint, chứa phần lớn logic game và xử lý `messageCreate`, `interactionCreate`
- `commands/` chứa các slash command (`/help`, `/stats`, `/rank`, `/me`, `/server`, `/report`, `/set-channel`, `/unblacklist`, `/ping`)
- `events/` chứa event handler, hiện tại chỉ có `ready.js` để thiết lập trạng thái bot
- `modules/sync_commands.js` đồng bộ slash commands với Discord khi bot khởi động
- `utils/` chứa các hàm hỗ trợ: `dictionary.js` (quản lý từ điển), `stats.js` (quản lý thống kê), `channel.js` (cấu hình kênh)
- `data/` chứa trạng thái runtime của bot dưới dạng file

## Cấu trúc dữ liệu (`data/` folder)

- `data.json`: cấu hình kênh nối từ theo guild ID
- `word-data.json`: trạng thái ván hiện tại theo channel ID (running status, từ đã nối, người chơi hiện tại)
- `ranking.json`: dữ liệu bảng xếp hạng mỗi server (win count, total count, số từ đúng)
- `query.txt`: counter lượng query/lookup từ điển
- `word-played.txt`: counter lượng từ đã nối
- `round-played.txt`: counter lượng ván đã diễn ra
- `words.txt`: từ điển chính tải từ GitHub (undertheseanlp/dictionary)
- `contribute-words.txt`: từ được đóng góp từ cộng đồng (từ lvdat/phobo-contribute-words)
- `official-words.txt`: tập hợp từ điển chính = `words.txt` + `contribute-words.txt` (loại trừ từ bị report)
- `report-words.txt`: danh sách từ bị report và được chấp nhận (blacklist động)
- `premium-guilds.txt`: danh sách guild có Premium (hiện chưa triển khai logic)

## Luồng game nối từ

Trò chơi được kích hoạt bằng lệnh prefix:

- `!start` - bắt đầu ván nối từ
- `!stop` - kết thúc ván hiện tại và bắt đầu ván mới (yêu cầu quyền `MANAGE_CHANNEL`)
- `?phobo set <channel>` - cấu hình kênh nối từ (yêu cầu quyền `MANAGE_GUILD`)

**Logic kiểm tra từ:**

1. Từ phải có chính xác 2 tiếng (2 từ tách bằng space)
2. Tiếng đầu tiên phải trùng với tiếng cuối cùng của từ trước
3. Từ không được sử dụng lại trong ván hiện tại
4. Từ phải có trong `official-words.txt` (từ điển chính loại trừ blacklist)
5. Nếu không có từ nào khác có thể nối được, bot tính người nước gần nhất thắng cuộc

**Cập nhật dữ liệu khi chơi:**

- Mỗi từ hợp lệ được thêm vào `word-data.json[channelId].words[]`
- `stats.addWordPlayedCount()` tăng counter từ đã nối
- `ranking.json` được cập nhật: cộng `true` và `total` cho người chơi hiện tại
- Khi ván kết thúc: `stats.addRoundPlayedCount()`, `ranking.json` cộng `win` cho người thắng

## Lệnh `/report`

Lệnh `/report` được dùng cho **cả hai mục đích**:

1. **Báo cáo từ không phù hợp** (`type: 'report'`):
   - Từ phải có trong `official-words.txt`
   - Khi được chấp nhận, từ được thêm vào `data/report-words.txt` (blacklist)
   - Từ trong blacklist sẽ bị loại khỏi gameplay
   - Sử dụng `dictionary.addWordToReportList(word)` để lưu

2. **Đề xuất thêm từ mới** (`type: 'add'`):
   - Từ không được có trong `official-words.txt`
   - Khi được chấp nhận, từ được thêm vào `data/official-words.txt`
   - Cập nhật `global.dicData` (từ điển runtime)
   - Sử dụng `dictionary.addWordToDictionary(word)` để lưu

Lệnh yêu cầu có `REPORT_CHANNEL` được cấu hình trong `.env`, nơi mods dùng button để chấp nhận/từ chối.

## Lệnh `/unblacklist`

Lệnh này chỉ dùng được trong `REPORT_CHANNEL` bởi người có quyền `MANAGE_GUILD`:

- `/unblacklist <word> check` - kiểm tra từ có trong blacklist không
- `/unblacklist <word> remove` - gỡ từ khỏi blacklist (lưu vào file, cập nhật `global.dicData`)

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

**Khởi động:**

1. Nếu `data/words.txt` không tồn tại, bot tải từ GitHub: `https://github.com/undertheseanlp/dictionary/raw/master/dictionary/words.txt`
2. Lọc những từ có 2 tiếng, không chứa dấu gạch/ngoặc
3. Tải từ đóng góp từ: `https://github.com/lvdat/phobo-contribute-words/raw/main/accepted-words.txt`
4. Ghi `official-words.txt` = từ điển lọc + từ đóng góp
5. Loại bỏ những từ trong `report-words.txt` từ gameplay

**Runtime:**

- `global.dicData` chứa từ điển được dùng trong gameplay (được lọc loại bỏ từ blacklist)
- `dictionary.getReportWords()` lấy danh sách blacklist từ file

## Cách chạy

```bash
# Cài dependencies
yarn

# Chạy bot
yarn start
# hoặc
node bot
```

## Lưu ý khi sửa code

1. **Xử lý file**: Nhiều hàm trong `bot.js` và `utils/` đọc/ghi trực tiếp JSON/TXT bằng `fs.writeFileSync()` và `require()`, vì vậy khi cập nhật dữ liệu phải đảm bảo file được ghi đúng và các module được reload nếu cần.

2. **Runtime dictionary**: `global.dicData` là từ điển runtime, được khởi tạo khi bot start và cập nhật khi gọi `/unblacklist remove` hoặc khi `/report` được chấp nhận (type: 'add'). Cần cẩn thận với cache của Node.js khi `require()` JSON files.

3. **Slash commands sync**: `modules/sync_commands.js` chỉ tạo/xóa/cập nhật commands dựa trên so sánh tên và description. Nếu thay đổi command structure, cần chạy bot để đồng bộ.

4. **Ranking update**: Mỗi lần người chơi gửi từ đúng, `ranking.json` được cập nhật trực tiếp. Khi cập nhật logic ranking, cần kiểm tra các nơi gọi `updateRankingForUser()` và `initRankDataForUser()`.

5. **Stats tracking**: Query counter được tăng liên tục khi kiểm tra từ điển để theo dõi hiệu năng. Khi thay đổi logic kiểm tra từ, có thể ảnh hưởng đến query counter.

6. **Report/Add channels**: Nếu `REPORT_CHANNEL` không cấu hình trong `.env`, lệnh `/report` và `/unblacklist` sẽ báo lỗi. Lệnh `/unblacklist` chỉ dùng được trong report channel cụ thể.

7. **Blacklist filtering**: Mỗi lần `messageCreate`, danh sách blacklist được load từ file và lọc khỏi `global.dicData`. Nếu có nhiều tin nhắn cùng lúc, điều này có thể gây hiệu suất kém. Cân nhắc cache nếu cần optimize.

8. **Múi giờ**: Nếu cần thêm timestamp, `moment-timezone` đã có trong dependencies.

## Dependencies chính

- `discord.js@14.14.1` - Discord API client
- `dotenv` - load `.env`
- `axios` - fetch từ GitHub
- `moment-timezone` - handle time (nếu cần)
- Chú ý: `mongodb` và `mongoose` có trong dependencies nhưng không được sử dụng trong code hiện tại

## Biến môi trường

```
BOT_TOKEN=...          # Token của Discord bot (bắt buộc)
REPORT_CHANNEL=...     # Channel ID để báo cáo từ (tùy chọn)
CORRECT_EMOJI=✅       # Emoji phản hồi từ đúng (mặc định: ✅)
WRONG_EMOJI=❌         # Emoji phản hồi từ sai (mặc định: ❌)
```
