const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

function success(data) { return { ok: true, data } }
function failure(message) { return { ok: false, message } }
function safeUser(doc = {}) {
  return { nickName: doc.nickName || '微信用户', avatarUrl: doc.avatarUrl || '', phoneMasked: doc.phoneNumber ? `${doc.phoneNumber.slice(0, 3)}****${doc.phoneNumber.slice(-4)}` : '', hasPhone: !!doc.phoneNumber }
}
function cleanCourse(course = {}) {
  const total = Number(course.total), used = Number(course.used) || 0
  if (!course.name || !course.name.trim()) throw new Error('请填写课程名称')
  if (!Number.isFinite(total) || total < 1) throw new Error('总课时需大于 0')
  if (used < 0 || used > total) throw new Error('已消课时不正确')
  return { name: course.name.trim(), type: course.type || '其他', total, used, expiresAt: course.expiresAt || '', color: course.color || '#658A77', tint: course.tint || '#E7F0E9', lastUsedAt: course.lastUsedAt || '', records: Array.isArray(course.records) ? course.records : [] }
}
async function currentUser() {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) throw new Error('无法识别微信账号')
  const found = await db.collection('users').where({ openid: OPENID }).get()
  if (found.data.length) return { openid: OPENID, user: found.data[0] }
  const doc = { openid: OPENID, nickName: '微信用户', avatarUrl: '', phoneNumber: '', createdAt: db.serverDate(), updatedAt: db.serverDate() }
  const add = await db.collection('users').add({ data: doc })
  return { openid: OPENID, user: { ...doc, _id: add._id } }
}
async function ownedCourse(id, openid) {
  const result = await db.collection('courses').where({ _id: id, ownerOpenid: openid }).get()
  if (!result.data.length) throw new Error('课程不存在或无权操作')
  return result.data[0]
}

exports.main = async event => {
  try {
    const { openid, user } = await currentUser()
    if (event.action === 'login') return success({ user: safeUser(user), openid })
    if (event.action === 'updateProfile') {
      const nickName = String(event.nickName || '微信用户').slice(0, 32), avatarUrl = String(event.avatarUrl || '').slice(0, 512)
      await db.collection('users').doc(user._id).update({ data: { nickName, avatarUrl, updatedAt: db.serverDate() } })
      return success({ user: safeUser({ ...user, nickName, avatarUrl }) })
    }
    if (event.action === 'bindPhone') {
      if (!event.code) throw new Error('未获得手机号授权码')
      const phone = await cloud.openapi.phonenumber.getPhoneNumber({ code: event.code })
      const phoneNumber = phone.phoneInfo && phone.phoneInfo.phoneNumber
      if (!phoneNumber) throw new Error('未能获取手机号')
      await db.collection('users').doc(user._id).update({ data: { phoneNumber, updatedAt: db.serverDate() } })
      return success({ user: safeUser({ ...user, phoneNumber }) })
    }
    if (event.action === 'listCourses') {
      const result = await db.collection('courses').where({ ownerOpenid: openid }).orderBy('updatedAt', 'desc').get()
      return success({ courses: result.data })
    }
    if (event.action === 'saveCourse') {
      const course = cleanCourse(event.course)
      if (event.course && event.course._id) {
        await ownedCourse(event.course._id, openid)
        await db.collection('courses').doc(event.course._id).update({ data: { ...course, updatedAt: db.serverDate() } })
        return success({ course: { ...course, _id: event.course._id } })
      }
      const add = await db.collection('courses').add({ data: { ...course, ownerOpenid: openid, createdAt: db.serverDate(), updatedAt: db.serverDate() } })
      return success({ course: { ...course, _id: add._id } })
    }
    if (event.action === 'consume') {
      const course = await ownedCourse(event.id, openid)
      if (course.used >= course.total) throw new Error('这门课已全部完成')
      const date = event.date || new Date().toISOString().slice(0, 10), time = event.time || '', records = [{ id: `record-${Date.now()}`, date, time }, ...(course.records || [])]
      const updated = { ...course, used: course.used + 1, lastUsedAt: date, records }
      await db.collection('courses').doc(course._id).update({ data: { used: updated.used, lastUsedAt: date, records, updatedAt: db.serverDate() } })
      return success({ course: updated })
    }
    if (event.action === 'deleteCourse') {
      await ownedCourse(event.id, openid)
      await db.collection('courses').doc(event.id).remove()
      return success({})
    }
    if (event.action === 'importCourses') {
      const exists = await db.collection('courses').where({ ownerOpenid: openid }).count()
      if (exists.total || !Array.isArray(event.courses)) return success({ imported: 0 })
      const tasks = event.courses.slice(0, 50).map(item => db.collection('courses').add({ data: { ...cleanCourse(item), ownerOpenid: openid, createdAt: db.serverDate(), updatedAt: db.serverDate() } }))
      await Promise.all(tasks)
      return success({ imported: tasks.length })
    }
    return failure('未知操作')
  } catch (error) { return failure(error.message || '服务执行失败') }
}
