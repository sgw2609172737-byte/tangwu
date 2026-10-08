param([switch]$Debug,[switch]$WithDebug)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$toolsRoot=Join-Path (Split-Path $projectRoot -Parent) 'tangwu-android-tools'
$toolchainFile=Join-Path $toolsRoot 'toolchain.json'
if(Test-Path -LiteralPath $toolchainFile){
  $toolchain=Get-Content -LiteralPath $toolchainFile -Raw | ConvertFrom-Json
  if(!$env:JAVA_HOME){$env:JAVA_HOME=$toolchain.java}
  if(!$env:ANDROID_HOME){$env:ANDROID_HOME=$toolchain.sdk}
}
if(!$env:JAVA_HOME -or !(Test-Path -LiteralPath (Join-Path $env:JAVA_HOME 'bin/java.exe'))){throw 'Set JAVA_HOME to a JDK 17 installation before building.'}
if(!$env:ANDROID_HOME -and $env:ANDROID_SDK_ROOT){$env:ANDROID_HOME=$env:ANDROID_SDK_ROOT}
if(!$env:ANDROID_HOME){throw 'Set ANDROID_HOME to the Android SDK (platform 35 and build-tools 35.0.0).'}
$env:PATH=(Join-Path $env:JAVA_HOME 'bin')+';'+$env:PATH
$javaTemp=Join-Path $toolsRoot 'tmp'
New-Item -ItemType Directory -Path $javaTemp -Force | Out-Null
# A short-name Windows TEMP can break JDK Unix-domain loopback sockets.
# Keep this process's JVM temp path explicit without changing global settings.
$tempOption=$javaTemp.Replace('\','/')
$env:JAVA_TOOL_OPTIONS="$($env:JAVA_TOOL_OPTIONS) -Djdk.net.unixdomain.tmpdir=$tempOption -Djava.io.tmpdir=$tempOption".Trim()
$utf8=New-Object System.Text.UTF8Encoding($false)
$sdkPath=$env:ANDROID_HOME.Replace('\','/').Replace(':','\:')
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'local.properties'),"sdk.dir=$sdkPath`n",$utf8)
Push-Location $projectRoot
try {
  & node android/prepare.js
  if($LASTEXITCODE -ne 0){throw 'Android asset preparation failed.'}
} finally {Pop-Location}

if(!$Debug){
  $signingFile=Join-Path $PSScriptRoot 'keystore.properties'
  if(!(Test-Path -LiteralPath $signingFile)){
    $signingDir=Join-Path (Split-Path $projectRoot -Parent) 'tangwu-android-signing'
    New-Item -ItemType Directory -Path $signingDir -Force | Out-Null
    $keystore=Join-Path $signingDir 'tangwu-release.jks'
    if(Test-Path -LiteralPath $keystore){throw 'An existing signing key was found. Restore keystore.properties to reuse it; do not replace the key.'}
    $bytes=New-Object byte[] 32
    $rng=[Security.Cryptography.RandomNumberGenerator]::Create();$rng.GetBytes($bytes);$rng.Dispose()
    $password=([BitConverter]::ToString($bytes)).Replace('-','').ToLowerInvariant()
    $env:TANGWU_ANDROID_SIGNING_PASSWORD=$password
    try {
      & (Join-Path $env:JAVA_HOME 'bin/keytool.exe') -genkeypair -keystore $keystore -storetype PKCS12 -alias tangwu -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=TangWu Android,O=TangWu,C=CN' -storepass:env TANGWU_ANDROID_SIGNING_PASSWORD -keypass:env TANGWU_ANDROID_SIGNING_PASSWORD
      if($LASTEXITCODE -ne 0){throw 'Release key creation failed.'}
    } finally {Remove-Item Env:TANGWU_ANDROID_SIGNING_PASSWORD -ErrorAction SilentlyContinue}
    $keyPath=$keystore.Replace('\','/').Replace(':','\:')
    [IO.File]::WriteAllText($signingFile,"storeFile=$keyPath`nstorePassword=$password`nkeyAlias=tangwu`nkeyPassword=$password`n",$utf8)
    Write-Host "Created private release key in $signingDir. Keep it for future APK updates."
  }
}
Push-Location $PSScriptRoot
try {
  $tasks=if($Debug){@('assembleDebug')}elseif($WithDebug){@('assembleRelease','assembleDebug')}else{@('assembleRelease')}
  if($toolchain -and (Test-Path -LiteralPath (Join-Path $toolchain.gradle 'bin/gradle.bat'))){
    & (Join-Path $toolchain.gradle 'bin/gradle.bat') --no-daemon --console=plain @tasks
  } else { & .\gradlew.bat --no-daemon --console=plain @tasks }
  if($LASTEXITCODE -ne 0){throw 'APK build failed.'}
} finally {Pop-Location}
$variant=if($Debug){'debug'}else{'release'}
$outputDir=Join-Path $projectRoot 'output/android'
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
$source=Join-Path $PSScriptRoot "app/build/outputs/apk/$variant/app-$variant.apk"
$filename=if($Debug){'TangWu-Android-debug.apk'}else{'TangWu-Android.apk'}
$destination=Join-Path $outputDir $filename
Copy-Item -LiteralPath $source -Destination $destination -Force
$hash=Get-FileHash -LiteralPath $destination -Algorithm SHA256
[IO.File]::WriteAllText((Join-Path $outputDir "$filename.sha256"),"$($hash.Hash.ToLowerInvariant())  $filename`n",$utf8)
Write-Host "APK: $destination"
if($WithDebug -and !$Debug){
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'app/build/outputs/apk/debug/app-debug.apk') -Destination (Join-Path $outputDir 'TangWu-Android-debug.apk') -Force
}
