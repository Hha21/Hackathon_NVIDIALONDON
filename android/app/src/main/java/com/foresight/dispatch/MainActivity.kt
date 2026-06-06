package com.foresight.dispatch

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.foresight.dispatch.ui.DispatchScreen
import com.foresight.dispatch.ui.DispatchViewModel
import com.foresight.dispatch.voice.VoiceController
import com.foresight.dispatch.voice.VoiceEngine
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    private val vm: DispatchViewModel by viewModels()
    // Swap this single line for an ElevenLabsVoiceEngine to take the bounty path.
    private lateinit var voice: VoiceEngine

    private val micPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) startListening() else toast("Microphone permission needed for voice.")
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        voice = VoiceController(this)

        // Single collector: fire routing on a new target, speak new answers.
        var lastSpokenAnswer: String? = null
        lifecycleScope.launch {
            vm.ui.collectLatest { state ->
                state.pendingRoute?.let { target ->
                    val mode = Routing.launch(this@MainActivity, target)
                    if (mode == null) toast("No maps app available to route.")
                    vm.consumeRoute()
                }
                val answer = state.scenarioAnswer
                if (answer != null && answer != lastSpokenAnswer) {
                    lastSpokenAnswer = answer
                    voice.speak(answer)
                }
            }
        }

        setContent {
            val ui by vm.ui.collectAsState()

            DispatchScreen(
                ui = ui,
                onSelectStation = vm::selectStation,
                onRefresh = vm::refresh,
                onAccept = vm::accept,
                onReject = vm::reject,
                onScenario = { scenario ->
                    vm.runScenario(scenario)
                },
                onMic = ::onMicClicked,
                onDismissAnswer = vm::clearScenarioAnswer,
                micAvailable = voice.isRecognitionAvailable,
            )
        }
    }

    private fun onMicClicked() {
        val granted = ContextCompat.checkSelfPermission(
            this, Manifest.permission.RECORD_AUDIO,
        ) == PackageManager.PERMISSION_GRANTED
        if (granted) startListening() else micPermission.launch(Manifest.permission.RECORD_AUDIO)
    }

    private fun startListening() {
        voice.listen(
            onResult = { transcript -> vm.ask(transcript) }, // answer is spoken by the collector in onCreate
            onError = { msg -> toast(msg) },
        )
    }

    private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_LONG).show()

    override fun onDestroy() {
        voice.shutdown()
        super.onDestroy()
    }
}
