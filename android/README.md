# 唐五 Android

原生 Android WebView 外壳，APK 内置完整游戏资源、插画和已发布的训练模型。支持 Android 8.0 及以上，建议保持 Android System WebView 更新。

- 人机、本地双人、AI 观战、人机排位可离线使用。真人排位和邀请联机通过系统浏览器打开 https://tang5.vercel.app/。
- 排位积分、续局和训练偏好保存在应用中，覆盖安装同签名版本会保留这些数据；卸载或清除应用数据会删除本机记录。
- 训练默认关闭。开启后，完整且可重放验证的人机对局存入手机 IndexedDB，最多保留最近 500 局。认输、中断不收录；导出按钮使用系统文件保存界面，JSON 可以通过现有 `scripts/import-human.js` 在电脑上导入。手机对战不会即时修改模型。
- 返回键先关闭规则/结果或回到游戏菜单。图鉴在应用内打开，横竖屏保持当前对局；页面使用固定的 HTTPS 资源地址，Worker AI 不依赖外部服务器。

## 构建

需要 JDK 17、Android SDK platform 35/build-tools 35.0.0，设置 `JAVA_HOME` 与 `ANDROID_HOME`。本机也可复用旁边的 `tangwu-android-tools/toolchain.json`。

```powershell
npm run build:android
# 仅用于调试与 WebView 检查：
powershell -NoProfile -ExecutionPolicy Bypass -File android/build.ps1 -Debug
```

交付文件为 `output/android/TangWu-Android.apk`，SHA256 写入同目录。Gradle Wrapper 固定使用 8.9，Android Gradle Plugin 为 8.7.3。

首次 release 构建在项目旁边的 `tangwu-android-signing` 生成持久签名密钥，密码写在被 Git 忽略的 `android/keystore.properties`。必须一起备份密钥和该配置，后续版本复用相同签名、提高 `versionCode`，才能覆盖安装并保留数据。不要发布密钥或密码文件。

资源加载遵循 [Android 官方的应用内内容加载方式](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content)，导出消息仅允许本地资源的主框架来源，联网页面不会进入拥有原生导出权限的 WebView。
