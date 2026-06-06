# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working in this repository.

## Tổng quan

Đây là một Discord bot tiếng Việt cho trò chơi nối từ. Ứng dụng chạy bằng một tiến trình Node.js duy nhất và tổ chức theo mô hình:

- `bot.js` là điểm khởi động và cũng chứa phần lớn logic runtime.
- `commands/` chứa các slash command (`/help`, `/stats`, `/rank`, `/me`, `/server`, `/report`, `/set-channel`).
- `events/` chứa các event handler của Discord, hiện chủ yếu là `ready`.
- `modules/sync_commands.js` đồng bộ slash commands với Discord khi bot khởi động.
- `utils/` chứa các hàm hỗ trợ cho kênh, từ điển và thống kê.
- `data/` là trạng thái bền vững của bot; nhiều file được tạo/ghi trực tiếp trong lúc chạy.

Kiến trúc quan trọng cần nhớ:

- Trò chơi nối từ không dùng database chính thức; trạng thái server, người chơi, lượt chơi và thống kê được lưu trong các file JSON/TXT dưới `data/`.
- `bot.js` nạp danh sách từ điển, nạp từ cộng đồng, rồi xử lý cả `messageCreate` lẫn `interactionCreate`.
- Mỗi guild chỉ có một kênh chơi nối từ được cấu hình trong `data/data.json`.
- Lượt chơi được quản lý qua `data/word-data.json`; bảng xếp hạng qua `data/ranking.json`; các chỉ số tổng hợp qua `data/query.txt`, `data/word-played.txt`, `data/round-played.txt`.
- Danh sách từ báo cáo và premium cũng được đọc/ghi từ file riêng trong `data/`.

## Lệnh thường dùng

- Cài dependencies: `yarn`
- Chạy bot: `yarn start`
- Chạy bot trực tiếp: `node bot`
- Lint nhẹ theo cấu hình hiện tại: `yarn lint`
- Test nhẹ theo cấu hình hiện tại: `yarn test`
- Chạy một command hoặc module riêng để kiểm tra load/runtime cục bộ: `node -e "require('./commands/stats')"` hoặc `node -e "require('./utils/dictionary')"`

Hiện tại `lint` và `test` đều là kiểm tra tối thiểu bằng cách load entrypoint, vì repo chưa có ESLint hay test framework chuyên dụng.

## Hành vi khởi động

Khi chạy `node bot` hoặc `yarn start`:

- bot đảm bảo các file dữ liệu cần thiết tồn tại trong `data/`
- nếu `data/words.txt` chưa có, bot tải từ nguồn dictionary trên GitHub
- bot tải thêm danh sách từ đóng góp từ GitHub và ghi vào `data/contribute-words.txt` / `data/official-words.txt`
- event `ready` sẽ set activity/status và gọi `modules/sync_commands.js`

## Luồng game nối từ

Luồng chính nằm trong `bot.js`:

- Lệnh prefix nội bộ để điều khiển game: `!start` và `!stop`
- Prefix `?phobo set` cho phép đặt kênh nối từ nếu người dùng có quyền `MANAGE_GUILD`
- Chỉ các tin nhắn trong kênh đã cấu hình mới được xử lý như một nước đi
- Mỗi từ phải là hai tiếng, nối đúng tiếng cuối của từ trước, chưa từng xuất hiện trong ván hiện tại và phải có trong từ điển
- Khi không còn từ tiếp theo hợp lệ, bot tính thắng cuộc, cập nhật thống kê và tự mở ván mới

Điểm cần chú ý khi sửa logic game:

- Nhiều hàm bên trong `messageCreate` đọc/ghi trực tiếp vào file JSON bằng `fs.writeFileSync`
- `dictionary.getReportWords()` được dùng như blacklist động; khi từ bị report được chấp nhận, nó được thêm vào `data/report-words.txt`
- Thống kê tổng hợp được cập nhật qua `utils/stats.js`

## Slash commands

Các command được load tự động bằng cách quét thư mục `commands/` và lấy `command.data.name`.

Các command chính:

- `/help`: hiển thị hướng dẫn sử dụng bot
- `/stats`: thống kê bot toàn cục
- `/rank`: bảng xếp hạng nối từ trong server
- `/me`: thống kê cá nhân trong server
- `/server`: thông tin server và trạng thái Premium
- `/set-channel`: cấu hình kênh nối từ
- `/report`: báo cáo từ không phù hợp; phụ thuộc `REPORT_CHANNEL` trong `.env`

## Quyền và cấu hình môi trường

- `.env` phải có `BOT_TOKEN`
- `REPORT_CHANNEL` là tùy chọn nhưng cần có nếu muốn dùng `/report`
- `/set-channel` yêu cầu `MANAGE_GUILD`
- `!stop` yêu cầu `MANAGE_CHANNEL`
- `bot.js` bật các intent: `Guilds`, `GuildMessages`, `MessageContent`

## Dữ liệu bền vững

Các file trong `data/` là một phần của trạng thái runtime, không chỉ là cache:

- `data/data.json`: cấu hình kênh theo guild
- `data/word-data.json`: trạng thái ván theo channel
- `data/ranking.json`: dữ liệu bảng xếp hạng
- `data/query.txt`: bộ đếm truy vấn
- `data/word-played.txt`: bộ đếm số từ đã nối
- `data/round-played.txt`: bộ đếm số vòng đã diễn ra
- `data/official-words.txt`: từ điển dùng khi kiểm tra nước đi
- `data/report-words.txt`: blacklist từ đã được chấp nhận report
- `data/premium-guilds.txt`: danh sách guild Premium

Khi thay đổi logic liên quan dữ liệu, cần kiểm tra các file liên quan trong `data/` vì nhiều module đang `require(...)` trực tiếp chúng.

## Lưu ý khi chỉnh sửa

- `bot.js` vừa là entrypoint vừa là nơi chứa game loop; thay đổi ở đây dễ ảnh hưởng nhiều luồng runtime.
- `modules/sync_commands.js` chỉ đồng bộ các command hiện có; nếu đổi schema của command, cần xem lại logic so sánh/update.
- Một số command và utility đang đọc dữ liệu bằng `require(rankingPath)` / `require(dataPath)` thay vì đọc lại bằng `fs.readFileSync`, nên hành vi cache của Node.js có thể ảnh hưởng khi sửa runtime state.
- Tên file `readme.md` đang viết thường; nội dung cài đặt từ README nói bot được phát triển với Node.js 20.x và dùng Yarn.
