function localUser() {
  return wx.getStorageSync('one_lesson_cloud_user') || { nickName: '微信用户', avatarUrl: '', phoneMasked: '', hasPhone: false }
}
function localCourses() { return wx.getStorageSync('one_lesson_courses') || [] }
function saveLocalCourses(courses) { wx.setStorageSync('one_lesson_courses', courses) }
function localCall(action, data) {
  const user = localUser()
  if (action === 'login') return { user, openid: 'local-user' }
  if (action === 'updateProfile') return { user: { ...user, nickName: data.nickName || user.nickName, avatarUrl: data.avatarUrl || user.avatarUrl } }
  if (action === 'listCourses') return { courses: localCourses() }
  if (action === 'saveCourse') {
    const courses = localCourses(), course = { ...data.course, _id: data.course._id || `local-${Date.now()}` }
    const index = courses.findIndex(item => (item._id || item.id) === course._id)
    if (index >= 0) courses[index] = course
    else courses.unshift(course)
    saveLocalCourses(courses)
    return { course }
  }
  if (action === 'consume') {
    const courses = localCourses(), index = courses.findIndex(item => (item._id || item.id) === data.id)
    if (index < 0) throw new Error('课程不存在')
    const course = courses[index]
    if (Number(course.used) >= Number(course.total)) throw new Error('这门课已全部完成')
    const date = data.date || new Date().toISOString().slice(0, 10)
    const updated = { ...course, used: Number(course.used) + 1, lastUsedAt: date, records: [{ id: `record-${Date.now()}`, date, time: data.time || '' }, ...(course.records || [])] }
    courses[index] = updated
    saveLocalCourses(courses)
    return { course: updated }
  }
  if (action === 'deleteCourse') {
    saveLocalCourses(localCourses().filter(item => (item._id || item.id) !== data.id))
    return {}
  }
  if (action === 'importCourses') {
    if (!localCourses().length && Array.isArray(data.courses)) saveLocalCourses(data.courses)
    return { imported: Array.isArray(data.courses) ? data.courses.length : 0 }
  }
  throw new Error('本地模式暂不支持该操作')
}

function call(action, data = {}) {
  return wx.cloud.callFunction({ name: 'lessonService', data: { action, ...data } }).then(res => {
    const result = res.result || {}
    if (!result.ok) throw new Error(result.message || '云端服务暂不可用')
    return result.data
  }).catch(error => {
    const message = error && (error.message || error.errMsg) || ''
    const code = error && error.errCode
    if (/function.*not found|FUNCTION_NOT_FOUND|云函数.*不存在/i.test(message)) throw new Error('云服务尚未部署，请先部署 lessonService')
    if (code === 601034 || /没有权限.*云开发|开通云开发/i.test(message)) throw new Error('当前小程序尚未开通云开发，请先在开发者工具开通并关联环境')
    if (code === -501000 || /Env Not Exists|INVALID_ENV/i.test(message)) {
      if (action !== 'login' && action !== 'listCourses') wx.showToast({ title: '云端暂不可用，已本地保存', icon: 'none' })
      return localCall(action, data)
    }
    throw error
  })
}

function isLoggedIn() {
  const user = wx.getStorageSync('one_lesson_cloud_user')
  return !!(user && user.loggedIn)
}

module.exports = { call, isLoggedIn }
