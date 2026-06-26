package expo.modules.circularcropper

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.Rect
import java.io.File
import java.io.FileOutputStream
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class CircularCropperModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CircularCropper")

    AsyncFunction("cropToCircle") { sourcePath: String, targetPath: String, promise: Promise ->
      CoroutineScope(Dispatchers.IO).launch {
        try {
          val bitmap = BitmapFactory.decodeFile(sourcePath)
          if (bitmap == null) {
            promise.reject("ERR_LOAD_IMAGE", "Could not load image from $sourcePath", null)
            return@launch
          }

          val minEdge = Math.min(bitmap.width, bitmap.height)
          val output = Bitmap.createBitmap(minEdge, minEdge, Bitmap.Config.ARGB_8888)
          val canvas = Canvas(output)

          val paint = Paint().apply {
            isAntiAlias = true
          }
          val rect = Rect(0, 0, minEdge, minEdge)

          // Center-crop source rect
          val srcX = (bitmap.width - minEdge) / 2
          val srcY = (bitmap.height - minEdge) / 2
          val srcRect = Rect(srcX, srcY, srcX + minEdge, srcY + minEdge)

          canvas.drawARGB(0, 0, 0, 0)
          canvas.drawCircle(minEdge / 2f, minEdge / 2f, minEdge / 2f, paint)
          paint.xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_IN)
          canvas.drawBitmap(bitmap, srcRect, rect, paint)

          val file = File(targetPath)
          FileOutputStream(file).use { out ->
            output.compress(Bitmap.CompressFormat.PNG, 100, out)
          }

          promise.resolve("file://$targetPath")
        } catch (e: Exception) {
          promise.reject("ERR_WRITE_FILE", "Could not crop image: ${e.message}", e)
        }
      }
    }
  }
}
