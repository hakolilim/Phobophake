const axios = require('axios')
const supabase = require('../db/supabase')

const wordDataUrl = 'https://github.com/undertheseanlp/dictionary/raw/master/dictionary/words.txt'
const contributeWordsUrl = 'https://github.com/lvdat/phobo-contribute-words/raw/main/accepted-words.txt'

const PAGE_SIZE = 1000

// cache RAM
let dic = []          // toàn bộ từ điển chính (words)
let reportDic = []    // blacklist (report_words)

/**
 * Đọc toàn bộ một bảng (cột `word`) qua phân trang .range() vì PostgREST
 * giới hạn ~1000 row mỗi request.
 * @param {String} table
 * @returns {Promise<String[]>}
 */
const fetchAllWords = async (table) => {
    const result = []
    let from = 0
    for (;;) {
        const { data, error } = await supabase
            .from(table)
            .select('word')
            .range(from, from + PAGE_SIZE - 1)
        if (error) {
            throw new Error(`Lỗi đọc bảng ${table}: ${error.message}`)
        }
        if (!data || data.length === 0) break
        for (const row of data) result.push(row.word)
        if (data.length < PAGE_SIZE) break
        from += PAGE_SIZE
    }
    return result
}

/**
 * Ghi mảng từ vào bảng theo từng batch (upsert, bỏ qua trùng).
 * @param {String} table
 * @param {String[]} words
 */
const upsertWordsInBatches = async (table, words) => {
    for (let i = 0; i < words.length; i += PAGE_SIZE) {
        const batch = words.slice(i, i + PAGE_SIZE).map(word => ({ word }))
        const { error } = await supabase
            .from(table)
            .upsert(batch, { onConflict: 'word', ignoreDuplicates: true })
        if (error) {
            throw new Error(`Lỗi ghi bảng ${table}: ${error.message}`)
        }
    }
}

/**
 * Tải từ điển từ GitHub và seed vào bảng `words` (chỉ chạy khi bảng rỗng).
 * @returns {Promise<String[]>} danh sách từ đã seed
 */
const seedFromGithub = async () => {
    console.log('[WARNING] Bảng words rỗng. Tải từ điển từ GitHub để seed...')

    const res = await axios.get(wordDataUrl)
    const lines = res.data.trim().split('\n')
    const baseWords = lines
        .map(line => JSON.parse(line).text.toLowerCase())
        .filter(w => w.split(' ').length === 2 && !w.includes('-') && !w.includes('(') && !w.includes(')'))
    console.log(`[OK] Tải ${baseWords.length} từ cơ bản từ GitHub.`)

    let contributeWords = []
    try {
        const cRes = await axios.get(contributeWordsUrl)
        contributeWords = cRes.data.toLowerCase().trim().split('\n').map(w => w.trim()).filter(Boolean)
        console.log(`[OK] Tải ${contributeWords.length} từ đóng góp từ GitHub.`)
    } catch (err) {
        console.log('[ERROR] Không tải được từ đóng góp: ' + err.message)
    }

    const all = Array.from(new Set([...baseWords, ...contributeWords]))
    console.log(`[WARNING] Đang seed ${all.length} từ vào Supabase...`)
    await upsertWordsInBatches('words', all)
    console.log('[OK] Seed từ điển vào Supabase hoàn tất.')
    return all
}

/**
 * Nạp từ điển + blacklist vào RAM. Seed từ GitHub nếu bảng words rỗng.
 * Sau khi xong, set global.dicData = words − report_words.
 */
const loadDictionary = async () => {
    console.log('[WARNING] Đang nạp từ điển từ Supabase...')
    dic = await fetchAllWords('words')

    if (dic.length === 0) {
        dic = await seedFromGithub()
    }

    reportDic = await fetchAllWords('report_words')

    const blackSet = new Set(reportDic)
    global.dicData = dic.filter(w => !blackSet.has(w))
    console.log(`[OK] Nạp ${dic.length} từ, ${reportDic.length} từ trong blacklist. Gameplay dùng ${global.dicData.length} từ.`)
}

/**
 * @param {String} word
 * @returns {Boolean}
 */
const checkWordIfInDictionary = (word) => {
    return dic.includes(word)
}

/**
 * @returns {Number}
 */
const countWordInDictionary = () => {
    return dic.length - reportDic.length
}

/**
 * @returns {String[]} blacklist
 */
const getReportWords = () => {
    return reportDic
}

/**
 * @param {String} word
 * @returns {Boolean}
 */
const checkWordIfInReportDictionary = (word) => {
    return reportDic.includes(word)
}

/**
 * Thêm từ vào blacklist (RAM + DB) và loại khỏi gameplay.
 * @param {String} word
 */
const addWordToReportList = async (word) => {
    if (!reportDic.includes(word)) {
        reportDic.push(word)
    }
    if (global.dicData) {
        global.dicData = global.dicData.filter(w => w !== word)
    }
    const { error } = await supabase
        .from('report_words')
        .upsert({ word }, { onConflict: 'word', ignoreDuplicates: true })
    if (error) {
        console.error('[ERROR] addWordToReportList:', error.message)
    }
}

/**
 * Thêm từ mới vào từ điển chính (RAM + DB).
 * @param {String} word
 */
const addWordToDictionary = async (word) => {
    if (!dic.includes(word)) {
        dic.push(word)
    }
    const { error } = await supabase
        .from('words')
        .upsert({ word }, { onConflict: 'word', ignoreDuplicates: true })
    if (error) {
        console.error('[ERROR] addWordToDictionary:', error.message)
    }
}

/**
 * Gỡ từ khỏi blacklist (RAM + DB) và nạp lại vào gameplay.
 * @param {String} word
 * @returns {Promise<Boolean>} false nếu từ không có trong blacklist
 */
const removeWordFromReportList = async (word) => {
    if (!reportDic.includes(word)) {
        return false
    }
    reportDic = reportDic.filter(item => item !== word)

    if (global.dicData && dic.includes(word) && !global.dicData.includes(word)) {
        global.dicData.push(word)
    }

    const { error } = await supabase
        .from('report_words')
        .delete()
        .eq('word', word)
    if (error) {
        console.error('[ERROR] removeWordFromReportList:', error.message)
        return false
    }
    return true
}

module.exports = {
    loadDictionary,
    checkWordIfInDictionary,
    countWordInDictionary,
    getReportWords,
    checkWordIfInReportDictionary,
    addWordToReportList,
    addWordToDictionary,
    removeWordFromReportList
}
