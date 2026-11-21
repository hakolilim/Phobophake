const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js')

const helpEmbed = () => new EmbedBuilder()
    .setColor(0xf97316)
    .setTitle('OrenjiNeko — Hướng dẫn sử dụng')
    .setDescription('Nối từ tiếng Việt, đếm số và trò chuyện với AI ngay trong Discord.')
    .addFields(
        {
            name: 'Cài đặt kênh trò chơi',
            value: '`/set-channel channel:#kênh` để chơi nối từ; chọn `bot_mode:True` để nối với bot hoặc `bot_mode:Couting` để đếm số. Có thể cài nhiều kênh trong một máy chủ. Cần quyền **Quản lý máy chủ (MANAGE_GUILD)**.'
        },
        {
            name: 'Cách chơi nối từ',
            value: 'Gõ `!start` trong kênh đã cài đặt. Mỗi lượt gửi một cụm **2 tiếng**, tiếng đầu trùng tiếng cuối của từ trước; không dùng lại từ trong ván và không đi hai lượt liên tiếp. Ví dụ: `học sinh` → `sinh nhật`. Từ phải có trong từ điển và không bị chặn. Người đi cuối thắng khi không còn từ hợp lệ để nối; bot tự mở ván mới.'
        },
        {
            name: 'Bắt đầu hoặc đặt lại ván',
            value: '`!start` bắt đầu nếu chưa có ván; `!stop` kết thúc ván đang chạy và **bắt đầu ván mới**. Mọi thành viên có thể gửi tin nhắn trong kênh nối từ đều dùng được; hãy tránh đặt lại ván khi người khác đang chơi.'
        },
        {
            name: 'Cách chơi đếm số',
            value: 'Sau khi bật chế độ **Couting**, gửi `1`, `2`, `3`… và luân phiên người đếm. Đếm sai hoặc một người đếm hai lần liên tiếp sẽ đặt lại về **0**. Không cần `!start`; trò chơi này không có bảng xếp hạng.'
        },
        {
            name: 'Xếp hạng và thông tin',
            value: '`/rank`: bảng xếp hạng nối từ của máy chủ.\n`/me`: thống kê nối từ cá nhân trong máy chủ.\n`/stats`: thống kê toàn bot.\n`/server`: thông tin máy chủ và trạng thái Premium.\n`/ping`: kiểm tra độ trễ. `/help`: xem hướng dẫn này.'
        },
        {
            name: 'Báo cáo hoặc đề xuất từ',
            value: '`/report word:<cụm từ> type:report reason:<lý do>` để báo từ không phù hợp; chọn `type:add` để đề xuất từ mới. Cụm từ cần đúng 2 tiếng. Tính năng cần kênh báo cáo được cấu hình; người duyệt xử lý tại đó và bot có thể nhắn riêng kết quả cho bạn.'
        },
        {
            name: 'Trò chuyện với AI',
            value: '`/ai message:<câu hỏi> [system:<chỉ dẫn>] [visible:false]` (khi AI được cấu hình). Bot gửi câu hỏi cùng tối đa **10 tin nhắn gần nhất và 4 ảnh** trong kênh tới nhà cung cấp AI. Phản hồi có LaTeX sẽ kèm **ảnh preview công thức** sau khi soạn xong. Phản hồi **công khai mặc định**; `visible:false` chỉ ẩn phản hồi với người khác, vẫn gửi ngữ cảnh. Tránh chia sẻ thông tin nhạy cảm và kiểm tra lại câu trả lời.'
        },
        {
            name: 'Tắt kênh hoặc cho bot rời máy chủ',
            value: '`/unset-channel channel:#kênh`: xoá cấu hình và trạng thái trò chơi của kênh. `/leave`: xoá cấu hình, trạng thái trò chơi, xếp hạng và Premium của máy chủ hiện tại rồi cho bot rời. Cả hai cần **MANAGE_GUILD**. Lệnh prefix tương đương cho kênh hiện tại: `?phobo set`, `?phobo unset`.'
        },
        {
            name: 'Công cụ tại kênh báo cáo',
            value: '`/unblacklist word:<từ> action:check`: kiểm tra từ bị chặn; `action:remove` để gỡ (gỡ cần **MANAGE_GUILD**). `/broadcast message:<nội dung>`: gửi tới mọi kênh nối từ và đếm số đã cài, mọi thành viên trong kênh báo cáo đều dùng được. `/leave guild:<ID hoặc tên>`: chọn máy chủ khác cho bot rời (cần **MANAGE_GUILD** tại máy chủ gọi lệnh).'
        },
        {
            name: 'Hỗ trợ và mã nguồn',
            value: 'Liên hệ người duy trì **hakolilim** tại [Support Discord Server](https://discord.gg/NC7Ks2c5wE).\n[Mã nguồn OrenjiNeko](https://github.com/hakolilim/Phobophake)'
        },
        {
            name: 'Chính sách và điều khoản',
            value: '[Chính sách quyền riêng tư](https://github.com/hakolilim/Phobophake/blob/main/PRIVACY_POLICY.md) · [Điều khoản dịch vụ](https://github.com/hakolilim/Phobophake/blob/main/TERMS_OF_SERVICE.md)'
        }
    )

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Xem hướng dẫn sử dụng OrenjiNeko'),
    async execute(interaction) {
        await interaction.reply({
            embeds: [helpEmbed()],
            flags: MessageFlags.SuppressNotifications
        })
    }
}
