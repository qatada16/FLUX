package expo.modules.foregroundservice

import android.content.Context
import android.content.Intent
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ForegroundServiceModule : Module() {

  private fun launch(context: Context): Boolean {
    if (FluxForegroundService.isRunning) return true
    val intent = Intent(context, FluxForegroundService::class.java)
    return try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
      true
    } catch (e: Exception) {
      false
    }
  }

  private fun halt(context: Context): Boolean {
    return try {
      context.stopService(Intent(context, FluxForegroundService::class.java))
      true
    } catch (e: Exception) {
      false
    }
  }

  override fun definition() = ModuleDefinition {
    Name("FluxForegroundService")

    Function("start") {
      val context = appContext.reactContext
      if (context == null) false else launch(context)
    }

    Function("stop") {
      val context = appContext.reactContext
      if (context == null) false else halt(context)
    }

    Function("isRunning") {
      FluxForegroundService.isRunning
    }
  }
}
