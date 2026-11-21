// Chờ các lượt đang xử lý xong và chặn lượt mới trong lúc xoá dữ liệu guild.
const active = new Map()
const leaving = new Set()

const beginOperation = (guildId) => {
    if (leaving.has(guildId)) return null
    const operations = active.get(guildId) || new Set()
    active.set(guildId, operations)
    let resolve
    const done = new Promise(done => { resolve = done })
    operations.add(done)
    return () => {
        if (!operations.delete(done)) return
        if (operations.size === 0) active.delete(guildId)
        resolve()
    }
}

const beginLeave = (guildId) => {
    if (leaving.has(guildId)) return null
    leaving.add(guildId)
    return {
        drained: Promise.all(active.get(guildId) || []),
        cancel: () => leaving.delete(guildId)
    }
}

// Cho phép xử lý lại khi bot được mời trở lại guild trong cùng tiến trình.
const allowGuild = (guildId) => leaving.delete(guildId)

module.exports = { beginOperation, beginLeave, allowGuild }
