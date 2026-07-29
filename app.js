App({
  globalData: {
    brand: '一课时',
    cloudReady: false
  },
  onLaunch() {
    if (!wx.cloud) {
      wx.showModal({ title: '版本提示', content: '当前微信版本不支持云开发，请升级后重试。', showCancel: false })
      return
    }
    try {
      wx.cloud.init({ env: 'cloud1-d9gv6il9s47674b85', traceUser: true })
      this.globalData.cloudReady = true
    } catch (error) {
      console.error('云开发初始化失败:', error)
      this.globalData.cloudReady = false
    }
  }
})
