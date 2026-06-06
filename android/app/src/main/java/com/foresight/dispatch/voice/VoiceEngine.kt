package com.foresight.dispatch.voice

/**
 * Voice abstraction so the input/output engine can be swapped without touching
 * the Activity or ViewModel.
 *
 * MVP impl: [VoiceController] (native Android SpeechRecognizer + TextToSpeech).
 * Bounty path: an ElevenLabsVoiceEngine that implements this same interface —
 *   - [listen]: capture mic audio -> ElevenLabs STT -> onResult(transcript)
 *   - [speak]:  text -> ElevenLabs TTS (streamed) -> AudioTrack playback
 * Wire it by constructing the ElevenLabs impl in MainActivity instead of
 * VoiceController; nothing else changes.
 */
interface VoiceEngine {
    /** True if speech input can be used right now. */
    val isRecognitionAvailable: Boolean

    /** Capture one utterance. [onResult] gets the transcript; [onError] a message. */
    fun listen(onResult: (String) -> Unit, onError: (String) -> Unit)

    /** Speak [text] aloud (flushes any in-progress utterance). */
    fun speak(text: String)

    /** Release recognizer / TTS / audio resources. */
    fun shutdown()
}
