#include "SharedDspRealtimeSupport.h"

#include <mach/mach_time.h>
#include <math.h>
#include <stdatomic.h>
#include <stdlib.h>
#include <string.h>

#define PS_SHADOW_CHANNELS 2
#define PS_SHADOW_FIXTURE_FRAMES 4096
#define PS_SHADOW_MAXIMUM_CALLBACK_FRAMES 4096
#define PS_SHADOW_FIXTURE_SAMPLE_RATE 48000.0
#define PS_SHADOW_INPUT_GAIN_DB 3.5
#define PS_SHADOW_INITIAL_OUTPUT_GAIN_DB -0.75f

typedef struct {
    int enabled;
    float fixtureInput[PS_SHADOW_CHANNELS][PS_SHADOW_FIXTURE_FRAMES];
    float capturedOutput[PS_SHADOW_CHANNELS][PS_SHADOW_FIXTURE_FRAMES];
    uint32_t fixtureCursor;
    uint32_t capturedFrames;
    uint32_t appliedUpdates;
    uint32_t lastAppliedGeneration;
    float lastAppliedOutputGainDb;
    double currentGain;
    double targetGain;
    uint64_t processedFrames;
    uint64_t recoveredSamples;
} PSRealtimeShadow;

typedef struct {
    int enabled;
    int interleaved;
    uint32_t channels;
    uint64_t totalFrames;
    uint32_t fadeFrames;
    float gainLinear;
} PSRealtimePreview;

struct PSRealtimeMetrics {
    _Atomic uint64_t callbacks;
    _Atomic uint64_t renderedFrames;
    _Atomic uint64_t frameMismatches;
    _Atomic uint64_t deadlineMisses;
    _Atomic uint64_t timingGapXruns;
    _Atomic uint64_t renderErrors;
    _Atomic uint64_t processorOverloads;
    _Atomic uint64_t deviceChanges;
    _Atomic uint64_t sampleRateChanges;
    _Atomic uint64_t shadowCallbacks;
    _Atomic uint64_t shadowFrames;
    _Atomic uint64_t shadowFailures;
    _Atomic uint64_t shadowParameterWord;
    _Atomic uint64_t shadowParameterPublishes;
    _Atomic uint64_t longestCallbackTicks;
    _Atomic uint64_t previousOutputHostTime;
    _Atomic uint64_t deadlineTicks;
    _Atomic uint64_t ticksPerFrame;
    _Atomic uint32_t expectedFrames;
    PSRealtimeShadow shadow;
    PSRealtimePreview preview;
};

static uint64_t ps_seconds_to_host_ticks(double seconds) {
    mach_timebase_info_data_t info;
    if (mach_timebase_info(&info) != KERN_SUCCESS || info.numer == 0) return 0;
    long double nanoseconds = (long double)seconds * 1000000000.0L;
    return (uint64_t)(nanoseconds * (long double)info.denom / (long double)info.numer);
}

static double ps_host_ticks_to_milliseconds(uint64_t ticks) {
    mach_timebase_info_data_t info;
    if (mach_timebase_info(&info) != KERN_SUCCESS || info.denom == 0) return 0;
    long double nanoseconds = (long double)ticks * (long double)info.numer / (long double)info.denom;
    return (double)(nanoseconds / 1000000.0L);
}

static void ps_atomic_max(_Atomic uint64_t *target, uint64_t candidate) {
    uint64_t current = atomic_load_explicit(target, memory_order_relaxed);
    while (candidate > current && !atomic_compare_exchange_weak_explicit(
        target,
        &current,
        candidate,
        memory_order_relaxed,
        memory_order_relaxed
    )) {}
}

PSRealtimeMetrics *ps_realtime_metrics_create(void) {
    return calloc(1, sizeof(PSRealtimeMetrics));
}

void ps_realtime_metrics_destroy(PSRealtimeMetrics *metrics) {
    free(metrics);
}

void ps_realtime_metrics_configure(PSRealtimeMetrics *metrics, uint32_t expectedFrames, double sampleRate) {
    if (!metrics) return;
    atomic_store_explicit(&metrics->expectedFrames, expectedFrames, memory_order_relaxed);
    uint64_t deadline = sampleRate > 0 ? ps_seconds_to_host_ticks((double)expectedFrames / sampleRate) : 0;
    uint64_t ticksPerFrame = sampleRate > 0 ? ps_seconds_to_host_ticks(1.0 / sampleRate) : 0;
    atomic_store_explicit(&metrics->deadlineTicks, deadline, memory_order_relaxed);
    atomic_store_explicit(&metrics->ticksPerFrame, ticksPerFrame, memory_order_relaxed);
    atomic_store_explicit(&metrics->previousOutputHostTime, 0, memory_order_relaxed);
}

void ps_realtime_metrics_configure_shadow(PSRealtimeMetrics *metrics, int enabled) {
    if (!metrics) return;
    PSRealtimeShadow *shadow = &metrics->shadow;
    memset(shadow, 0, sizeof(*shadow));
    shadow->enabled = enabled ? 1 : 0;
    if (!shadow->enabled) return;

    for (uint32_t frame = 0; frame < PS_SHADOW_FIXTURE_FRAMES; frame += 1) {
        shadow->fixtureInput[0][frame] = (float)(0.27 * sin((2.0 * M_PI * 997.0 * (double)frame) / PS_SHADOW_FIXTURE_SAMPLE_RATE));
        shadow->fixtureInput[1][frame] = (float)(0.27 * sin((2.0 * M_PI * 503.0 * (double)frame) / PS_SHADOW_FIXTURE_SAMPLE_RATE));
    }
    shadow->lastAppliedOutputGainDb = PS_SHADOW_INITIAL_OUTPUT_GAIN_DB;
    shadow->currentGain = pow(10.0, (PS_SHADOW_INPUT_GAIN_DB + (double)PS_SHADOW_INITIAL_OUTPUT_GAIN_DB) / 20.0);
    shadow->targetGain = shadow->currentGain;
}

void ps_realtime_metrics_configure_preview(
    PSRealtimeMetrics *metrics,
    int enabled,
    uint32_t channels,
    int interleaved,
    uint64_t totalFrames,
    uint32_t fadeFrames,
    float gainLinear
) {
    if (!metrics) return;
    PSRealtimePreview *preview = &metrics->preview;
    memset(preview, 0, sizeof(*preview));
    if (!enabled || channels == 0 || channels > 32 || totalFrames == 0 || fadeFrames == 0
        || !isfinite(gainLinear) || gainLinear <= 0.0f || gainLinear > 1.0f) return;
    preview->enabled = 1;
    preview->interleaved = interleaved ? 1 : 0;
    preview->channels = channels;
    preview->totalFrames = totalFrames;
    preview->fadeFrames = fadeFrames;
    preview->gainLinear = gainLinear;
}

void ps_realtime_publish_shadow_output_gain(PSRealtimeMetrics *metrics, uint32_t generation, float outputGainDb) {
    if (!metrics || generation == 0) return;
    uint32_t gainBits = 0;
    memcpy(&gainBits, &outputGainDb, sizeof(gainBits));
    uint64_t word = ((uint64_t)generation << 32) | gainBits;
    atomic_store_explicit(&metrics->shadowParameterWord, word, memory_order_release);
    atomic_fetch_add_explicit(&metrics->shadowParameterPublishes, 1, memory_order_relaxed);
}

void ps_realtime_metrics_reset_timing(PSRealtimeMetrics *metrics) {
    if (!metrics) return;
    atomic_store_explicit(&metrics->previousOutputHostTime, 0, memory_order_relaxed);
}

void ps_realtime_metrics_record_device_change(PSRealtimeMetrics *metrics) {
    if (!metrics) return;
    atomic_fetch_add_explicit(&metrics->deviceChanges, 1, memory_order_relaxed);
}

#define PS_GETTER(name, field) \
uint64_t name(const PSRealtimeMetrics *metrics) { \
    return metrics ? atomic_load_explicit(&metrics->field, memory_order_relaxed) : 0; \
}

PS_GETTER(ps_realtime_callbacks, callbacks)
PS_GETTER(ps_realtime_rendered_frames, renderedFrames)
PS_GETTER(ps_realtime_frame_mismatches, frameMismatches)
PS_GETTER(ps_realtime_deadline_misses, deadlineMisses)
PS_GETTER(ps_realtime_timing_gap_xruns, timingGapXruns)
PS_GETTER(ps_realtime_render_errors, renderErrors)
PS_GETTER(ps_realtime_processor_overloads, processorOverloads)
PS_GETTER(ps_realtime_device_changes, deviceChanges)
PS_GETTER(ps_realtime_sample_rate_changes, sampleRateChanges)
PS_GETTER(ps_realtime_shadow_callbacks, shadowCallbacks)
PS_GETTER(ps_realtime_shadow_frames, shadowFrames)
PS_GETTER(ps_realtime_shadow_failures, shadowFailures)
PS_GETTER(ps_realtime_shadow_parameter_word, shadowParameterWord)
PS_GETTER(ps_realtime_shadow_parameter_publishes, shadowParameterPublishes)

uint64_t ps_realtime_shadow_kernel_processed_frames(const PSRealtimeMetrics *metrics) {
    return metrics ? metrics->shadow.processedFrames : 0;
}

uint32_t ps_realtime_shadow_captured_frames(const PSRealtimeMetrics *metrics) {
    return metrics ? metrics->shadow.capturedFrames : 0;
}

uint64_t ps_realtime_shadow_recovered_samples(const PSRealtimeMetrics *metrics) {
    return metrics ? metrics->shadow.recoveredSamples : 0;
}

uint32_t ps_realtime_shadow_applied_updates(const PSRealtimeMetrics *metrics) {
    return metrics ? metrics->shadow.appliedUpdates : 0;
}

uint32_t ps_realtime_shadow_last_applied_generation(const PSRealtimeMetrics *metrics) {
    return metrics ? metrics->shadow.lastAppliedGeneration : 0;
}

float ps_realtime_shadow_last_applied_output_gain_db(const PSRealtimeMetrics *metrics) {
    return metrics ? metrics->shadow.lastAppliedOutputGainDb : 0;
}

uint32_t ps_realtime_shadow_capture_sample_bits(const PSRealtimeMetrics *metrics, uint32_t channel, uint32_t frame) {
    if (!metrics || channel >= PS_SHADOW_CHANNELS || frame >= metrics->shadow.capturedFrames) return 0;
    uint32_t bits = 0;
    memcpy(&bits, &metrics->shadow.capturedOutput[channel][frame], sizeof(bits));
    return bits;
}

double ps_realtime_longest_callback_ms(const PSRealtimeMetrics *metrics) {
    return metrics ? ps_host_ticks_to_milliseconds(atomic_load_explicit(&metrics->longestCallbackTicks, memory_order_relaxed)) : 0;
}

int ps_realtime_metrics_are_lock_free(const PSRealtimeMetrics *metrics) {
    if (!metrics) return 0;
    return atomic_is_lock_free(&metrics->callbacks)
        && atomic_is_lock_free(&metrics->renderedFrames)
        && atomic_is_lock_free(&metrics->sampleRateChanges)
        && atomic_is_lock_free(&metrics->shadowCallbacks)
        && atomic_is_lock_free(&metrics->longestCallbackTicks)
        && atomic_is_lock_free(&metrics->expectedFrames);
}

int ps_realtime_shadow_parameter_word_is_lock_free(const PSRealtimeMetrics *metrics) {
    return metrics && atomic_is_lock_free(&metrics->shadowParameterWord);
}

static int ps_preview_buffers_are_valid(const PSRealtimePreview *preview, const AudioBufferList *ioData, uint32_t frameCount) {
    if (!preview || !preview->enabled) return 1;
    if (!ioData || ioData->mNumberBuffers == 0) return 0;
    if (preview->interleaved) {
        const AudioBuffer *buffer = &ioData->mBuffers[0];
        uint32_t bufferChannels = buffer->mNumberChannels;
        uint64_t requiredSamples = (uint64_t)frameCount * (uint64_t)bufferChannels;
        return buffer->mData && bufferChannels >= preview->channels
            && (uint64_t)buffer->mDataByteSize >= requiredSamples * sizeof(float);
    }
    if (ioData->mNumberBuffers < preview->channels) return 0;
    for (uint32_t channel = 0; channel < preview->channels; channel += 1) {
        const AudioBuffer *buffer = &ioData->mBuffers[channel];
        if (!buffer->mData || buffer->mNumberChannels != 1
            || (uint64_t)buffer->mDataByteSize < (uint64_t)frameCount * sizeof(float)) return 0;
    }
    return 1;
}

static void ps_write_preview_sample(
    const PSRealtimePreview *preview,
    AudioBufferList *ioData,
    uint64_t outputFrame,
    uint32_t callbackFrame,
    uint32_t channel,
    float sample
) {
    if (!preview || !preview->enabled || outputFrame >= preview->totalFrames || channel >= preview->channels) return;
    uint64_t remainingFrames = preview->totalFrames - outputFrame;
    float fadeIn = outputFrame >= preview->fadeFrames ? 1.0f : (float)outputFrame / (float)preview->fadeFrames;
    float fadeOut = remainingFrames > preview->fadeFrames ? 1.0f : (float)remainingFrames / (float)preview->fadeFrames;
    float output = sample * preview->gainLinear * fminf(fadeIn, fadeOut);
    if (preview->interleaved) {
        AudioBuffer *buffer = &ioData->mBuffers[0];
        ((float *)buffer->mData)[(uint64_t)callbackFrame * buffer->mNumberChannels + channel] = output;
    } else {
        ((float *)ioData->mBuffers[channel].mData)[callbackFrame] = output;
    }
}

static int32_t ps_realtime_shadow_process(PSRealtimeMetrics *metrics, uint32_t frameCount, uint64_t parameterWord, AudioBufferList *ioData) {
    PSRealtimeShadow *shadow = metrics ? &metrics->shadow : NULL;
    PSRealtimePreview *preview = metrics ? &metrics->preview : NULL;
    uint32_t generation = (uint32_t)(parameterWord >> 32);
    uint32_t gainBits = (uint32_t)(parameterWord & UINT64_C(0xffffffff));
    float outputGainDb = 0;
    memcpy(&outputGainDb, &gainBits, sizeof(outputGainDb));
    if (!shadow || !shadow->enabled || frameCount == 0 || frameCount > PS_SHADOW_MAXIMUM_CALLBACK_FRAMES
        || generation == 0 || !isfinite(outputGainDb) || outputGainDb < -48.0f || outputGainDb > 12.0f
        || generation < shadow->lastAppliedGeneration || !ps_preview_buffers_are_valid(preview, ioData, frameCount)) return 1;

    if (generation > shadow->lastAppliedGeneration) {
        shadow->targetGain = pow(10.0, (PS_SHADOW_INPUT_GAIN_DB + (double)outputGainDb) / 20.0);
        shadow->lastAppliedGeneration = generation;
        shadow->lastAppliedOutputGainDb = outputGainDb;
        shadow->appliedUpdates += 1;
    }

    uint32_t captureCount = frameCount;
    if (captureCount > PS_SHADOW_FIXTURE_FRAMES - shadow->capturedFrames) {
        captureCount = PS_SHADOW_FIXTURE_FRAMES - shadow->capturedFrames;
    }
    for (uint32_t frame = 0; frame < frameCount; frame += 1) {
        // The reviewed fixture uses zero smoothing, bypass off, no DC blocker,
        // and no peak guard. Keep the arithmetic order identical to the Swift
        // contract kernel so the captured Float32 stream remains bit-exact.
        shadow->currentGain = shadow->targetGain;
        for (uint32_t channel = 0; channel < PS_SHADOW_CHANNELS; channel += 1) {
            double sample = (double)shadow->fixtureInput[channel][shadow->fixtureCursor];
            float processed = (float)(sample * shadow->currentGain);
            if (frame < captureCount) {
                shadow->capturedOutput[channel][shadow->capturedFrames + frame] = processed;
            }
            ps_write_preview_sample(preview, ioData, shadow->processedFrames + frame, frame, channel, processed);
        }
        shadow->fixtureCursor += 1;
        if (shadow->fixtureCursor == PS_SHADOW_FIXTURE_FRAMES) shadow->fixtureCursor = 0;
    }
    shadow->capturedFrames += captureCount;
    shadow->processedFrames += frameCount;
    return 0;
}

OSStatus ps_silence_render_callback(
    void *inRefCon,
    AudioUnitRenderActionFlags *ioActionFlags,
    const AudioTimeStamp *inTimeStamp,
    UInt32 inBusNumber,
    UInt32 inNumberFrames,
    AudioBufferList *ioData
) {
    (void)inBusNumber;
    PSRealtimeMetrics *metrics = (PSRealtimeMetrics *)inRefCon;
    if (!metrics || !ioData) return noErr;
    uint64_t startedAt = mach_absolute_time();

    if (metrics->preview.enabled) {
        for (UInt32 index = 0; index < ioData->mNumberBuffers; index += 1) {
            AudioBuffer *buffer = &ioData->mBuffers[index];
            if (buffer->mData && buffer->mDataByteSize > 0) memset(buffer->mData, 0, buffer->mDataByteSize);
        }
    }

    if (metrics->shadow.enabled) {
        uint64_t parameterWord = atomic_load_explicit(&metrics->shadowParameterWord, memory_order_acquire);
        int32_t shadowStatus = ps_realtime_shadow_process(metrics, inNumberFrames, parameterWord, ioData);
        if (shadowStatus == 0) {
            atomic_fetch_add_explicit(&metrics->shadowCallbacks, 1, memory_order_relaxed);
            atomic_fetch_add_explicit(&metrics->shadowFrames, inNumberFrames, memory_order_relaxed);
        } else {
            atomic_fetch_add_explicit(&metrics->shadowFailures, 1, memory_order_relaxed);
        }
    }

    // Every normal laboratory mode zero-fills only after shadow processing. The
    // explicit preview mode pre-zeroes all channels, then writes only its two
    // generated fixture channels through the fixed attenuation and fades above.
    if (!metrics->preview.enabled) {
        for (UInt32 index = 0; index < ioData->mNumberBuffers; index += 1) {
            AudioBuffer *buffer = &ioData->mBuffers[index];
            if (buffer->mData && buffer->mDataByteSize > 0) memset(buffer->mData, 0, buffer->mDataByteSize);
        }
    }

    atomic_fetch_add_explicit(&metrics->callbacks, 1, memory_order_relaxed);
    atomic_fetch_add_explicit(&metrics->renderedFrames, inNumberFrames, memory_order_relaxed);
    uint32_t expectedFrames = atomic_load_explicit(&metrics->expectedFrames, memory_order_relaxed);
    if (inNumberFrames == 0 || (expectedFrames > 0 && inNumberFrames > expectedFrames)) atomic_fetch_add_explicit(&metrics->frameMismatches, 1, memory_order_relaxed);
    if (ioActionFlags && (*ioActionFlags & kAudioUnitRenderAction_PostRenderError) != 0) atomic_fetch_add_explicit(&metrics->renderErrors, 1, memory_order_relaxed);

    uint64_t ticksPerFrame = atomic_load_explicit(&metrics->ticksPerFrame, memory_order_relaxed);
    uint64_t deadlineTicks = ticksPerFrame > 0 ? ticksPerFrame * inNumberFrames : atomic_load_explicit(&metrics->deadlineTicks, memory_order_relaxed);
    if (inTimeStamp && (inTimeStamp->mFlags & kAudioTimeStampHostTimeValid) != 0 && deadlineTicks > 0) {
        uint64_t previous = atomic_exchange_explicit(&metrics->previousOutputHostTime, inTimeStamp->mHostTime, memory_order_relaxed);
        if (previous > 0 && inTimeStamp->mHostTime > previous + deadlineTicks + (deadlineTicks / 2)) {
            atomic_fetch_add_explicit(&metrics->timingGapXruns, 1, memory_order_relaxed);
        }
    }

    uint64_t durationTicks = mach_absolute_time() - startedAt;
    ps_atomic_max(&metrics->longestCallbackTicks, durationTicks);
    if (deadlineTicks > 0 && durationTicks > deadlineTicks) atomic_fetch_add_explicit(&metrics->deadlineMisses, 1, memory_order_relaxed);
    return noErr;
}

OSStatus ps_install_silence_render_callback(AudioUnit unit, PSRealtimeMetrics *metrics) {
    AURenderCallbackStruct callback = {
        .inputProc = ps_silence_render_callback,
        .inputProcRefCon = metrics,
    };
    return AudioUnitSetProperty(
        unit,
        kAudioUnitProperty_SetRenderCallback,
        kAudioUnitScope_Input,
        0,
        &callback,
        sizeof(callback)
    );
}

static OSStatus ps_default_output_listener(
    AudioObjectID inObjectID,
    UInt32 inNumberAddresses,
    const AudioObjectPropertyAddress inAddresses[],
    void *inClientData
) {
    (void)inObjectID;
    (void)inNumberAddresses;
    (void)inAddresses;
    ps_realtime_metrics_record_device_change((PSRealtimeMetrics *)inClientData);
    return noErr;
}

static OSStatus ps_processor_overload_listener(
    AudioObjectID inObjectID,
    UInt32 inNumberAddresses,
    const AudioObjectPropertyAddress inAddresses[],
    void *inClientData
) {
    (void)inObjectID;
    (void)inNumberAddresses;
    (void)inAddresses;
    PSRealtimeMetrics *metrics = (PSRealtimeMetrics *)inClientData;
    if (metrics) atomic_fetch_add_explicit(&metrics->processorOverloads, 1, memory_order_relaxed);
    return noErr;
}

static OSStatus ps_sample_rate_listener(
    AudioObjectID inObjectID,
    UInt32 inNumberAddresses,
    const AudioObjectPropertyAddress inAddresses[],
    void *inClientData
) {
    (void)inObjectID;
    (void)inNumberAddresses;
    (void)inAddresses;
    PSRealtimeMetrics *metrics = (PSRealtimeMetrics *)inClientData;
    if (metrics) atomic_fetch_add_explicit(&metrics->sampleRateChanges, 1, memory_order_relaxed);
    return noErr;
}

OSStatus ps_install_default_output_listener(PSRealtimeMetrics *metrics) {
    AudioObjectPropertyAddress address = {
        .mSelector = kAudioHardwarePropertyDefaultOutputDevice,
        .mScope = kAudioObjectPropertyScopeGlobal,
        .mElement = kAudioObjectPropertyElementMain,
    };
    return AudioObjectAddPropertyListener(
        kAudioObjectSystemObject,
        &address,
        ps_default_output_listener,
        metrics
    );
}

OSStatus ps_remove_default_output_listener(PSRealtimeMetrics *metrics) {
    AudioObjectPropertyAddress address = {
        .mSelector = kAudioHardwarePropertyDefaultOutputDevice,
        .mScope = kAudioObjectPropertyScopeGlobal,
        .mElement = kAudioObjectPropertyElementMain,
    };
    return AudioObjectRemovePropertyListener(
        kAudioObjectSystemObject,
        &address,
        ps_default_output_listener,
        metrics
    );
}

OSStatus ps_install_processor_overload_listener(AudioObjectID deviceID, PSRealtimeMetrics *metrics) {
    AudioObjectPropertyAddress address = {
        .mSelector = kAudioDeviceProcessorOverload,
        .mScope = kAudioObjectPropertyScopeGlobal,
        .mElement = kAudioObjectPropertyElementMain,
    };
    return AudioObjectAddPropertyListener(deviceID, &address, ps_processor_overload_listener, metrics);
}

OSStatus ps_remove_processor_overload_listener(AudioObjectID deviceID, PSRealtimeMetrics *metrics) {
    AudioObjectPropertyAddress address = {
        .mSelector = kAudioDeviceProcessorOverload,
        .mScope = kAudioObjectPropertyScopeGlobal,
        .mElement = kAudioObjectPropertyElementMain,
    };
    return AudioObjectRemovePropertyListener(deviceID, &address, ps_processor_overload_listener, metrics);
}

OSStatus ps_install_sample_rate_listener(AudioObjectID deviceID, PSRealtimeMetrics *metrics) {
    AudioObjectPropertyAddress address = {
        .mSelector = kAudioDevicePropertyNominalSampleRate,
        .mScope = kAudioObjectPropertyScopeGlobal,
        .mElement = kAudioObjectPropertyElementMain,
    };
    return AudioObjectAddPropertyListener(deviceID, &address, ps_sample_rate_listener, metrics);
}

OSStatus ps_remove_sample_rate_listener(AudioObjectID deviceID, PSRealtimeMetrics *metrics) {
    AudioObjectPropertyAddress address = {
        .mSelector = kAudioDevicePropertyNominalSampleRate,
        .mScope = kAudioObjectPropertyScopeGlobal,
        .mElement = kAudioObjectPropertyElementMain,
    };
    return AudioObjectRemovePropertyListener(deviceID, &address, ps_sample_rate_listener, metrics);
}
