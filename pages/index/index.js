const COLORS = [
  { color: '#E56B5D', tint: '#FDEBE8' },
  { color: '#E9954D', tint: '#FFF0E2' },
  { color: '#D8AE3C', tint: '#FFF8DC' },
  { color: '#6EAA68', tint: '#EAF5E7' },
  { color: '#45A99A', tint: '#E3F6F3' },
  { color: '#4E93C8', tint: '#E7F2FA' },
  { color: '#6177B7', tint: '#EAEDF9' },
  { color: '#8B6BB5', tint: '#F0EAF8' },
  { color: '#C96C99', tint: '#FBEAF2' },
  { color: '#C45A72', tint: '#FBE7EB' }
]

function formatDate(date = new Date()) {
  const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, '0'), d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
function formatTime(date = new Date()) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
function dueInfo(expiresAt) {
  if (!expiresAt) return { dueText: '', isExpired: false, daysToExpiry: 99999 }
  const parts = expiresAt.split('-').map(Number), target = new Date(parts[0], parts[1] - 1, parts[2]), now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.round((target - today) / 86400000)
  return { daysToExpiry: days, isExpired: days < 0, dueText: days < 0 ? `已逾期 ${Math.abs(days)} 天` : days === 0 ? '今天到期' : days === 1 ? '明天到期' : `${days} 天后到期` }
}
function normalize(course) {
  const total = Number(course.total) || 0, used = Math.min(Number(course.used) || 0, total)
  const records = (course.records || []).map(record => ({ ...record, timestamp: `${record.date}${record.time ? ` ${record.time}` : ''}` }))
  return { ...course, id: course._id || course.id, total, used, remaining: Math.max(total - used, 0), progress: total ? Math.round(used / total * 100) : 0, records, ...dueInfo(course.expiresAt) }
}

Page({
  data: {
    courses: [], displayCourses: [], filter: 'all', modal: '', editingId: '', selectedCourse: null,
    today: {}, statistics: {}, types: ['语言学习', '学科辅导', '艺术技能', '运动健康', '兴趣培养', '其他'], typeIndex: 0, colors: COLORS,
    form: { name: '', type: '语言学习', total: '', used: '', expiresAt: '', color: COLORS[0].color, tint: COLORS[0].tint }, consumeDate: '', consumeTime: '', expiryCourses: [],
    filters: [{ key: 'all', label: '全部' }, { key: 'active', label: '进行中' }, { key: 'finished', label: '已结课' }]
  },
  onLoad() {
    const saved = wx.getStorageSync('one_lesson_courses')
    this.courses = (saved || []).map(normalize)
    const now = new Date()
    this.setData({ today: { month: now.getMonth() + 1, day: now.getDate() } })
    this.refresh()
  },
  onShow() {
    if (!isLoggedIn()) {
      if (!this.redirectingToLogin) {
        this.redirectingToLogin = true
        wx.navigateTo({ url: '/pages/profile/profile' })
      }
      return
    }
    this.redirectingToLogin = false
    this.syncCourses()
  },
  syncCourses() {
    if (!isLoggedIn()) return
    wx.showNavigationBarLoading()
    call('listCourses').then(result => { this.courses = (result.courses || []).map(normalize); this.refresh() }).catch(error => wx.showToast({ title: error.message || '同步失败', icon: 'none' })).finally(() => wx.hideNavigationBarLoading())
  },
  refresh() {
    const monthPrefix = formatDate().slice(0, 7)
    const monthUsed = this.courses.reduce((sum, c) => sum + c.records.filter(r => r.date.indexOf(monthPrefix) === 0).length, 0)
    const active = this.courses.filter(c => c.remaining > 0).length
    const visible = this.courses.filter(c => this.data.filter === 'all' || (this.data.filter === 'active' ? c.remaining > 0 : c.remaining === 0))
    const expiryCourses = this.courses.filter(c => c.expiresAt && c.remaining > 0 && c.daysToExpiry <= 30).sort((a, b) => a.daysToExpiry - b.daysToExpiry)
    this.setData({ courses: this.courses, displayCourses: visible, expiryCourses, statistics: { monthUsed, active, remaining: this.courses.reduce((sum, c) => sum + c.remaining, 0) } })
    wx.setStorageSync('one_lesson_courses', this.courses)
  },
  changeFilter(e) { this.setData({ filter: e.currentTarget.dataset.key }, () => this.refresh()) },
  stopPropagation() {},
  openAdd() { this.setData({ modal: 'form', editingId: '', typeIndex: 0, form: { name: '', type: this.data.types[0], total: '', used: '', expiresAt: '', color: COLORS[0].color, tint: COLORS[0].tint } }) },
  closeModal() { this.setData({ modal: '', selectedCourse: null }) },
  updateForm(e) { this.setData({ [`form.${e.currentTarget.dataset.field}`]: e.detail.value }) },
  selectType(e) { const index = Number(e.detail.value); this.setData({ typeIndex: index, 'form.type': this.data.types[index] }) },
  selectExpiry(e) { this.setData({ 'form.expiresAt': e.detail.value }) },
  clearExpiry() { this.setData({ 'form.expiresAt': '' }) },
  selectColor(e) { this.setData({ 'form.color': e.currentTarget.dataset.color, 'form.tint': e.currentTarget.dataset.tint }) },
  saveCourse() {
    const form = this.data.form
    if (!form.name.trim()) return wx.showToast({ title: '请填写课程名称', icon: 'none' })
    if (!Number(form.total) || Number(form.total) < 1) return wx.showToast({ title: '总课时需大于 0', icon: 'none' })
    if (Number(form.used) > Number(form.total)) return wx.showToast({ title: '已消课时不能超过总课时', icon: 'none' })
    if (!isLoggedIn()) return wx.showToast({ title: '请先在“我的”页面登录', icon: 'none' })
    const oldCourse = this.courses.find(c => c.id === this.data.editingId)
    const course = { ...form, name: form.name.trim(), _id: oldCourse && oldCourse._id, records: oldCourse ? oldCourse.records : [] }
    wx.showLoading({ title: '正在保存' })
    call('saveCourse', { course }).then(result => { const saved = normalize(result.course); if (this.data.editingId) this.courses = this.courses.map(c => c.id === saved.id ? saved : c); else this.courses = [saved, ...this.courses]; this.closeModal(); this.refresh(); wx.showToast({ title: '已保存', icon: 'success' }) }).catch(error => wx.showToast({ title: error.message || '保存失败', icon: 'none' })).finally(() => wx.hideLoading())
  },
  openCourse(e) { const course = this.courses.find(c => c.id === e.currentTarget.dataset.id); this.setData({ modal: 'course', selectedCourse: course }) },
  openConsume() {
    const c = this.data.selectedCourse
    if (c.remaining < 1) return wx.showToast({ title: '这门课已全部完成', icon: 'none' })
    if (!isLoggedIn()) return wx.showToast({ title: '请先登录', icon: 'none' })
    this.setData({ modal: 'consume', consumeDate: formatDate(), consumeTime: formatTime() })
  },
  selectConsumeDate(e) { this.setData({ consumeDate: e.detail.value }) },
  selectConsumeTime(e) { this.setData({ consumeTime: e.detail.value }) },
  confirmConsume() {
    const c = this.data.selectedCourse
    wx.showLoading({ title: '正在消课' })
    call('consume', { id: c._id, date: this.data.consumeDate, time: this.data.consumeTime }).then(result => { const updated = normalize(result.course); this.courses = this.courses.map(item => item.id === updated.id ? updated : item); this.setData({ modal: 'course', selectedCourse: updated }); this.refresh(); wx.showToast({ title: '已消耗 1 课时', icon: 'success' }) }).catch(error => wx.showToast({ title: error.message || '消课失败', icon: 'none' })).finally(() => wx.hideLoading())
  },
  editCourse() { const c = this.data.selectedCourse, index = this.data.types.indexOf(c.type); this.setData({ modal: 'form', editingId: c.id, typeIndex: index < 0 ? 0 : index, form: { name: c.name, type: c.type, total: c.total, used: c.used, expiresAt: c.expiresAt || '', color: c.color, tint: c.tint } }) },
  deleteCourse() { wx.showModal({ title: '删除课程', content: '删除后无法恢复，确定继续吗？', confirmColor: '#BB695B', success: res => { if (res.confirm) { wx.showLoading({ title: '正在删除' }); call('deleteCourse', { id: this.data.selectedCourse._id }).then(() => { this.courses = this.courses.filter(c => c.id !== this.data.selectedCourse.id); this.closeModal(); this.refresh(); wx.showToast({ title: '已删除', icon: 'success' }) }).catch(error => wx.showToast({ title: error.message || '删除失败', icon: 'none' })).finally(() => wx.hideLoading()) } } }) },
  goProfile() { wx.navigateTo({ url: '/pages/profile/profile' }) }
})
const { call, isLoggedIn } = require('../../utils/cloud')
