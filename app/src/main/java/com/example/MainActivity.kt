package com.example

import android.app.Activity
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.MediaStore
import android.util.Base64
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.FileProvider
import com.example.ui.theme.MyApplicationTheme
import com.google.android.gms.ads.AdListener
import com.google.android.gms.ads.AdLoader
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.MobileAds
import com.google.android.gms.ads.nativead.NativeAd
import com.google.android.gms.ads.nativead.NativeAdOptions
import com.google.android.gms.ads.nativead.NativeAdView
import java.io.File
import java.io.FileOutputStream

class MainActivity : ComponentActivity() {

  companion object {
    private const val TAG = "PDFStudio_AdMob"
    const val ADMOB_APP_ID = "ca-app-pub-8630539981886637~3489915688"
    const val ADMOB_NATIVE_AD_UNIT_ID = "ca-app-pub-8630539981886637/2942074598"
  }

  private var webView: WebView? = null
  private var filePathCallback: ValueCallback<Array<Uri>>? = null

  private val fileChooserLauncher: ActivityResultLauncher<Intent> =
      registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (filePathCallback != null) {
          val uriResult =
              if (result.resultCode == Activity.RESULT_OK && result.data != null) {
                val data = result.data
                val clipData = data?.clipData
                if (clipData != null && clipData.itemCount > 0) {
                  val uris = Array(clipData.itemCount) { i -> clipData.getItemAt(i).uri }
                  uris
                } else if (data?.data != null) {
                  arrayOf(data.data!!)
                } else {
                  null
                }
              } else {
                null
              }
          filePathCallback?.onReceiveValue(uriResult)
          filePathCallback = null
        }
      }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    enableEdgeToEdge()

    // Initialize Google Mobile Ads SDK
    try {
      MobileAds.initialize(this) { initializationStatus ->
        Log.d(TAG, "AdMob SDK initialized: $initializationStatus")
      }
    } catch (e: Exception) {
      Log.e(TAG, "Error initializing MobileAds", e)
    }

    setContent {
      MyApplicationTheme {
        PdfStudioScreen(
            adUnitId = ADMOB_NATIVE_AD_UNIT_ID,
            onWebViewReady = { wv -> webView = wv },
            openFileChooser = { callback, intent ->
              filePathCallback = callback
              fileChooserLauncher.launch(intent)
            },
            onSaveFile = { base64Data, filename, mime ->
              saveFileToDownloads(base64Data, filename, mime)
            },
            onShareFile = { base64Data, filename, mime ->
              shareFileFromCache(base64Data, filename, mime)
            },
            onShowToast = { msg ->
              Toast.makeText(this@MainActivity, msg, Toast.LENGTH_SHORT).show()
            },
            onVibrate = { ms -> vibrateDevice(ms) })
      }
    }
  }

  private fun vibrateDevice(ms: Long) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val vibratorManager = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
        vibratorManager?.defaultVibrator?.vibrate(
            VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE))
      } else {
        @Suppress("DEPRECATION")
        val vibrator = getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        @Suppress("DEPRECATION")
        vibrator?.vibrate(ms)
      }
    } catch (_: Exception) {}
  }

  private fun saveFileToDownloads(base64Data: String, filename: String, mimeType: String) {
    try {
      val cleanBase64 =
          if (base64Data.contains(",")) base64Data.substringAfter(",") else base64Data
      val bytes = Base64.decode(cleanBase64, Base64.DEFAULT)

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val contentValues =
            ContentValues().apply {
              put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
              put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
              put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
            }
        val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues)
        if (uri != null) {
          contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
          Toast.makeText(this, "Saved to Downloads: $filename", Toast.LENGTH_LONG).show()
          return
        }
      }

      val targetDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
      if (!targetDir.exists()) targetDir.mkdirs()
      val targetFile = File(targetDir, filename)
      FileOutputStream(targetFile).use { it.write(bytes) }
      Toast.makeText(this, "Saved: ${targetFile.name}", Toast.LENGTH_LONG).show()
    } catch (e: Exception) {
      Toast.makeText(this, "Error saving file: ${e.message}", Toast.LENGTH_SHORT).show()
    }
  }

  private fun shareFileFromCache(base64Data: String, filename: String, mimeType: String) {
    try {
      val cleanBase64 =
          if (base64Data.contains(",")) base64Data.substringAfter(",") else base64Data
      val bytes = Base64.decode(cleanBase64, Base64.DEFAULT)

      val shareDir = File(cacheDir, "shared_docs").apply { mkdirs() }
      val file = File(shareDir, filename)
      FileOutputStream(file).use { it.write(bytes) }

      val uri: Uri =
          FileProvider.getUriForFile(this, "${applicationContext.packageName}.fileprovider", file)

      val shareIntent =
          Intent(Intent.ACTION_SEND).apply {
            type = mimeType
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_SUBJECT, filename)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
          }
      startActivity(Intent.createChooser(shareIntent, "Share $filename"))
    } catch (e: Exception) {
      Toast.makeText(this, "Error sharing file: ${e.message}", Toast.LENGTH_SHORT).show()
    }
  }
}

@Composable
fun PdfStudioScreen(
    adUnitId: String,
    onWebViewReady: (WebView) -> Unit,
    openFileChooser: (ValueCallback<Array<Uri>>, Intent) -> Unit,
    onSaveFile: (String, String, String) -> Unit,
    onShareFile: (String, String, String) -> Unit,
    onShowToast: (String) -> Unit,
    onVibrate: (Long) -> Unit
) {
  var webViewInstance by remember { mutableStateOf<WebView?>(null) }

  BackHandler(enabled = true) {
    webViewInstance?.evaluateJavascript(
        "if (window.handleAndroidBack) { window.handleAndroidBack(); } else { window.history.back(); }",
        null)
  }

  Column(
      modifier =
          Modifier.fillMaxSize()
              .background(Color(0xFF0F0E17))
              .statusBarsPadding()
              .testTag("pdf_studio_container")) {
        // Main Web View
        Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
          AndroidView(
              modifier = Modifier.fillMaxSize().testTag("pdf_studio_webview"),
              factory = { context ->
                WebView(context).apply {
                  webViewInstance = this
                  onWebViewReady(this)
                  setBackgroundColor(android.graphics.Color.TRANSPARENT)

                  settings.apply {
                    javaScriptEnabled = true
                    domStorageEnabled = true
                    allowFileAccess = true
                    allowContentAccess = true
                    databaseEnabled = true
                    useWideViewPort = true
                    loadWithOverviewMode = true
                    setSupportZoom(true)
                    builtInZoomControls = false
                    displayZoomControls = false
                    cacheMode = WebSettings.LOAD_DEFAULT
                    mediaPlaybackRequiresUserGesture = false
                  }

                  addJavascriptInterface(
                      object {
                        @JavascriptInterface
                        fun saveFile(base64Data: String, filename: String, mimeType: String) {
                          (context as? Activity)?.runOnUiThread {
                            onSaveFile(base64Data, filename, mimeType)
                          }
                        }

                        @JavascriptInterface
                        fun shareFile(base64Data: String, filename: String, mimeType: String) {
                          (context as? Activity)?.runOnUiThread {
                            onShareFile(base64Data, filename, mimeType)
                          }
                        }

                        @JavascriptInterface
                        fun showToast(message: String) {
                          (context as? Activity)?.runOnUiThread { onShowToast(message) }
                        }

                        @JavascriptInterface
                        fun vibrate(ms: Long) {
                          (context as? Activity)?.runOnUiThread { onVibrate(ms) }
                        }

                        @JavascriptInterface
                        fun isAndroid(): Boolean = true

                        @JavascriptInterface
                        fun getAppVersion(): String = "PDF Studio Ultimate v1.0"
                      },
                      "AndroidBridge")

                  webChromeClient =
                      object : WebChromeClient() {
                        override fun onShowFileChooser(
                            webView: WebView?,
                            filePathCallback: ValueCallback<Array<Uri>>?,
                            fileChooserParams: FileChooserParams?
                        ): Boolean {
                          if (filePathCallback == null) return false
                          val intent =
                              fileChooserParams?.createIntent()
                                  ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                                    type = "*/*"
                                    addCategory(Intent.CATEGORY_OPENABLE)
                                  }
                          openFileChooser(filePathCallback, intent)
                          return true
                        }

                        override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                          return super.onConsoleMessage(consoleMessage)
                        }
                      }

                  webViewClient =
                      object : WebViewClient() {
                        override fun shouldOverrideUrlLoading(
                            view: WebView?,
                            request: WebResourceRequest?
                        ): Boolean {
                          val url = request?.url?.toString() ?: return false
                          if (url.startsWith("file:///android_asset/")) {
                            return false
                          }
                          return try {
                            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                            context.startActivity(intent)
                            true
                          } catch (_: Exception) {
                            false
                          }
                        }
                      }

                  loadUrl("file:///android_asset/pdfstudio/index.html")
                }
              })
        }

        // Native Advanced AdMob Container
        NativeAdCard(adUnitId = adUnitId)
      }
}

/**
 * Renders AdMob Native Advanced Ad with Google Play compliant attribution and layout.
 */
@Composable
fun NativeAdCard(adUnitId: String) {
  var nativeAdState by remember { mutableStateOf<NativeAd?>(null) }
  var isDismissed by remember { mutableStateOf(false) }

  val context = LocalContext.current

  DisposableEffect(adUnitId) {
    var adLoader: AdLoader? = null
    try {
      adLoader =
          AdLoader.Builder(context, adUnitId)
              .forNativeAd { ad: NativeAd ->
                nativeAdState = ad
              }
              .withAdListener(
                  object : AdListener() {
                    override fun onAdFailedToLoad(error: LoadAdError) {
                      Log.w("PDFStudio_AdMob", "Native ad failed to load: ${error.message}")
                    }
                  })
              .withNativeAdOptions(
                  NativeAdOptions.Builder()
                      .setRequestMultipleImages(false)
                      .build())
              .build()

      adLoader.loadAd(AdRequest.Builder().build())
    } catch (e: Exception) {
      Log.e("PDFStudio_AdMob", "Error building AdLoader", e)
    }

    onDispose {
      nativeAdState?.destroy()
    }
  }

  val ad = nativeAdState
  if (ad != null && !isDismissed) {
    Box(
        modifier =
            Modifier.fillMaxWidth()
                .navigationBarsPadding()
                .background(Color(0xFF141320))
                .testTag("admob_native_ad_container")) {
          AndroidView(
              modifier = Modifier.fillMaxWidth(),
              factory = { ctx ->
                createNativeAdView(ctx, ad) {
                  isDismissed = true
                  ad.destroy()
                }
              })
        }
  }
}

/**
 * Creates and registers a NativeAdView with headline, body, icon, call to action, and "Ad" attribution badge.
 */
private fun createNativeAdView(
    context: Context,
    nativeAd: NativeAd,
    onDismiss: () -> Unit
): NativeAdView {
  val nativeAdView = NativeAdView(context)
  nativeAdView.layoutParams =
      ViewGroup.LayoutParams(
          ViewGroup.LayoutParams.MATCH_PARENT,
          ViewGroup.LayoutParams.WRAP_CONTENT)

  val rootLayout = LinearLayout(context).apply {
    orientation = LinearLayout.HORIZONTAL
    gravity = Gravity.CENTER_VERTICAL
    val pad = (10 * context.resources.displayMetrics.density).toInt()
    setPadding(pad, pad, pad, pad)
    background =
        GradientDrawable().apply {
          setColor(android.graphics.Color.parseColor("#1B1A2C"))
          setStroke(1, android.graphics.Color.parseColor("#33FFFFFF"))
          cornerRadius = 14 * context.resources.displayMetrics.density
        }
  }

  // Left Icon
  val iconView = ImageView(context).apply {
    val size = (44 * context.resources.displayMetrics.density).toInt()
    layoutParams = LinearLayout.LayoutParams(size, size).apply {
      rightMargin = (10 * context.resources.displayMetrics.density).toInt()
    }
    scaleType = ImageView.ScaleType.CENTER_CROP
    val icon = nativeAd.icon
    if (icon != null) {
      setImageDrawable(icon.drawable)
      visibility = View.VISIBLE
    } else {
      visibility = View.GONE
    }
  }
  rootLayout.addView(iconView)
  nativeAdView.iconView = iconView

  // Middle Text Content (Badge, Headline, Body)
  val textLayout = LinearLayout(context).apply {
    orientation = LinearLayout.VERTICAL
    layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1.0f)
  }

  // Header row with "Ad" badge and Headline
  val headerRow = LinearLayout(context).apply {
    orientation = LinearLayout.HORIZONTAL
    gravity = Gravity.CENTER_VERTICAL
  }

  val adBadge = TextView(context).apply {
    text = "Ad"
    textSize = 10f
    setTypeface(null, Typeface.BOLD)
    setTextColor(android.graphics.Color.parseColor("#FFFFFF"))
    background =
        GradientDrawable().apply {
          setColor(android.graphics.Color.parseColor("#FF3366"))
          cornerRadius = 4 * context.resources.displayMetrics.density
        }
    val hPad = (5 * context.resources.displayMetrics.density).toInt()
    val vPad = (1 * context.resources.displayMetrics.density).toInt()
    setPadding(hPad, vPad, hPad, vPad)
    layoutParams = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.WRAP_CONTENT,
        ViewGroup.LayoutParams.WRAP_CONTENT).apply {
      rightMargin = (6 * context.resources.displayMetrics.density).toInt()
    }
  }
  headerRow.addView(adBadge)

  val headlineView = TextView(context).apply {
    text = nativeAd.headline ?: "Sponsored"
    textSize = 13f
    setTypeface(null, Typeface.BOLD)
    setTextColor(android.graphics.Color.parseColor("#F4F4F9"))
    maxLines = 1
    ellipsize = android.text.TextUtils.TruncateAt.END
  }
  headerRow.addView(headlineView)
  nativeAdView.headlineView = headlineView

  textLayout.addView(headerRow)

  val bodyView = TextView(context).apply {
    text = nativeAd.body ?: ""
    textSize = 11f
    setTextColor(android.graphics.Color.parseColor("#9E9DB5"))
    maxLines = 1
    ellipsize = android.text.TextUtils.TruncateAt.END
    val topPad = (2 * context.resources.displayMetrics.density).toInt()
    setPadding(0, topPad, 0, 0)
    visibility = if (nativeAd.body.isNullOrEmpty()) View.GONE else View.VISIBLE
  }
  textLayout.addView(bodyView)
  nativeAdView.bodyView = bodyView

  rootLayout.addView(textLayout)

  // Call to Action Button
  val ctaButton = Button(context).apply {
    text = nativeAd.callToAction ?: "Install"
    textSize = 11f
    setTypeface(null, Typeface.BOLD)
    setTextColor(android.graphics.Color.WHITE)
    background =
        GradientDrawable().apply {
          setColor(android.graphics.Color.parseColor("#FF3366"))
          cornerRadius = 8 * context.resources.displayMetrics.density
        }
    val hPad = (12 * context.resources.displayMetrics.density).toInt()
    val vPad = (6 * context.resources.displayMetrics.density).toInt()
    setPadding(hPad, vPad, hPad, vPad)
    layoutParams = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.WRAP_CONTENT,
        (34 * context.resources.displayMetrics.density).toInt()).apply {
      leftMargin = (8 * context.resources.displayMetrics.density).toInt()
      rightMargin = (4 * context.resources.displayMetrics.density).toInt()
    }
    isClickable = false // Managed by NativeAdView
  }
  rootLayout.addView(ctaButton)
  nativeAdView.callToActionView = ctaButton

  // Dismiss button
  val closeButton = TextView(context).apply {
    text = "✕"
    textSize = 13f
    setTextColor(android.graphics.Color.parseColor("#66FFFFFF"))
    val cPad = (6 * context.resources.displayMetrics.density).toInt()
    setPadding(cPad, cPad, cPad, cPad)
    setOnClickListener { onDismiss() }
  }
  rootLayout.addView(closeButton)

  nativeAdView.addView(rootLayout)
  nativeAdView.setNativeAd(nativeAd)

  return nativeAdView
}
