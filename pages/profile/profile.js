function formatDate(date = new Date()) {
  const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, '0'), d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
function dueInfo(expiresAt) {
  if (!expiresAt) return { dueText: '', isExpired: false, daysToExpiry: 99999 }
  const parts = expiresAt.split('-').map(Number), target = new Date(parts[0], parts[1] - 1, parts[2]), now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.round((target - today) / 86400000)
  return { daysToExpiry: days, isExpired: days < 0, dueText: days < 0 ? `已逾期 ${Math.abs(days)} 天` : days === 0 ? '今天到期' : days === 1 ? '明天到期' : `${days} 天后到期` }
}
function monthKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` }

Page({
  data: { user: { loggedIn: false, nickName: '', avatarUrl: '', initial: '一', phoneMasked: '', hasPhone: false }, loginPending: false, stats: { totalUsed: 0, courseCount: 0, monthUsed: 0 }, records: [], allRecords: [], hasMoreRecords: false, showAllRecords: false, reminders: [], report: [] },
  onShow() { this.loadData() },
  loadData() {
    const storedUser = wx.getStorageSync('one_lesson_cloud_user')
    const user = storedUser && storedUser.loggedIn ? storedUser : { loggedIn: false, nickName: '', avatarUrl: '', initial: '一', phoneMasked: '', hasPhone: false }
    const courses = wx.getStorageSync('one_lesson_courses') || []
    const records = courses.reduce((all, course) => all.concat((course.records || []).map(record => ({ ...record, timestamp: `${record.date}${record.time ? ` ${record.time}` : ''}`, courseName: course.name, type: course.type, color: course.color, tint: course.tint }))), []).sort((a, b) => `${b.date} ${b.time || ''}`.localeCompare(`${a.date} ${a.time || ''}`))
    const monthPrefix = formatDate().slice(0, 7)
    const now = new Date(), monthCounts = records.reduce((all, record) => { const key = record.date.slice(0, 7); all[key] = (all[key] || 0) + 1; return all }, {})
    const months = Array.from({ length: 6 }, (_, index) => { const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1); return { key: monthKey(date), label: `${date.getMonth() + 1}月`, current: index === 5 } })
    const max = Math.max(1, ...months.map(month => monthCounts[month.key] || 0))
    const report = months.map(month => ({ ...month, count: monthCounts[month.key] || 0, height: Math.max(8, Math.round(((monthCounts[month.key] || 0) / max) * 104)) }))
    const reminders = courses.filter(course => course.expiresAt && Number(course.total) > Number(course.used) && dueInfo(course.expiresAt).daysToExpiry <= 30).map(course => ({ ...course, ...dueInfo(course.expiresAt) })).sort((a, b) => a.daysToExpiry - b.daysToExpiry)
    this.setData({ user, records: records.slice(0, 5), allRecords: records, hasMoreRecords: records.length > 5, reminders, report, stats: { totalUsed: courses.reduce((sum, course) => sum + (Number(course.used) || 0), 0), courseCount: courses.length, monthUsed: records.filter(record => record.date.indexOf(monthPrefix) === 0).length } })
  },
  completeLogin() {
    if (this.data.loginPending) return
    this.setData({ loginPending: true })
    if (!wx.getUserProfile) return this.saveAuthorizedUser({})
    wx.getUserProfile({
      desc: '用于创建一课时学习档案',
      success: res => this.saveAuthorizedUser(res.userInfo || {}),
      fail: () => this.saveAuthorizedUser({})
    })
  },
  saveAuthorizedUser(profile) {
    wx.showLoading({ title: '正在登录' })
    call('login').then(result => {
      const update = profile.nickName || profile.avatarUrl ? call('updateProfile', profile) : Promise.resolve({ user: result.user })
      return update.then(updated => ({ result, detail: updated.user || result.user }))
    }).then(({ result, detail }) => {
      const nickName = detail.nickName || '微信用户'
      const user = { ...detail, loggedIn: true, initial: nickName.slice(0, 1), openid: result.openid }
      const marker = `one_lesson_migrated_${result.openid}`, localCourses = wx.getStorageSync('one_lesson_courses') || []
      const migrate = !wx.getStorageSync(marker) && localCourses.length ? call('importCourses', { courses: localCourses }).then(() => wx.setStorageSync(marker, true)) : Promise.resolve()
      return migrate.then(() => { wx.setStorageSync('one_lesson_cloud_user', user); this.setData({ user }); this.loadData(); wx.showToast({ title: '登录成功', icon: 'success' }); setTimeout(() => wx.reLaunch({ url: '/pages/index/index' }), 600) })
    }).catch(error => {
      console.error('微信登录失败:', error)
      wx.showModal({ title: '登录失败', content: error.message || error.errMsg || '请稍后重试', showCancel: false })
    }).finally(() => { this.setData({ loginPending: false }); wx.hideLoading() })
  },
  logout() { wx.showModal({ title: '退出登录', content: '云端课程不会删除，下次登录同一微信账号可继续使用。', success: res => { if (res.confirm) { const user = { loggedIn: false, nickName: '', avatarUrl: '', initial: '一', phoneMasked: '', hasPhone: false }; wx.removeStorageSync('one_lesson_cloud_user'); this.setData({ user }) } } }) },
  openAllRecords() { this.setData({ showAllRecords: true }) },
  closeAllRecords() { this.setData({ showAllRecords: false }) },
  stopPropagation() {},
  goCourses() { wx.navigateBack({ delta: 1 }) }
})
const { call } = require('../../utils/cloud')
