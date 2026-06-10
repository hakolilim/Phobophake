## Phở Bò | Bot nối từ tiếng Việt
BOT nối từ tiếng Việt trên Discord! | [INVITE ME!](https://discord.com/oauth2/authorize?client_id=1211679955143106670) | [Discord Support Server](https://discord.gg/TFvSWf9SBb)

Toàn bộ dữ liệu (từ điển, cấu hình, bảng xếp hạng, trạng thái ván, thống kê) được lưu trên **Supabase (Postgres)** thay vì file cục bộ, nên nhiều VPS có thể dùng chung một database — thuận tiện cho việc đồng bộ và failover (mô hình *active–standby*: mỗi thời điểm chỉ chạy 1 instance).

## Nguồn ngữ liệu tiếng Việt
> https://github.com/undertheseanlp/dictionary (ngữ liệu chính, có chỉnh sửa để phù hợp với trò chơi)

> https://github.com/lvdat/phobo-contribute-words (ngữ liệu đóng góp bởi cộng đồng ở [Discord Support Server](https://discord.gg/TFvSWf9SBb))

## Cài đặt BOT trên server riêng
> Tham gia vào Discord Support để được hỗ trợ self-hosted Bot.
### Yêu cầu
- Hệ điều hành: `Linux, MacOS, Windows`, có cài đặt:
  - `NodeJS >= 18` (BOT được phát triển trên `NodeJS 20.x`)
  - Có cài đặt gói `yarn` (`npm i -g yarn`)
  - Git
- Một project **Supabase** (miễn phí tại [supabase.com](https://supabase.com))

### Cài đặt
- Clone repo về máy:
```bash
git clone https://github.com/lvdat/bot-noi-tu && cd bot-noi-tu
```
- Cài đặt các gói cần thiết:
```bash
yarn
```
- **Tạo các bảng trên Supabase**: mở **SQL Editor** trong project Supabase, dán toàn bộ nội dung tệp [`supabase/schema.sql`](supabase/schema.sql) và chạy một lần.
- Lấy thông tin kết nối tại **Project Settings → API**:
  - `Project URL` → `SUPABASE_URL`
  - `service_role` key (mục Project API keys) → `SUPABASE_KEY`
  > ⚠️ `service_role` key có toàn quyền truy cập database, chỉ dùng ở phía server và **không** commit lên Git.
- Tạo tệp tin `.env` (tham khảo `.env.example`):
```bash
BOT_TOKEN=...          # TOKEN của BOT trong Discord Developer Portal (bắt buộc)
SUPABASE_URL=...       # URL project Supabase (bắt buộc)
SUPABASE_KEY=...       # service_role key của Supabase (bắt buộc)
REPORT_CHANNEL=...     # Channel ID để báo cáo từ (tùy chọn)
CORRECT_EMOJI=✅       # Emoji phản hồi từ đúng (tùy chọn, mặc định ✅)
WRONG_EMOJI=❌         # Emoji phản hồi từ sai (tùy chọn, mặc định ❌)
```
- Chạy BOT:
```bash
node bot
# hoặc
yarn start
```
> Lần chạy đầu tiên, nếu bảng `words` còn rỗng, BOT sẽ **tự tải từ điển từ GitHub và nạp (~74k từ) vào Supabase**. Quá trình này chỉ diễn ra một lần; các lần sau BOT đọc thẳng từ database.

> Dữ liệu nay nằm hoàn toàn trên Supabase — không cần backup thủ công thư mục `data/` nữa. Việc backup/khôi phục được thực hiện qua chính Supabase.
- Tạo link mời BOT vào máy chủ
  - Trong bảng điều khiển, chọn Tab `Installation` và tích chọn `Guild Install`
    ![image](https://github.com/lvdat/bot-noi-tu/assets/72507371/638fda71-7378-409e-9e23-be04a6b8597a)
  - Ở phần Install Link chọn `Discord Provided Link` và chọn các scope trong phần Default Install Settings như sau
   ![image](https://github.com/lvdat/bot-noi-tu/assets/72507371/c642a73d-e1a5-4c02-86f8-2e9156825f16)
  - Click nút `Copy` ở link phía trên và dán vào trình duyệt để mời BOT!

<details>
  <summary>Trường hợp không có trường Installation hoặc Discord Provided Link</summary>
  
  - Trong bảng điều khiển BOT, chọn Tab `OAuth2`

 ![image](https://github.com/lvdat/bot-noi-tu/assets/72507371/1a83d38d-2d2b-4066-bb9e-fddfa4a6cecc)
 
  - Chọn scope

  ![image](https://github.com/lvdat/bot-noi-tu/assets/72507371/9dba916d-4cf5-4c40-8670-8f7740cc9647)

  - Chọn BOT permission:

  ![image](https://github.com/lvdat/bot-noi-tu/assets/72507371/599a47e7-21e6-40fe-ae58-895509c059e2)

  - Copy URL trong trường `GENERATED URL` và mở trong trình duyệt.
</details>


## Các lệnh của BOT
|          **Lệnh**          |          **Chức năng**          |            **Quyền cần**            |
|:--------------------------:|:-------------------------------:|:----------------------------------:|
| /set-channel <channel>     | Cài đặt kênh chơi nối từ        | `MANAGE_GUILD`                     |
| /help                      | Xem thông tin và các lệnh BOT   |                                    |
| !start                     | Bắt đầu lượt chơi nối từ        |                                    |
| !stop                      | Kết thúc lượt chơi nối từ       | `MANAGE_CHANNEL`                   |
| /stats                     | Xem thống kê của Bot            |                                    |
| /rank                      | Xem BXH nối từ trong máy chủ    |                                    |
| /me                        | Xem thống kê nối từ cá nhân     |                                    |
| /server                    | Xem thông tin máy chủ           |                                    |
| /report <từ> [lí do]       | Báo cáo từ sai / đề xuất từ mới |                                    |
| /unblacklist <từ> [action] | Kiểm tra / gỡ từ khỏi blacklist | `MANAGE_GUILD` (trong report channel) |

## Kiến trúc & dữ liệu

Dữ liệu được tổ chức trong các bảng Supabase (xem [`supabase/schema.sql`](supabase/schema.sql)):

| Bảng | Vai trò |
|---|---|
| `words` | Từ điển chính (seed từ GitHub) |
| `report_words` | Blacklist động (từ bị report) |
| `guild_config` | Kênh nối từ theo từng máy chủ |
| `game_state` | Trạng thái ván hiện tại theo kênh |
| `rankings` | Bảng xếp hạng mỗi máy chủ |
| `global_stats` | Counter `query`, `word_played`, `round_played` |
| `premium_guilds` | Danh sách máy chủ Premium |

BOT nạp toàn bộ dữ liệu vào RAM khi khởi động (đọc nhanh khi chơi) và ghi đồng thời xuống Supabase mỗi khi có thay đổi (*write-through*). Chi tiết kiến trúc xem trong [`CLAUDE.md`](CLAUDE.md).
