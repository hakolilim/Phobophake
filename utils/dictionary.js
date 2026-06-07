const fs = require('fs')
const path = require('path')

const officalWordsPath = path.resolve(__dirname, '../data/official-words.txt')
const reportWordsPath = path.resolve(__dirname, '../data/report-words.txt')

let dic = []
let reportDic = []

try {
    const dicRead = fs.readFileSync(officalWordsPath, 'utf-8')
    dic = dicRead.toLowerCase().split('\n')
} catch (err) {
    console.error(`Error reading file ${officalWordsPath}:`, err)
}

try {
    const reportDicRead = fs.readFileSync(reportWordsPath, 'utf-8')
    reportDic = reportDicRead.toLowerCase().split('\n')
} catch (err) {
    console.error(`Error reading file ${reportWordsPath}:`, err)
}

/**
 *
 * @param {String} word
 * @returns {Boolean} return true if word included in dictionary
 */
const checkWordIfInDictionary = (word) => {
    return dic.includes(word)
}

/**
 *
 * @returns {Number} length of dictionary array
 */
const countWordInDictionary = () => {
    return dic.length - reportDic.length
}

/**
 *
 * @returns {Array} report words array
 */
const getReportWords = () => {
    return reportDic
}

/**
 *
 * @param {String} word
 * @returns {Boolean}
 */
const checkWordIfInReportDictionary = (word) => {
    return reportDic.includes(word)
}

/**
 *
 * @param {String} word
 */
const addWordToReportList = (word) => {
    reportDic.push(word)
    fs.writeFileSync(reportWordsPath, reportDic.join('\n'))
}

/**
 *
 * @param {String} word
 */
const addWordToDictionary = (word) => {
    dic.push(word)
    fs.writeFileSync(officalWordsPath, dic.join('\n'))
}

/**
 *
 * @param {String} word
 * @returns {Boolean}
 */
const removeWordFromReportList = (word) => {
    const nextReportDic = reportDic.filter(item => item !== word)

    if (nextReportDic.length === reportDic.length) {
        return false
    }

    reportDic = nextReportDic
    fs.writeFileSync(reportWordsPath, reportDic.join('\n'))
    return true
}

module.exports = {
    checkWordIfInDictionary,
    countWordInDictionary,
    getReportWords,
    checkWordIfInReportDictionary,
    addWordToReportList,
    addWordToDictionary,
    removeWordFromReportList
}